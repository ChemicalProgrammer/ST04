import { isConveyorEquipment, resolveAccumulationZoneDefinition } from './FormatGeometryAdapter.js';

export function validateSimulationInput(input) {
  const details = [];
  validateCase(input?.case, details);
  validateRun(input?.run, details);
  validateCommands(input?.run?.commands, input?.case?.equipment, details);

  return details.length === 0
    ? { ok: true }
    : {
        ok: false,
        error: {
          code: 'INVALID_SIMULATION_INPUT',
          message: 'The simulation input does not satisfy the required physical-line contract.',
          details
        }
      };
}

function validateCase(caseModel, details) {
  if (!caseModel || typeof caseModel !== 'object') {
    details.push(required('case'));
    return;
  }
  if (!Array.isArray(caseModel.equipment) || caseModel.equipment.length < 3) {
    details.push(invalid('case.equipment', 'must contain at least a machine, a conveyor, and a machine'));
    return;
  }

  const ids = new Set();
  caseModel.equipment.forEach((equipment, index) => {
    const path = 'case.equipment[' + index + ']';
    if (!equipment || typeof equipment !== 'object') {
      details.push(invalid(path, 'must be an object'));
      return;
    }
    if (!nonEmptyString(equipment.id)) details.push(required(path + '.id'));
    if (ids.has(equipment.id)) details.push(invalid(path + '.id', 'must be unique'));
    ids.add(equipment.id);
    if (!nonEmptyString(equipment.type)) details.push(required(path + '.type'));
    if(equipment.unitOfFlow!==undefined&&(typeof equipment.unitOfFlow!=='string'||equipment.unitOfFlow.trim().length>40))details.push(invalid(path+'.unitOfFlow','must be text of at most 40 characters'));
    if (!positiveNumber(equipment.nominalRatePerSecond)) {
      details.push(invalid(path + '.nominalRatePerSecond', 'must be a number greater than zero'));
    }
    if (!['AUTO', 'MANUAL', 'PAUSE', 'STOP'].includes(equipment.initialMode)) {
      details.push(invalid(path + '.initialMode', 'must be AUTO, MANUAL, PAUSE, or STOP'));
    }
    if (equipment.bufferAfterCapacity !== undefined) {
      details.push(invalid(path + '.bufferAfterCapacity', 'is no longer supported; configure the physical conveyor geometry instead'));
    }
    if (equipment.accumulationZone !== undefined) {
      details.push(invalid(path + '.accumulationZone', 'is no longer supported; configure processData.accumulation on the conveyor instead'));
    }
    validateNoiseProfile(equipment.noiseProfile, path, details);
    validateStartProfile(equipment, path, details);
  });

  validateAlternatingTopology(caseModel.equipment, details);
  caseModel.equipment.forEach((equipment, index) => {
    const path = 'case.equipment[' + index + ']';
    if (!equipment || typeof equipment !== 'object') return;
    if (isConveyorEquipment(equipment)) {
      validateConveyorGeometry(caseModel.equipment, index, path, details);
    } else if (equipment.processData?.accumulation !== undefined) {
      details.push(invalid(path + '.processData.accumulation', 'belongs only on a CONVEYOR'));
    }
  });
}

function validateAlternatingTopology(equipment, details) {
  const first = equipment[0];
  const last = equipment[equipment.length - 1];
  if (isConveyorEquipment(first)) details.push(invalid('case.equipment[0]', 'a line must start with a machine, not a conveyor'));
  if (isConveyorEquipment(last)) details.push(invalid('case.equipment[' + (equipment.length - 1) + ']', 'a line must end with a machine, not a conveyor'));

  equipment.forEach((item, index) => {
    if (!item) return;
    const path = 'case.equipment[' + index + ']';
    const previous = equipment[index - 1];
    const next = equipment[index + 1];
    if (isConveyorEquipment(item)) {
      if (!previous || isConveyorEquipment(previous) || !next || isConveyorEquipment(next)) {
        details.push(invalid(path, 'must sit between two non-conveyor machines'));
      }
    } else if (next && !isConveyorEquipment(next)) {
      details.push(invalid(path, 'must be followed by a CONVEYOR; direct machine-to-machine accumulation is not modeled'));
    }
  });
}

function validateConveyorGeometry(allEquipment, index, path, details) {
  const accumulation = allEquipment[index].processData?.accumulation;
  if (!accumulation || typeof accumulation !== 'object' || Array.isArray(accumulation)) {
    details.push(required(path + '.processData.accumulation'));
    return;
  }

  if (accumulation.speedMode !== undefined && !['AUTO', 'MANUAL'].includes(accumulation.speedMode)) details.push(invalid(path + '.processData.accumulation.speedMode', 'must be AUTO or MANUAL'));
  validateOptionalNonNegative(accumulation.movingGapMm, path + '.processData.accumulation.movingGapMm', details);
  validateOptionalNonNegative(accumulation.accumulatedGapMm, path + '.processData.accumulation.accumulatedGapMm', details);
  const resolved = resolveAccumulationZoneDefinition(allEquipment, index);
  validatePhysicalZone(resolved.definition, path + '.processData.accumulation', details);
}

