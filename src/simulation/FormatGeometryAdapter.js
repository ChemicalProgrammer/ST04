import { calculateConveyorEngineering } from './ConveyorEngineering.js';

export function resolveAccumulationZoneDefinition(allEquipment, ownerIndex) {
  const equipment = Array.isArray(allEquipment) ? allEquipment : [];
  const owner = equipment[ownerIndex];
  if (!owner) {
    return { definition: undefined, origin: 'NONE', sources: {}, assumptions: [] };
  }

  if (isConveyorEquipment(owner)) {
    return resolveConveyorZone(equipment, owner, ownerIndex);
  }

  const next = equipment[ownerIndex + 1];
  if (isConveyorEquipment(next)) {
    return {
      definition: {
        kind: 'INTERNAL_HANDOFF',
        id: owner.id + '--handoff--' + next.id,
        name: owner.name + ' handoff to ' + next.name,
        upstreamControlEquipmentId: owner.id,
        downstreamControlEquipmentId: next.id
      },
      origin: 'INTERNAL_HANDOFF',
      sources: {},
      assumptions: ['Internal handoff: no abstract buffer is modeled between a machine and its following conveyor.']
    };
  }

  return { definition: undefined, origin: 'NONE', sources: {}, assumptions: [] };
}

export function isConveyorEquipment(equipment) {
  return Boolean(equipment && (equipment.type === 'CONVEYOR' || equipment.processData?.role === 'CONVEYOR'));
}

export function hasFormatAccumulationData(equipment) {
  return Boolean(equipment?.processData?.accumulation &&
    typeof equipment.processData.accumulation === 'object' &&
    !Array.isArray(equipment.processData.accumulation));
}

function resolveConveyorZone(equipment, owner, ownerIndex) {
  const format = owner.processData?.accumulation || {};
  const upstreamControl = findNearestNonConveyor(equipment, ownerIndex - 1, -1);
  const downstreamControl = findNearestNonConveyor(equipment, ownerIndex + 1, 1);
  const resolved = hasFlowPilotInputs(owner, format)
    ? resolveFlowPilotConveyor(owner, format, upstreamControl, downstreamControl)
    : resolveDirectPhysicalConveyor(owner, format, upstreamControl, downstreamControl);
  if (format.speedMode === 'MANUAL') {
    resolved.definition.conveyorSpeedMmPerSecond = format.conveyorSpeedMmPerSecond;
    resolved.sources.conveyorSpeedMmPerSecond = 'processData.accumulation.conveyorSpeedMmPerSecond';
    for (const key of ['packagePassSensorSeconds', 'sensorClearGapSeconds', 'sensorCycleSeconds']) delete resolved.definition[key];
    resolved.assumptions.push('Manual belt speed overrides the engineering speed calculation.');
  }
  const definition = resolved.definition;
  if (format.movingGapMm !== undefined) {
    definition.productPitchMm = definition.productLengthMm + format.movingGapMm;
    definition.gapMm = format.movingGapMm;
    resolved.sources.productPitchMm = 'product length + processData.accumulation.movingGapMm';
    for (const key of ['packagePassSensorSeconds', 'sensorClearGapSeconds', 'sensorCycleSeconds']) delete definition[key];
  }
  definition.accumulatedPitchMm = format.accumulatedPitchMm ??
    (definition.productLengthMm !== undefined ? definition.productLengthMm + (format.accumulatedGapMm ?? 0) : definition.productPitchMm);
  resolved.sources.accumulatedPitchMm = format.accumulatedPitchMm !== undefined ? 'processData.accumulation.accumulatedPitchMm' : 'product length + accumulated gap (default 0 mm)';
  if (definition.engineering) {
    // Runtime geometry may override worksheet speed/spacing. Preserve the
    // worksheet audit separately rather than presenting it as the active model.
    definition.engineering.runtimeGeometry = {
      speedMode: format.speedMode || 'AUTO',
      conveyorSpeedMmPerSecond: definition.conveyorSpeedMmPerSecond,
      movingPitchMm: definition.productPitchMm,
      accumulatedPitchMm: definition.accumulatedPitchMm,
      transferCapacityPerSecond: definition.conveyorSpeedMmPerSecond / definition.productPitchMm,
      capacityUnits: Math.floor(definition.usableLengthMm / definition.accumulatedPitchMm)
    };
  }
  return resolved;
}

