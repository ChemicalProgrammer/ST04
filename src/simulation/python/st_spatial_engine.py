"""Spatial serial DES: product leading edges, finite packing, photoeyes and belt stops."""
from collections import deque
from copy import deepcopy
from dataclasses import dataclass, field
import math

from st_des_engine import EPS, Conveyor, InputError, RandomStream, STATES, number, integer, keys, validate as validate_fifo
from st_simpy_engine import SimPySimulation

SPATIAL_VERSION = '0.4.0-experimental'


def validate(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('run'), dict) or not isinstance(payload.get('machines'), list) or not payload['machines'] or not isinstance(payload.get('conveyors'), list) or any(not isinstance(c, dict) or 'id' not in c or 'lengthMm' not in c or 'movingPitchMm' not in c for c in payload['conveyors']):
        raise InputError('Spatial DES requires machines, conveyor geometry and run configuration')
    copy = deepcopy(payload)
    spatial_keys = ('productLengthMm', 'primeSensorPositionMm', 'backupSensorPositionMm', 'backupRestartPositionMm', 'upstreamRestartDelaySeconds', 'downstreamRampUpSeconds', 'blockedTimeDelaySeconds',
                    'clearTimeDelaySeconds', 'upstreamStopResponseSeconds', 'bottlesDischargedAtStop', 'initialMode', 'reliability', 'microStop', 'failures')
    ids = {c.get('id') for c in copy['conveyors'] if isinstance(c.get('id'), str)}
    commands = copy['run'].get('commands', [])
    if not isinstance(commands, list) or any(not isinstance(c, dict) for c in commands):
        raise InputError('run.commands must contain command objects')
    copy['run']['commands'] = [c for c in commands if not isinstance(c.get('equipmentId'), str) or c.get('equipmentId') not in ids]
    for belt in copy['conveyors']:
        for name in spatial_keys:
            belt.pop(name, None)
    validate_fifo(copy)
    for i, belt in enumerate(copy.get('conveyors', [])):
        original = payload['conveyors'][i]
        keys(original, ('id', 'name', 'lengthMm', 'speedMmPerSecond', 'movingPitchMm', 'accumulatedPitchMm', 'initialReadyUnits') + spatial_keys, f'conveyors[{i}]')
        for name in spatial_keys:
            belt.pop(name, None)
        length = original['lengthMm']
        product = number(original.get('productLengthMm', original.get('accumulatedPitchMm', original['movingPitchMm'])), 'productLengthMm', positive=True)
        if product > original.get('accumulatedPitchMm', original['movingPitchMm']) + EPS:
            raise InputError('Product length must not exceed packed pitch')
        for name in ('primeSensorPositionMm', 'backupSensorPositionMm', 'backupRestartPositionMm'):
            if original.get(name) is not None:
                position = number(original[name], name)
                if position > length:
                    raise InputError(name + ': position exceeds belt length')
        for name in ('blockedTimeDelaySeconds', 'clearTimeDelaySeconds', 'upstreamStopResponseSeconds', 'upstreamRestartDelaySeconds', 'downstreamRampUpSeconds'):
            number(original.get(name, 0), name)
        integer(original.get('bottlesDischargedAtStop', 0), 'bottlesDischargedAtStop')
        if original.get('initialMode', 'AUTO') not in ('AUTO', 'MANUAL', 'PAUSE', 'STOP'):
            raise InputError('Unsupported conveyor initial mode')
        # Reuse the audited downtime and interval validation without running it.
        probe = deepcopy(copy)
        probe['machines'][0].update({k: original[k] for k in ('reliability', 'microStop', 'failures') if k in original})
        for candidate in probe['conveyors']:
            for name in spatial_keys:
                candidate.pop(name, None)
        validate_fifo(probe)
    validate_fifo(copy)
    all_ids = {m['id'] for m in payload['machines']} | ids
    for command in payload['run'].get('commands', []):
        keys(command, ('atSecond', 'equipmentId', 'action'), 'command')
        number(command.get('atSecond'), 'command.atSecond')
        if not isinstance(command.get('equipmentId'), str) or command.get('equipmentId') not in all_ids or command.get('action') not in ('RUN', 'AUTO', 'MANUAL', 'PAUSE', 'STOP', 'EMERGENCY_STOP', 'RESET'):
            raise InputError('Unsupported command or equipment id')


