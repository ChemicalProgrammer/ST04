function createPublicDemoCaseRequest_() {
  var suffix = new Date().getTime().toString();
  var equipment = [
      createPublicLineUnit_({ id: 'blowmolder-1', type: 'BLOWMOLDER', name: 'Blowmolder', role: 'CRITICAL_MACHINE', nominalRateBpm: 420, maximumSpeedBpm: 450, mtbfMinutes: 720, mttrMinutes: 15, actualDischargeMm: 85, actualCodingMm: 85, packageLengthMm: 66, dischargePitchMm: 85, startupTimeSeconds: 8, bottlesDischargedAtStop: 4, infeedPitchMm: 88, rampUpTimeSeconds: 10, dischargeFactorPercent: 100, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.08, microStopMinSeconds: 3, microStopMaxSeconds: 8 }),
      createPublicLineUnit_({ id: 'conveyor-1', type: 'CONVEYOR', name: 'Blowmolder discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 480, maximumSpeedBpm: 500, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 88, actualCodingMm: 88, packageLengthMm: 66, dischargePitchMm: 85, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 88, rampUpTimeSeconds: 5, dischargeFactorPercent: 5, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'pucker-1', type: 'PUCKER', name: 'Pucker', role: 'CRITICAL_MACHINE', nominalRateBpm: 415, maximumSpeedBpm: 430, mtbfMinutes: 960, mttrMinutes: 10, actualDischargeMm: 90, actualCodingMm: 90, packageLengthMm: 66, dischargePitchMm: 90, startupTimeSeconds: 7, bottlesDischargedAtStop: 3, infeedPitchMm: 90, rampUpTimeSeconds: 8, dischargeFactorPercent: 102, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.1, microStopMinSeconds: 3, microStopMaxSeconds: 9 }),
      createPublicLineUnit_({ id: 'conveyor-2', type: 'CONVEYOR', name: 'Pucker discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 480, maximumSpeedBpm: 500, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 90, actualCodingMm: 90, packageLengthMm: 66, dischargePitchMm: 90, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 90, rampUpTimeSeconds: 5, dischargeFactorPercent: 5, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'filler-1', type: 'FILLER', name: 'Filler', role: 'PACEMAKER', nominalRateBpm: 400, maximumSpeedBpm: 420, mtbfMinutes: 600, mttrMinutes: 20, actualDischargeMm: 92, actualCodingMm: 92, packageLengthMm: 66, dischargePitchMm: 92, startupTimeSeconds: 12, bottlesDischargedAtStop: 6, infeedPitchMm: 92, rampUpTimeSeconds: 15, dischargeFactorPercent: 100, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.12, microStopMinSeconds: 4, microStopMaxSeconds: 12 }),
      createPublicLineUnit_({ id: 'conveyor-3', type: 'CONVEYOR', name: 'Filler discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 480, maximumSpeedBpm: 500, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 92, actualCodingMm: 92, packageLengthMm: 66, dischargePitchMm: 92, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 92, rampUpTimeSeconds: 5, dischargeFactorPercent: 7, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'depucker-1', type: 'DEPUCKER', name: 'De-pucker', role: 'CRITICAL_MACHINE', nominalRateBpm: 410, maximumSpeedBpm: 430, mtbfMinutes: 1000, mttrMinutes: 8, actualDischargeMm: 92, actualCodingMm: 92, packageLengthMm: 66, dischargePitchMm: 92, startupTimeSeconds: 7, bottlesDischargedAtStop: 3, infeedPitchMm: 92, rampUpTimeSeconds: 8, dischargeFactorPercent: 102, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.1, microStopMinSeconds: 3, microStopMaxSeconds: 9 }),
      createPublicLineUnit_({ id: 'conveyor-4', type: 'CONVEYOR', name: 'De-pucker discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 480, maximumSpeedBpm: 500, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 92, actualCodingMm: 92, packageLengthMm: 66, dischargePitchMm: 92, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 92, rampUpTimeSeconds: 5, dischargeFactorPercent: 6, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'sleever-1', type: 'SLEEVER', name: 'Sleever', role: 'CRITICAL_MACHINE', nominalRateBpm: 390, maximumSpeedBpm: 400, mtbfMinutes: 480, mttrMinutes: 15, actualDischargeMm: 94, actualCodingMm: 94, packageLengthMm: 66, dischargePitchMm: 94, startupTimeSeconds: 10, bottlesDischargedAtStop: 4, infeedPitchMm: 94, rampUpTimeSeconds: 12, dischargeFactorPercent: 101, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.14, microStopMinSeconds: 4, microStopMaxSeconds: 12 }),
      createPublicLineUnit_({ id: 'conveyor-5', type: 'CONVEYOR', name: 'Sleever discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 450, maximumSpeedBpm: 470, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 94, actualCodingMm: 94, packageLengthMm: 66, dischargePitchMm: 94, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 94, rampUpTimeSeconds: 5, dischargeFactorPercent: 5, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'case-packer-1', type: 'CASE_PACKER', name: 'Case packer', role: 'CRITICAL_MACHINE', nominalRateBpm: 385, maximumSpeedBpm: 400, mtbfMinutes: 720, mttrMinutes: 12, actualDischargeMm: 96, actualCodingMm: 96, packageLengthMm: 66, dischargePitchMm: 96, startupTimeSeconds: 10, bottlesDischargedAtStop: 4, infeedPitchMm: 96, rampUpTimeSeconds: 12, dischargeFactorPercent: 100, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.14, microStopMinSeconds: 4, microStopMaxSeconds: 12 }),
      createPublicLineUnit_({ id: 'conveyor-6', type: 'CONVEYOR', name: 'Case packer discharge conveyor', role: 'CONVEYOR', nominalRateBpm: 430, maximumSpeedBpm: 450, mtbfMinutes: 1440, mttrMinutes: 5, actualDischargeMm: 96, actualCodingMm: 96, packageLengthMm: 66, dischargePitchMm: 96, startupTimeSeconds: 4, bottlesDischargedAtStop: 2, infeedPitchMm: 96, rampUpTimeSeconds: 5, dischargeFactorPercent: 5, codingFactorPercent: 102, microStopProbabilityPerMinute: 0.04, microStopMinSeconds: 2, microStopMaxSeconds: 5 }),
      createPublicLineUnit_({ id: 'palletizer-1', type: 'PALLETIZER', name: 'Palletizer', role: 'CRITICAL_MACHINE', nominalRateBpm: 380, maximumSpeedBpm: 400, mtbfMinutes: 960, mttrMinutes: 20, actualDischargeMm: 96, actualCodingMm: 96, packageLengthMm: 66, dischargePitchMm: 96, startupTimeSeconds: 12, bottlesDischargedAtStop: 3, infeedPitchMm: 96, rampUpTimeSeconds: 15, dischargeFactorPercent: 100, codingFactorPercent: 100, microStopProbabilityPerMinute: 0.1, microStopMinSeconds: 4, microStopMaxSeconds: 10 })
  ];

  configurePublicAccumulationZones_(equipment);
  configurePublicDemoLosses_(equipment);
  var run = { durationMode: 'SHIFTS', shiftHours: 8, shiftCount: 1, shiftSeconds: 28800, durationSeconds: 28800, tickSeconds: 0.25, sampleEverySeconds: 15, seed: 20261008, rounds: 3, commands: [] };
  var options = createPublicDemoTargets_(equipment);
  var baseline = { id: 'simulation-a', name: 'Baseline — inefficient line', equipment: equipment, dynamicConfig: run, results: null, whatIf: { externalOptions: options } };
  var simulations = [baseline];
  options.forEach(function(option) {
    var copy = JSON.parse(JSON.stringify(equipment));
    option.changes.forEach(function(change) {
      var unit = copy.filter(function(item) { return item.id === change.equipmentId; })[0];
      var keys = change.path.split('.'), field = keys.pop();
      keys.reduce(function(value, key) { return value[key]; }, unit)[field] = change.after;
    });
    simulations.push({ id: 'demo-' + option.tier.toLowerCase(), name: option.tier === 'ZERO' ? 'Zero CAPEX — operating adjustments' : option.tier === 'MEDIUM' ? 'Medium CAPEX — buffers and restart control' : 'High CAPEX — accumulation upgrade',
      equipment: copy, dynamicConfig: JSON.parse(JSON.stringify(run)), results: null,
      scenario: { origin: 'PUBLIC_DEMO', tier: option.tier, sourceSimulationId: baseline.id, changes: option.changes } });
  });

  return {
    id: 'public-demo-packaging-line-' + suffix,
    name: 'Public demo — low-efficiency CAPEX challenge',
    unitOfFlow: 'units',
    metadata: createPublicDemoMetadata_(),
    engineConfig: {
      modelMode: 'PUBLIC_DEMONSTRATION_EQUIVALENT_BOTTLES',
      designThroughputBottlesPerHour: 24000,
      packConfiguration: { bottlesPerCase: 12, casesPerLayer: 10, layersPerPallet: 6 },
      reliabilityModel: 'Seeded exponential time-to-failure with fixed MTTR repair duration',
      accumulationControlModel: 'FlowPilot physical conveyor engineering with package-pulse photoeyes, sustained Back-up debounce, overflow margin, and recovery audit'
    },
    equipment: equipment,
    simulations: simulations
  };
}

// Deliberately poor operating setup. Keep reliability identical in all scenarios;
// Zero tunes existing speeds/sensors; Medium and High add progressively larger
// buffers and faster restart controls. Reliability stays fixed across categories.
function configurePublicDemoLosses_(equipment) {
  var machineIndex = 0;
  var rates = [240, 210, 400, 220, 170, 250, 230];
  var maximums = [600, 580, 420, 570, 560, 590, 560];
  var mtbf = [2.2, 1.8, 2.8, 1.6, 1.4, 1.8, 2];
  var mttr = [0.4, 0.35, 0.3, 0.4, 0.3, 0.4, 0.4];
  equipment.forEach(function(unit) {
    if (unit.type === 'CONVEYOR') {
      unit.processData.geometry.lactMm = 8000;
      unit.processData.geometry.lpPrimeMm = 1800;
      unit.processData.accumulation.backupSensorPositionMm = 1200;
      unit.processData.accumulation.downstreamRampUpSeconds = 12;
      unit.processData.accumulation.conveyorSpeedFactorPercent = 15;
    } else {
      var index = machineIndex++, rate = rates[index];
      unit.nominalRatePerSecond = rate / 60;
      unit.characteristics.nominalRateBpm = rate;
      unit.processData.equipment.maximumSpeedBpm = maximums[index];
      unit.processData.upstream.startupTimeSeconds = 5;
      unit.noiseProfile.reliability = { mtbfMinutes: mtbf[index], mttrMinutes: mttr[index] };
      unit.processData.equipment.mtbfMinutes = mtbf[index];
      unit.processData.equipment.mttrMinutes = mttr[index];
      unit.noiseProfile.microStop = { probabilityPerMinute: 0.35, minDurationSeconds: 3, maxDurationSeconds: 8 };
    }
  });
}

// Each category is a complete independent hypothesis against the baseline.
// The targets are model inputs; efficiencies are always computed by the engine.
function createPublicDemoTargets_(equipment) {
  return ['ZERO', 'MEDIUM', 'HIGH'].map(function(tier) {
    var changes = [];
    function change(unit, path, after, unitOfMeasure, intervention) {
      var before = path.split('.').reduce(function(value, key) { return value[key]; }, unit);
      if (before === after) return;
      var item = { equipmentId: unit.id, path: path, before: before, after: after, unit: unitOfMeasure };
      if (intervention) { item.external = true; item.justification = intervention; }
      changes.push(item);
    }
    equipment.forEach(function(unit) {
      if (unit.type === 'CONVEYOR') {
        change(unit, 'processData.accumulation.conveyorSpeedFactorPercent', 100, '%');
        change(unit, 'processData.geometry.lpPrimeMm', 400, 'mm');
        if (tier !== 'ZERO') {
          change(unit, 'processData.geometry.lactMm', tier === 'MEDIUM' ? 12000 : 24000, 'mm');
        }
        if (tier === 'HIGH') {
          change(unit, 'processData.accumulation.backupSensorPositionMm', 3000, 'mm');
        }
      } else {
        if (unit.type !== 'FILLER') change(unit, 'nominalRatePerSecond', (tier === 'ZERO' ? 450 : tier === 'MEDIUM' ? 420 : 550) / 60, 'units/s');
        if (tier !== 'ZERO') change(unit, 'processData.upstream.startupTimeSeconds', tier === 'MEDIUM' ? 3 : 1, 's',
          'Synthetic demo assumption: ' + (tier === 'MEDIUM' ? 'local start-sequence retrofit with a 3-second restart target.' : 'integrated controls upgrade with a 1-second restart target.') + ' This target is a hypothesis, not measured plant performance.');
      }
    });
    return { tier: tier, changes: changes };
  });
}

function configurePublicAccumulationZones_(equipment) {
  setPublicConveyorEngineering_(equipment, 'conveyor-1', {
    id: 'zone-blowmolder-to-pucker', name: 'Blowmolder discharge accumulation',
    lactMm: 20000, lpPrimeMm: 1500, backupSensorPositionMm: 1600,
    dischargeRunoutLengthMm: 250, rejectRunoutLengthMm: 350,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 2,
    upstreamStopResponseSeconds: 1, bottlesDischargedAtStop: 4, downstreamRampUpSeconds: 8
  });
  setPublicConveyorEngineering_(equipment, 'conveyor-2', {
    id: 'zone-pucker-to-filler', name: 'Pucker discharge accumulation',
    lactMm: 20000, lpPrimeMm: 1500, backupSensorPositionMm: 1400,
    dischargeRunoutLengthMm: 200, rejectRunoutLengthMm: 250,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 2,
    upstreamStopResponseSeconds: 1, bottlesDischargedAtStop: 3, downstreamRampUpSeconds: 15
  });
  setPublicConveyorEngineering_(equipment, 'conveyor-3', {
    id: 'zone-filler-to-depucker', name: 'Filler discharge accumulation',
    lactMm: 24000, lpPrimeMm: 2000, backupSensorPositionMm: 2600,
    dischargeRunoutLengthMm: 450, rejectRunoutLengthMm: 600,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 3,
    upstreamStopResponseSeconds: 2, bottlesDischargedAtStop: 6, downstreamRampUpSeconds: 8
  });
  setPublicConveyorEngineering_(equipment, 'conveyor-4', {
    id: 'zone-depucker-to-sleever', name: 'De-pucker discharge accumulation',
    lactMm: 24000, lpPrimeMm: 2000, backupSensorPositionMm: 1600,
    dischargeRunoutLengthMm: 250, rejectRunoutLengthMm: 350,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 2,
    upstreamStopResponseSeconds: 1, bottlesDischargedAtStop: 3, downstreamRampUpSeconds: 12
  });
  setPublicConveyorEngineering_(equipment, 'conveyor-5', {
    id: 'zone-sleever-to-case-packer', name: 'Sleever discharge accumulation',
    lactMm: 22000, lpPrimeMm: 1800, backupSensorPositionMm: 1600,
    dischargeRunoutLengthMm: 220, rejectRunoutLengthMm: 280,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 2,
    upstreamStopResponseSeconds: 1, bottlesDischargedAtStop: 4, downstreamRampUpSeconds: 12
  });
  setPublicConveyorEngineering_(equipment, 'conveyor-6', {
    id: 'zone-case-packer-to-palletizer', name: 'Case packer discharge accumulation',
    lactMm: 18000, lpPrimeMm: 1500, backupSensorPositionMm: 1600,
    dischargeRunoutLengthMm: 220, rejectRunoutLengthMm: 280,
    blockedTimeDelaySeconds: 0.5, clearTimeDelaySeconds: 0.5, insuranceFactorUnits: 2,
    upstreamStopResponseSeconds: 1, bottlesDischargedAtStop: 4, downstreamRampUpSeconds: 15
  });
}

function setPublicConveyorEngineering_(equipment, equipmentId, design) {
  var owner = equipment.filter(function(unit) { return unit.id === equipmentId; })[0];
  if (!owner) throw new Error('Unknown public demo conveyor: ' + equipmentId);
  owner.processData.geometry.lactMm = design.lactMm;
  owner.processData.geometry.lpPrimeMm = design.lpPrimeMm;
  owner.processData.accumulation = {
    id: design.id,
    name: design.name,
    backupSensorPositionMm: design.backupSensorPositionMm,
    dischargeRunoutLengthMm: design.dischargeRunoutLengthMm,
    rejectRunoutLengthMm: design.rejectRunoutLengthMm,
    blockedTimeDelaySeconds: design.blockedTimeDelaySeconds,
    clearTimeDelaySeconds: design.clearTimeDelaySeconds,
    insuranceFactorUnits: design.insuranceFactorUnits,
    upstreamStopResponseSeconds: design.upstreamStopResponseSeconds,
    bottlesDischargedAtStop: design.bottlesDischargedAtStop,
    downstreamRampUpSeconds: design.downstreamRampUpSeconds
  };
  owner.characteristics.accumulationModel = 'FlowPilot physical conveyor engineering; L_act, L_p, speed factor, Prime, Back-up, overflow, and recovery are derived with positions measured from upstream discharge toward downstream infeed.';
}

function createPublicDemoMetadata_() {
  return {
    demoRevision: 'capex-challenge-3',
    consoleOptions: { autosaveEnabled: true, autosaveSeconds: 10, seedPolicy: 'FIXED' },
    learningObjectives: ['Compare the low theoretical series availability with simulated OEE; buffering can decouple equipment downtime.', 'Read the instantaneous V-Graph: uneven configured speeds, distinct recovery recommendations, and the fixed Filler reference.', 'Zero CAPEX: retune under-speed machines and existing sensors.', 'Medium CAPEX: evaluate moderate buffer extensions and an explicitly assumed local restart-control retrofit.', 'High CAPEX: evaluate additional accumulation length and safe sensor relocation.'],
    dataClassification: 'PUBLIC_DEMONSTRATION_ONLY',
    dataNote: 'This is a non-confidential demonstration Case. Public manufacturer capacity pages provide only broad bounds. MTBF, MTTR, physical conveyor geometry, speeds, sensor positions, and line configuration are transparent synthetic assumptions for software testing; they are not plant measurements, equipment guarantees, or operating recommendations.',
    publicReferences: [
      { publisher: 'Krones', title: 'Contiform Speed stretch blow moulder', url: 'https://www.krones.com/en/products/machines/contiform-speed-stretch-blow-moulder.php', usedFor: 'Public upper-bound reference for PET blow moulding capacity.' },
      { publisher: 'Krones', title: 'Modulfill Dual', url: 'https://www.krones.com/en/products/machines/modulfill-dual.php', usedFor: 'Public upper-bound reference for PET filling capacity.' },
      { publisher: 'Krones', title: 'Coca-Cola HBC Egypt fastest canning line', url: 'https://www.krones.com/en/company/press/magazine/reference/coca-cola-hbc-egypts-fastest-canning-line.php', usedFor: 'Public packer cycle-rate context.' },
      { publisher: 'Krones', title: 'Modulpal Pro palletiser', url: 'https://www.krones.com/en/products/machines/modulpal-pro-palletiser.php', usedFor: 'Public palletising layer-rate context.' }
    ],
    modelLimitations: [
      'All generic-engine rates are units per minute; the current MVP does not yet transform bottles into cases or pallets.',
      'MTBF produces seeded exponential time-to-failure intervals. MTTR is represented as a fixed repair duration.',
      'The public demo uses transparent synthetic L_act, L_p, runout lengths, sensor delays, insurance, and sensor positions. They are not plant measurements or recommendations.',
      'Every conveyor derives pitch, conveyor velocity, Population %, normal photoeye pulse/gap timing, Prime location, Back-up margin, usable accumulation, recovery length, and anti-starve / anti-block time from the named FlowPilot inputs.',
      'Prime is modeled as leading-product travel to the downstream photocell. Back-up receives normal product pulses, but it requests an upstream stop only after a queue holds the photocell continuously blocked for its configured delay; its clear delay is also continuous.'
    ]
  };
}

function createPublicLineUnit_(definition) {
  return {
    id: definition.id,
    type: definition.type,
    name: definition.name,
    nominalRatePerSecond: definition.nominalRateBpm / 60,
    initialMode: 'AUTO',
    characteristics: {
      dataClassification: 'PUBLIC_DEMONSTRATION_ONLY',
      rateBasis: 'units per minute',
      nominalRateBpm: definition.nominalRateBpm
    },
    noiseProfile: {
      reliability: { mtbfMinutes: definition.mtbfMinutes, mttrMinutes: definition.mttrMinutes },
      microStop: {
        probabilityPerMinute: definition.microStopProbabilityPerMinute,
        minDurationSeconds: definition.microStopMinSeconds,
        maxDurationSeconds: definition.microStopMaxSeconds
      }
    },
    processData: {
      role: definition.role,
      machineType: definition.type,
      equipment: {
        mtbfMinutes: definition.mtbfMinutes,
        mttrMinutes: definition.mttrMinutes,
        maximumSpeedBpm: definition.maximumSpeedBpm,
        bufferMinutes: definition.bufferMinutes
      },
      geometry: {
        lactMm: null,
        lpPrimeMm: null,
        actualDischargeMm: definition.actualDischargeMm,
        actualCodingMm: definition.actualCodingMm
      },
      upstream: {
        packageLengthMm: definition.packageLengthMm,
        dischargePitchMm: definition.dischargePitchMm,
        startupTimeSeconds: definition.startupTimeSeconds,
        bottlesDischargedAtStop: definition.bottlesDischargedAtStop
      },
      downstream: {
        infeedPitchMm: definition.infeedPitchMm,
        rampUpTimeSeconds: definition.rampUpTimeSeconds
      },
      speedAndSensors: {
        conveyorSpeedFactorVsDischargeVelocityPercent: definition.dischargeFactorPercent,
        codingConveyorSpeedFactorVsPreviousConveyorPercent: definition.codingFactorPercent,
        additionalParameters: []
      }
    }
  };
}

