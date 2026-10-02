/**
 * Deterministic conveyor-design calculations based on the FlowPilot / CAT
 * engineering worksheet.  All linear rates below use millimetres per second
 * so the result can be consumed directly by the event simulation.
 */
export function calculateConveyorEngineering(input = {}) {
  const values = normaliseInput(input);
  const calculated = calculate(values);
  const audit = createAudit(values, calculated);

  return { input: values, calculated, audit };
}

function normaliseInput(input) {
  return {
    installedLengthMm: numberOrUndefined(input.installedLengthMm),
    primeReserveMm: numberOrUndefined(input.primeReserveMm),
    packageLengthMm: numberOrUndefined(input.packageLengthMm),
    upstreamDischargePitchMm: numberOrUndefined(input.upstreamDischargePitchMm),
    upstreamNominalSpeedBpm: numberOrUndefined(input.upstreamNominalSpeedBpm),
    downstreamHighSpeedBpm: numberOrUndefined(input.downstreamHighSpeedBpm),
    downstreamInfeedPitchMm: numberOrUndefined(input.downstreamInfeedPitchMm),
    conveyorSpeedFactorPercent: numberOrUndefined(input.conveyorSpeedFactorPercent),
    codingSpeedFactorPercent: nonNegativeOrDefault(input.codingSpeedFactorPercent, 0),
    accumulationSpeedFactorPercent: nonNegativeOrDefault(input.accumulationSpeedFactorPercent, 0),
    infeedOverspeedPercent: nonNegativeOrDefault(input.infeedOverspeedPercent, 5),
    dischargeRunoutLengthMm: nonNegativeOrDefault(input.dischargeRunoutLengthMm, 0),
    rejectRunoutLengthMm: nonNegativeOrDefault(input.rejectRunoutLengthMm, 0),
    blockedTimeDelaySeconds: nonNegativeOrDefault(input.blockedTimeDelaySeconds, 0),
    clearTimeDelaySeconds: nonNegativeOrDefault(input.clearTimeDelaySeconds, 0),
    insuranceFactorUnits: nonNegativeOrDefault(input.insuranceFactorUnits, 0),
    backupSensorPositionMm: numberOrUndefined(input.backupSensorPositionMm),
    upstreamStopResponseSeconds: nonNegativeOrDefault(input.upstreamStopResponseSeconds, 0),
    bottlesDischargedAtStop: nonNegativeOrDefault(input.bottlesDischargedAtStop, 0),
    downstreamRampUpSeconds: nonNegativeOrDefault(input.downstreamRampUpSeconds, 0),
    upstreamStartupTimeSeconds: nonNegativeOrDefault(input.upstreamStartupTimeSeconds, 0)
  };
}

