import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateConveyorEngineering } from '../src/simulation/ConveyorEngineering.js';
import { simulateLine } from '../src/simulation/LineSimulationEngine.js';

function closeTo(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function createFlowPilotLine() {
  return {
    id: 'flowpilot-line',
    unitOfFlow: 'bottles',
    equipment: [
      {
        id: 'upstream', type: 'FILLER', name: 'Upstream', nominalRatePerSecond: 7,
        initialMode: 'AUTO',
        processData: {
          equipment: { maximumSpeedBpm: 420 },
          upstream: { packageLengthMm: 66, dischargePitchMm: 85, startupTimeSeconds: 8, bottlesDischargedAtStop: 4 },
          downstream: { infeedPitchMm: 88, rampUpTimeSeconds: 8 }
        }
      },
      {
        id: 'conveyor', type: 'CONVEYOR', name: 'Engineering conveyor', nominalRatePerSecond: 8,
        initialMode: 'AUTO',
        processData: {
          role: 'CONVEYOR',
          geometry: { lactMm: 20000, lpPrimeMm: 1500 },
          upstream: { packageLengthMm: 66, dischargePitchMm: 85, startupTimeSeconds: 8, bottlesDischargedAtStop: 4 },
          downstream: { infeedPitchMm: 90, rampUpTimeSeconds: 8 },
          speedAndSensors: { conveyorSpeedFactorVsDischargeVelocityPercent: 5 },
          accumulation: {
            backupSensorPositionMm: 1600,
            dischargeRunoutLengthMm: 250,
            rejectRunoutLengthMm: 350,
            blockedTimeDelaySeconds: 0.5,
            clearTimeDelaySeconds: 0.5,
            insuranceFactorUnits: 2,
            upstreamStopResponseSeconds: 1,
            bottlesDischargedAtStop: 4,
            downstreamRampUpSeconds: 8
          }
        }
      },
      {
        id: 'downstream', type: 'SLEEVER', name: 'Downstream', nominalRatePerSecond: 7.1666666667,
        initialMode: 'AUTO',
        processData: {
          equipment: { maximumSpeedBpm: 430 },
          upstream: { packageLengthMm: 66, dischargePitchMm: 90, startupTimeSeconds: 6, bottlesDischargedAtStop: 3 },
          downstream: { infeedPitchMm: 90, rampUpTimeSeconds: 8 }
        }
      }
    ]
  };
}

test('calculates FlowPilot velocity, population, overflow, recovery, and audit deterministically', () => {
  const result = calculateConveyorEngineering({
    installedLengthMm: 20000,
    primeReserveMm: 1500,
    packageLengthMm: 66,
    upstreamDischargePitchMm: 85,
    upstreamNominalSpeedBpm: 420,
    downstreamHighSpeedBpm: 430,
    downstreamInfeedPitchMm: 90,
    conveyorSpeedFactorPercent: 5,
    dischargeRunoutLengthMm: 250,
    rejectRunoutLengthMm: 350,
    blockedTimeDelaySeconds: 0.5,
    clearTimeDelaySeconds: 0.5,
    insuranceFactorUnits: 2,
    backupSensorPositionMm: 1600,
    upstreamStopResponseSeconds: 1,
    bottlesDischargedAtStop: 4,
    upstreamStartupTimeSeconds: 8
  });

  closeTo(result.calculated.upstreamDischargeVelocityMmPerSecond, 595);
  closeTo(result.calculated.conveyorSpeedMmPerSecond, 624.75);
  closeTo(result.calculated.populationPercent, 73.9495798319, 1e-8);
  closeTo(result.calculated.effectiveProductPitchMm, 89.25);
  closeTo(result.calculated.packagePassSensorSeconds, 66 / 624.75);
  closeTo(result.calculated.sensorClearGapSeconds, 23.25 / 624.75);
  closeTo(result.calculated.sensorCycleSeconds, 89.25 / 624.75);
  closeTo(result.calculated.overflowLengthMm, 1447.875);
  closeTo(result.calculated.usefulAccumulationLengthMm, 17052.125);
  assert.equal(result.calculated.primeSensorPositionMm, 18500);
  assert.equal(result.calculated.recommendedBackupSensorPositionMm, 1447.875);
  assert.equal(result.calculated.conveyorCapacityUnits, 224);
  assert.equal(result.audit.status, 'WARNING');
  assert.equal(result.audit.goals.find(goal=>goal.id==='POPULATION').status,'WARNING');
  assert.equal(result.audit.goals.find((goal) => goal.id === 'SENSOR_DEBOUNCE').status, 'PASS');
});

test('warns when a Back-up debounce is no longer than normal package pulses or gaps', () => {
  const result = calculateConveyorEngineering({
    installedLengthMm: 20000,
    primeReserveMm: 1500,
    packageLengthMm: 66,
    upstreamDischargePitchMm: 85,
    upstreamNominalSpeedBpm: 420,
    downstreamHighSpeedBpm: 430,
    downstreamInfeedPitchMm: 90,
    conveyorSpeedFactorPercent: 5,
    blockedTimeDelaySeconds: 0.1,
    clearTimeDelaySeconds: 0.03,
    insuranceFactorUnits: 2,
    backupSensorPositionMm: 1600,
    bottlesDischargedAtStop: 4,
    upstreamStartupTimeSeconds: 8
  });

  assert.equal(result.audit.goals.find((goal) => goal.id === 'SENSOR_DEBOUNCE').status, 'WARNING');
});

test('uses the FlowPilot fields as the physical conveyor model instead of direct geometry overrides', () => {
  const response = simulateLine({
    case: createFlowPilotLine(),
    run: { durationSeconds: 60, tickSeconds: 0.25, sampleEverySeconds: 1, seed: 17 }
  });

  assert.equal(response.ok, true);
  const zone = response.result.accumulationZoneMetrics['conveyor--physical-zone'];
  assert.equal(zone.modelOrigin, 'FLOWPILOT_ENGINEERING');
  assert.equal(zone.capacityUnits, 303);
  assert.equal(zone.accumulatedPitchMm, 66);
  assert.equal(zone.engineering.audit.status, 'WARNING');
  closeTo(zone.engineering.calculated.conveyorSpeedMmPerSecond, 624.75);
  assert.ok(response.result.events.some((event) => event.type === 'PRIME_SENSOR_TRIGGERED'));
});

test('flags a Back-up photocell that leaves less than the calculated overflow margin', () => {
  const result = calculateConveyorEngineering({
    installedLengthMm: 20000,
    primeReserveMm: 1500,
    packageLengthMm: 66,
    upstreamDischargePitchMm: 85,
    upstreamNominalSpeedBpm: 420,
    downstreamHighSpeedBpm: 430,
    downstreamInfeedPitchMm: 90,
    conveyorSpeedFactorPercent: 5,
    dischargeRunoutLengthMm: 250,
    rejectRunoutLengthMm: 350,
    blockedTimeDelaySeconds: 0.5,
    clearTimeDelaySeconds: 0.5,
    insuranceFactorUnits: 2,
    backupSensorPositionMm: 1200,
    bottlesDischargedAtStop: 4,
    upstreamStartupTimeSeconds: 8
  });

  assert.equal(result.audit.goals.find((goal) => goal.id === 'BACKUP_POSITION').status, 'WARNING');
});

test('worksheet zone factors, actual lengths and overspeed produce dimensional design outputs',()=>{
  const input={installedLengthMm:20000,primeReserveMm:1500,packageLengthMm:80,upstreamDischargePitchMm:100,upstreamNominalSpeedBpm:180,downstreamHighSpeedBpm:200,downstreamInfeedPitchMm:90,conveyorSpeedFactorPercent:10,codingSpeedFactorPercent:20,accumulationSpeedFactorPercent:30,infeedOverspeedPercent:7,dischargeRunoutLengthMm:200,rejectRunoutLengthMm:300,blockedTimeDelaySeconds:1,insuranceFactorUnits:2,bottlesDischargedAtStop:3,downstreamRampUpSeconds:4};
  const {calculated:c}=calculateConveyorEngineering(input);
  closeTo(c.dischargeZoneSpeedMmPerSecond,330);closeTo(c.codingZoneSpeedMmPerSecond,396);closeTo(c.conveyorSpeedMmPerSecond,514.8);
  closeTo(c.dischargePopulationPercent,240/330*100);closeTo(c.codingPopulationPercent,240/396*100);closeTo(c.populationPercent,240/514.8*100);
  closeTo(c.overflowLengthMm,200+300+c.overflowProductLengthMm);closeTo(c.usefulAccumulationLengthMm,20000-1500-c.overflowLengthMm);
  closeTo(c.minimumRampAccumulationLengthMm,200*80/60*4/2);closeTo(c.minimumInstalledLengthMm,c.overflowLengthMm+1500+c.minimumRampAccumulationLengthMm);
  closeTo(c.recommendedInfeedConveyorSpeedMmPerSecond,200*90/60*1.07);closeTo(c.downstreamInfeedRateMmPerSecond,300);
});


test('target Population preserves flow and manual LBA changes the active Back-up sensor', () => {
  const line=createFlowPilotLine();
  Object.assign(line.equipment[1].processData.accumulation,{targetPopulationPercent:50,manualLbaMm:10000,speedMode:'MANUAL',conveyorSpeedMmPerSecond:1,movingGapMm:1});
  const response=simulateLine({case:line,run:{durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:17}});
  assert.equal(response.ok,true,JSON.stringify(response.error));
  const zone=response.result.accumulationZoneMetrics['conveyor--physical-zone'];
  const c=zone.engineering.calculated,r=zone.engineering.runtimeGeometry;
  closeTo(c.populationPercent,50);
  closeTo(r.conveyorSpeedMmPerSecond,924);
  closeTo(r.movingPitchMm,132);
  closeTo(r.transferCapacityPerSecond,7);
  closeTo(c.usefulAccumulationLengthMm,10000);
  closeTo(c.actualBackupSensorPositionMm,8500);
  assert.equal(zone.capacityUnits,303);
  assert.equal(zone.engineering.audit.goals.find(g=>g.id==='POPULATION').status,'PASS');
});

test('invalid Population or LBA cannot simulate impossible reserves', () => {
  for(const overrides of [{targetPopulationPercent:0},{targetPopulationPercent:101},{manualLbaMm:19000},{manualLbaMm:-1}]){
    const line=createFlowPilotLine();Object.assign(line.equipment[1].processData.accumulation,overrides);
    const response=simulateLine({case:line,run:{durationSeconds:5,tickSeconds:.25,sampleEverySeconds:1,seed:17}});
    assert.equal(response.ok,false,JSON.stringify(overrides));
  }
});

test('target Overspeed sets active belt speed and pitch and rejects conflicting targets',()=>{
 const line=createFlowPilotLine(),acc=line.equipment[1].processData.accumulation;
 Object.assign(acc,{targetOverspeedPercent:20,speedMode:'MANUAL',conveyorSpeedMmPerSecond:1,movingGapMm:1});
 const response=simulateLine({case:line,run:{durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:17,commands:[]}});assert(response.ok,JSON.stringify(response.error));
 const zone=response.result.accumulationZoneMetrics;const metric=Object.values(zone)[0];
 // 430 BPM × 90 mm / 60 × 1.20 = 774 mm/s.
 const calculated=calculateConveyorEngineering({upstreamNominalSpeedBpm:420,upstreamDischargePitchMm:85,packageLengthMm:66,conveyorSpeedFactorPercent:5,downstreamHighSpeedBpm:430,downstreamInfeedPitchMm:90,targetOverspeedPercent:20}).calculated;
 closeTo(calculated.conveyorSpeedMmPerSecond,774);closeTo(calculated.actualInfeedOverspeedPercent,20);closeTo(metric.conveyorSpeedMmPerSecond,774);
 for(const invalid of [-1,1001,NaN]){acc.targetOverspeedPercent=invalid;assert.equal(simulateLine({case:line,run:{durationSeconds:1,tickSeconds:.25,sampleEverySeconds:1,seed:17}}).ok,false);}
 acc.targetOverspeedPercent=20;acc.targetPopulationPercent=50;assert.equal(simulateLine({case:line,run:{durationSeconds:1,tickSeconds:.25,sampleEverySeconds:1,seed:17}}).ok,false);
});
