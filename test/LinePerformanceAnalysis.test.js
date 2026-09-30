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
  assert.equal(profile.points[0].normalPercent, 125);
  assert.equal(profile.points[0].maximumPercent, 150);
  assert.equal(profile.points[0].recommendedBpm, null);
  assert(Math.abs(profile.points[0].speedHeadroomPercent - 20) < 1e-9);
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
  assert.equal(profile.points[0].recommendedBpm, 300);
  assert.equal(profile.points[1].recommendedBpm, 240 / .9);
  assert.equal(profile.points[1].recommendationExceedsMaximum, true);
  assert.equal(profile.points[2].recommendedBpm, 300);
  assert.equal(profile.points[2].recommendationExceedsMaximum, false);
});

test('imported maximum equal to normal is not presented as recovery overspeed', () => {
  const imported = equipment.map(e => ({...e,processData:{equipment:{maximumSpeedBpm:e.nominalRatePerSecond*60}}}));
  const profile = analyzeLinePerformance(imported, {durationSeconds:60,summary:{outputCount:0},equipmentMetrics:{}});
  assert.equal(profile.hasSpeedHeadroom, false);
  assert.equal(profile.points[0].observedBpm, null);
  assert.equal(profile.points[0].runtimeEfficiency, null);
});