function calculate(values) {
  const upstreamDischargeVelocityMmPerSecond = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.upstreamDischargePitchMm,
    60
  );
  const machineOutputRateMmPerSecond = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.packageLengthMm,
    60
  );
  const dischargeZoneSpeedMmPerSecond = isFiniteNumber(upstreamDischargeVelocityMmPerSecond) &&
    isFiniteNumber(values.conveyorSpeedFactorPercent)
    ? upstreamDischargeVelocityMmPerSecond * (1 + values.conveyorSpeedFactorPercent / 100)
    : undefined;
  const codingZoneSpeedMmPerSecond = multiplyIfFinite(dischargeZoneSpeedMmPerSecond, 1 + values.codingSpeedFactorPercent / 100);
  const conveyorSpeedMmPerSecond = multiplyIfFinite(codingZoneSpeedMmPerSecond, 1 + values.accumulationSpeedFactorPercent / 100);
  const dischargePopulationPercent = safeDivide(machineOutputRateMmPerSecond, dischargeZoneSpeedMmPerSecond, 100);
  const codingPopulationPercent = safeDivide(machineOutputRateMmPerSecond, codingZoneSpeedMmPerSecond, 100);
  const populationPercent = safeDivide(machineOutputRateMmPerSecond, conveyorSpeedMmPerSecond, 100);
  const effectiveProductPitchMm = safeDivide(values.packageLengthMm, populationPercent, 100);
  const productGapMm = isFiniteNumber(effectiveProductPitchMm) && isFiniteNumber(values.packageLengthMm)
    ? effectiveProductPitchMm - values.packageLengthMm
    : undefined;
  // A photoeye normally sees short occupied and clear intervals as packages
  // pass.  These are design values, not the continuous Back-up condition
  // produced by a queue reaching the sensor.
  const packagePassSensorSeconds = safeDivide(values.packageLengthMm, conveyorSpeedMmPerSecond);
  const sensorClearGapSeconds = safeDivide(productGapMm, conveyorSpeedMmPerSecond);
  const sensorCycleSeconds = safeDivide(effectiveProductPitchMm, conveyorSpeedMmPerSecond);
  const downstreamConsumptionRateMmPerSecond = multiplyAndDivide(
    values.downstreamHighSpeedBpm,
    values.packageLengthMm,
    60
  );
  const packagesDuringBlockedDelay = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.blockedTimeDelaySeconds,
    60
  );
  const totalOverflowPackages = sumIfFinite(
    packagesDuringBlockedDelay,
    values.bottlesDischargedAtStop,
    values.insuranceFactorUnits
  );
  const overflowProductLengthMm = multiplyIfFinite(totalOverflowPackages, effectiveProductPitchMm);
  const overflowLengthMm = sumIfFinite(
    values.dischargeRunoutLengthMm,
    values.rejectRunoutLengthMm,
    overflowProductLengthMm
  );
  const usefulAccumulationLengthMm = subtractIfFinite(
    values.installedLengthMm,
    values.primeReserveMm,
    overflowLengthMm
  );
  const primeSensorPositionMm = subtractIfFinite(values.installedLengthMm, values.primeReserveMm);
  const actualBackupSensorPositionMm = firstDefined(values.backupSensorPositionMm, overflowLengthMm);
  const conveyorCapacityUnits = safeFloorDivide(values.installedLengthMm, effectiveProductPitchMm);
  const primeTravelSeconds = safeDivide(primeSensorPositionMm, conveyorSpeedMmPerSecond);
  const totalTravelSeconds = safeDivide(values.installedLengthMm, conveyorSpeedMmPerSecond);
  const overflowTransitSeconds = safeDivide(overflowLengthMm, conveyorSpeedMmPerSecond);
  const recoveryToBackupSeconds = sumIfFinite(
    values.clearTimeDelaySeconds,
    values.upstreamStartupTimeSeconds,
    overflowTransitSeconds
  );
  const queueReductionOneMm = multiplyIfFinite(downstreamConsumptionRateMmPerSecond, recoveryToBackupSeconds);
  const remainingAccumulationMm = subtractIfFinite(usefulAccumulationLengthMm, queueReductionOneMm);
  const timeToQueueSeconds = isFiniteNumber(remainingAccumulationMm) && remainingAccumulationMm > 0
    ? safeDivide(remainingAccumulationMm, sumIfFinite(conveyorSpeedMmPerSecond, downstreamConsumptionRateMmPerSecond))
    : 0;
  const queueReductionTwoMm = multiplyIfFinite(downstreamConsumptionRateMmPerSecond, timeToQueueSeconds);
  const recoveryLengthMm = subtractIfFinite(usefulAccumulationLengthMm, queueReductionOneMm, queueReductionTwoMm);
  const antiStarveSeconds = multiplyAndDivide(usefulAccumulationLengthMm, populationPercent, 100 * downstreamConsumptionRateMmPerSecond);
  const antiBlockSeconds = isFiniteNumber(usefulAccumulationLengthMm) && isFiniteNumber(populationPercent)
    ? safeDivide(usefulAccumulationLengthMm * (1 - populationPercent / 100), machineOutputRateMmPerSecond)
    : undefined;
  const recommendedInfeedConveyorSpeedMmPerSecond = multiplyAndDivide(
    values.downstreamHighSpeedBpm,
    values.downstreamInfeedPitchMm,
    60 / (1 + values.infeedOverspeedPercent / 100)
  );
  const recommendedConveyorSpeedFactorPercent = isFiniteNumber(recommendedInfeedConveyorSpeedMmPerSecond) &&
    isFiniteNumber(upstreamDischargeVelocityMmPerSecond) && upstreamDischargeVelocityMmPerSecond > 0
    ? (recommendedInfeedConveyorSpeedMmPerSecond / upstreamDischargeVelocityMmPerSecond - 1) * 100
    : undefined;

  // Linear ramp-up integral: reserve half the full-rate consumption over the ramp.
  const minimumRampAccumulationLengthMm = multiplyAndDivide(downstreamConsumptionRateMmPerSecond, values.downstreamRampUpSeconds, 2);
  const minimumInstalledLengthMm = sumIfFinite(overflowLengthMm, values.primeReserveMm, minimumRampAccumulationLengthMm);
  const downstreamInfeedRateMmPerSecond = multiplyAndDivide(values.downstreamHighSpeedBpm, values.downstreamInfeedPitchMm, 60);
  return compact({
    dischargeZoneSpeedMmPerSecond,
    codingZoneSpeedMmPerSecond,
    dischargePopulationPercent,
    codingPopulationPercent,
    minimumRampAccumulationLengthMm,
    minimumInstalledLengthMm,
    downstreamInfeedRateMmPerSecond,
    upstreamDischargeVelocityMmPerSecond,
    machineOutputRateMmPerSecond,
    conveyorSpeedMmPerSecond,
    populationPercent,
    effectiveProductPitchMm,
    productGapMm,
    packagePassSensorSeconds,
    sensorClearGapSeconds,
    sensorCycleSeconds,
    downstreamConsumptionRateMmPerSecond,
    packagesDuringBlockedDelay,
    totalOverflowPackages,
    overflowProductLengthMm,
    overflowLengthMm,
    usefulAccumulationLengthMm,
    primeSensorPositionMm,
    recommendedBackupSensorPositionMm: overflowLengthMm,
    actualBackupSensorPositionMm,
    conveyorCapacityUnits,
    primeTravelSeconds,
    totalTravelSeconds,
    overflowTransitSeconds,
    recoveryToBackupSeconds,
    queueReductionOneMm,
    timeToQueueSeconds,
    queueReductionTwoMm,
    recoveryLengthMm,
    antiStarveSeconds,
    antiBlockSeconds,
    recommendedInfeedConveyorSpeedMmPerSecond,
    recommendedConveyorSpeedFactorPercent
  });
}

