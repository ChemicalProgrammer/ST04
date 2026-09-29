import assert from 'node:assert/strict';
import test from 'node:test';

import { simulateLine } from '../src/simulation/LineSimulationEngine.js';

function createPhysicalLine(overrides = {}) {
  const line = {
    id: 'physical-line',
    unitOfFlow: 'bottles',
    equipment: [
      {
        id: 'source',
        type: 'BLOWMOLDER',
        name: 'Source',
        nominalRatePerSecond: 10,
        initialMode: 'AUTO',
        processData: {
          upstream: { startupTimeSeconds: 0, bottlesDischargedAtStop: 1 },
          downstream: { rampUpTimeSeconds: 1 }
        }
      },
      {
        id: 'conveyor',
        type: 'CONVEYOR',
        name: 'Conveyor',
        nominalRatePerSecond: 12,
        initialMode: 'AUTO',
        processData: {
          role: 'CONVEYOR',
          accumulation: {
            usableLengthMm: 100,
            productLengthMm: 8,
            gapMm: 2,
            conveyorSpeedMmPerSecond: 100,
            primeSensorPositionMm: 50,
            backupSensorPositionMm: 30,
            backupRestartPositionMm: 40,
            upstreamStopResponseSeconds: 0,
            bottlesDischargedAtStop: 1,
            downstreamRampUpSeconds: 1
          }
        }
      },
      {
        id: 'downstream',
        type: 'PUCKER',
        name: 'Downstream',
        nominalRatePerSecond: 10,
        initialMode: 'AUTO',
        processData: {
          upstream: { startupTimeSeconds: 0, bottlesDischargedAtStop: 1 },
          downstream: { rampUpTimeSeconds: 1 }
        }
      }
    ]
  };
  return Object.assign(line, overrides);
}

function createInput(overrides = {}) {
  return {
    case: createPhysicalLine(),
    run: {
      durationSeconds: 20,
      tickSeconds: 1,
      sampleEverySeconds: 1,
      seed: 20260910,
      ...overrides
    }
  };
}

function createDebouncedSensorLine() {
  return {
    id: 'debounced-sensor-line',
    unitOfFlow: 'bottles',
    equipment: [
      {
        id: 'source', type: 'FILLER', name: 'Source', nominalRatePerSecond: 2, initialMode: 'AUTO',
        processData: { upstream: { startupTimeSeconds: 0, bottlesDischargedAtStop: 0 }, downstream: { rampUpTimeSeconds: 0 } }
      },
      {
        id: 'conveyor', type: 'CONVEYOR', name: 'Conveyor', nominalRatePerSecond: 2, initialMode: 'AUTO',
        processData: {
          role: 'CONVEYOR',
          accumulation: {
            usableLengthMm: 1000,
            productLengthMm: 80,
            gapMm: 20,
            conveyorSpeedMmPerSecond: 200,
            primeSensorPositionMm: 900,
            backupSensorPositionMm: 800,
            backupRestartPositionMm: 800,
            blockedTimeDelaySeconds: 0.5,
            clearTimeDelaySeconds: 0.5,
            upstreamStopResponseSeconds: 0,
            bottlesDischargedAtStop: 0,
            downstreamRampUpSeconds: 0
          }
        }
      },
      {
        id: 'downstream', type: 'SLEEVER', name: 'Downstream', nominalRatePerSecond: 2, initialMode: 'AUTO',
        processData: { upstream: { startupTimeSeconds: 0, bottlesDischargedAtStop: 0 }, downstream: { rampUpTimeSeconds: 0 } }
      }
    ]
  };
}

test('returns a structured error when required input is absent', () => {
  const response = simulateLine({});
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'INVALID_SIMULATION_INPUT');
  assert.ok(response.error.details.some((detail) => detail.path === 'case'));
});

test('repeats exactly with the same physical case, run configuration, and seed', () => {
  const first = simulateLine(createInput());
  const second = simulateLine(createInput());

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.result.summary, second.result.summary);
  assert.deepEqual(first.result.events, second.result.events);
  assert.deepEqual(first.result.samples, second.result.samples);
});

test('reports equipment OEE and global line OEE with an explicit pacemaker reference', () => {
  const input = createInput({ durationSeconds: 20 });
  input.case.equipment[0].type = 'PACEMAKER';
  input.case.equipment[0].processData.role = 'PACEMAKER';

  const response = simulateLine(input);

  assert.equal(response.ok, true);
  assert.equal(response.result.summary.lineOeePacemakerEquipmentId, 'source');
  assert.equal(response.result.summary.lineOeeReference, 'EXPLICIT_PACEMAKER');
  assert.ok(response.result.summary.lineOeePercent >= 0 && response.result.summary.lineOeePercent <= 100);
  const metrics = response.result.equipmentMetrics.source;
  assert.ok(metrics.oeePercent >= 0 && metrics.oeePercent <= 100);
  assert.ok(metrics.availabilityPercent >= 0 && metrics.availabilityPercent <= 100);
  assert.ok(metrics.performancePercent >= 0 && metrics.performancePercent <= 100);
  assert.equal(metrics.qualityPercent, 100);
  assert.equal(metrics.qualityAssumption, 'NO_REJECT_MODEL_ASSUMES_100_PERCENT');
  assert.ok(response.result.samples.at(-1).equipment[0].oeePercent >= 0);
});

test('starts with the downstream machine waiting for the physical Prime sensor', () => {
  const response = simulateLine(createInput({ durationSeconds: 1 }));
  const initial = response.result.samples[0];
  const downstream = initial.equipment.find((item) => item.id === 'downstream');

  assert.equal(response.ok, true);
  assert.equal(downstream.availabilityState, 'WAITING_FOR_PRIME');
  assert.equal(downstream.actualRatePerSecond, 0);
  assert.equal(initial.accumulationZones.length, 1);
});

