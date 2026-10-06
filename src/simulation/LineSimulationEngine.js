import { createSeededRandom } from './SeededRandom.js';
import { validateSimulationInput } from './SimulationValidation.js';
import { resolveAccumulationZoneDefinition } from './FormatGeometryAdapter.js';

export function simulateLine(input) {
  const validation = validateSimulationInput(input);
  if (!validation.ok) return validation;

  const runtime = createRuntime(input);
  applyDueCommands(runtime);
  initializeInitialMaterialStates(runtime);
  addSample(runtime);
  executeTicks(runtime);
  return { ok: true, result: createResult(runtime) };
}

// Same tick operations as a single run, yielding between chunks for UI cancellation.
export async function simulateLineAsync(input, options = {}) {
  const validation = validateSimulationInput(input);
  if (!validation.ok) return validation;
  if(input.run.shiftSeconds!==undefined&&(!Number.isFinite(input.run.shiftSeconds)||input.run.shiftSeconds<=0||input.run.shiftSeconds%input.run.tickSeconds!==0))throw new Error('INVALID_SHIFT_DURATION');
  const runtime = createRuntime(input);
  runtime.summaryOnly=options.summaryOnly===true;
  let omittedEvents = runtime.summaryOnly?runtime.events.length:0;
  if(runtime.summaryOnly)runtime.events.length=0;
  const push = runtime.events.push.bind(runtime.events);
  runtime.events.push = (...items) => {
    if (!runtime.summaryOnly && options.detail && runtime.events.length < 2000) return push(...items);
    omittedEvents += items.length; return runtime.events.length;
  };
  applyDueCommands(runtime); initializeInitialMaterialStates(runtime); addSample(runtime);
  const shifts = []; let previous = {outputCount:0,totalStarvedSeconds:0,totalBlockedSeconds:0,totalFailureSeconds:0};
  const shiftSeconds = input.run.shiftSeconds || input.run.durationSeconds;
  let nextShift = shiftSeconds;
  while (runtime.virtualSecond < input.run.durationSeconds) {
    if (options.cancelled?.()) throw new Error('BATCH_CANCELLED');
    const until = Math.min(runtime.virtualSecond + input.run.tickSeconds * 1000, nextShift, input.run.durationSeconds);
    executeTicks(runtime, until);
    if (runtime.virtualSecond >= nextShift || runtime.virtualSecond >= input.run.durationSeconds) {
      const summary = createSummary(runtime);
      const duration = Math.min(shiftSeconds, runtime.virtualSecond - shifts.length * shiftSeconds);
      const output = summary.outputCount - previous.outputCount;
      shifts.push({shift:shifts.length+1,durationSeconds:duration,outputCount:output,throughputPerMinute:output/duration*60,
        lineOeePercent:summary.lineOeePacemakerRatePerSecond>0?Math.min(100,100*output/(summary.lineOeePacemakerRatePerSecond*duration)):0,
        starvedSeconds:summary.totalStarvedSeconds-previous.totalStarvedSeconds,blockedSeconds:summary.totalBlockedSeconds-previous.totalBlockedSeconds,failureSeconds:summary.totalFailureSeconds-previous.totalFailureSeconds});
      previous=summary; nextShift+=shiftSeconds;
    }
    options.progress?.(runtime.virtualSecond/input.run.durationSeconds);
    if(options.yieldBetweenChunks!==false)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(runtime.samples.at(-1)?.virtualSecond!==runtime.virtualSecond)addSample(runtime);
  const result=createResult(runtime); result.shifts=shifts; result.detailCoverage={omittedEvents};
  return {ok:true,result};
}

function createRuntime(input) {
  const random = createSeededRandom(input.run.seed);
  const equipment = input.case.equipment.map((model) => createEquipmentRuntime(model, random));
  const zones = equipment.slice(0, -1).map((equipment, index) => createAccumulationZoneRuntime(
    equipment,
    input.case.equipment[index + 1],
    input.case.equipment,
    index,
    input.run.tickSeconds
  ));

  equipment.forEach((equipment, index) => {
    const incomingZone = zones.find((zone) => zone.downstreamControlEquipmentId === equipment.id && zone.hasPrimeSensor);
    const outgoingZone = zones[index];
    if ((equipment.type === 'CONVEYOR' || equipment.processData?.role === 'CONVEYOR') && outgoingZone?.physicalModelEnabled) {
      equipment.nominalRatePerSecond = outgoingZone.conveyorSpeedMmPerSecond / outgoingZone.productPitchMm;
    }
    equipment.primeStartAuthorized = index === 0 || !incomingZone;
    equipment.startupDelaySeconds = resolveStartupDelaySeconds(equipment);
    equipment.restartRampUpSeconds = resolveRestartRampUpSeconds(equipment);
    equipment.startDelayRemainingSeconds = 0;
    equipment.startRampDurationSeconds = 0;
    equipment.startRampElapsedSeconds = 0;
    equipment.startReason = null;
    equipment.backupControl = null;
  });

  const runtime = {
    caseId: input.case.id,
    unitOfFlow: input.case.unitOfFlow,
    run: input.run,
    random,
    virtualSecond: 0,
    equipment,
    zones,
    events: [],
    samples: [],
    outputCount: 0,
    commandIndex: 0,
    commands: sortCommands(input.run.commands || [])
  };

  const source = runtime.equipment[0];
  if (source && isOperationalMode(source) && hasStartProfile(source)) {
    requestEquipmentStart(runtime, source, 'INITIAL_START');
  }

  return runtime;
}

function createEquipmentRuntime(model, random) {
  const reliability = model.noiseProfile?.reliability;
  return {
    ...model,
    mode: model.initialMode,
    availabilityState: model.initialMode,
    actualRatePerSecond: 0,
    microStopRemainingSeconds: 0,
    microStopSeconds: 0,
    failureRemainingSeconds: 0,
    failureSeconds: 0,
    failureCount: 0,
    emergencyStopLatched: false,
    emergencyStopSeconds: 0,
    timeToFailureRemainingSeconds: reliability
      ? randomExponentialSeconds(random, reliability.mtbfMinutes * 60)
      : null,
    outputCount: 0,
    runningSeconds: 0,
    pausedSeconds: 0,
    stoppedSeconds: 0,
    starvedSeconds: 0,
    blockedSeconds: 0,
    partialStarvationLossSeconds: 0,
    partialBlockingLossSeconds: 0,
    waitingForPrimeSeconds: 0,
    backupStopSeconds: 0,
    stateSeconds: {}
  };
}

function createAccumulationZoneRuntime(owner, downstreamModel, allEquipment, ownerIndex, tickSeconds) {
  const resolvedDefinition = resolveAccumulationZoneDefinition(allEquipment, ownerIndex);
  const definition = resolvedDefinition.definition;
  const isInternalHandoff = definition?.kind === 'INTERNAL_HANDOFF';
  const physical = !isInternalHandoff && definition ? normalizePhysicalZone(definition) : null;
  const capacityUnits = isInternalHandoff
    ? createHandoffCapacityUnits(owner, downstreamModel, tickSeconds)
    : physical?.capacityUnits;
  const upstreamControlEquipmentId = definition?.upstreamControlEquipmentId || owner.id;
  const downstreamControlEquipmentId = definition?.downstreamControlEquipmentId || downstreamModel.id;

  return {
    id: definition?.id || owner.id + '--to--' + downstreamModel.id,
    name: definition?.name || owner.name + ' to ' + downstreamModel.name,
    ownerEquipmentId: owner.id,
    upstreamControlEquipmentId,
    downstreamControlEquipmentId,
    visible: Boolean(physical),
    internalHandoff: isInternalHandoff,
    physicalModelEnabled: Boolean(physical),
    modelOrigin: resolvedDefinition.origin,
    geometrySources: resolvedDefinition.sources || {},
    formatAssumptions: resolvedDefinition.assumptions || [],
    engineering: physical?.engineering || null,
    capacityUnits,
    usableLengthMm: physical?.usableLengthMm || null,
    productPitchMm: physical?.productPitchMm || null,
    accumulatedPitchMm: physical?.accumulatedPitchMm || null,
    productLengthMm: physical?.productLengthMm || null,
    gapMm: physical?.gapMm || null,
    conveyorSpeedMmPerSecond: physical?.conveyorSpeedMmPerSecond || null,
    travelSeconds: physical?.travelSeconds || 0,
    packagePassSensorSeconds: physical?.packagePassSensorSeconds ?? null,
    sensorClearGapSeconds: physical?.sensorClearGapSeconds ?? null,
    sensorCycleSeconds: physical?.sensorCycleSeconds ?? null,
    primeSensorPositionMm: physical?.primeSensorPositionMm ?? null,
    primeTravelSeconds: physical?.primeTravelSeconds ?? null,
    primeTriggerWaitingUnits: physical?.primeTriggerWaitingUnits ?? null,
    hasPrimeSensor: physical?.hasPrimeSensor || false,
    primeDetected: false,
    primeDetectedAtVirtualSecond: null,
    primeTriggerCount: 0,
    primeSignalState: 'CLEAR',
    primePulseUntilVirtualSecond: 0,
    primePassedUnits: 0,
    primeLastPassAtVirtualSecond: null,
    downstreamRampUpSeconds: physical?.downstreamRampUpSeconds || 0,
    backupSensorPositionMm: physical?.backupSensorPositionMm ?? null,
    backupRestartPositionMm: physical?.backupRestartPositionMm ?? null,
    backupTriggerWaitingUnits: physical?.backupTriggerWaitingUnits ?? null,
    backupRestartWaitingUnits: physical?.backupRestartWaitingUnits ?? null,
    hasBackupSensor: physical?.hasBackupSensor || false,
    backupActive: false,
    backupSignalState: 'CLEAR',
    backupPulseUntilVirtualSecond: 0,
    backupPassedUnits: 0,
    backupLastPassAtVirtualSecond: null,
    backupBlockedCandidateSeconds: 0,
    backupClearCandidateSeconds: 0,
    backupTriggeredAtVirtualSecond: null,
    backupTriggerCount: 0,
    blockedTimeDelaySeconds: physical?.blockedTimeDelaySeconds || 0,
    clearTimeDelaySeconds: physical?.clearTimeDelaySeconds || 0,
    upstreamStopResponseSeconds: physical?.upstreamStopResponseSeconds || 0,
    bottlesDischargedAtStop: physical?.bottlesDischargedAtStop || 0,
    upstreamRestartDelaySeconds: physical?.upstreamRestartDelaySeconds ?? null,
    upstreamRestartRampUpSeconds: physical?.upstreamRestartRampUpSeconds ?? null,
    transit: [],
    waitingUnits: 0,
    overflowUnits: 0,
    overflowEvents: 0,
    blockingEquivalentSeconds: 0,
    starvingEquivalentSeconds: 0,
    constraintLossEquivalentSeconds: 0,
    lastPartialBlockingSeconds: 0,
    lastPartialStarvingSeconds: 0,
    inventoryIntegralUnitSeconds: 0,
    minimumInventoryUnits: 0,
    maximumInventoryUnits: 0,
    emptyInventorySeconds: 0,
    backupSignalBlockedSeconds: 0,
    backupSignalPulsingSeconds: 0,
    backupSignalClearSeconds: 0
  };
}

function createHandoffCapacityUnits(owner, downstreamModel, tickSeconds) {
  const rate = Math.max(owner?.nominalRatePerSecond || 0, downstreamModel?.nominalRatePerSecond || 0, 1);
  return Math.max(1, Math.ceil(rate * Math.max(tickSeconds || 1, 1) * 2));
}

function normalizePhysicalZone(definition) {
  const productPitchMm = definition.productPitchMm || ((definition.productLengthMm || 0) + (definition.gapMm || 0));
  const usableLengthMm = definition.usableLengthMm;
  const accumulatedPitchMm = definition.accumulatedPitchMm ?? productPitchMm;
  const capacityUnits = Math.floor(usableLengthMm / accumulatedPitchMm);
  const conveyorSpeedMmPerSecond = definition.conveyorSpeedMmPerSecond;
  const productLengthMm = definition.productLengthMm ?? null;
  const gapMm = definition.gapMm ?? (isFiniteNumber(productLengthMm) ? productPitchMm - productLengthMm : null);
  const hasPrimeSensor = definition.primeSensorPositionMm !== undefined && definition.primeSensorPositionMm !== null;
  const hasBackupSensor = definition.backupSensorPositionMm !== undefined && definition.backupSensorPositionMm !== null;
  const backupRestartPositionMm = hasBackupSensor
    ? definition.backupRestartPositionMm ?? definition.backupSensorPositionMm
    : null;
  return {
    engineering: definition.engineering || null,
    usableLengthMm,
    productPitchMm,
    accumulatedPitchMm,
    productLengthMm,
    gapMm,
    conveyorSpeedMmPerSecond,
    capacityUnits,
    travelSeconds: usableLengthMm / conveyorSpeedMmPerSecond,
    packagePassSensorSeconds: firstFinite(
      definition.packagePassSensorSeconds,
      safePositiveDivide(productLengthMm, conveyorSpeedMmPerSecond)
    ),
    sensorClearGapSeconds: firstFinite(
      definition.sensorClearGapSeconds,
      safeNonNegativeDivide(gapMm, conveyorSpeedMmPerSecond)
    ),
    sensorCycleSeconds: firstFinite(
      definition.sensorCycleSeconds,
      safePositiveDivide(productPitchMm, conveyorSpeedMmPerSecond)
    ),
    hasPrimeSensor,
    primeSensorPositionMm: hasPrimeSensor ? definition.primeSensorPositionMm : null,
    primeTravelSeconds: hasPrimeSensor ? definition.primeSensorPositionMm / conveyorSpeedMmPerSecond : null,
    primeTriggerWaitingUnits: hasPrimeSensor
      ? Math.max(1, Math.ceil((usableLengthMm - definition.primeSensorPositionMm) / accumulatedPitchMm))
      : null,
    hasBackupSensor,
    backupSensorPositionMm: hasBackupSensor ? definition.backupSensorPositionMm : null,
    backupRestartPositionMm,
    backupTriggerWaitingUnits: hasBackupSensor
      ? Math.max(1, Math.ceil((usableLengthMm - definition.backupSensorPositionMm) / accumulatedPitchMm))
      : null,
    backupRestartWaitingUnits: hasBackupSensor
      ? Math.max(0, Math.floor((usableLengthMm - backupRestartPositionMm) / accumulatedPitchMm))
      : null,
    blockedTimeDelaySeconds: definition.blockedTimeDelaySeconds || 0,
    clearTimeDelaySeconds: definition.clearTimeDelaySeconds || 0,
    upstreamStopResponseSeconds: definition.upstreamStopResponseSeconds || 0,
    bottlesDischargedAtStop: definition.bottlesDischargedAtStop || 0,
    downstreamRampUpSeconds: definition.downstreamRampUpSeconds || 0,
    upstreamRestartDelaySeconds: definition.upstreamRestartDelaySeconds ?? null,
    upstreamRestartRampUpSeconds: definition.upstreamRestartRampUpSeconds ?? null
  };
}

function executeTicks(runtime, until = runtime.run.durationSeconds) {
  while (runtime.virtualSecond < until) {
    applyDueCommands(runtime);
    updateReliabilityFailures(runtime);
    updateMicroStops(runtime);
    advanceAccumulationZones(runtime);
    processLineFromDownstream(runtime);
    recordZoneStatistics(runtime);
    runtime.equipment.forEach((item) => {
      item.stateSeconds[item.availabilityState] = (item.stateSeconds[item.availabilityState] || 0) + runtime.run.tickSeconds;
    });
    advanceEquipmentControlTimers(runtime);
    runtime.virtualSecond += runtime.run.tickSeconds;
    addSampleIfDue(runtime);
  }
}

function recordZoneStatistics(runtime) {
  runtime.zones.forEach((zone) => {
    if (!zone.visible) return;
    const up=getEquipment(runtime,zone.upstreamControlEquipmentId),down=getEquipment(runtime,zone.downstreamControlEquipmentId),tick=runtime.run.tickSeconds;
    const partialBlock=Math.max(0,(up?.partialBlockingLossSeconds||0)-zone.lastPartialBlockingSeconds);
    const partialStarve=Math.max(0,(down?.partialStarvationLossSeconds||0)-zone.lastPartialStarvingSeconds);
    zone.lastPartialBlockingSeconds=up?.partialBlockingLossSeconds||0;zone.lastPartialStarvingSeconds=down?.partialStarvationLossSeconds||0;
    const blocked=up?.availabilityState==='BLOCKED'||up?.availabilityState==='BACKUP_STOP'&&up.backupControl?.zoneId===zone.id;
    const starved=['STARVED','WAITING_FOR_PRIME'].includes(down?.availabilityState);
    const blockLoss=blocked?tick:Math.min(tick,partialBlock),starveLoss=starved?tick:Math.min(tick,partialStarve);
    zone.blockingEquivalentSeconds+=blockLoss;zone.starvingEquivalentSeconds+=starveLoss;
    // Concurrent constraints count once; partial losses use their larger weight.
    zone.constraintLossEquivalentSeconds+=Math.max(blockLoss,starveLoss);
    const inventoryUnits = getZoneInventory(zone);
    zone.inventoryIntegralUnitSeconds += inventoryUnits * runtime.run.tickSeconds;
    zone.minimumInventoryUnits = Math.min(zone.minimumInventoryUnits, inventoryUnits);
    zone.maximumInventoryUnits = Math.max(zone.maximumInventoryUnits, inventoryUnits);
    if (inventoryUnits <= 0) zone.emptyInventorySeconds += runtime.run.tickSeconds;
  });
}

function initializeInitialMaterialStates(runtime) {
  runtime.equipment.forEach((equipment, index) => {
    equipment.actualRatePerSecond = 0;

    if (equipment.emergencyStopLatched) {
      equipment.availabilityState = 'EMERGENCY_STOP';
    } else if (equipment.mode === 'PAUSE') {
      equipment.availabilityState = 'PAUSED';
    } else if (!isOperationalMode(equipment)) {
      equipment.availabilityState = 'STOPPED';
    } else if (requiresPrime(equipment)) {
      equipment.availabilityState = 'WAITING_FOR_PRIME';
    } else if (isStartDelayed(equipment)) {
      equipment.availabilityState = 'STARTING';
    } else if (isRampingUp(equipment)) {
      equipment.availabilityState = 'RAMPING_UP';
    } else if (index === 0) {
      equipment.availabilityState = 'READY';
    } else {
      equipment.availabilityState = 'STARVED';
    }
  });
}

function advanceAccumulationZones(runtime) {
  runtime.zones.forEach((zone) => {
    const owner = getEquipment(runtime, zone.ownerEquipmentId);
    const conveyorStopped = zone.physicalModelEnabled && owner && (!isAvailable(owner) || isStartDelayed(owner));
    if (conveyorStopped) {
      zone.transit.forEach((packet) => {
        delayTransitPacket(packet, runtime.run.tickSeconds);
      });
      updateZonePhotoeyes(runtime, zone);
      return;
    }

    // A moving head packet awaiting this tick's discharge is not a stationary
    // queue. Subtract the discharge the downstream can accept before locating
    // the tail; otherwise equal-rate flow falsely compresses on every tick.
    const downstream = getEquipment(runtime, zone.downstreamControlEquipmentId);
    const downstreamIndex = runtime.equipment.indexOf(downstream);
    const canDischarge = downstream && isAvailable(downstream) && !requiresPrime(downstream) && !activeBackupControl(downstream);
    const plannedDischarge = canDischarge ? Math.min(getRequestedFlow(downstream, runtime.run.tickSeconds),
      getDownstreamSpace(runtime, downstreamIndex), zone.conveyorSpeedMmPerSecond / zone.accumulatedPitchMm * runtime.run.tickSeconds) : 0;
    let stationaryQueueUnits = Math.max(0, zone.waitingUnits - plannedDischarge);
    const remainingTransit = [];
    const endSecond = runtime.virtualSecond + runtime.run.tickSeconds;
    zone.transit.forEach((packet) => {
      const queueTailMm = Math.max(0, zone.usableLengthMm - stationaryQueueUnits * zone.accumulatedPitchMm);
      const queueArrival = stationaryQueueUnits > 1e-9
        ? packet.arrivesAtVirtualSecond - (zone.usableLengthMm - queueTailMm) / zone.conveyorSpeedMmPerSecond
        : packet.arrivesAtVirtualSecond;
      const arrivedFraction = Math.max(packet.arrivedFraction,
        fractionPassed(endSecond, queueArrival, packet.entryDurationSeconds));
      // Each packet represents uniform flow during its entry tick. Split a
      // crossing packet instead of rounding its whole travel to the next tick.
      // This prevents discretization from becoming a fictitious bottleneck.
      ['backup', 'prime'].forEach((sensor) => {
        if (!zone[sensor === 'backup' ? 'hasBackupSensor' : 'hasPrimeSensor']) return;
        const position = zone[sensor + 'SensorPositionMm'];
        if (position > queueTailMm && stationaryQueueUnits > 1e-9) return;
        const fraction = fractionPassed(endSecond, packet[sensor + 'AtVirtualSecond'], packet.entryDurationSeconds);
        const previous = packet[sensor + 'PassedFraction'] || 0;
        if (fraction > previous) {
          recordNormalPhotoeyePass(runtime, zone, sensor, (fraction - previous) * packet.initialUnits);
          packet[sensor + 'PassedFraction'] = fraction;
          if (sensor === 'prime') triggerPrimeSensor(runtime, zone);
        }
      });
      const arrivals = Math.min(packet.units, Math.max(0, arrivedFraction - packet.arrivedFraction) * packet.initialUnits);
      zone.waitingUnits += arrivals;
      packet.units = Math.max(0, packet.units - arrivals);
      packet.arrivedFraction = arrivedFraction;
      stationaryQueueUnits = Math.max(0, zone.waitingUnits - plannedDischarge);
      if (packet.units > 1e-9) remainingTransit.push(packet);
    });
    zone.transit = remainingTransit;
    updateZonePhotoeyes(runtime, zone);
  });
}

function fractionPassed(second, start, duration) {
  return Math.max(0, Math.min(1, (second - start) / duration));
}

function delayTransitPacket(packet, tickSeconds) {
  if (packet.backupAtVirtualSecond !== null) packet.backupAtVirtualSecond += tickSeconds;
  if (packet.primeAtVirtualSecond !== null) packet.primeAtVirtualSecond += tickSeconds;
  packet.arrivesAtVirtualSecond += tickSeconds;
}

function updateZonePhotoeyes(runtime, zone) {
  updatePrimeSensorSignal(runtime, zone);
  updateBackupSensor(runtime, zone);
}

function updatePrimeSensorSignal(runtime, zone) {
  if (!zone.hasPrimeSensor) return;
  const queueCoversPrime = zone.waitingUnits >= zone.primeTriggerWaitingUnits;
  if (queueCoversPrime) triggerPrimeSensor(runtime, zone);
  zone.primeSignalState = queueCoversPrime
    ? 'BLOCKED'
    : isNormalPulseActive(zone.primePulseUntilVirtualSecond, runtime.virtualSecond)
      ? 'PULSING'
      : 'CLEAR';
}

function recordNormalPhotoeyePass(runtime, zone, sensor, units) {
  const duration = sensorBlockedDurationSeconds(zone, units);
  const prefix = sensor === 'prime' ? 'prime' : 'backup';
  zone[prefix + 'PassedUnits'] += units;
  zone[prefix + 'LastPassAtVirtualSecond'] = runtime.virtualSecond;
  if (!(duration > 0)) return;
  const untilField = prefix + 'PulseUntilVirtualSecond';
  zone[untilField] = Math.max(runtime.virtualSecond, zone[untilField] || 0) + duration;
}

function sensorBlockedDurationSeconds(zone, units) {
  return isFiniteNumber(zone.packagePassSensorSeconds) && units > 0
    ? zone.packagePassSensorSeconds * units
    : 0;
}

function isNormalPulseActive(pulseUntilVirtualSecond, virtualSecond) {
  return isFiniteNumber(pulseUntilVirtualSecond) && pulseUntilVirtualSecond > virtualSecond;
}

function triggerPrimeSensor(runtime, zone) {
  if (zone.primeDetected) return;
  zone.primeDetected = true;
  zone.primeDetectedAtVirtualSecond = runtime.virtualSecond;
  zone.primeTriggerCount += 1;
  const downstream = getEquipment(runtime, zone.downstreamControlEquipmentId);
  if (downstream) {
    downstream.primeStartAuthorized = true;
    requestEquipmentStart(runtime, downstream, 'PRIME_SENSOR', {
      rampUpSeconds: zone.downstreamRampUpSeconds
    });
  }
  runtime.events.push({
    type: 'PRIME_SENSOR_TRIGGERED',
    atVirtualSecond: runtime.virtualSecond,
    zoneId: zone.id,
    downstreamEquipmentId: zone.downstreamControlEquipmentId,
    sensorPositionMm: zone.primeSensorPositionMm
  });
}

function updateBackupSensor(runtime, zone) {
  if (!zone.hasBackupSensor) return;
  const queueCoversBackup = zone.waitingUnits >= zone.backupTriggerWaitingUnits;
  const signalState = queueCoversBackup
    ? 'BLOCKED'
    : isNormalPulseActive(zone.backupPulseUntilVirtualSecond, runtime.virtualSecond)
      ? 'PULSING'
      : 'CLEAR';
  zone.backupSignalState = signalState;
  recordBackupSignalDuration(zone, signalState, runtime.run.tickSeconds);

  // A normal stream can pulse the photoeye on every product.  Only a queue
  // covering the sensor creates a continuously BLOCKED signal and starts the
  // blocked-delay timer.
  if (!zone.backupActive && signalState === 'BLOCKED') {
    zone.backupBlockedCandidateSeconds += runtime.run.tickSeconds;
    if (zone.backupBlockedCandidateSeconds < zone.blockedTimeDelaySeconds) return;
    zone.backupActive = true;
    zone.backupBlockedCandidateSeconds = 0;
    zone.backupClearCandidateSeconds = 0;
    zone.backupTriggeredAtVirtualSecond = runtime.virtualSecond;
    zone.backupTriggerCount += 1;
    const upstream = getEquipment(runtime, zone.upstreamControlEquipmentId);
    if (upstream) {
      upstream.backupControl = {
        zoneId: zone.id,
        active: true,
        responseRemainingSeconds: zone.upstreamStopResponseSeconds,
        residualRemainingUnits: zone.bottlesDischargedAtStop
      };
    }
    runtime.events.push({
      type: 'BACKUP_SENSOR_BLOCKED',
      atVirtualSecond: runtime.virtualSecond,
      zoneId: zone.id,
      upstreamEquipmentId: zone.upstreamControlEquipmentId,
      waitingUnits: round(zone.waitingUnits),
    queueLengthMm: round(zone.waitingUnits * zone.accumulatedPitchMm),
    queueTailPositionMm: round(Math.max(0, zone.usableLengthMm - zone.waitingUnits * zone.accumulatedPitchMm)),
      thresholdUnits: round(zone.backupTriggerWaitingUnits)
    });
    return;
  }

  if (!zone.backupActive) {
    zone.backupBlockedCandidateSeconds = 0;
    return;
  }

  // The signal must stay continuously clear. A passing package restarts the
  // clear timer instead of releasing an upstream stop from one normal gap.
  if (zone.backupActive && signalState === 'CLEAR' && zone.waitingUnits <= zone.backupRestartWaitingUnits) {
    zone.backupClearCandidateSeconds += runtime.run.tickSeconds;
    if (zone.backupClearCandidateSeconds < zone.clearTimeDelaySeconds) return;
    zone.backupActive = false;
    zone.backupClearCandidateSeconds = 0;
    zone.backupBlockedCandidateSeconds = 0;
    const upstream = getEquipment(runtime, zone.upstreamControlEquipmentId);
    if (upstream && upstream.backupControl?.zoneId === zone.id) {
      const completedBackupStop = upstream.backupControl.responseRemainingSeconds <= 0 &&
        upstream.backupControl.residualRemainingUnits <= 0;
      upstream.backupControl.active = false;
      upstream.backupControl = null;
      if (completedBackupStop && isOperationalMode(upstream) && !upstream.emergencyStopLatched) {
        requestEquipmentStart(runtime, upstream, 'BACKUP_SENSOR_CLEAR', {
          delaySeconds: zone.upstreamRestartDelaySeconds,
          rampUpSeconds: zone.upstreamRestartRampUpSeconds
        });
      }
    }
    runtime.events.push({
      type: 'BACKUP_SENSOR_CLEARED',
      atVirtualSecond: runtime.virtualSecond,
      zoneId: zone.id,
      upstreamEquipmentId: zone.upstreamControlEquipmentId,
      waitingUnits: round(zone.waitingUnits),
    queueLengthMm: round(zone.waitingUnits * zone.accumulatedPitchMm),
    queueTailPositionMm: round(Math.max(0, zone.usableLengthMm - zone.waitingUnits * zone.accumulatedPitchMm)),
      restartThresholdUnits: round(zone.backupRestartWaitingUnits)
    });
    return;
  }

  zone.backupClearCandidateSeconds = 0;
}

function recordBackupSignalDuration(zone, signalState, tickSeconds) {
  if (signalState === 'BLOCKED') zone.backupSignalBlockedSeconds += tickSeconds;
  else if (signalState === 'PULSING') zone.backupSignalPulsingSeconds += tickSeconds;
  else zone.backupSignalClearSeconds += tickSeconds;
}

function advanceEquipmentControlTimers(runtime) {
  runtime.equipment.forEach((equipment) => {
    const control = equipment.backupControl;
    if (control?.active && control.responseRemainingSeconds > 0) {
      control.responseRemainingSeconds = Math.max(0, control.responseRemainingSeconds - runtime.run.tickSeconds);
      if (control.responseRemainingSeconds === 0) {
        runtime.events.push({
          type: 'BACKUP_STOP_RESPONSE_COMPLETED',
          atVirtualSecond: runtime.virtualSecond,
          equipmentId: equipment.id,
          zoneId: control.zoneId
        });
      }
    }

    advanceEquipmentStart(runtime, equipment);
  });
}

function updateReliabilityFailures(runtime) {
  runtime.equipment.forEach((equipment) => {
    if (equipment.emergencyStopLatched) return;
    const profile = equipment.noiseProfile?.reliability;
    if (!profile) return;

    if (equipment.failureRemainingSeconds > 0) {
      equipment.failureRemainingSeconds = Math.max(0, equipment.failureRemainingSeconds - runtime.run.tickSeconds);
      if (equipment.failureRemainingSeconds === 0) {
        runtime.events.push({ type: 'REPAIR_COMPLETED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id });
        equipment.timeToFailureRemainingSeconds = randomExponentialSeconds(runtime.random, profile.mtbfMinutes * 60);
      }
      return;
    }

    if (!isOperationalMode(equipment) || equipment.microStopRemainingSeconds > 0) return;
    if (equipment.timeToFailureRemainingSeconds === null) {
      equipment.timeToFailureRemainingSeconds = randomExponentialSeconds(runtime.random, profile.mtbfMinutes * 60);
    }
    equipment.timeToFailureRemainingSeconds -= runtime.run.tickSeconds;
    if (equipment.timeToFailureRemainingSeconds > 0) return;

    equipment.failureRemainingSeconds = profile.mttrMinutes * 60;
    equipment.failureCount += 1;
    runtime.events.push({
      type: 'FAILURE_STARTED',
      atVirtualSecond: runtime.virtualSecond,
      equipmentId: equipment.id,
      durationSeconds: equipment.failureRemainingSeconds,
      mtbfMinutes: profile.mtbfMinutes,
      mttrMinutes: profile.mttrMinutes
    });
  });
}

function applyDueCommands(runtime) {
  while (runtime.commandIndex < runtime.commands.length) {
    const command = runtime.commands[runtime.commandIndex];
    if (command.atVirtualSecond > runtime.virtualSecond) return;
    const equipment = runtime.equipment.find((item) => item.id === command.equipmentId);
    if (equipment && isSupportedAction(command.action)) {
      applyCommand(runtime, equipment, command.action);
    }
    runtime.commandIndex += 1;
  }
}

function applyCommand(runtime, equipment, action) {
  if (action === 'EMERGENCY_STOP') {
    equipment.emergencyStopLatched = true;
    equipment.mode = 'STOP';
    cancelEquipmentStart(equipment);
    runtime.events.push({ type: 'EMERGENCY_STOP_APPLIED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id });
    return;
  }

  if (action === 'RESET') {
    if (!equipment.emergencyStopLatched) {
      runtime.events.push({ type: 'COMMAND_REJECTED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id, action, reason: 'NO_EMERGENCY_STOP_TO_RESET' });
      return;
    }
    equipment.emergencyStopLatched = false;
    equipment.mode = 'STOP';
    cancelEquipmentStart(equipment);
    runtime.events.push({ type: 'EMERGENCY_STOP_RESET', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id });
    return;
  }

  if (equipment.emergencyStopLatched) {
    runtime.events.push({ type: 'COMMAND_REJECTED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id, action, reason: 'EMERGENCY_STOP_LATCHED' });
    return;
  }

  const wasOperational = isOperationalMode(equipment);
  equipment.mode = action === 'RUN' ? 'AUTO' : action;
  if (!isOperationalMode(equipment)) cancelEquipmentStart(equipment);
  runtime.events.push({ type: 'COMMAND_APPLIED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id, action });

  if (isOperationalMode(equipment) && !wasOperational) {
    requestEquipmentStart(runtime, equipment, 'COMMAND_' + action);
  }
}

function updateMicroStops(runtime) {
  runtime.equipment.forEach((equipment) => {
    if (equipment.emergencyStopLatched) return;
    if (equipment.failureRemainingSeconds > 0) return;
    if (equipment.microStopRemainingSeconds > 0) {
      equipment.microStopRemainingSeconds = Math.max(0, equipment.microStopRemainingSeconds - runtime.run.tickSeconds);
      return;
    }
    if (equipment.mode !== 'AUTO') return;
    const profile = equipment.noiseProfile?.microStop;
    if (!profile) return;
    const probability = (profile.probabilityPerMinute || 0) * runtime.run.tickSeconds / 60;
    if (runtime.random.next() < probability) {
      equipment.microStopRemainingSeconds = randomDuration(runtime.random, profile);
      runtime.events.push({ type: 'MICRO_STOP_STARTED', atVirtualSecond: runtime.virtualSecond, equipmentId: equipment.id, durationSeconds: equipment.microStopRemainingSeconds });
    }
  });
}

function processLineFromDownstream(runtime) {
  for (let index = runtime.equipment.length - 1; index >= 0; index -= 1) {
    processEquipment(runtime, index);
  }
}

function processEquipment(runtime, index) {
  const equipment = runtime.equipment[index];
  const tickSeconds = runtime.run.tickSeconds;
  if (!isAvailable(equipment)) {
    recordUnavailable(equipment, tickSeconds);
    return;
  }

  if (requiresPrime(equipment)) {
    equipment.actualRatePerSecond = 0;
    equipment.waitingForPrimeSeconds += tickSeconds;
    equipment.availabilityState = 'WAITING_FOR_PRIME';
    return;
  }

  const control = activeBackupControl(equipment);
  if (control && control.responseRemainingSeconds <= 0 && control.residualRemainingUnits <= 0) {
    equipment.actualRatePerSecond = 0;
    equipment.backupStopSeconds += tickSeconds;
    equipment.availabilityState = 'BACKUP_STOP';
    return;
  }

  if (isStartDelayed(equipment)) {
    equipment.actualRatePerSecond = 0;
    equipment.availabilityState = 'STARTING';
    return;
  }

  const residualDischarge = Boolean(control && control.responseRemainingSeconds <= 0 && control.residualRemainingUnits > 0);
  const requestedFlow = residualDischarge
    ? Math.min(equipment.nominalRatePerSecond * tickSeconds, control.residualRemainingUnits)
    : getRequestedFlow(equipment, tickSeconds);

  if (requestedFlow <= 0) {
    equipment.actualRatePerSecond = 0;
    equipment.availabilityState = 'RAMPING_UP';
    return;
  }

  const incomingZone = runtime.zones[index - 1];
  const inputAvailable = index === 0 ? requestedFlow : Math.min(incomingZone.waitingUnits,
    incomingZone.physicalModelEnabled ? (isTransportAvailable(getEquipment(runtime, incomingZone.ownerEquipmentId))
      ? incomingZone.conveyorSpeedMmPerSecond / incomingZone.accumulatedPitchMm * tickSeconds : 0) : Infinity);
  const downstreamSpace = getDownstreamSpace(runtime, index);
  const flow = Math.max(0, Math.min(requestedFlow, inputAvailable, residualDischarge ? requestedFlow : downstreamSpace));
  recordMaterialState(equipment, requestedFlow, inputAvailable, downstreamSpace, flow, tickSeconds, control, residualDischarge);
  moveFlow(runtime, index, flow, residualDischarge);
  equipment.outputCount += flow;
  equipment.actualRatePerSecond = flow / tickSeconds;

  if (residualDischarge) {
    control.residualRemainingUnits = Math.max(0, control.residualRemainingUnits - flow);
  }
}

function getRequestedFlow(equipment, tickSeconds) {
  if (isStartDelayed(equipment)) return 0;
  if (isRampingUp(equipment)) {
    const rampFactor = equipment.startRampDurationSeconds <= 0
      ? 1
      : equipment.startRampElapsedSeconds / equipment.startRampDurationSeconds;
    return equipment.nominalRatePerSecond * tickSeconds * rampFactor;
  }
  return equipment.nominalRatePerSecond * tickSeconds;
}

function hasStartProfile(equipment) {
  return equipment.startupDelaySeconds > 0 || equipment.restartRampUpSeconds > 0;
}

function requestEquipmentStart(runtime, equipment, reason, options = {}) {
  if (!equipment || equipment.emergencyStopLatched || !isOperationalMode(equipment)) return false;
  const delaySeconds = firstNonNegative(options.delaySeconds, equipment.startupDelaySeconds);
  const rampUpSeconds = firstNonNegative(options.rampUpSeconds, equipment.restartRampUpSeconds);
  equipment.startDelayRemainingSeconds = delaySeconds;
  equipment.startRampDurationSeconds = rampUpSeconds;
  equipment.startRampElapsedSeconds = 0;
  equipment.startReason = reason;
  runtime.events.push({
    type: 'EQUIPMENT_START_SEQUENCE_REQUESTED',
    atVirtualSecond: runtime.virtualSecond,
    equipmentId: equipment.id,
    reason,
    delaySeconds,
    rampUpSeconds
  });
  return true;
}

function cancelEquipmentStart(equipment) {
  equipment.startDelayRemainingSeconds = 0;
  equipment.startRampDurationSeconds = 0;
  equipment.startRampElapsedSeconds = 0;
  equipment.startReason = null;
}

function advanceEquipmentStart(runtime, equipment) {
  if (!isAvailable(equipment) || activeBackupControl(equipment)) return;
  if (isStartDelayed(equipment)) {
    equipment.startDelayRemainingSeconds = Math.max(0, equipment.startDelayRemainingSeconds - runtime.run.tickSeconds);
    return;
  }
  if (isRampingUp(equipment)) {
    equipment.startRampElapsedSeconds = Math.min(
      equipment.startRampDurationSeconds,
      equipment.startRampElapsedSeconds + runtime.run.tickSeconds
    );
  }
}

function isStartDelayed(equipment) {
  return equipment.startDelayRemainingSeconds > 0;
}

function isRampingUp(equipment) {
  return equipment.startRampElapsedSeconds < equipment.startRampDurationSeconds;
}

function resolveStartupDelaySeconds(equipment) {
  return firstNonNegative(
    equipment.startupDelaySeconds,
    equipment.processData?.upstream?.startupTimeSeconds
  );
}

function resolveRestartRampUpSeconds(equipment) {
  return firstNonNegative(
    equipment.restartRampUpSeconds,
    equipment.processData?.downstream?.rampUpTimeSeconds
  );
}

function firstNonNegative(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function firstFinite(...values) {
  return values.find(isFiniteNumber) ?? null;
}

function safePositiveDivide(numerator, denominator) {
  return isFiniteNumber(numerator) && numerator > 0 && isFiniteNumber(denominator) && denominator > 0
    ? numerator / denominator
    : null;
}

function safeNonNegativeDivide(numerator, denominator) {
  return isFiniteNumber(numerator) && numerator >= 0 && isFiniteNumber(denominator) && denominator > 0
    ? numerator / denominator
    : null;
}

function getDownstreamSpace(runtime, index) {
  if (index === runtime.equipment.length - 1) return Number.POSITIVE_INFINITY;
  const zone = runtime.zones[index];
  return getZoneEntrySpace(zone);
}

function moveFlow(runtime, index, flow, allowOverflow) {
  if (index > 0) {
    runtime.zones[index - 1].waitingUnits = Math.max(0, runtime.zones[index - 1].waitingUnits - flow);
  }
  if (index === runtime.equipment.length - 1) {
    runtime.outputCount += flow;
    return;
  }
  addFlowToZone(runtime, runtime.zones[index], flow, allowOverflow);
}

function addFlowToZone(runtime, zone, flow, allowOverflow) {
  const availableSpace = getZoneEntrySpace(zone);
  const accepted = Math.min(flow, availableSpace);
  const overflow = allowOverflow ? Math.max(0, flow - accepted) : 0;

  if (accepted > 0) {
    if (zone.travelSeconds <= 0) {
      zone.waitingUnits += accepted;
      if (zone.hasBackupSensor && zone.backupSensorPositionMm <= 0) {
        recordNormalPhotoeyePass(runtime, zone, 'backup', accepted);
      }
      if (zone.hasPrimeSensor && zone.primeTravelSeconds <= 0) {
        recordNormalPhotoeyePass(runtime, zone, 'prime', accepted);
        triggerPrimeSensor(runtime, zone);
      }
    } else {
      zone.transit.push({
        units: accepted,
        initialUnits: accepted,
        entryDurationSeconds: runtime.run.tickSeconds,
        arrivedFraction: 0,
        backupDetected: false,
        backupAtVirtualSecond: zone.hasBackupSensor
          ? runtime.virtualSecond + zone.backupSensorPositionMm / zone.conveyorSpeedMmPerSecond
          : null,
        primeDetected: false,
        primeAtVirtualSecond: zone.hasPrimeSensor
          ? runtime.virtualSecond + zone.primeTravelSeconds
          : null,
        arrivesAtVirtualSecond: runtime.virtualSecond + zone.travelSeconds
      });
    }
  }

  if (overflow > 0) {
    zone.overflowUnits += overflow;
    zone.overflowEvents += 1;
    runtime.events.push({
      type: 'OVERFLOW',
      atVirtualSecond: runtime.virtualSecond,
      zoneId: zone.id,
      upstreamEquipmentId: zone.upstreamControlEquipmentId,
      lostUnits: round(overflow),
      totalOverflowUnits: round(zone.overflowUnits)
    });
  }
}

function recordMaterialState(equipment, requestedFlow, inputAvailable, downstreamSpace, flow, tickSeconds, control, residualDischarge) {
  if (control && flow <= 0) equipment.backupStopSeconds += tickSeconds;

  if (flow > 0) {
    equipment.runningSeconds += tickSeconds;
    if (control) {
      equipment.availabilityState = control.responseRemainingSeconds > 0 || residualDischarge
        ? 'BACKUP_STOPPING'
        : 'BACKUP_STOP';
    } else if (isRampingUp(equipment)) {
      equipment.availabilityState = 'RAMPING_UP';
    } else {
      equipment.availabilityState = 'RUNNING';
    }
    if (!control) recordPartialConstraintLoss(equipment, requestedFlow, inputAvailable, downstreamSpace, tickSeconds);
    return;
  }

  equipment.actualRatePerSecond = 0;
  if (control) {
    equipment.availabilityState = control.responseRemainingSeconds > 0 || residualDischarge
      ? 'BACKUP_STOPPING'
      : 'BACKUP_STOP';
    return;
  }
  if (downstreamSpace <= 0) {
    equipment.blockedSeconds += tickSeconds;
    equipment.availabilityState = 'BLOCKED';
    return;
  }
  if (inputAvailable <= 0) {
    equipment.starvedSeconds += tickSeconds;
    equipment.availabilityState = 'STARVED';
    return;
  }
  equipment.availabilityState = 'IDLE';
}

function recordPartialConstraintLoss(equipment, requestedFlow, inputAvailable, downstreamSpace, tickSeconds) {
  if (requestedFlow <= 0) return;
  if (inputAvailable < requestedFlow && inputAvailable <= downstreamSpace) {
    equipment.partialStarvationLossSeconds += (1 - inputAvailable / requestedFlow) * tickSeconds;
  } else if (downstreamSpace < requestedFlow) {
    equipment.partialBlockingLossSeconds += (1 - downstreamSpace / requestedFlow) * tickSeconds;
  }
}

function recordUnavailable(equipment, tickSeconds) {
  equipment.actualRatePerSecond = 0;
  if (equipment.emergencyStopLatched) {
    equipment.stoppedSeconds += tickSeconds;
    equipment.emergencyStopSeconds += tickSeconds;
    equipment.availabilityState = 'EMERGENCY_STOP';
  } else if (equipment.failureRemainingSeconds > 0) {
    equipment.stoppedSeconds += tickSeconds;
    equipment.failureSeconds += tickSeconds;
    equipment.availabilityState = 'FAILURE';
  } else if (equipment.microStopRemainingSeconds > 0) {
    equipment.stoppedSeconds += tickSeconds;
    equipment.microStopSeconds += tickSeconds;
    equipment.availabilityState = 'MICRO_STOP';
  } else if (equipment.mode === 'PAUSE') {
    equipment.pausedSeconds += tickSeconds;
    equipment.availabilityState = 'PAUSED';
  } else {
    equipment.stoppedSeconds += tickSeconds;
    equipment.availabilityState = 'STOPPED';
  }
}

function isTransportAvailable(equipment) {
  return equipment && isAvailable(equipment) && !isStartDelayed(equipment);
}

function isAvailable(equipment) {
  return !equipment.emergencyStopLatched && isOperationalMode(equipment) &&
    equipment.microStopRemainingSeconds <= 0 && equipment.failureRemainingSeconds <= 0;
}

function requiresPrime(equipment) {
  return equipment.mode === 'AUTO' && equipment.primeStartAuthorized === false;
}

function activeBackupControl(equipment) {
  return equipment.backupControl?.active ? equipment.backupControl : null;
}

function getEquipment(runtime, equipmentId) {
  return runtime.equipment.find((equipment) => equipment.id === equipmentId);
}

function getZoneEntrySpace(zone) {
  if (!zone.physicalModelEnabled) return Math.max(0, zone.capacityUnits - getZoneInventory(zone));
  const occupiedLength = zone.waitingUnits * zone.accumulatedPitchMm + sum(zone.transit.map(packet => packet.units)) * zone.productPitchMm;
  return Math.max(0, Math.min(zone.capacityUnits - getZoneInventory(zone), (zone.usableLengthMm - occupiedLength) / zone.productPitchMm));
}

function getZoneInventory(zone) {
  return zone.waitingUnits + sum(zone.transit.map((packet) => packet.units));
}

function addSampleIfDue(runtime) {
  if(runtime.summaryOnly)return;
  const interval = runtime.run.sampleEverySeconds || runtime.run.tickSeconds;
  if (runtime.virtualSecond !== runtime.run.durationSeconds && runtime.virtualSecond % interval !== 0) return;
  addSample(runtime);
}

function addSample(runtime) {
  if(runtime.summaryOnly)return;
  const visibleZones = runtime.zones.filter((zone) => zone.visible);
  runtime.samples.push({
    virtualSecond: runtime.virtualSecond,
    outputCount: round(runtime.outputCount),
    buffers: visibleZones.map((zone) => round(getZoneInventory(zone))),
    accumulationZones: visibleZones.map(createZoneSample),
    equipment: runtime.equipment.map((item) => {
      const effectiveness = createEquipmentEffectiveness(item, runtime.virtualSecond);
      return {
        id: item.id,
        mode: item.mode,
        availabilityState: item.availabilityState,
        outputCount: round(item.outputCount),
        processedUnits: round(item.outputCount),
        actualRatePerSecond: round(item.actualRatePerSecond),
        starvedSeconds: round(item.starvedSeconds),
        blockedSeconds: round(item.blockedSeconds),
        partialStarvationLossSeconds: round(item.partialStarvationLossSeconds),
        partialBlockingLossSeconds: round(item.partialBlockingLossSeconds),
        failureSeconds: round(item.failureSeconds),
        emergencyStopSeconds: round(item.emergencyStopSeconds),
        waitingForPrimeSeconds: round(item.waitingForPrimeSeconds),
        backupStopSeconds: round(item.backupStopSeconds),
        oeePercent: round(effectiveness.oee * 100)
      };
    })
  });
}

function createZoneSample(zone) {
  const inventoryUnits = getZoneInventory(zone);
  return {
    id: zone.id,
    name: zone.name,
    ownerEquipmentId: zone.ownerEquipmentId,
    upstreamControlEquipmentId: zone.upstreamControlEquipmentId,
    downstreamControlEquipmentId: zone.downstreamControlEquipmentId,
    physicalModelEnabled: zone.physicalModelEnabled,
    modelOrigin: zone.modelOrigin,
    geometrySources: zone.geometrySources,
    formatAssumptions: zone.formatAssumptions,
    geometry: {
      usableLengthMm: zone.usableLengthMm,
      productPitchMm: zone.productPitchMm,
      accumulatedPitchMm: zone.accumulatedPitchMm,
      transferCapacityPerSecond: zone.conveyorSpeedMmPerSecond / zone.productPitchMm,
      productLengthMm: zone.productLengthMm,
      gapMm: zone.gapMm,
      conveyorSpeedMmPerSecond: zone.conveyorSpeedMmPerSecond,
      travelSeconds: round(zone.travelSeconds),
      packagePassSensorSeconds: zone.packagePassSensorSeconds,
      sensorClearGapSeconds: zone.sensorClearGapSeconds,
      sensorCycleSeconds: zone.sensorCycleSeconds,
      capacityFormula: zone.physicalModelEnabled ? 'floor(usableLengthMm / accumulatedPitchMm)' : null
    },
    inventoryUnits: round(inventoryUnits),
    waitingUnits: round(zone.waitingUnits),
    queueLengthMm: round(zone.waitingUnits * zone.accumulatedPitchMm),
    queueTailPositionMm: round(Math.max(0, zone.usableLengthMm - zone.waitingUnits * zone.accumulatedPitchMm)),
    inTransitUnits: round(sum(zone.transit.map((packet) => packet.units))),
    capacityUnits: round(zone.capacityUnits),
    fillPercent: zone.capacityUnits > 0 ? round(inventoryUnits / zone.capacityUnits * 100) : 0,
    prime: {
      configured: zone.hasPrimeSensor,
      state: zone.primeSignalState,
      latched: zone.primeDetected,
      positionMm: zone.primeSensorPositionMm,
      thresholdUnits: zone.primeTriggerWaitingUnits,
      detectedAtVirtualSecond: zone.primeDetectedAtVirtualSecond,
      triggerCount: zone.primeTriggerCount,
      passedUnits: round(zone.primePassedUnits),
      lastPassAtVirtualSecond: zone.primeLastPassAtVirtualSecond
    },
    backup: {
      configured: zone.hasBackupSensor,
      state: zone.backupSignalState,
      controlActive: zone.backupActive,
      positionMm: zone.backupSensorPositionMm,
      restartPositionMm: zone.backupRestartPositionMm,
      thresholdUnits: zone.backupTriggerWaitingUnits,
      restartThresholdUnits: zone.backupRestartWaitingUnits,
      triggerCount: zone.backupTriggerCount,
      passedUnits: round(zone.backupPassedUnits),
      blockedTimeDelaySeconds: zone.blockedTimeDelaySeconds,
      clearTimeDelaySeconds: zone.clearTimeDelaySeconds,
      blockedCandidateSeconds: round(zone.backupBlockedCandidateSeconds),
      clearCandidateSeconds: round(zone.backupClearCandidateSeconds)
    },
    overflowUnits: round(zone.overflowUnits),
    overflowEvents: zone.overflowEvents,
    state: zone.overflowUnits > 0
      ? 'OVERFLOW'
      : zone.backupActive
        ? 'BACKUP_ACTIVE'
        : inventoryUnits > 0
          ? 'FLOWING'
          : 'EMPTY'
  };
}

function createResult(runtime) {
  return {
    caseId: runtime.caseId,
    unitOfFlow: runtime.unitOfFlow,
    engineVersion: '0.12.0',
    seed: runtime.run.seed,
    durationSeconds: runtime.run.durationSeconds,
    summary: createSummary(runtime),
    equipmentMetrics: Object.fromEntries(runtime.equipment.map((item) => [item.id, createEquipmentMetrics(item, runtime.run.durationSeconds)])),
    accumulationZoneMetrics: Object.fromEntries(runtime.zones.filter((zone) => zone.visible).map((zone) => [
      zone.id,
      createZoneMetrics(zone, runtime.run.durationSeconds)
    ])),
    events: runtime.events.slice(),
    samples: runtime.samples
  };
}

function createSummary(runtime) {
  const lineEffectiveness = createLineEffectiveness(runtime);
  return {
    outputCount: round(runtime.outputCount),
    materialBalance: {
      inputUnits: round(runtime.equipment[0]?.outputCount || 0),
      outputUnits: round(runtime.outputCount),
      inventoryUnits: round(sum(runtime.zones.map(getZoneInventory))),
      overflowUnits: round(sum(runtime.zones.map(zone => zone.overflowUnits))),
      residualUnits: round((runtime.equipment[0]?.outputCount || 0) - runtime.outputCount -
        sum(runtime.zones.map(getZoneInventory)) - sum(runtime.zones.map(zone => zone.overflowUnits)))
    },
    averageOutputRatePerSecond: round(runtime.outputCount / runtime.run.durationSeconds),
    totalBlockedSeconds: round(sum(runtime.equipment.map((item) => item.blockedSeconds))),
    totalStarvedSeconds: round(sum(runtime.equipment.map((item) => item.starvedSeconds))),
    totalPartialStarvationLossSeconds: round(sum(runtime.equipment.map((item) => item.partialStarvationLossSeconds))),
    totalPartialBlockingLossSeconds: round(sum(runtime.equipment.map((item) => item.partialBlockingLossSeconds))),
    totalFailureSeconds: round(sum(runtime.equipment.map((item) => item.failureSeconds))),
    totalEmergencyStopSeconds: round(sum(runtime.equipment.map((item) => item.emergencyStopSeconds))),
    totalBackupStopSeconds: round(sum(runtime.equipment.map((item) => item.backupStopSeconds))),
    totalWaitingForPrimeSeconds: round(sum(runtime.equipment.map((item) => item.waitingForPrimeSeconds))),
    totalOverflowUnits: round(sum(runtime.zones.map((zone) => zone.overflowUnits))),
    lineOeePercent: round(lineEffectiveness.oee * 100),
    lineOeePacemakerEquipmentId: lineEffectiveness.reference?.id || null,
    lineOeePacemakerName: lineEffectiveness.reference?.name || null,
    lineOeePacemakerRatePerSecond: lineEffectiveness.reference?.nominalRatePerSecond || null,
    lineOeeReference: lineEffectiveness.referenceMethod,
    qualityAssumption: 'NO_REJECT_MODEL_ASSUMES_100_PERCENT'
  };
}

function createEquipmentMetrics(equipment, durationSeconds) {
  const effectiveness = createEquipmentEffectiveness(equipment, durationSeconds);
  return {
    outputCount: round(equipment.outputCount),
    stateSeconds: Object.fromEntries(Object.entries(equipment.stateSeconds).map(([state, seconds]) => [state, round(seconds)])),
    runningSeconds: round(equipment.runningSeconds),
    productiveEquivalentSeconds: round(equipment.outputCount / equipment.nominalRatePerSecond),
    processingCapacityPercent: round(100 * equipment.outputCount / (equipment.nominalRatePerSecond * durationSeconds)),
    pausedSeconds: round(equipment.pausedSeconds),
    stoppedSeconds: round(equipment.stoppedSeconds),
    failureSeconds: round(equipment.failureSeconds),
    failureCount: equipment.failureCount,
    microStopSeconds: round(equipment.microStopSeconds),
    emergencyStopSeconds: round(equipment.emergencyStopSeconds),
    starvedSeconds: round(equipment.starvedSeconds),
    blockedSeconds: round(equipment.blockedSeconds),
    partialStarvationLossSeconds: round(equipment.partialStarvationLossSeconds),
    partialBlockingLossSeconds: round(equipment.partialBlockingLossSeconds),
    waitingForPrimeSeconds: round(equipment.waitingForPrimeSeconds),
    backupStopSeconds: round(equipment.backupStopSeconds),
    availability: round(effectiveness.availability),
    availabilityPercent: round(effectiveness.availability * 100),
    performance: round(effectiveness.performance),
    performancePercent: round(effectiveness.performance * 100),
    quality: round(effectiveness.quality),
    qualityPercent: round(effectiveness.quality * 100),
    oee: round(effectiveness.oee),
    oeePercent: round(effectiveness.oee * 100),
    qualityAssumption: 'NO_REJECT_MODEL_ASSUMES_100_PERCENT'
  };
}

function createEquipmentEffectiveness(equipment, elapsedSeconds) {
  const durationSeconds = Math.max(0, elapsedSeconds || 0);
  // Intrinsic availability deliberately excludes STARVED, BLOCKED, Waiting for
  // Prime, and Back-up control. Those are line-interaction losses, not an
  // equipment reliability loss. The stopped counter contains failures,
  // micro-stops, emergency stops, and explicit STOP commands.
  const availability = durationSeconds > 0
    ? clampUnit(1 - equipment.stoppedSeconds / durationSeconds)
    : 1;
  const idealOutput = Math.max(0, equipment.nominalRatePerSecond || 0) * Math.max(0, equipment.runningSeconds || 0);
  const performance = idealOutput > 0
    ? clampUnit(equipment.outputCount / idealOutput)
    : 0;
  // The current engine has no reject stream. Do not synthesize quality loss;
  // expose the assumption alongside the metric until rejects are modeled.
  const quality = 1;
  return { availability, performance, quality, oee: availability * performance * quality };
}

function createLineEffectiveness(runtime) {
  const reference = resolveLineOeeReference(runtime.equipment);
  const idealOutput = reference
    ? reference.nominalRatePerSecond * runtime.run.durationSeconds
    : 0;
  return {
    reference,
    referenceMethod: reference?.lineOeeReference || 'NOT_AVAILABLE',
    oee: idealOutput > 0 ? clampUnit(runtime.outputCount / idealOutput) : 0
  };
}

function resolveLineOeeReference(equipment) {
  const explicitPacemaker = equipment.find((item) => item.type === 'PACEMAKER' ||
    item.processData?.role === 'PACEMAKER' || item.characteristics?.isPacemaker === true);
  if (explicitPacemaker) return { ...explicitPacemaker, lineOeeReference: 'EXPLICIT_PACEMAKER' };

  const fillerFallback = equipment.find((item) => item.type === 'FILLER');
  if (fillerFallback) return { ...fillerFallback, lineOeeReference: 'FILLER_FALLBACK' };

  const firstMachine = equipment.find((item) => item.type !== 'CONVEYOR' && item.processData?.role !== 'CONVEYOR');
  if (firstMachine) return { ...firstMachine, lineOeeReference: 'FIRST_MACHINE_FALLBACK' };

  return equipment[0] ? { ...equipment[0], lineOeeReference: 'FIRST_EQUIPMENT_FALLBACK' } : null;
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}

function createZoneMetrics(zone, durationSeconds) {
  return {
    id: zone.id,
    name: zone.name,
    ownerEquipmentId: zone.ownerEquipmentId,
    upstreamControlEquipmentId: zone.upstreamControlEquipmentId,
    downstreamControlEquipmentId: zone.downstreamControlEquipmentId,
    capacityUnits: round(zone.capacityUnits),
    movingPitchMm: zone.productPitchMm,
    accumulatedPitchMm: zone.accumulatedPitchMm,
    conveyorSpeedMmPerSecond: zone.conveyorSpeedMmPerSecond,
    transferCapacityPerSecond: zone.conveyorSpeedMmPerSecond / zone.productPitchMm,
    modelOrigin: zone.modelOrigin,
    geometrySources: zone.geometrySources,
    blockingEquivalentSeconds: round(zone.blockingEquivalentSeconds),
    starvingEquivalentSeconds: round(zone.starvingEquivalentSeconds),
    constraintLossEquivalentSeconds: round(zone.constraintLossEquivalentSeconds),
    conveyorConstraintLossPercent: round(100*zone.constraintLossEquivalentSeconds/Math.max(durationSeconds,1e-9)),
    finalInventoryUnits: round(getZoneInventory(zone)),
    finalWaitingUnits: round(zone.waitingUnits),
    finalInTransitUnits: round(sum(zone.transit.map((packet) => packet.units))),
    minimumInventoryUnits: round(zone.minimumInventoryUnits),
    averageInventoryUnits: round(zone.inventoryIntegralUnitSeconds / Math.max(1, durationSeconds)),
    maximumInventoryUnits: round(zone.maximumInventoryUnits),
    emptyInventorySeconds: round(zone.emptyInventorySeconds),
    overflowUnits: round(zone.overflowUnits),
    overflowEvents: zone.overflowEvents,
    primeSignalState: zone.primeSignalState,
    backupTriggerCount: zone.backupTriggerCount,
    backupSignalState: zone.backupSignalState,
    backupSignalBlockedSeconds: round(zone.backupSignalBlockedSeconds),
    backupSignalPulsingSeconds: round(zone.backupSignalPulsingSeconds),
    backupSignalClearSeconds: round(zone.backupSignalClearSeconds),
    primeTriggerCount: zone.primeTriggerCount,
    primePassedUnits: round(zone.primePassedUnits),
    backupPassedUnits: round(zone.backupPassedUnits),
    primeDetected: zone.primeDetected,
    engineering: zone.engineering
  };
}

function sortCommands(commands) {
  return [...commands].sort((a, b) => a.atVirtualSecond - b.atVirtualSecond);
}
function isSupportedAction(action) {
  return ['RUN', 'PAUSE', 'STOP', 'MANUAL', 'AUTO', 'EMERGENCY_STOP', 'RESET'].includes(action);
}
function isOperationalMode(equipment) {
  return equipment.mode === 'AUTO' || equipment.mode === 'MANUAL';
}
function randomDuration(random, profile) {
  const min = profile.minDurationSeconds || 0;
  const max = profile.maxDurationSeconds ?? min;
  return min + (max - min) * random.next();
}
function randomExponentialSeconds(random, meanSeconds) {
  return -Math.log(1 - Math.max(random.next(), 1e-12)) * meanSeconds;
}
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
function round(value) {
  return Number(value.toFixed(6));
}