@dataclass
class SpatialConveyor(Conveyor):
    items: deque = field(default_factory=deque)
    positions: dict = field(default_factory=dict)
    mode: str = 'AUTO'
    emergency: bool = False
    failed: bool = False
    micro_stopped: bool = False
    state_seconds: dict = field(default_factory=lambda: {'RUNNING': 0., 'PAUSED': 0., 'STOPPED': 0., 'FAILED': 0., 'MICRO_STOP': 0.})
    wake_at: float | None = None
    wake_token: int = 0
    prime_latched: bool = False
    prime_occupied: bool = False
    backup_occupied: bool = False
    backup_signal: bool = False
    backup_latched: bool = False
    sensor_token: int = 0
    stop_token: int = 0
    timers: dict = field(default_factory=dict)
    remaining_noise: dict = field(default_factory=dict)
    noise_tokens: dict = field(default_factory=lambda: {'failure': 0, 'micro': 0})
    failure_count: int = 0
    micro_count: int = 0
    overflow: int = 0

    @property
    def inventory(self):
        return len(self.items)

    @property
    def product_length(self):
        return self.model.get('productLengthMm', self.model.get('accumulatedPitchMm', self.model['movingPitchMm']))

    @property
    def pitch(self):
        return self.model.get('accumulatedPitchMm', self.model['movingPitchMm'])

    @property
    def enabled(self):
        return self.mode in ('AUTO', 'MANUAL') and not self.emergency

    @property
    def velocity(self):
        return self.model['speedMmPerSecond'] if self.enabled and not self.failed and not self.micro_stopped else 0.

    @property
    def state(self):
        return 'FAILED' if self.failed else 'STOPPED' if self.emergency or self.mode == 'STOP' else 'PAUSED' if self.mode == 'PAUSE' else 'MICRO_STOP' if self.micro_stopped else 'RUNNING'

    @property
    def queued(self):
        result=[];limit=self.model['lengthMm']
        for item in self.items:
            if abs(self.positions[item]-limit)>EPS*10: break
            result.append(item);limit-=self.pitch
        return result

    def occupied(self, position):
        if position is None: return False
        parked=set(self.queued)
        return any(p>=position-EPS and (p-self.product_length<=position+EPS if item in parked else p-self.product_length<position-EPS) for item,p in self.positions.items())

    def can_enter(self):
        return self.inventory < self.capacity and (not self.items or self.positions[self.items[-1]] >= self.model['movingPitchMm'] - EPS)

    def refresh(self):
        self.ready = deque([self.items[0]]) if self.items and self.positions[self.items[0]] >= self.model['lengthMm'] - EPS else deque()
        self.moving = {item: self.positions[item] for item in self.items if item not in self.ready}