function validatePhysicalZone(zone, path, details) {
  if (!zone || !['FORMAT_GEOMETRY', 'FLOWPILOT_ENGINEERING'].includes(zone.kind)) {
    details.push(invalid(path, 'could not resolve a physical conveyor zone'));
    return;
  }

  if (!positiveNumber(zone.usableLengthMm)) {
    details.push(invalid(path + '.usableLengthMm', 'must be a number greater than zero'));
  }
  if (zone.productPitchMm !== undefined && !positiveNumber(zone.productPitchMm)) {
    details.push(invalid(path + '.productPitchMm', 'must be a number greater than zero'));
  }
  if (zone.productLengthMm !== undefined && !positiveNumber(zone.productLengthMm)) {
    details.push(invalid(path + '.productLengthMm', 'must be a number greater than zero'));
  }
  if (zone.gapMm !== undefined && !nonNegativeNumber(zone.gapMm)) {
    details.push(invalid(path + '.gapMm', 'must be a number greater than or equal to zero'));
  }

  const hasExplicitPitch = positiveNumber(zone.productPitchMm);
  const hasLengthAndGap = positiveNumber(zone.productLengthMm) && nonNegativeNumber(zone.gapMm);
  if (!hasExplicitPitch && !hasLengthAndGap) {
    details.push(invalid(path, 'requires effective product pitch, or product length plus gap'));
  }

  if (zone.accumulatedPitchMm !== undefined && (!positiveNumber(zone.accumulatedPitchMm) || zone.accumulatedPitchMm < (zone.productLengthMm || 0) || zone.accumulatedPitchMm > (zone.productPitchMm ?? zone.productLengthMm + zone.gapMm))) {
    details.push(invalid(path + '.accumulatedPitchMm', 'must be between product length and moving pitch'));
  }
  const pitch = hasExplicitPitch ? zone.productPitchMm : hasLengthAndGap ? zone.productLengthMm + zone.gapMm : null;
  if (positiveNumber(zone.usableLengthMm) && positiveNumber(pitch) && Math.floor(zone.usableLengthMm / pitch) < 1) {
    details.push(invalid(path, 'usableLengthMm must hold at least one product pitch'));
  }

  if (!positiveNumber(zone.conveyorSpeedMmPerSecond)) {
    details.push(invalid(path + '.conveyorSpeedMmPerSecond', 'must be a number greater than zero'));
  }
  validateRequiredSensor(zone.primeSensorPositionMm, path + '.primeSensorPositionMm', zone.usableLengthMm, details);
  validateRequiredSensor(zone.backupSensorPositionMm, path + '.backupSensorPositionMm', zone.usableLengthMm, details);
  validateRequiredSensor(zone.backupRestartPositionMm, path + '.backupRestartPositionMm', zone.usableLengthMm, details);

  if (nonNegativeNumber(zone.backupRestartPositionMm) && nonNegativeNumber(zone.backupSensorPositionMm) &&
      zone.backupRestartPositionMm < zone.backupSensorPositionMm) {
    details.push(invalid(path + '.backupRestartPositionMm', 'must be at or downstream of backupSensorPositionMm'));
  }
  if (nonNegativeNumber(zone.backupSensorPositionMm) && nonNegativeNumber(zone.primeSensorPositionMm) &&
      zone.backupSensorPositionMm > zone.primeSensorPositionMm) {
    details.push(invalid(path + '.backupSensorPositionMm', 'must be upstream of the Prime sensor'));
  }

  validateRequiredNonNegative(zone.upstreamStopResponseSeconds, path + '.upstreamStopResponseSeconds', details);
  validateRequiredNonNegative(zone.bottlesDischargedAtStop, path + '.bottlesDischargedAtStop', details);
  validateRequiredNonNegative(zone.downstreamRampUpSeconds, path + '.downstreamRampUpSeconds', details);
  validateOptionalNonNegative(zone.blockedTimeDelaySeconds, path + '.blockedTimeDelaySeconds', details);
  validateOptionalNonNegative(zone.clearTimeDelaySeconds, path + '.clearTimeDelaySeconds', details);
  if (!nonEmptyString(zone.upstreamControlEquipmentId)) details.push(required(path + '.upstreamControlEquipmentId'));
  if (!nonEmptyString(zone.downstreamControlEquipmentId)) details.push(required(path + '.downstreamControlEquipmentId'));
}

function validateRequiredSensor(value, path, usableLengthMm, details) {
  if (!nonNegativeNumber(value)) {
    details.push(required(path));
  } else if (positiveNumber(usableLengthMm) && value > usableLengthMm) {
    details.push(invalid(path, 'must be within usableLengthMm'));
  }
}

function validateRequiredNonNegative(value, path, details) {
  if (!nonNegativeNumber(value)) details.push(required(path));
}