test('derives capacity and travel from mandatory geometry', () => {
  const response = simulateLine(createInput({ durationSeconds: 1 }));
  const zone = response.result.samples[0].accumulationZones[0];

  assert.equal(response.ok, true);
  assert.equal(zone.modelOrigin, 'FORMAT_GEOMETRY');
  assert.equal(zone.capacityUnits, 12);
  assert.equal(zone.geometry.accumulatedPitchMm, 8);
  assert.equal(zone.geometry.productPitchMm, 10);
  assert.equal(zone.geometry.travelSeconds, 1);
  assert.equal(zone.upstreamControlEquipmentId, 'source');
  assert.equal(zone.downstreamControlEquipmentId, 'downstream');
});

test('rejects abstract buffers and explicit accumulation-zone overrides', () => {
  const buffered = createInput();
  buffered.case.equipment[0].bufferAfterCapacity = 100;
  const override = createInput();
  override.case.equipment[1].accumulationZone = { usableLengthMm: 100 };

  const first = simulateLine(buffered);
  const second = simulateLine(override);

  assert.equal(first.ok, false);
  assert.ok(first.error.details.some((detail) => detail.path.endsWith('.bufferAfterCapacity')));
  assert.equal(second.ok, false);
  assert.ok(second.error.details.some((detail) => detail.path.endsWith('.accumulationZone')));
});

test('rejects a conveyor without complete physical geometry', () => {
  const input = createInput();
  delete input.case.equipment[1].processData.accumulation.primeSensorPositionMm;

  const response = simulateLine(input);

  assert.equal(response.ok, false);
  assert.ok(response.error.details.some((detail) =>
    detail.path === 'case.equipment[1].processData.accumulation.primeSensorPositionMm'
  ));
});

test('Prime starts downstream and Back-up requests a controlled upstream stop', () => {
  const response = simulateLine(createInput({ durationSeconds: 10 }));

  assert.equal(response.ok, true);
  assert.ok(response.result.events.some((event) => event.type === 'PRIME_SENSOR_TRIGGERED'));
  assert.ok(response.result.events.some((event) => event.type === 'BACKUP_SENSOR_BLOCKED'));
  assert.ok(response.result.equipmentMetrics.source.backupStopSeconds > 0);
});

test('a stopped conveyor freezes material travel until it runs again', () => {
  const response = simulateLine(createInput({
    durationSeconds: 8,
    commands: [
      { atVirtualSecond: 2, equipmentId: 'conveyor', action: 'PAUSE' },
      { atVirtualSecond: 5, equipmentId: 'conveyor', action: 'RUN' }
    ]
  }));

  assert.equal(response.ok, true);
  const primeEvent = response.result.events.find((event) => event.type === 'PRIME_SENSOR_TRIGGERED');
  assert.ok(primeEvent);
  assert.ok(primeEvent.atVirtualSecond >= 5);
});

test('normal product pulses are visible at photoeyes but do not trigger Back-up control', () => {
  const response = simulateLine({
    case: createDebouncedSensorLine(),
    run: { durationSeconds: 12, tickSeconds: 0.1, sampleEverySeconds: 0.5, seed: 7 }
  });

  assert.equal(response.ok, true);
  const metrics = response.result.accumulationZoneMetrics['conveyor--physical-zone'];
  assert.ok(metrics.primePassedUnits > 0);
  assert.ok(metrics.backupPassedUnits > 0);
  assert.ok(metrics.backupSignalPulsingSeconds > 0);
  assert.equal(response.result.events.some((event) => event.type === 'BACKUP_SENSOR_BLOCKED'), false);
  assert.ok(response.result.samples.some((sample) => {
    const zone = sample.accumulationZones[0];
    return zone && zone.inventoryUnits === Number((zone.inTransitUnits + zone.waitingUnits).toFixed(6));
  }));
});

test('Back-up needs a sustained blocked signal and a sustained clear signal before restart', () => {
  const response = simulateLine({
    case: createDebouncedSensorLine(),
    run: {
      durationSeconds: 20,
      tickSeconds: 0.1,
      sampleEverySeconds: 0.5,
      seed: 7,
      commands: [
        { atVirtualSecond: 6, equipmentId: 'downstream', action: 'PAUSE' },
        { atVirtualSecond: 12, equipmentId: 'downstream', action: 'RUN' }
      ]
    }
  });

  assert.equal(response.ok, true);
  const blocked = response.result.events.find((event) => event.type === 'BACKUP_SENSOR_BLOCKED');
  const cleared = response.result.events.find((event) => event.type === 'BACKUP_SENSOR_CLEARED');
  assert.ok(blocked);
  assert.ok(cleared);
  assert.ok(blocked.atVirtualSecond >= 6.5);
  assert.ok(cleared.atVirtualSecond >= 12.5);
  assert.ok(response.result.accumulationZoneMetrics['conveyor--physical-zone'].backupSignalBlockedSeconds >= 0.5);
});

test('uses MTBF and MTTR as seeded failure and repair events', () => {
  const input = createInput({ durationSeconds: 120, seed: 19 });
  input.case.equipment[2].noiseProfile = {
    reliability: { mtbfMinutes: 0.1, mttrMinutes: 0.05 }
  };

  const first = simulateLine(input);
  const second = simulateLine(structuredClone(input));

  assert.equal(first.ok, true);
  assert.deepEqual(first.result.events, second.result.events);
  assert.ok(first.result.events.some((event) => event.type === 'FAILURE_STARTED' && event.equipmentId === 'downstream'));
  assert.ok(first.result.equipmentMetrics.downstream.failureSeconds > 0);
});