function resolveFlowPilotConveyor(owner, format, upstreamControl, downstreamControl) {
  const sources = {};
  const packageLength = selectValue([
    sourceValue(owner.processData?.upstream?.packageLengthMm, 'processData.upstream.packageLengthMm'),
    sourceValue(upstreamControl?.processData?.upstream?.packageLengthMm, 'upstream processData.upstream.packageLengthMm')
  ]);
  const dischargePitch = selectValue([
    sourceValue(owner.processData?.upstream?.dischargePitchMm, 'processData.upstream.dischargePitchMm'),
    sourceValue(upstreamControl?.processData?.upstream?.dischargePitchMm, 'upstream processData.upstream.dischargePitchMm')
  ]);
  const conveyorSpeedFactor = selectValue([
    sourceValue(format.conveyorSpeedFactorPercent, 'processData.accumulation.conveyorSpeedFactorPercent'),
    sourceValue(owner.processData?.speedAndSensors?.conveyorSpeedFactorVsDischargeVelocityPercent, 'processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent')
  ]);
  const installedLength = sourceValue(owner.processData?.geometry?.lactMm, 'processData.geometry.lactMm');
  const primeReserve = sourceValue(owner.processData?.geometry?.lpPrimeMm, 'processData.geometry.lpPrimeMm');
  const downstreamHighSpeed = selectValue([
    sourceValue(format.useNominalDesignSpeed ? rateBpm(downstreamControl) : undefined, 'downstream nominalRatePerSecond'),
    sourceValue(downstreamControl?.processData?.equipment?.maximumSpeedBpm, 'downstream processData.equipment.maximumSpeedBpm'),
    sourceValue(rateBpm(downstreamControl), 'downstream nominalRatePerSecond')
  ]);
  const downstreamInfeedPitch = selectValue([
    sourceValue(format.useNominalDesignSpeed ? owner.processData?.downstream?.infeedPitchMm : undefined, 'processData.downstream.infeedPitchMm'),
    sourceValue(downstreamControl?.processData?.downstream?.infeedPitchMm, 'downstream processData.downstream.infeedPitchMm'),
    sourceValue(owner.processData?.downstream?.infeedPitchMm, 'processData.downstream.infeedPitchMm')
  ]);
  const upstreamStopResponse = sourceValue(format.upstreamStopResponseSeconds, 'processData.accumulation.upstreamStopResponseSeconds');
  const bottlesDischargedAtStop = selectValue([
    sourceValue(format.bottlesDischargedAtStop, 'processData.accumulation.bottlesDischargedAtStop'),
    sourceValue(upstreamControl?.processData?.upstream?.bottlesDischargedAtStop, 'upstream processData.upstream.bottlesDischargedAtStop')
  ]);
  const downstreamRampUp = selectValue([
    sourceValue(format.downstreamRampUpSeconds, 'processData.accumulation.downstreamRampUpSeconds'),
    sourceValue(downstreamControl?.processData?.downstream?.rampUpTimeSeconds, 'downstream processData.downstream.rampUpTimeSeconds')
  ]);
  const calculation = calculateConveyorEngineering({
    installedLengthMm: installedLength.value,
    primeReserveMm: primeReserve.value,
    packageLengthMm: packageLength.value,
    upstreamDischargePitchMm: dischargePitch.value,
    upstreamNominalSpeedBpm: rateBpm(upstreamControl),
    downstreamHighSpeedBpm: downstreamHighSpeed.value,
    downstreamInfeedPitchMm: downstreamInfeedPitch.value,
    conveyorSpeedFactorPercent: conveyorSpeedFactor.value,
    codingSpeedFactorPercent: owner.processData?.speedAndSensors?.codingConveyorSpeedFactorVsPreviousConveyorPercent,
    accumulationSpeedFactorPercent: owner.processData?.speedAndSensors?.conveyorSpeedFactorVsPreviousConveyorPercent,
    infeedOverspeedPercent: owner.processData?.speedAndSensors?.overspeedVsInfeedScrewPercent,
    dischargeRunoutLengthMm: owner.processData?.geometry?.actualDischargeMm ?? format.dischargeRunoutLengthMm,
    rejectRunoutLengthMm: owner.processData?.geometry?.actualCodingMm ?? format.rejectRunoutLengthMm,
    blockedTimeDelaySeconds: format.blockedTimeDelaySeconds,
    clearTimeDelaySeconds: format.clearTimeDelaySeconds,
    insuranceFactorUnits: format.insuranceFactorUnits,
    backupSensorPositionMm: format.backupSensorPositionMm,
    upstreamStopResponseSeconds: upstreamStopResponse.value,
    bottlesDischargedAtStop: bottlesDischargedAtStop.value,
    downstreamRampUpSeconds: downstreamRampUp.value,
    upstreamStartupTimeSeconds: owner.processData?.upstream?.startupTimeSeconds ?? upstreamControl?.processData?.upstream?.startupTimeSeconds
  });
  const derived = calculation.calculated;
  const definition = {
    kind: 'FLOWPILOT_ENGINEERING',
    id: format.id || owner.id + '--physical-zone',
    name: format.name || (owner.name || owner.id) + ' accumulation',
    upstreamControlEquipmentId: upstreamControl?.id,
    downstreamControlEquipmentId: downstreamControl?.id,
    engineering: calculation,
    upstreamRestartDelaySeconds: calculation.input.upstreamStartupTimeSeconds
  };

  assignIfDefined(definition, 'usableLengthMm', calculation.input.installedLengthMm, sources, installedLength.source);
  assignIfDefined(definition, 'productLengthMm', packageLength.value, sources, packageLength.source);
  assignIfDefined(definition, 'gapMm', derived.productGapMm, sources, 'calculated: effective pitch - package length');
  assignIfDefined(definition, 'productPitchMm', derived.effectiveProductPitchMm, sources, 'calculated: package length / population');
  assignIfDefined(definition, 'conveyorSpeedMmPerSecond', derived.conveyorSpeedMmPerSecond, sources, 'calculated: discharge velocity × (1 + speed factor)');
  assignIfDefined(definition, 'packagePassSensorSeconds', derived.packagePassSensorSeconds, sources,
    'calculated: package length / conveyor speed');
  assignIfDefined(definition, 'sensorClearGapSeconds', derived.sensorClearGapSeconds, sources,
    'calculated: product gap / conveyor speed');
  assignIfDefined(definition, 'sensorCycleSeconds', derived.sensorCycleSeconds, sources,
    'calculated: product pitch / conveyor speed');
  assignIfDefined(definition, 'primeSensorPositionMm', derived.primeSensorPositionMm, sources, 'calculated: L_act - L_p');
  assignIfDefined(definition, 'backupSensorPositionMm', derived.actualBackupSensorPositionMm, sources,
    isDefined(format.backupSensorPositionMm) ? 'processData.accumulation.backupSensorPositionMm' : 'calculated: required overflow length L_bu');
  assignIfDefined(definition, 'backupRestartPositionMm', derived.actualBackupSensorPositionMm, sources,
    'same Back-up position; Clear Time Delay provides the restart debounce');
  assignIfDefined(definition, 'blockedTimeDelaySeconds', calculation.input.blockedTimeDelaySeconds, sources,
    'processData.accumulation.blockedTimeDelaySeconds');
  assignIfDefined(definition, 'clearTimeDelaySeconds', calculation.input.clearTimeDelaySeconds, sources,
    'processData.accumulation.clearTimeDelaySeconds');
  assignIfDefined(definition, 'upstreamStopResponseSeconds', calculation.input.upstreamStopResponseSeconds, sources,
    upstreamStopResponse.source);
  assignIfDefined(definition, 'bottlesDischargedAtStop', calculation.input.bottlesDischargedAtStop, sources,
    bottlesDischargedAtStop.source);
  assignIfDefined(definition, 'downstreamRampUpSeconds', calculation.input.downstreamRampUpSeconds, sources,
    downstreamRampUp.source);

  return {
    definition,
    origin: 'FLOWPILOT_ENGINEERING',
    sources,
    assumptions: [
      'FlowPilot geometry is active by default: L_act, L_p, package pitch, speed factor, and sensor delays are converted to the physical zone.',
      'Positions are measured from upstream discharge toward downstream infeed.',
      'Prime is L_act - L_p. If no installed Back-up position is supplied, L_bu is used as the calculated recommendation.'
    ]
  };
}

