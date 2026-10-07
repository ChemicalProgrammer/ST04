#!/usr/bin/env python3
"""ST experimental discrete-event engine, Python 3.10+, standard library only.

Model: serial single-item processors, finite FIFO delay/accumulation conveyors,
blocking after service, preempt/resume downtime, linear ramps and machine microstops. This is NOT a spatial conveyor
or sensor model and NOT an interchangeable implementation of ST's fluid engine.
See README.md for supported physics, adapter restrictions and comparison rules.
Public API: simulate_line(payload), returning {ok, result} or {ok, error}.
CLI: python st_des_engine.py input.json --output result.json --rounds 1
"""
from __future__ import annotations

import argparse
from collections import deque
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import heapq
import json
import math
from pathlib import Path
import statistics
import sys
import time

VERSION = "0.2.0-experimental"
SCHEMA = "st-des/1"
EPS = 1e-10
STATES = ("RUNNING", "STARVED", "BLOCKED", "FAILED", "PAUSED", "STOPPED", "STARTING", "MICRO_STOP")
ACTIONS = ("RUN", "AUTO", "MANUAL", "PAUSE", "STOP", "EMERGENCY_STOP", "RESET")


class InputError(ValueError):
    pass


def number(value, path, minimum=0, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InputError(f"{path}: finite number required")
    if value < minimum or (positive and value <= minimum):
        raise InputError(f"{path}: must be {'greater than' if positive else 'at least'} {minimum}")
    return float(value)


def integer(value, path, minimum=0):
    number(value, path, minimum)
    if int(value) != value:
        raise InputError(f"{path}: integer required")
    return int(value)


def keys(obj, allowed, path):
    if not isinstance(obj, dict):
        raise InputError(f"{path}: object required")
    extra = set(obj) - set(allowed)
    if extra:
        raise InputError(f"{path}: unsupported fields {sorted(extra)}")


def validate(payload):
    keys(payload, ("schema", "caseId", "unitOfFlow", "machines", "conveyors", "run", "metadata"), "input")
    if payload.get("schema") != SCHEMA:
        raise InputError("schema: use st-des/1; native ST JSON needs export_st_to_des.mjs")
    machines, conveyors, run = payload.get("machines"), payload.get("conveyors"), payload.get("run")
    if not isinstance(machines, list) or len(machines) < 2:
        raise InputError("machines: at least two serial processors required")
    if not isinstance(conveyors, list) or len(conveyors) != len(machines) - 1:
        raise InputError("conveyors: one between each pair of processors required")
    keys(run, ("durationSeconds", "seed", "sampleEverySeconds", "eventLogLimit", "maxEvents", "commands", "shiftSeconds"), "run")
    if "shiftSeconds" in run:
        number(run["shiftSeconds"], "run.shiftSeconds", positive=True)
    duration = number(run.get("durationSeconds"), "run.durationSeconds", positive=True)
    seed = run.get("seed", 1)
    if isinstance(seed, bool) or not isinstance(seed, int):
        raise InputError("run.seed: integer required")
    sample = number(run.get("sampleEverySeconds", 5), "run.sampleEverySeconds", positive=True)
    if math.ceil(duration / sample) + (math.ceil(duration / run["shiftSeconds"]) if "shiftSeconds" in run else 0) + 1 > 10000:
        raise InputError("run.sampleEverySeconds: at most 10,000 sample frames supported")
    integer(run.get("eventLogLimit", 1000), "run.eventLogLimit")
    integer(run.get("maxEvents", 2000000), "run.maxEvents", 1)
    ids = set()
    for i, model in enumerate(machines):
        p = f"machines[{i}]"
        keys(model, ("id", "name", "rateBpm", "critical", "initialMode", "startupSeconds", "rampUpSeconds", "microStop", "reliability", "failures"), p)
        uid = model.get("id")
        if not isinstance(uid, str) or not uid or uid in ids:
            raise InputError(f"{p}.id: unique nonempty string required")
        ids.add(uid)
        number(model.get("rateBpm"), p + ".rateBpm", positive=True)
        if model.get("initialMode", "AUTO") not in ("AUTO", "MANUAL", "PAUSE", "STOP"):
            raise InputError(p + ".initialMode: unsupported")
        number(model.get("startupSeconds", 0), p + ".startupSeconds")
        number(model.get("rampUpSeconds", 0), p + ".rampUpSeconds")
        micro = model.get("microStop")
        if micro is not None:
            keys(micro, ("probabilityPerMinute", "minDurationSeconds", "maxDurationSeconds"), p + ".microStop")
            number(micro.get("probabilityPerMinute", 0), p + ".microStop.probabilityPerMinute")
            low = number(micro.get("minDurationSeconds", 0), p + ".microStop.minDurationSeconds")
            high = number(micro.get("maxDurationSeconds", low), p + ".microStop.maxDurationSeconds")
            if high < low:
                raise InputError(p + ".microStop: maximum duration must be at least minimum")
        rel = model.get("reliability")
        if rel is not None:
            keys(rel, ("mtbfMinutes", "mttrMinutes"), p + ".reliability")
            number(rel.get("mtbfMinutes"), p + ".mtbfMinutes", positive=True)
            number(rel.get("mttrMinutes"), p + ".mttrMinutes", positive=True)
        windows = model.get("failures", [])
        if not isinstance(windows, list):
            raise InputError(p + ".failures: array required")
        if rel and windows:
            raise InputError(p + ": use stochastic reliability OR explicit failure calendar")
        end = -1.0
        for failure in sorted(windows, key=lambda f: f.get("atSecond", -1) if isinstance(f, dict) else -1):
            keys(failure, ("atSecond", "durationSeconds"), p + ".failures[]")
            start = number(failure.get("atSecond"), p + ".failures[].atSecond")
            length = number(failure.get("durationSeconds"), p + ".failures[].durationSeconds", positive=True)
            if start < end - EPS:
                raise InputError(p + ".failures: overlapping intervals unsupported")
            end = start + length
    for i, model in enumerate(conveyors):
        p = f"conveyors[{i}]"
        keys(model, ("id", "name", "lengthMm", "speedMmPerSecond", "movingPitchMm", "accumulatedPitchMm", "initialReadyUnits"), p)
        uid = model.get("id")
        if not isinstance(uid, str) or not uid or uid in ids:
            raise InputError(p + ".id: unique nonempty string required")
        ids.add(uid)
        length = number(model.get("lengthMm"), p + ".lengthMm", positive=True)
        number(model.get("speedMmPerSecond"), p + ".speedMmPerSecond", positive=True)
        pitch = number(model.get("movingPitchMm"), p + ".movingPitchMm", positive=True)
        packed = number(model.get("accumulatedPitchMm", pitch), p + ".accumulatedPitchMm", positive=True)
        if packed > pitch + EPS or length < pitch:
            raise InputError(p + ": require accumulated pitch <= moving pitch <= length")
        initial = integer(model.get("initialReadyUnits", 0), p + ".initialReadyUnits")
        if initial > math.floor(length / packed + EPS):
            raise InputError(p + ": initial inventory exceeds packed capacity")
    commands = run.get("commands", [])
    if not isinstance(commands, list):
        raise InputError("run.commands: array required")
    machine_ids = {m["id"] for m in machines}
    for command in commands:
        keys(command, ("atSecond", "equipmentId", "action"), "run.commands[]")
        number(command.get("atSecond"), "run.commands[].atSecond")
        if command.get("equipmentId") not in machine_ids or command.get("action") not in ACTIONS:
            raise InputError("run.commands[]: supported action and machine id required; belt stops are not supported")
    critical = [m for m in machines if m.get("critical")]
    if len(critical) > 1:
        raise InputError("machines: at most one critical processor supported for reference capacity")


class RandomStream:
    """Mulberry32 arithmetic, independent seed derived from stable equipment id.
    Same numeric seed alone does not pair schedules with ST's shared RNG stream.
    """
    def __init__(self, seed, uid):
        digest = hashlib.sha256(f"{seed}:{uid}".encode()).digest()
        self.state = int.from_bytes(digest[:4], "little")

    def uniform(self):
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF
        value = ((self.state ^ (self.state >> 15)) * (self.state | 1)) & 0xFFFFFFFF
        value ^= (value + (((value ^ (value >> 7)) * (value | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((value ^ (value >> 14)) & 0xFFFFFFFF) / 4294967296

    def exponential(self, mean):
        return -math.log1p(-max(self.uniform(), 1e-12)) * mean


@dataclass
class Machine:
    model: dict
    index: int
    rng: RandomStream
    mode: str = "AUTO"
    emergency: bool = False
    failed: bool = False
    busy: bool = False
    completed: bool = False
    item: int | None = None
    remaining: float = 0
    finish_at: float | None = None
    service_started_at: float | None = None
    process_token: int = 0
    failure_token: int = 0
    failure_due: float | None = None
    failure_remaining: float | None = None
    startup_until: float = 0
    state: str = "STARVED"
    state_seconds: dict = field(default_factory=lambda: {state: 0.0 for state in STATES})
    output: int = 0
    processed: int = 0
    failure_count: int = 0
    micro_stopped: bool = False
    micro_started_at: float = 0
    micro_profile_origin: float = 0
    micro_token: int = 0
    micro_due: float | None = None
    micro_remaining: float | None = None
    micro_count: int = 0

    @property
    def enabled(self):
        return self.mode in ("AUTO", "MANUAL") and not self.emergency

    @property
    def rate(self):
        return self.model["rateBpm"] / 60


@dataclass
class Conveyor:
    model: dict
    index: int
    ready: deque = field(default_factory=deque)
    moving: dict = field(default_factory=dict)
    next_entry: float = 0
    next_exit: float = 0
    integral: float = 0
    maximum: int = 0
    admitted: int = 0
    released: int = 0

    @property
    def inventory(self):
        return len(self.ready) + len(self.moving)

    @property
    def capacity(self):
        return math.floor(self.model["lengthMm"] / self.model.get("accumulatedPitchMm", self.model["movingPitchMm"]) + EPS)

    @property
    def travel(self):
        return self.model["lengthMm"] / self.model["speedMmPerSecond"]

    @property
    def entry_headway(self):
        return self.model["movingPitchMm"] / self.model["speedMmPerSecond"]

    @property
    def exit_headway(self):
        return self.model.get("accumulatedPitchMm", self.model["movingPitchMm"]) / self.model["speedMmPerSecond"]


class Simulation:
    def __init__(self, payload):
        self.payload = payload
        self.run = payload["run"]
        self.duration = self.run["durationSeconds"]
        self.now = 0.0
        self.queue = []
        self.sequence = 0
        self.executed = 0
        self.event_counts = {}
        self.events = []
        self.omitted_events = 0
        self.samples = []
        self.output = 0
        self.source_started = 0
        self.initial_inventory = 0
        self.item_sequence = 0
        self.wakes = set()
        self.machines = [Machine(m, i, RandomStream(self.run.get("seed", 1), m["id"]), mode=m.get("initialMode", "AUTO")) for i, m in enumerate(payload["machines"])]
        self.micro_rng = {m.index: RandomStream(self.run.get("seed", 1), m.model["id"] + ":microstop") for m in self.machines}
        self.conveyors = [Conveyor(c, i) for i, c in enumerate(payload["conveyors"])]
        for belt in self.conveyors:
            for _ in range(belt.model.get("initialReadyUnits", 0)):
                belt.ready.append(self.new_item())
                self.initial_inventory += 1
            belt.maximum = belt.inventory
        for machine in self.machines:
            if machine.enabled:
                machine.startup_until = machine.model.get("startupSeconds", 0)
                self.wake(machine.startup_until)
            rel = machine.model.get("reliability")
            if rel:
                machine.failure_remaining = machine.rng.exponential(rel["mtbfMinutes"] * 60)
                self.arm_failure(machine)
            for window in machine.model.get("failures", []):
                self.schedule(window["atSecond"], 2, "FAILURE", (machine.index, None, window["durationSeconds"]))
            self.arm_microstop(machine)
        ids = {m.model["id"]: m.index for m in self.machines}
        for command in self.run.get("commands", []):
            self.schedule(command["atSecond"], 0, "COMMAND", (ids[command["equipmentId"]], command["action"]))
        self.schedule(0, 9, "SAMPLE", 0)

    def new_item(self):
        self.item_sequence += 1
        return self.item_sequence

    def schedule(self, at, priority, kind, data=None):
        if at < self.now - EPS:
            raise RuntimeError("Attempt to schedule an event in the past")
        if at <= self.duration + EPS:
            self.sequence += 1
            heapq.heappush(self.queue, (min(float(at), self.duration), priority, self.sequence, kind, data))

    def wake(self, at):
        if at <= self.now + EPS or at > self.duration + EPS:
            return
        if at not in self.wakes:
            self.wakes.add(at)
            self.schedule(at, 5, "WAKE", at)

    def log(self, kind, uid=None, **details):
        record = dict(type=kind, atVirtualSecond=self.now, **details)
        if uid is not None:
            record["equipmentId"] = uid
        if len(self.events) < self.run.get("eventLogLimit", 1000):
            self.events.append(record)
        else:
            self.omitted_events += 1

    def arm_failure(self, machine):
        if not machine.enabled or machine.failed or machine.failure_remaining is None:
            return
        machine.failure_token += 1
        machine.failure_due = self.now + machine.failure_remaining
        rel = machine.model["reliability"]
        self.schedule(machine.failure_due, 2, "FAILURE", (machine.index, machine.failure_token, rel["mttrMinutes"] * 60))

    def suspend_failure(self, machine):
        if machine.failure_due is not None:
            machine.failure_remaining = max(0.0, machine.failure_due - self.now)
            machine.failure_due = None
            machine.failure_token += 1

    def suspend_service(self, machine):
        if machine.finish_at is not None:
            machine.remaining = max(0.0, machine.remaining - self.service_work(machine, machine.service_started_at, self.now))
            machine.finish_at = None
            machine.service_started_at = None
            machine.process_token += 1

    def service_work(self, machine, start, end):
        ramp = machine.model.get("rampUpSeconds", 0)
        origin = machine.startup_until
        def integral(at):
            elapsed = max(0.0, at - origin)
            if ramp <= EPS:
                return machine.rate * elapsed
            return machine.rate * (elapsed * elapsed / (2 * ramp) if elapsed < ramp else elapsed - ramp / 2)
        return integral(end) - integral(start)

    def resume_service(self, machine):
        machine.process_token += 1
        ramp = machine.model.get("rampUpSeconds", 0)
        elapsed = max(0.0, self.now - machine.startup_until)
        work_seconds = machine.remaining / machine.rate
        if ramp > EPS and elapsed < ramp:
            available = (ramp * ramp - elapsed * elapsed) / (2 * ramp)
            delay = math.sqrt(elapsed * elapsed + 2 * ramp * work_seconds) - elapsed if work_seconds <= available else ramp - elapsed + work_seconds - available
        else:
            delay = work_seconds
        machine.service_started_at = self.now
        machine.finish_at = self.now + delay
        self.schedule(machine.finish_at, 3, "COMPLETE", (machine.index, machine.process_token))

    def suspend_microstop_clock(self, machine):
        if machine.micro_due is not None:
            machine.micro_remaining = max(0.0, machine.micro_due - self.now)
            machine.micro_due = None
            machine.micro_token += 1

    def arm_microstop(self, machine):
        profile = machine.model.get("microStop") or {}
        rate = profile.get("probabilityPerMinute", 0)
        if rate <= 0 or machine.mode != "AUTO" or not machine.enabled or machine.failed or machine.micro_stopped or machine.micro_due is not None:
            return
        if machine.micro_remaining is None:
            machine.micro_remaining = self.micro_rng[machine.index].exponential(60 / rate)
        machine.micro_token += 1
        machine.micro_due = self.now + machine.micro_remaining
        self.schedule(machine.micro_due, 2, "MICRO_STOP", (machine.index, machine.micro_token))

    def dispatch(self, kind, data):
        if kind == "WAKE":
            self.wakes.discard(data)
        elif kind == "COMMAND":
            index, action = data
            machine = self.machines[index]
            was_enabled = machine.enabled
            if action in ("RUN", "AUTO", "MANUAL"):
                machine.mode = "MANUAL" if action == "MANUAL" else "AUTO"
            elif action == "EMERGENCY_STOP":
                machine.emergency = True
            elif action == "RESET":
                machine.emergency = False  # preserves AUTO/PAUSE/STOP selection
            else:
                machine.mode = action
            if not machine.enabled or machine.mode != "AUTO":
                self.suspend_microstop_clock(machine)
            else:
                self.arm_microstop(machine)
            if was_enabled and not machine.enabled:
                self.suspend_failure(machine)
                self.suspend_service(machine)
            elif not was_enabled and machine.enabled:
                machine.startup_until = self.now + machine.model.get("startupSeconds", 0)
                self.wake(machine.startup_until)
                self.arm_failure(machine)
            self.log("COMMAND", machine.model["id"], action=action)
        elif kind == "FAILURE":
            index, token, repair_seconds = data
            machine = self.machines[index]
            if token is not None and token != machine.failure_token:
                return
            if token is not None and not machine.enabled:
                return
            machine.failure_due = None
            machine.failure_remaining = None
            machine.failed = True
            self.suspend_microstop_clock(machine)
            machine.failure_count += 1
            self.suspend_service(machine)
            self.schedule(self.now + repair_seconds, 1, "REPAIR", index)
            self.log("FAILURE_STARTED", machine.model["id"], durationSeconds=repair_seconds)
        elif kind == "REPAIR":
            machine = self.machines[data]
            machine.failed = False
            machine.startup_until = self.now + machine.model.get("startupSeconds", 0)
            self.wake(machine.startup_until)
            if machine.model.get("reliability"):
                machine.failure_remaining = machine.rng.exponential(machine.model["reliability"]["mtbfMinutes"] * 60)
                self.arm_failure(machine)
            self.log("REPAIR_COMPLETED", machine.model["id"])
            self.arm_microstop(machine)
        elif kind == "MICRO_STOP":
            index, token = data
            machine = self.machines[index]
            if token != machine.micro_token or machine.failed or not machine.enabled or machine.mode != "AUTO":
                return
            machine.micro_due = None
            machine.micro_remaining = None
            machine.micro_stopped = True
            machine.micro_started_at = self.now
            machine.micro_profile_origin = machine.startup_until
            machine.micro_count += 1
            self.suspend_service(machine)
            profile = machine.model["microStop"]
            low = profile.get("minDurationSeconds", 0)
            high = profile.get("maxDurationSeconds", low)
            length = low + (high - low) * self.micro_rng[index].uniform()
            self.schedule(self.now + length, 1, "MICRO_STOP_END", index)
            self.log("MICRO_STOP_STARTED", machine.model["id"], durationSeconds=length)
        elif kind == "MICRO_STOP_END":
            machine = self.machines[data]
            # Freeze the unfinished start profile during a microstop. A repair
            # or explicit restart already establishes a new profile instead.
            if not machine.failed and machine.startup_until == machine.micro_profile_origin:
                machine.startup_until += self.now - machine.micro_started_at
                self.wake(machine.startup_until)
            machine.micro_stopped = False
            self.arm_microstop(machine)
            self.log("MICRO_STOP_COMPLETED", machine.model["id"])
        elif kind == "COMPLETE":
            index, token = data
            machine = self.machines[index]
            if token != machine.process_token:
                return
            machine.busy = False
            machine.completed = True
            machine.finish_at = None
            machine.service_started_at = None
            machine.remaining = 0
            machine.processed += 1
            self.log("PROCESS_COMPLETED", machine.model["id"], itemId=machine.item)
        elif kind == "ARRIVAL":
            index, item = data
            belt = self.conveyors[index]
            del belt.moving[item]
            belt.ready.append(item)
        elif kind == "SAMPLE":
            pass  # observe after all physical events and fixed-point transfers

    def settle(self):
        # Blocking-after-service: completed products occupy their processor until
        # the receiving conveyor has capacity AND admission headway is satisfied.
        # Downstream-first fixpoint makes zero-time releases causal and repeatable.
        for _ in range(2 * len(self.machines) + 2):
            changed = False
            for machine in reversed(self.machines):
                operational = machine.enabled and not machine.failed and not machine.micro_stopped and self.now >= machine.startup_until - EPS
                if not operational:
                    continue
                if machine.completed:
                    if machine.index == len(self.machines) - 1:
                        self.output += 1
                    else:
                        belt = self.conveyors[machine.index]
                        if belt.inventory >= belt.capacity:
                            continue
                        if self.now < belt.next_entry - EPS:
                            self.wake(belt.next_entry)
                            continue
                        item = machine.item
                        at = self.now + belt.travel
                        belt.moving[item] = at
                        belt.admitted += 1
                        belt.next_entry = self.now + belt.entry_headway
                        belt.maximum = max(belt.maximum, belt.inventory)
                        self.schedule(at, 4, "ARRIVAL", (belt.index, item))
                    machine.output += 1
                    machine.completed = False
                    machine.item = None
                    changed = True
                if machine.busy:
                    if machine.finish_at is None:
                        self.resume_service(machine)
                        changed = True
                    continue
                if machine.item is None and self.now < self.duration - EPS:
                    if machine.index == 0:
                        machine.item = self.new_item()
                        self.source_started += 1
                    else:
                        belt = self.conveyors[machine.index - 1]
                        if not belt.ready:
                            continue
                        if self.now < belt.next_exit - EPS:
                            self.wake(belt.next_exit)
                            continue
                        machine.item = belt.ready.popleft()
                        belt.released += 1
                        belt.next_exit = self.now + belt.exit_headway
                    machine.busy = True
                    machine.remaining = 1.0
                    self.resume_service(machine)
                    changed = True
            if not changed:
                break
        else:
            raise RuntimeError("Instantaneous transfer fixed point did not converge")
        for machine in self.machines:
            if machine.failed:
                state = "FAILED"
            elif not machine.enabled:
                state = "PAUSED" if machine.mode == "PAUSE" and not machine.emergency else "STOPPED"
            elif machine.micro_stopped:
                state = "MICRO_STOP"
            elif self.now < machine.startup_until - EPS:
                state = "STARTING"
            elif machine.completed:
                state = "BLOCKED"
            elif machine.busy:
                state = "RUNNING"
            else:
                state = "STARVED"
            machine.state = state
        self.check_invariants()

    def check_invariants(self):
        inventory = sum(b.inventory for b in self.conveyors) + sum(m.item is not None for m in self.machines)
        if self.initial_inventory + self.source_started != self.output + inventory:
            raise RuntimeError("Material conservation violation")
        for belt in self.conveyors:
            if not 0 <= belt.inventory <= belt.capacity:
                raise RuntimeError("Conveyor capacity violation")

    def advance(self, at):
        elapsed = max(0.0, at - self.now)
        for machine in self.machines:
            machine.state_seconds[machine.state] += elapsed
        for belt in self.conveyors:
            belt.integral += belt.inventory * elapsed
        self.now = at

    def sample(self):
        self.samples.append({"virtualSecond": self.now, "outputCount": self.output,
                             "equipment": [{"id": m.model["id"], "mode": m.mode, "state": m.state, "outputCount": m.output,
                                            "stateSeconds": dict(m.state_seconds)} for m in self.machines],
                             "zones": [{"id": b.model["id"], "inventoryUnits": b.inventory, "readyUnits": len(b.ready),
                                        "movingUnits": len(b.moving), "releasedUnits": b.released} for b in self.conveyors]})

    def execute(self):
        while self.queue:
            at = self.queue[0][0]
            self.advance(at)
            sampling = False
            while self.queue and abs(self.queue[0][0] - at) <= EPS:
                _, _, _, kind, data = heapq.heappop(self.queue)
                self.executed += 1
                if self.executed > self.run.get("maxEvents", 2000000):
                    raise InputError("EVENT_LIMIT: increase run.maxEvents or shorten the run; no partial result returned")
                self.event_counts[kind] = self.event_counts.get(kind, 0) + 1
                if kind == "SAMPLE":
                    sampling = True
                    sample_index = data + 1
                    self.schedule(sample_index * self.run.get("sampleEverySeconds", 5), 9, "SAMPLE", sample_index)
                self.dispatch(kind, data)
            # Inclusive horizon: deliver completed items, do not start new cycles.
            self.settle()
            if sampling:
                self.sample()
        self.advance(self.duration)
        if not self.samples or self.samples[-1]["virtualSecond"] != self.duration:
            self.sample()
        self.check_invariants()
        return self.result()

    def result(self):
        critical = next((m for m in self.machines if m.model.get("critical")), None)
        reference = critical or min(self.machines, key=lambda m: m.rate)
        equipment = []
        for machine in self.machines:
            equipment.append({"id": machine.model["id"], "name": machine.model.get("name", machine.model["id"]),
                "outputCount": machine.output, "processedCount": machine.processed,
                "stateSeconds": machine.state_seconds,
                "runningSeconds": machine.state_seconds["RUNNING"], "starvedSeconds": machine.state_seconds["STARVED"],
                "blockedSeconds": machine.state_seconds["BLOCKED"], "failureSeconds": machine.state_seconds["FAILED"],
                "failureCount": machine.failure_count,
                "microStopCount": machine.micro_count, "microStopSeconds": machine.state_seconds["MICRO_STOP"],
                "startupSeconds": machine.state_seconds["STARTING"],
                "processingUtilizationPercent": 100 * machine.state_seconds["RUNNING"] / self.duration,
                "productiveCapacityPercent": 100 * machine.output / (machine.rate * self.duration)})
        zones = [{"id": b.model["id"], "capacityUnits": b.capacity, "inventoryUnits": b.inventory,
                  "readyUnits": len(b.ready), "movingUnits": len(b.moving), "maximumInventoryUnits": b.maximum,
                  "averageInventoryUnits": b.integral / self.duration, "travelSeconds": b.travel,
                  "entryHeadwaySeconds": b.entry_headway, "exitHeadwaySeconds": b.exit_headway} for b in self.conveyors]
        wip = sum(z["inventoryUnits"] for z in zones) + sum(m.item is not None for m in self.machines)
        return {"engine": {"id": "DES_PYTHON_EXPERIMENTAL", "version": VERSION, "method": "NEXT_EVENT",
                  "conveyorModel": "FINITE_FIFO_DELAY_WITH_ACCUMULATION", "modelEquivalentToST": False,
                  "schema": SCHEMA, "source": self.payload.get("metadata", {})},
                "caseId": self.payload.get("caseId", "des-case"), "unitOfFlow": self.payload.get("unitOfFlow", "units"),
                "run": deepcopy(self.run), "summary": {"outputCount": self.output,
                  "throughputPerMinute": self.output / self.duration * 60,
                  "capacityAchievementPercent": 100 * self.output / (reference.rate * self.duration),
                  "referenceEquipmentId": reference.model["id"], "qualityModel": "NO_REJECTS",
                  "lineOeePercent": None, "materialBalance": {"initialInventory": self.initial_inventory,
                    "sourceStarted": self.source_started, "outletOutput": self.output, "totalInventory": wip,
                    "residualUnits": self.initial_inventory + self.source_started - self.output - wip}},
                "equipment": equipment, "zones": zones, "samples": self.samples, "events": self.events,
                "detailCoverage": {"omittedEvents": self.omitted_events},
                "diagnostics": {"eventsProcessed": self.executed, "eventsByType": self.event_counts,
                  "fixedTimeStep": None, "physicalEventHorizon": "inclusive",
                  "failureClock": "enabled non-failed elapsed time, including starvation/blocking",
                  "repairDistribution": "deterministic MTTR", "failureDistribution": "exponential MTBF",
                  "rampModel": "linear rate ramp, analytical work integral and next-completion inversion",
                  "microStopClock": "AUTO enabled non-failed time, exponential interval, uniform duration, separate random stream",
                  "sameTimeOrder": "commands, repairs, failures, processing completions, arrivals; downstream-first transfers"},
                "limitations": ["No spatial queue-tail, Prime/Back-up sensors or belt stop logic.",
                  "No overflow runout, conveyor downtime, rejects, batches, conversion ratios, merges or splits.",
                  "Constant full-length travel delay; queue growth does not shorten incoming travel.",
                  "No spatial occupied-length constraint; packed capacity plus admission/exit headway only.",
                  "Machine holds one item; blocking after service; pause/failure resumes remaining work.",
                  "Capacity achievement is not validated plant OEE; lineOeePercent is intentionally null."]}


def simulate_line(payload):
    started = time.perf_counter()
    try:
        validate(payload)
        result = Simulation(deepcopy(payload)).execute()
        result["diagnostics"]["wallTimeSeconds"] = time.perf_counter() - started
        return {"ok": True, "result": result}
    except InputError as error:
        return {"ok": False, "error": {"code": "INVALID_DES_INPUT", "message": str(error)}}


def simulate_batch(payload, rounds):
    if isinstance(rounds, bool) or not isinstance(rounds, int) or not 1 <= rounds <= 1000:
        return {"ok": False, "error": {"code": "INVALID_ROUNDS", "message": "rounds must be 1..1000"}}
    results = []
    for index in range(rounds):
        copy = deepcopy(payload)
        copy.setdefault("run", {})["seed"] = payload.get("run", {}).get("seed", 1) + index
        response = simulate_line(copy)
        if not response["ok"]:
            return response
        results.append(response["result"])
    values = [r["summary"]["throughputPerMinute"] for r in results]
    return {"ok": True, "batch": {"rounds": rounds, "seeds": [r["run"]["seed"] for r in results],
              "meanThroughputPerMinute": statistics.mean(values),
              "standardDeviationThroughput": statistics.stdev(values) if rounds > 1 else None,
              "results": results}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--rounds", type=int, default=1)
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        result = simulate_line(payload) if args.rounds == 1 else simulate_batch(payload, args.rounds)
    except (OSError, json.JSONDecodeError) as error:
        result = {"ok": False, "error": {"code": "FILE_ERROR", "message": str(error)}}
    serialized = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)
    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