function validateStartProfile(equipment, path, details) {
  validateOptionalNonNegative(equipment.startupDelaySeconds, path + '.startupDelaySeconds', details);
  validateOptionalNonNegative(equipment.restartRampUpSeconds, path + '.restartRampUpSeconds', details);
  validateOptionalNonNegative(equipment.processData?.upstream?.startupTimeSeconds, path + '.processData.upstream.startupTimeSeconds', details);
  validateOptionalNonNegative(equipment.processData?.downstream?.rampUpTimeSeconds, path + '.processData.downstream.rampUpTimeSeconds', details);
}

function validateOptionalNonNegative(value, path, details) {
  if (value !== undefined && value !== null && !nonNegativeNumber(value)) {
    details.push(invalid(path, 'must be a number greater than or equal to zero'));
  }
}

function validateRun(run, details) {
  if (!run || typeof run !== 'object') {
    details.push(required('run'));
    return;
  }
  if (!positiveNumber(run.durationSeconds)) details.push(invalid('run.durationSeconds', 'must be a number greater than zero'));
  if (!positiveNumber(run.tickSeconds)) details.push(invalid('run.tickSeconds', 'must be a number greater than zero'));
  if (!Number.isInteger(run.seed)) details.push(invalid('run.seed', 'must be an integer'));
  if (run.sampleEverySeconds !== undefined && !positiveNumber(run.sampleEverySeconds)) {
    details.push(invalid('run.sampleEverySeconds', 'must be a number greater than zero'));
  }
}

function validateCommands(commands, equipment, details) {
  if (commands === undefined) return;
  if (!Array.isArray(commands)) {
    details.push(invalid('run.commands', 'must be an array'));
    return;
  }
  const equipmentIds = new Set(Array.isArray(equipment) ? equipment.map((item) => item?.id) : []);
  commands.forEach((command, index) => {
    const path = 'run.commands[' + index + ']';
    if (!command || typeof command !== 'object') {
      details.push(invalid(path, 'must be an object'));
      return;
    }
    if (!nonNegativeNumber(command.atVirtualSecond)) {
      details.push(invalid(path + '.atVirtualSecond', 'must be a number greater than or equal to zero'));
    }
    if (!equipmentIds.has(command.equipmentId)) {
      details.push(invalid(path + '.equipmentId', 'must reference an equipment unit in case.equipment'));
    }
    if (!['RUN', 'PAUSE', 'STOP', 'MANUAL', 'AUTO', 'EMERGENCY_STOP', 'RESET'].includes(command.action)) {
      details.push(invalid(path + '.action', 'is not supported'));
    }
  });
}

function validateNoiseProfile(noiseProfile, equipmentPath, details) {
  if (noiseProfile === undefined) return;
  if (!noiseProfile || typeof noiseProfile !== 'object' || Array.isArray(noiseProfile)) {
    details.push(invalid(equipmentPath + '.noiseProfile', 'must be an object'));
    return;
  }
  if (noiseProfile.microStop !== undefined) validateMicroStop(noiseProfile.microStop, equipmentPath, details);
  if (noiseProfile.reliability !== undefined) validateReliability(noiseProfile.reliability, equipmentPath, details);
}

function validateMicroStop(microStop, equipmentPath, details) {
  const path = equipmentPath + '.noiseProfile.microStop';
  if (!microStop || typeof microStop !== 'object' || Array.isArray(microStop)) {
    details.push(invalid(path, 'must be an object'));
    return;
  }
  if (microStop.probabilityPerMinute !== undefined && !nonNegativeNumber(microStop.probabilityPerMinute)) {
    details.push(invalid(path + '.probabilityPerMinute', 'must be a number greater than or equal to zero'));
  }
  if (microStop.minDurationSeconds !== undefined && !nonNegativeNumber(microStop.minDurationSeconds)) {
    details.push(invalid(path + '.minDurationSeconds', 'must be a number greater than or equal to zero'));
  }
  if (microStop.maxDurationSeconds !== undefined && !nonNegativeNumber(microStop.maxDurationSeconds)) {
    details.push(invalid(path + '.maxDurationSeconds', 'must be a number greater than or equal to zero'));
  }
  if (nonNegativeNumber(microStop.minDurationSeconds) && nonNegativeNumber(microStop.maxDurationSeconds) &&
      microStop.minDurationSeconds > microStop.maxDurationSeconds) {
    details.push(invalid(path + '.maxDurationSeconds', 'must be greater than or equal to minDurationSeconds'));
  }
}

function validateReliability(reliability, equipmentPath, details) {
  const path = equipmentPath + '.noiseProfile.reliability';
  if (!reliability || typeof reliability !== 'object' || Array.isArray(reliability)) {
    details.push(invalid(path, 'must be an object'));
    return;
  }
  if (!positiveNumber(reliability.mtbfMinutes)) {
    details.push(invalid(path + '.mtbfMinutes', 'must be a number greater than zero'));
  }
  if (!positiveNumber(reliability.mttrMinutes)) {
    details.push(invalid(path + '.mttrMinutes', 'must be a number greater than zero'));
  }
}

function required(path) { return { path, reason: 'is required' }; }
function invalid(path, reason) { return { path, reason }; }
function positiveNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function nonNegativeNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nonEmptyString(value) { return typeof value === 'string' && value.length > 0; }