function resolveDirectPhysicalConveyor(owner, format, upstreamControl, downstreamControl) {
  const sources = {};
  const usableLength = selectValue([
    sourceValue(format.usableLengthMm, 'processData.accumulation.usableLengthMm')
  ]);
  const productLength = selectValue([
    sourceValue(format.productLengthMm, 'processData.accumulation.productLengthMm'),
    sourceValue(owner.processData?.upstream?.packageLengthMm, 'processData.upstream.packageLengthMm')
  ]);
  const gap = selectValue([
    sourceValue(format.gapMm, 'processData.accumulation.gapMm')
  ]);
  const explicitPitch = selectValue([
    sourceValue(format.productPitchMm, 'processData.accumulation.productPitchMm')
  ]);
  const pitch = selectValue([
    explicitPitch,
    sourceValue(
      sumNumericValues(productLength.value, gap.value),
      productLength.source && gap.source ? productLength.source + ' + ' + gap.source : undefined
    )
  ]);
  const conveyorSpeed = selectValue([
    sourceValue(format.conveyorSpeedMmPerSecond, 'processData.accumulation.conveyorSpeedMmPerSecond')
  ]);
  const primeSensor = selectValue([
    sourceValue(format.primeSensorPositionMm, 'processData.accumulation.primeSensorPositionMm')
  ]);
  const backupSensor = selectValue([
    sourceValue(format.backupSensorPositionMm, 'processData.accumulation.backupSensorPositionMm')
  ]);
  const backupRestart = selectValue([
    sourceValue(format.backupRestartPositionMm, 'processData.accumulation.backupRestartPositionMm')
  ]);
  const upstreamStopResponse = sourceValue(format.upstreamStopResponseSeconds, 'processData.accumulation.upstreamStopResponseSeconds');
  const bottlesDischargedAtStop = selectValue([
    sourceValue(format.bottlesDischargedAtStop, 'processData.accumulation.bottlesDischargedAtStop'),
    sourceValue(
      upstreamControl?.processData?.upstream?.bottlesDischargedAtStop,
      'upstream processData.upstream.bottlesDischargedAtStop'
    )
  ]);
  const downstreamRampUp = selectValue([
    sourceValue(format.downstreamRampUpSeconds, 'processData.accumulation.downstreamRampUpSeconds'),
    sourceValue(
      downstreamControl?.processData?.downstream?.rampUpTimeSeconds,
      'downstream processData.downstream.rampUpTimeSeconds'
    )
  ]);

  const definition = {
    kind: 'FORMAT_GEOMETRY',
    id: format.id || owner.id + '--physical-zone',
    name: format.name || (owner.name || owner.id) + ' accumulation',
    upstreamControlEquipmentId: upstreamControl?.id,
    downstreamControlEquipmentId: downstreamControl?.id
  };
  assignIfDefined(definition, 'usableLengthMm', usableLength.value, sources, usableLength.source);
  assignIfDefined(definition, 'productLengthMm', productLength.value, sources, productLength.source);
  assignIfDefined(definition, 'gapMm', gap.value, sources, gap.source);
  assignIfDefined(definition, 'productPitchMm', pitch.value, sources, pitch.source);
  assignIfDefined(definition, 'conveyorSpeedMmPerSecond', conveyorSpeed.value, sources, conveyorSpeed.source);
  assignIfDefined(definition, 'primeSensorPositionMm', primeSensor.value, sources, primeSensor.source);
  assignIfDefined(definition, 'backupSensorPositionMm', backupSensor.value, sources, backupSensor.source);
  assignIfDefined(definition, 'backupRestartPositionMm', backupRestart.value, sources, backupRestart.source);
  assignIfDefined(definition, 'blockedTimeDelaySeconds', format.blockedTimeDelaySeconds, sources, 'processData.accumulation.blockedTimeDelaySeconds');
  assignIfDefined(definition, 'clearTimeDelaySeconds', format.clearTimeDelaySeconds, sources, 'processData.accumulation.clearTimeDelaySeconds');
  assignIfDefined(definition, 'upstreamStopResponseSeconds', upstreamStopResponse.value, sources, upstreamStopResponse.source);
  assignIfDefined(definition, 'bottlesDischargedAtStop', bottlesDischargedAtStop.value, sources, bottlesDischargedAtStop.source);
  assignIfDefined(definition, 'downstreamRampUpSeconds', downstreamRampUp.value, sources, downstreamRampUp.source);

  return {
    definition,
    origin: 'FORMAT_GEOMETRY',
    sources,
    assumptions: [
      'This conveyor uses direct named physical geometry.',
      'Prime and Back-up positions are explicit; FlowPilot L_act and L_p are not available on this Case.',
      'The upstream and downstream controlled equipment are inferred from the line sequence.'
    ]
  };
}