class SpatialSimulation(SimPySimulation):
    def __init__(self, payload, progress=None, cancelled=None, on_partial=None):
        machine_ids = {m['id'] for m in payload['machines']}
        compatible = deepcopy(payload)
        compatible['run']['commands'] = [c for c in payload['run'].get('commands', []) if c['equipmentId'] in machine_ids]
        super().__init__(compatible, progress, cancelled, on_partial)
        self.payload, self.run = payload, payload['run']
        self.conveyors = [SpatialConveyor(c, i, mode=c.get('initialMode', 'AUTO')) for i, c in enumerate(payload['conveyors'])]
        self.initial_inventory = 0
        self.overflow = 0
        self.belt_rng = {}
        for belt in self.conveyors:
            if 'upstreamRestartDelaySeconds' in belt.model:
                machine = self.machines[belt.index]
                machine.model['startupSeconds'] = belt.model['upstreamRestartDelaySeconds']
                if machine.enabled:
                    machine.startup_until = machine.model['startupSeconds']; self.wake(machine.startup_until)
            if 'downstreamRampUpSeconds' in belt.model:
                self.machines[belt.index+1].model['rampUpSeconds'] = belt.model['downstreamRampUpSeconds']
            self.belt_rng[belt.index] = {kind: RandomStream(self.run.get('seed', 1), belt.model['id'] + ':' + kind) for kind in ('failure', 'micro')}
            for i in range(belt.model.get('initialReadyUnits', 0)):
                item = self.new_item(); belt.items.append(item); belt.positions[item] = belt.model['lengthMm'] - i * belt.pitch; self.initial_inventory += 1
            belt.refresh(); belt.maximum = belt.inventory
            for window in belt.model.get('failures', []):
                self.schedule(window['atSecond'], 2, 'BELT_FAIL', (belt.index, None, window['durationSeconds']))
            self.arm_belt_noise(belt)
        for machine in self.machines:
            machine.state_seconds.update(WAITING_PRIME=0., BACKUP_STOP=0.)
            machine.await_prime = machine.index > 0 and self.conveyors[machine.index-1].model.get('primeSensorPositionMm') is not None
            machine.backup_stopped = False
            machine.runout_remaining = 0
        for command in payload['run'].get('commands', []):
            if command['equipmentId'] not in machine_ids:
                index = next(b.index for b in self.conveyors if b.model['id'] == command['equipmentId'])
                self.schedule(command['atSecond'], 0, 'BELT_COMMAND', (index, command['action']))

    def arm_belt_noise(self, belt):
        for kind, profile, rate in (('failure', belt.model.get('reliability'), None), ('micro', belt.model.get('microStop'), None)):
            if not profile or not belt.enabled or belt.failed or belt.micro_stopped or kind == 'micro' and belt.mode != 'AUTO' or kind in belt.timers:
                continue
            mean = profile['mtbfMinutes'] * 60 if kind == 'failure' else 60 / profile.get('probabilityPerMinute', 0) if profile.get('probabilityPerMinute', 0) > 0 else None
            if mean is None:
                continue
            delay = belt.remaining_noise.pop(kind, None)
            if delay is None:
                delay = self.belt_rng[belt.index][kind].exponential(mean)
            belt.noise_tokens[kind] += 1; belt.timers[kind] = self.now + delay
            self.schedule(self.now + delay, 2, 'BELT_NOISE', (belt.index, kind, belt.noise_tokens[kind]))

    def suspend_belt_noise(self, belt):
        for kind, at in list(belt.timers.items()):
            belt.remaining_noise[kind] = max(0., at-self.now); belt.noise_tokens[kind] += 1
        belt.timers.clear()

    def dispatch(self, kind, data):
        if kind == 'BELT_COMMAND':
            belt = self.conveyors[data[0]]; action = data[1]
            self.suspend_belt_noise(belt)
            if action == 'EMERGENCY_STOP': belt.emergency = True
            elif action == 'RESET': belt.emergency = False
            else: belt.mode = 'MANUAL' if action == 'MANUAL' else 'AUTO' if action in ('RUN', 'AUTO') else action
            self.arm_belt_noise(belt); self.log('COMMAND', belt.model['id'], action=action)
        elif kind == 'BELT_NOISE':
            index, noise, token = data; belt = self.conveyors[index]
            if token != belt.noise_tokens[noise]: return
            belt.timers.pop(noise, None); profile = belt.model['reliability' if noise == 'failure' else 'microStop']
            length = profile['mttrMinutes']*60 if noise == 'failure' else profile.get('minDurationSeconds', 0) + (profile.get('maxDurationSeconds', profile.get('minDurationSeconds', 0))-profile.get('minDurationSeconds', 0))*self.belt_rng[index]['micro'].uniform()
            if noise == 'failure': self.dispatch('BELT_FAIL', (index, None, length))
            else:
                belt.micro_stopped = True; belt.micro_count += 1; self.suspend_belt_noise(belt)
                self.schedule(self.now+length, 1, 'BELT_MICRO_END', index); self.log('MICRO_STOP_STARTED', belt.model['id'], durationSeconds=length)
        elif kind == 'BELT_FAIL':
            index, _, length = data; belt = self.conveyors[index]
            belt.failed = True; belt.failure_count += 1; self.suspend_belt_noise(belt)
            self.schedule(self.now+length, 1, 'BELT_REPAIR', index); self.log('FAILURE_STARTED', belt.model['id'], durationSeconds=length)
        elif kind in ('BELT_REPAIR', 'BELT_MICRO_END'):
            belt = self.conveyors[data]
            if kind == 'BELT_REPAIR': belt.failed = False
            else: belt.micro_stopped = False
            self.arm_belt_noise(belt); self.log('REPAIR_COMPLETED' if kind == 'BELT_REPAIR' else 'MICRO_STOP_COMPLETED', belt.model['id'])
        elif kind == 'SPATIAL_WAKE':
            belt = self.conveyors[data[0]]
            if data[1] == belt.wake_token: belt.wake_at = None
        elif kind == 'BACKUP_CONFIRM':
            belt = self.conveyors[data[0]]
            if data[1] != belt.sensor_token or not belt.backup_signal or belt.backup_latched: return
            belt.backup_latched = True; belt.stop_token += 1
            self.schedule(self.now+belt.model.get('upstreamStopResponseSeconds', 0), 1, 'BACKUP_STOP', (belt.index, belt.stop_token))
            self.log('BACKUP_SENSOR_BLOCKED', belt.model['id'])
        elif kind == 'BACKUP_STOP':
            belt = self.conveyors[data[0]]
            if data[1] != belt.stop_token or not belt.backup_latched: return
            machine = self.machines[belt.index]; machine.backup_stopped = True; machine.runout_remaining = belt.model.get('bottlesDischargedAtStop', 0)
            if machine.runout_remaining == 0: self.suspend_service(machine)
            self.log('BACKUP_STOP_RESPONSE_COMPLETED', machine.model['id'])
        elif kind == 'BACKUP_CLEAR':
            belt = self.conveyors[data[0]]
            if data[1] != belt.sensor_token or belt.backup_signal or not belt.backup_latched: return
            belt.backup_latched = False; belt.stop_token += 1
            machine = self.machines[belt.index]
            if machine.backup_stopped:
                machine.backup_stopped = False; machine.runout_remaining = 0; machine.startup_until = self.now + machine.model.get('startupSeconds', 0); self.wake(machine.startup_until)
            self.log('BACKUP_SENSOR_CLEARED', belt.model['id'])
        else:
            super().dispatch(kind, data)

    def advance(self, at):
        dt = max(0., at-self.now)
        for machine in self.machines: machine.state_seconds[machine.state] += dt
        for belt in self.conveyors:
            belt.integral += belt.inventory*dt; belt.state_seconds[belt.state] += dt
            limit = belt.model['lengthMm']
            for item in belt.items:
                belt.positions[item] = min(belt.positions[item]+belt.velocity*dt, limit)
                limit = belt.positions[item]-belt.pitch
            belt.refresh()
        self.now = at

    def sensors(self, belt):
        prime = belt.occupied(belt.model.get('primeSensorPositionMm'))
        if prime and not belt.prime_occupied:
            belt.prime_latched = True; self.log('PRIME_DETECTED', belt.model['id'])
        belt.prime_occupied = prime
        sensor=belt.model.get('backupSensorPositionMm')
        belt.backup_occupied=belt.occupied(sensor)
        # Moving product pulses are not a stationary Back-up queue. Debounce
        # applies to sustained occupation by the physically packed queue.
        control_sensor=belt.model.get('backupRestartPositionMm', sensor) if belt.backup_latched else sensor
        blocked=control_sensor is not None and any(belt.positions[item]>=control_sensor-EPS and belt.positions[item]-belt.product_length<=control_sensor+EPS for item in belt.queued)
        if blocked != belt.backup_signal:
            belt.backup_signal = blocked; belt.sensor_token += 1
            kind = 'BACKUP_CONFIRM' if blocked else 'BACKUP_CLEAR'
            delay = belt.model.get('blockedTimeDelaySeconds' if blocked else 'clearTimeDelaySeconds', 0)
            self.schedule(self.now+delay, 1, kind, (belt.index, belt.sensor_token))

    def predict(self, belt):
        if belt.velocity <= EPS or not belt.items:
            belt.wake_token += 1; belt.wake_at = None; return
        candidates = []; previous = None; previous_stopped = True
        for item in belt.items:
            position = belt.positions[item]
            limit = belt.model['lengthMm'] if previous is None else previous-belt.pitch
            stopped = previous_stopped and position >= limit-EPS
            if not stopped:
                if previous_stopped and limit-position > EPS: candidates.append((limit-position)/belt.velocity)
                for sensor in (belt.model.get('primeSensorPositionMm'), belt.model.get('backupSensorPositionMm'), belt.model.get('backupRestartPositionMm')):
                    if sensor is not None:
                        for boundary in (sensor, sensor+belt.product_length):
                            if boundary-position > EPS: candidates.append((boundary-position)/belt.velocity)
                if item == belt.items[-1]:
                    boundary = belt.model['movingPitchMm']
                    if boundary-position > EPS: candidates.append((boundary-position)/belt.velocity)
            previous, previous_stopped = position, stopped
        at = self.now+min(candidates) if candidates else None
        if at is not None and (belt.wake_at is None or abs(at-belt.wake_at)>EPS):
            belt.wake_token += 1; belt.wake_at = at; self.schedule(at, 4, 'SPATIAL_WAKE', (belt.index, belt.wake_token))

    def settle(self):
        for belt in self.conveyors: self.sensors(belt)
        for _ in range(2*len(self.machines)+2):
            changed = False
            for machine in reversed(self.machines):
                if machine.index > 0 and machine.await_prime and self.conveyors[machine.index-1].prime_latched:
                    machine.await_prime = False; machine.startup_until = self.now+machine.model.get('startupSeconds', 0); self.wake(machine.startup_until)
                operating = machine.enabled and not machine.failed and not machine.micro_stopped and self.now >= machine.startup_until-EPS
                if not operating or machine.backup_stopped and machine.runout_remaining <= 0: continue
                if machine.completed:
                    if machine.index == len(self.machines)-1: self.output += 1
                    else:
                        belt = self.conveyors[machine.index]
                        if not belt.can_enter():
                            if machine.backup_stopped and machine.runout_remaining > 0:
                                self.overflow += 1; belt.overflow += 1; self.log('OVERFLOW_SPILL', belt.model['id'], itemId=machine.item)
                            else: continue
                        else:
                            belt.items.append(machine.item); belt.positions[machine.item] = 0.; belt.admitted += 1; belt.maximum = max(belt.maximum, belt.inventory); belt.refresh()
                    machine.output += 1; machine.completed = False; machine.item = None
                    if machine.backup_stopped:
                        machine.runout_remaining -= 1
                        if machine.runout_remaining <= 0: self.suspend_service(machine)
                    changed = True
                if machine.backup_stopped and machine.runout_remaining <= 0: continue
                if machine.busy:
                    if machine.finish_at is None: self.resume_service(machine); changed = True
                    continue
                if machine.item is None and self.now < self.duration-EPS:
                    if machine.index == 0:
                        machine.item = self.new_item(); self.source_started += 1
                    else:
                        belt = self.conveyors[machine.index-1]
                        if machine.await_prime or not belt.enabled or belt.failed or belt.micro_stopped or not belt.ready:
                            if not belt.items and belt.model.get('primeSensorPositionMm') is not None:
                                belt.prime_latched = False; machine.await_prime = True
                            continue
                        machine.item = belt.items.popleft(); del belt.positions[machine.item]; belt.released += 1; belt.refresh()
                    machine.busy = True; machine.remaining = 1.; self.resume_service(machine); changed = True
            if not changed: break
        else: raise RuntimeError('Spatial fixed point did not converge')
        for machine in self.machines:
            machine.state = 'FAILED' if machine.failed else 'PAUSED' if machine.mode == 'PAUSE' and not machine.emergency else 'STOPPED' if not machine.enabled else 'MICRO_STOP' if machine.micro_stopped else 'BACKUP_STOP' if machine.backup_stopped and machine.runout_remaining <= 0 else 'STARTING' if self.now < machine.startup_until-EPS else 'BLOCKED' if machine.completed else 'RUNNING' if machine.busy else 'WAITING_PRIME' if machine.await_prime else 'STARVED'
        for belt in self.conveyors: self.sensors(belt); self.predict(belt)
        self.check_invariants()

    def check_invariants(self):
        if not hasattr(self, 'overflow'): return super().check_invariants()
        wip = sum(b.inventory for b in self.conveyors)+sum(m.item is not None for m in self.machines)
        if self.initial_inventory+self.source_started != self.output+wip+self.overflow: raise RuntimeError('Spatial material balance failed')
        for belt in self.conveyors:
            if belt.inventory > belt.capacity: raise RuntimeError('Spatial packed capacity exceeded')
            previous = belt.model['lengthMm']+belt.pitch
            for item in belt.items:
                position = belt.positions[item]
                if position < -EPS or position > previous-belt.pitch+EPS: raise RuntimeError('Spatial product overlap or out-of-bounds position')
                previous = position

    def sample(self):
        super().sample()
        for frame, belt in zip(self.samples[-1]['zones'], self.conveyors):
            frame.update(readyUnits=len(belt.queued),movingUnits=belt.inventory-len(belt.queued),positionsMm=list(belt.positions.values()),overflowUnits=belt.overflow, queueTailPositionMm=belt.positions[belt.queued[-1]]-belt.product_length if belt.queued else belt.model['lengthMm'], prime={'configured':belt.model.get('primeSensorPositionMm') is not None,'detected':belt.prime_latched,'occupied':belt.prime_occupied},backup={'configured':belt.model.get('backupSensorPositionMm') is not None,'occupied':belt.backup_occupied,'blocked':belt.backup_latched},state=belt.state,stateSeconds=dict(belt.state_seconds))

    def result(self):
        result = super().result()
        result['engine'].update(version=SPATIAL_VERSION,conveyorModel='SPATIAL_FINITE_PRODUCTS',modelEquivalentToST=False)
        result['summary']['materialBalance'].update(overflowSpilledUnits=self.overflow,residualUnits=0)
        result['summary']['overflowUnits'] = self.overflow
        for value,m in zip(result['equipment'],self.machines):
            value.update(waitingForPrimeSeconds=m.state_seconds['WAITING_PRIME'],backupStopSeconds=m.state_seconds['BACKUP_STOP'])
        for value,b in zip(result['zones'],self.conveyors):
            value.update(readyUnits=len(b.queued),movingUnits=b.inventory-len(b.queued),stateSeconds=b.state_seconds,failureCount=b.failure_count,microStopCount=b.micro_count,physicalModelEnabled=True,overflowUnits=b.overflow)
        result['limitations'] = ['Serial single-item machines; no batches, merges, splits, conversion ratios or rejects.', 'Spatial discrete products differ from the current fluid packet model; stochastic schedules are not paired.', 'Conveyor speed is constant while enabled; no conveyor acceleration ramp.', 'Residual discharge after Back-up stop spills at a full inlet, recorded as material loss; this requires plant calibration.', 'OEE remains unavailable pending a validated plant reference and reject/quality model.']
        result['diagnostics'].update(spatialCoordinates='product leading edges in mm; head stops at length, followers at packed pitch',photoeyes='per-product leading/trailing edge crossings, sustained occupancy debounce',overflowModel='counted residual discharge after response delay; full inlet spills')
        return result

