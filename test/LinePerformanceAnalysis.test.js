import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLinePerformance} from '../src/analysis/LinePerformanceAnalysis.js';

const equipment = [
  {id:'a', name:'Unscrambler', type:'MACHINE', nominalRatePerSecond:5, processData:{equipment:{maximumSpeedBpm:360}}},
  {id:'belt', name:'Conveyor', type:'CONVEYOR', nominalRatePerSecond:5},
  {id:'f', name:'Filler', type:'FILLER', nominalRatePerSecond:4, processData:{equipment:{maximumSpeedBpm:240}}},
  {id:'p', name:'Packer', type:'MACHINE', nominalRatePerSecond:5, processData:{equipment:{maximumSpeedBpm:330}}}
];

test('design profile identifies the pacemaker and distinguishes maximum from normal speed', () => {
  const profile = analyzeLinePerformance(equipment, null);
  assert.deepEqual(profile.points.map(p => p.id), ['a','f','p']);
  assert.equal(profile.referenceId, 'f');
  assert.equal(profile.points[0].normalPercent, 100);
  assert.equal(profile.points[0].configuredBpm,300);
  assert.equal(profile.points[0].maximumPercent, 150);
  assert.equal(profile.points[0].capacityEstimateBpm, null);
  assert(Math.abs(profile.points[0].speedHeadroomPercent - 50) < 1e-9);
  assert.equal(profile.points[1].speedHeadroomPercent, 0);
  assert.equal(profile.simulatesOverspeed, false);
  assert.equal(profile.outletBpm, null);
});

test('observed throughput equals availability times operating efficiency times normal speed', () => {
  const result = {
    durationSeconds:600, unitOfFlow:'equivalent bottles',
    summary:{outputCount:2400,lineOeePacemakerEquipmentId:'f'},
    equipmentMetrics:{a:{outputCount:2700,stoppedSeconds:30},f:{outputCount:2500,stoppedSeconds:60},p:{outputCount:2400,stoppedSeconds:120}}
  };
  const profile = analyzeLinePerformance(equipment, result);
  assert.equal(profile.outletBpm, 240);
  assert.equal(profile.points[0].observedBpm, 270);
  assert.equal(profile.points[2].observedBpm, 240);
  assert.equal(profile.points[2].availability, .8);
  assert.equal(profile.points[2].runtimeEfficiency, 2400 / (480 * 5));
  assert.equal(profile.points[2].computedBpm, profile.points[2].observedBpm);
  assert.equal(profile.points[0].capacityEstimateBpm, 300);
  assert.equal(profile.points[1].capacityEstimateBpm, null,'the pacemaker is not assigned a recovery overspeed target');
  assert.equal(profile.points[1].capacityEstimateExceedsMaximum, null);
  assert.equal(profile.points[2].capacityEstimateBpm, 300);
  assert.equal(profile.points[2].capacityEstimateExceedsMaximum, false);
});

test('imported maximum equal to normal is not presented as recovery overspeed', () => {
  const imported = equipment.map(e => ({...e,processData:{equipment:{maximumSpeedBpm:e.nominalRatePerSecond*60}}}));
  const profile = analyzeLinePerformance(imported, {durationSeconds:60,summary:{outputCount:0},equipmentMetrics:{}});
  assert.equal(profile.points[0].recommendedBpm,null,'missing conveyor geometry does not turn a maximum into a recommendation');
  assert.equal(profile.points[0].observedBpm, null);
  assert.equal(profile.points[0].runtimeEfficiency, null);
});

test('recovery recommendation uses installed accumulation and a recovery window, not maximum speed',()=>{
  const machine=(id,type='CUSTOM')=>({id,name:id,type,nominalRatePerSecond:4,noiseProfile:{reliability:{mtbfMinutes:10,mttrMinutes:2}},processData:{equipment:{maximumSpeedBpm:240}}});
  const belt={id:'b',type:'CONVEYOR',processData:{accumulation:{usableLengthMm:10000,productLengthMm:100,productPitchMm:110,conveyorSpeedMmPerSecond:500,primeSensorPositionMm:9000,backupSensorPositionMm:1000}}};
  const equipment=[machine('a'),belt,{...machine('f','FILLER'),processData:{role:'PACEMAKER'}}];
  let profile=analyzeLinePerformance(equipment,null);
  assert.equal(profile.points[0].normalBpm,240);
  assert.equal(profile.points[0].bufferUnits,100);
  assert.equal(profile.points[0].recoveryUnits,100,'mean-stop demand is limited by available accumulation');
  assert.equal(profile.points[0].recommendedBpm,250);
  assert.equal(profile.points[0].recommendationExceedsMaximum,true,'an infeasible target is not clipped to installed maximum');
  assert.equal(profile.points[1].recommendedBpm,240,'pacemaker stays at normal speed');
  equipment[0].processData.equipment.recoveryTimeSeconds=60;
  profile=analyzeLinePerformance(equipment,null);
  assert.equal(profile.points[0].recommendedBpm,340);
  assert.equal(profile.points[0].recoveryBasis,'EXPLICIT_RECOVERY_TIME');
  delete equipment[0].noiseProfile.reliability;
  assert.equal(analyzeLinePerformance(equipment,null).points[0].recommendedBpm,null,'disabled failures are not inferred from stale processData');
});

test('selected machine role takes precedence over an old run reference without changing its equipment type',()=>{
  const models=equipment.map(e=>({...e,characteristics:{isPacemaker:e.id==='a'}}));
  const profile=analyzeLinePerformance(models,{summary:{lineOeePacemakerEquipmentId:'f'}});
  assert.equal(profile.referenceId,'a');assert.equal(models[0].type,'MACHINE');
});
