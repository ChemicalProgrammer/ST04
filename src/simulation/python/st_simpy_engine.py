#!/usr/bin/env python3
"""ST DES engine using the real SimPy event scheduler, Python 3.10+.

Install requirements.txt. CLI: python st_simpy_engine.py input.json --output result.json
The validated physical model is shared with st_des_engine.py (legacy heap oracle).
This module never runs that oracle's scheduler. SimPy owns the event agenda and
clock; the shared model owns item transfer, downtime and statistical accounting.
Event callbacks are used instead of Store/Resource so the existing deterministic
same-time priority, blocking-after-service and inclusive horizon stay explicit.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
import math
from pathlib import Path
import statistics
import sys
import time

try:
    import simpy
except ImportError:
    simpy = None

from st_des_engine import EPS, InputError, Simulation, validate

VERSION = "0.2.0-experimental"
TESTED_SIMPY_VERSION = "4.1.2"


class Cancelled(Exception):
    pass


if simpy is not None:
    class PriorityEnvironment(simpy.Environment):
        """Public Timeout/schedule API adapter for ST's event priorities.

        Timeout schedules itself with NORMAL priority. We temporarily choose
        the model priority during its construction, delegating the entire
        agenda to Environment.schedule(). No SimPy private queue is accessed.
        SimPy is single-threaded; this context is local to this environment.
        """
        def __init__(self):
            self.model_priority = None
            super().__init__()

        def schedule(self, event, priority=1, delay=0):
            selected = self.model_priority if self.model_priority is not None else priority
            return super().schedule(event, selected, delay)

        def priority_timeout(self, delay, priority, value=None):
            previous = self.model_priority
            self.model_priority = priority
            try:
                return self.timeout(delay, value)
            finally:
                self.model_priority = previous


class SimPySimulation(Simulation):
    def __init__(self, payload, progress=None, cancelled=None):
        self.env = PriorityEnvironment()
        self.progress = progress
        self.cancelled = cancelled
        self.pending_sample = False
        super().__init__(payload)
        shift = self.run.get("shiftSeconds", self.duration)
        at = shift
        while at < self.duration - EPS:
            self.schedule(at, 9, "SHIFT_SAMPLE")
            at += shift
        # The domain constructor has compatibility attributes for the legacy
        # implementation. Removing them makes accidental scheduler use fail.
        del self.queue
        del self.sequence

    def schedule(self, at, priority, kind, data=None):
        if at < self.now - EPS:
            raise RuntimeError("Attempt to schedule an event in the past")
        if at > self.duration + EPS:
            return
        target = min(float(at), self.duration)
        event = self.env.priority_timeout(max(0.0, target - self.env.now), priority, (kind, data))
        event.callbacks.append(self.handle_event)

    def handle_event(self, event):
        kind, data = event.value
        self.executed += 1
        if self.executed > self.run.get("maxEvents", 2000000):
            raise InputError("EVENT_LIMIT: increase run.maxEvents or shorten the run; no partial result returned")
        self.event_counts[kind] = self.event_counts.get(kind, 0) + 1
        if kind == "SAMPLE":
            self.pending_sample = True
            index = data + 1
            self.schedule(index * self.run.get("sampleEverySeconds", 5), 9, "SAMPLE", index)
        if kind == "SHIFT_SAMPLE":
            self.pending_sample = True
        self.dispatch(kind, data)

    def execute(self):
        # env.run(until=T) stops before normal-priority events exactly at T.
        # Explicit stepping preserves ST DES's documented inclusive horizon.
        # No fixed time increments: env.peek() jumps to each next event time.
        while math.isfinite(self.env.peek()):
            if self.cancelled and self.cancelled():
                raise Cancelled("Simulation cancelled; no partial result returned")
            at = self.env.peek()
            self.advance(at)
            self.pending_sample = False
            while self.env.peek() <= at + EPS:
                self.env.step()
            self.settle()
            if self.pending_sample:
                self.sample()
                if self.progress:
                    self.progress(min(1.0, self.now / self.duration))
        self.advance(self.duration)
        if not self.samples or self.samples[-1]["virtualSecond"] != self.duration:
            self.sample()
        self.check_invariants()
        if self.progress:
            self.progress(1.0)
        return self.result()

    def result(self):
        result = super().result()
        result["engine"].update(id="DES_SIMPY_EXPERIMENTAL", version=VERSION,
            library="SimPy", libraryVersion=simpy.__version__, scheduler="simpy.Environment")
        result["diagnostics"].update(library="SimPy", libraryVersion=simpy.__version__,
            testedLibraryVersion=TESTED_SIMPY_VERSION,
            libraryVersionMatchesValidation=simpy.__version__ == TESTED_SIMPY_VERSION)
        return result


def simulate_line(payload, progress=None, cancelled=None):
    if simpy is None:
        return {"ok": False, "error": {"code": "MISSING_DEPENDENCY",
            "message": "Install SimPy locally: python -m pip install -r requirements.txt"}}
    started = time.perf_counter()
    try:
        validate(payload)
        result = SimPySimulation(deepcopy(payload), progress, cancelled).execute()
        result["diagnostics"]["wallTimeSeconds"] = time.perf_counter() - started
        return {"ok": True, "result": result}
    except Cancelled as error:
        return {"ok": False, "error": {"code": "CANCELLED", "message": str(error)}}
    except InputError as error:
        return {"ok": False, "error": {"code": "INVALID_DES_INPUT", "message": str(error)}}


def simulate_batch(payload, rounds, progress=None, cancelled=None):
    if isinstance(rounds, bool) or not isinstance(rounds, int) or not 1 <= rounds <= 1000:
        return {"ok": False, "error": {"code": "INVALID_ROUNDS", "message": "rounds must be 1..1000"}}
    base_seed = payload.get("run", {}).get("seed", 1) if isinstance(payload, dict) else 1
    if isinstance(base_seed, bool) or not isinstance(base_seed, int):
        return {"ok": False, "error": {"code": "INVALID_DES_INPUT", "message": "run.seed: integer required"}}
    results = []
    for index in range(rounds):
        copy = deepcopy(payload)
        if not isinstance(copy, dict) or not isinstance(copy.get("run"), dict):
            return simulate_line(copy)
        copy["run"]["seed"] = base_seed + index
        report = (lambda value, index=index: progress((index + value) / rounds)) if progress else None
        response = simulate_line(copy, report, cancelled)
        if not response["ok"]:
            return response
        results.append(response["result"])
    values = [r["summary"]["throughputPerMinute"] for r in results]
    return {"ok": True, "batch": {"rounds": rounds, "engineId": "DES_SIMPY_EXPERIMENTAL",
        "engineVersion": VERSION, "libraryVersion": simpy.__version__ if simpy else None,
        "seeds": [r["run"]["seed"] for r in results],
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
        response = simulate_line(payload) if args.rounds == 1 else simulate_batch(payload, args.rounds)
    except (OSError, json.JSONDecodeError) as error:
        response = {"ok": False, "error": {"code": "FILE_ERROR", "message": str(error)}}
    serialized = json.dumps(response, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")
    return 0 if response["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