function createAudit(values, calculated) {
  const inputFields = [
    values.installedLengthMm,
    values.primeReserveMm,
    values.packageLengthMm,
    values.upstreamDischargePitchMm,
    values.upstreamNominalSpeedBpm,
    values.conveyorSpeedFactorPercent
  ];
  const inputsReady = inputFields.every((value) => isFiniteNumber(value) && value >= 0) &&
    values.installedLengthMm > 0 && values.packageLengthMm > 0 &&
    values.upstreamDischargePitchMm > 0 && values.upstreamNominalSpeedBpm > 0;
  const installedLengthValid = isFiniteNumber(values.installedLengthMm) &&
    isFiniteNumber(values.primeReserveMm) && isFiniteNumber(calculated.overflowLengthMm) &&
    values.installedLengthMm > values.primeReserveMm + calculated.overflowLengthMm;
  const recoveryEvaluated = isFiniteNumber(calculated.recoveryLengthMm);
  const backupPositionEvaluated = isFiniteNumber(calculated.actualBackupSensorPositionMm) &&
    isFiniteNumber(calculated.recommendedBackupSensorPositionMm);
  const sensorTimingEvaluated = isFiniteNumber(calculated.packagePassSensorSeconds) &&
    isFiniteNumber(calculated.sensorClearGapSeconds);
  const blockedDebounceAdequate = sensorTimingEvaluated &&
    values.blockedTimeDelaySeconds > calculated.packagePassSensorSeconds;
  const clearDebounceAdequate = sensorTimingEvaluated &&
    values.clearTimeDelaySeconds > calculated.sensorClearGapSeconds;

  const goals = [
    goal(
      'INPUT_INTEGRITY',
      inputsReady ? 'PASS' : 'NOT_EVALUATED',
      inputsReady
        ? 'Required FlowPilot inputs are physically usable.'
        : 'Installed length, Prime reserve, package length, upstream discharge pitch, upstream BPM, and conveyor speed factor are required.'
    ),
    goal(
      'SMOOTH_RECOVERY',
      !recoveryEvaluated ? 'NOT_EVALUATED' : calculated.recoveryLengthMm > 0 ? 'PASS' : 'WARNING',
      !recoveryEvaluated
        ? 'Recovery length cannot be evaluated until downstream high speed and infeed pitch are available.'
        : calculated.recoveryLengthMm > 0
          ? 'Recovery length is positive; the modeled restart has physical margin.'
          : 'Recovery length is zero or negative; this configuration can create unstable or stuttering restarts.'
    ),
    goal(
      'INSTALLED_LENGTH',
      !isFiniteNumber(calculated.overflowLengthMm) ? 'NOT_EVALUATED' : installedLengthValid ? 'PASS' : 'FAIL',
      !isFiniteNumber(calculated.overflowLengthMm)
        ? 'Overflow length cannot be evaluated until the upstream flow inputs are complete.'
        : installedLengthValid
          ? 'Installed length exceeds Prime reserve plus required overflow length.'
          : 'Installed length is insufficient for the Prime reserve and required overflow length.'
    ),
    goal(
      'BACKUP_POSITION',
      !backupPositionEvaluated ? 'NOT_EVALUATED' : calculated.actualBackupSensorPositionMm >= calculated.recommendedBackupSensorPositionMm ? 'PASS' : 'WARNING',
      !backupPositionEvaluated
        ? 'Back-up position is not available.'
        : calculated.actualBackupSensorPositionMm >= calculated.recommendedBackupSensorPositionMm
          ? 'Back-up position leaves the calculated overflow margin.'
          : 'Back-up is too close to the upstream machine for the calculated residual flow.'
    ),
    goal(
      'SENSOR_DEBOUNCE',
      !sensorTimingEvaluated ? 'NOT_EVALUATED' : blockedDebounceAdequate && clearDebounceAdequate ? 'PASS' : 'WARNING',
      !sensorTimingEvaluated
        ? 'Sensor pulse timing cannot be evaluated until package length, pitch, and conveyor speed are available.'
        : blockedDebounceAdequate && clearDebounceAdequate
          ? 'Back-up blocked and clear delays exceed the normal package pulse and gap at the configured belt speed.'
          : 'At least one Back-up delay is no longer than a normal package pulse or gap; the control can chatter or react to normal product spacing.'
    )
  ];

  return {
    status: aggregateAuditStatus(goals),
    goals
  };
}