function hasFlowPilotInputs(owner, format) {
  return [
    owner.processData?.geometry?.lactMm,
    owner.processData?.geometry?.lpPrimeMm,
    format.conveyorSpeedFactorPercent,
    owner.processData?.speedAndSensors?.conveyorSpeedFactorVsDischargeVelocityPercent
  ].some(isDefined);
}

function findNearestNonConveyor(equipment, startIndex, direction) {
  for (let index = startIndex; index >= 0 && index < equipment.length; index += direction) {
    const candidate = equipment[index];
    if (candidate && !isConveyorEquipment(candidate)) return candidate;
  }
  return undefined;
}

function rateBpm(equipment) {
  return isFiniteNumber(equipment?.nominalRatePerSecond) ? equipment.nominalRatePerSecond * 60 : undefined;
}

function selectValue(candidates) {
  for (const candidate of candidates) {
    if (candidate && isDefined(candidate.value)) return candidate;
  }
  return { value: undefined, source: undefined };
}

function sourceValue(value, source) {
  return { value, source };
}

function sumNumericValues(left, right) {
  return isFiniteNumber(left) && isFiniteNumber(right) ? left + right : undefined;
}

function assignIfDefined(target, key, value, sources, source) {
  if (!isDefined(value)) return;
  target[key] = value;
  if (sources && source) sources[key] = source;
}

function isDefined(value) {
  return value !== undefined && value !== null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