function goal(id, status, message) {
  return { id, status, message };
}

function aggregateAuditStatus(goals) {
  if (goals.some((item) => item.status === 'FAIL')) return 'FAIL';
  if (goals.some((item) => item.status === 'WARNING')) return 'WARNING';
  if (goals.some((item) => item.status === 'NOT_EVALUATED')) return 'NOT_EVALUATED';
  return 'PASS';
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function numberOrUndefined(value) {
  return isFiniteNumber(value) ? value : undefined;
}

function nonNegativeOrDefault(value, fallback) {
  return isFiniteNumber(value) && value >= 0 ? value : fallback;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function multiplyAndDivide(left, right, divisor) {
  return isFiniteNumber(left) && isFiniteNumber(right) && isFiniteNumber(divisor) && divisor !== 0
    ? left * right / divisor
    : undefined;
}

function multiplyIfFinite(left, right) {
  return isFiniteNumber(left) && isFiniteNumber(right) ? left * right : undefined;
}

function safeDivide(numerator, denominator, multiplier = 1) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && denominator > 0
    ? numerator / denominator * multiplier
    : undefined;
}

function safeFloorDivide(numerator, denominator) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && denominator > 0
    ? Math.floor(numerator / denominator)
    : undefined;
}

function sumIfFinite(...values) {
  return values.every(isFiniteNumber) ? values.reduce((total, value) => total + value, 0) : undefined;
}

function subtractIfFinite(first, ...rest) {
  return isFiniteNumber(first) && rest.every(isFiniteNumber)
    ? rest.reduce((total, value) => total - value, first)
    : undefined;
}
