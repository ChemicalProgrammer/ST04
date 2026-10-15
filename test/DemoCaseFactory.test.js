import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { applyScenarioChanges } from '../src/analysis/ScenarioPlanner.js';

import { simulateLine } from '../src/simulation/LineSimulationEngine.js';
import { analyzeLinePerformance } from '../src/analysis/LinePerformanceAnalysis.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('demo starts with low series availability and a V-shaped configured speed profile',()=>{
  const factory=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(repositoryRoot,'apps-script/DemoCaseFactory.gs'),'utf8'),factory);
  const record=JSON.parse(JSON.stringify(factory.createDemoCaseRequest_()));
  const machines=record.equipment.filter(e=>e.type!=='CONVEYOR');
  const availability=machines.reduce((product,e)=>product*e.noiseProfile.reliability.mtbfMinutes/(e.noiseProfile.reliability.mtbfMinutes+e.noiseProfile.reliability.mttrMinutes),1);
  assert(availability>.25&&availability<.35);
  const {points,referenceId}=analyzeLinePerformance(record.equipment);
  assert.equal(referenceId,'filler-1');
  assert(new Set(points.map(p=>p.normalBpm)).size>=5);
  for(const simulation of record.simulations){
    const speeds=simulation.equipment.filter(e=>e.type!=='CONVEYOR').map(e=>e.nominalRatePerSecond*60);
    assert.equal(speeds[2],400);assert(speeds.every((v,i)=>i===2||v>400));
    assert(speeds[0]>speeds[1]&&speeds[1]>speeds[2]);
    assert(speeds.slice(2).every((v,i,a)=>!i||v>a[i-1]));
    assert.equal(simulation.equipment.filter(e=>e.characteristics.isPacemaker).length,1);
    const profile=analyzeLinePerformance(simulation.equipment);
    assert.deepEqual(profile.points.map(p=>p.normalBpm),speeds);
    assert(profile.points.every(p=>p.maximumBpm>=p.normalBpm));
    assert.equal(profile.points.reduce((a,b)=>a.normalBpm<b.normalBpm?a:b).id,'filler-1');
  }
  assert(new Set(points.map(p=>p.maximumBpm)).size>=5);
  assert(points.filter(p=>p.recommendedBpm-p.normalBpm>10).length>=5);
  assert(points.every(p=>Number.isFinite(p.recommendedBpm)&&p.recommendedBpm>0));
  const filler=points.find(p=>p.id===referenceId);assert.equal(filler.recommendedBpm,filler.normalBpm);
  assert(points.every(p=>p.hasDynamicEvidence===false));
});

test('demo factory creates a runnable 13-step Case with explicit provenance', () => {
  const factory = vm.createContext({ Date, Array, Object });
  vm.runInContext(
    fs.readFileSync(path.join(repositoryRoot, 'apps-script', 'DemoCaseFactory.gs'), 'utf8'),
    factory,
    { filename: 'DemoCaseFactory.gs' }
  );
  const caseModel = factory.createDemoCaseRequest_();

  assert.equal(caseModel.metadata.dataClassification, 'DEMO_ONLY');
  assert.match(caseModel.metadata.dataNote, /synthetic assumptions/i);
  assert.equal(caseModel.metadata.publicReferences, undefined);
  assert.deepEqual(Array.from(caseModel.equipment, (item) => item.type), [
    'BLOWMOLDER', 'CONVEYOR', 'PUCKER', 'CONVEYOR', 'FILLER', 'CONVEYOR',
    'DEPUCKER', 'CONVEYOR', 'SLEEVER', 'CONVEYOR', 'CASE_PACKER', 'CONVEYOR', 'PALLETIZER'
  ]);

  const conveyors = caseModel.equipment.filter((unit) => unit.type === 'CONVEYOR');
  assert.equal(conveyors.length, 6);
  assert.equal(conveyors.every((unit) => {
    const zone = unit.processData.accumulation;
    return zone && unit.processData.geometry.lactMm > 0 && unit.processData.geometry.lpPrimeMm > 0 &&
      zone.backupSensorPositionMm > 0 && zone.dischargeRunoutLengthMm >= 0 &&
      zone.rejectRunoutLengthMm >= 0 && zone.blockedTimeDelaySeconds >= 0 &&
      zone.clearTimeDelaySeconds >= 0 && zone.insuranceFactorUnits >= 0;
  }), true);

  for (const unit of caseModel.equipment) {
    assert.ok(unit.nominalRatePerSecond > 0);
    assert.ok(unit.noiseProfile.reliability.mtbfMinutes > 0);
    assert.ok(unit.noiseProfile.reliability.mttrMinutes > 0);
    assert.ok(unit.processData.equipment.mtbfMinutes > 0);
    assert.ok(unit.processData.equipment.mttrMinutes > 0);
    assert.ok(unit.processData.equipment.maximumSpeedBpm > 0);
    if (unit.type === 'CONVEYOR') {
      assert.ok(unit.processData.geometry.lactMm > 0);
      assert.ok(unit.processData.geometry.lpPrimeMm > 0);
    } else {
      assert.equal(unit.processData.geometry.lactMm, null);
      assert.equal(unit.processData.geometry.lpPrimeMm, null);
    }
    assert.ok(unit.processData.geometry.actualDischargeMm > 0);
    assert.ok(unit.processData.geometry.actualCodingMm > 0);
    assert.ok(unit.processData.upstream.packageLengthMm > 0);
    assert.ok(unit.processData.upstream.dischargePitchMm > 0);
    assert.ok(unit.processData.upstream.startupTimeSeconds > 0);
    assert.ok(unit.processData.upstream.bottlesDischargedAtStop >= 0);
    assert.ok(unit.processData.downstream.infeedPitchMm > 0);
    assert.ok(unit.processData.downstream.rampUpTimeSeconds > 0);
    assert.ok(unit.processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent > 0);
    assert.ok(unit.processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent > 0);
    assert.deepEqual(Array.from(unit.processData.speedAndSensors.additionalParameters), []);
  }

  const response = simulateLine({
    case: JSON.parse(JSON.stringify(caseModel)),
    run: {...caseModel.simulations[0].dynamicConfig, durationMode:'FIXED', durationSeconds:600}
  });
  assert.equal(response.ok, true);
  assert.ok(response.result.summary.outputCount > 0);
  const zoneMetrics = Object.values(response.result.accumulationZoneMetrics);
  assert.equal(zoneMetrics.every((zone) => zone.modelOrigin === 'FLOWPILOT_ENGINEERING'), true);
  assert.equal(zoneMetrics.some((zone) => zone.engineering.audit.status === 'WARNING'), true); // Deliberately undersized accumulation is the High CAPEX opportunity.
});


// Results are calculated, never preset. Check one 8-hour shift and three paired seeds.
test('CAPEX demo reproduces separate baseline / zero / medium / high gains with physical inputs', (t) => {
  const factory = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(repositoryRoot, 'apps-script/DemoCaseFactory.gs'), 'utf8'), factory);
  const record = JSON.parse(JSON.stringify(factory.createDemoCaseRequest_()));
  const simulation = record.simulations[0];
  assert.equal(record.metadata.consoleOptions.seedPolicy, 'FIXED');
  assert.equal(simulation.dynamicConfig.durationSeconds, 28800);
  assert.equal(simulation.results, null);
  assert.equal(record.simulations.length, 4);
  assert(record.simulations.every(s => s.results === null));
  const tiers = [{tier: 'BASELINE', changes: []}, ...simulation.whatIf.externalOptions];
  const expected = [49, 53, 64, 79], means = [];
  for (const [index, option] of tiers.entries()) {
    const candidate = option.changes.length ? applyScenarioChanges(simulation, option.changes) : simulation;
    assert.deepEqual(record.simulations[index].equipment, candidate.equipment);
    assert(!candidate.scenarioWarnings?.length, JSON.stringify(candidate.scenarioWarnings));
    assert.deepEqual(candidate.equipment.map(e => e.noiseProfile.reliability), simulation.equipment.map(e => e.noiseProfile.reliability));
    assert.equal(candidate.equipment.find(e => e.id === 'filler-1').nominalRatePerSecond, 400 / 60);
    if (option.tier === 'ZERO') assert(option.changes.every(c => !c.external && c.path !== 'processData.geometry.lactMm'));
    if (option.tier === 'MEDIUM') assert(candidate.equipment.filter(e=>e.type==='CONVEYOR').every(e=>e.processData.geometry.lactMm===12000));
    const values = [0, 1, 2].map(offset => {
      const response = simulateLine({case: {id: 'demo-check', equipment: candidate.equipment}, run: {...simulation.dynamicConfig, seed: simulation.dynamicConfig.seed + offset}});
      assert(response.ok);
      const result = response.result;
      assert(Math.abs(result.summary.lineOeePercent - 100 * result.summary.outputCount / ((400 / 60) * result.durationSeconds)) < .001);
      return result.summary.lineOeePercent;
    });
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    means.push(mean);
    t.diagnostic(option.tier + ': ' + mean.toFixed(2) + '% · ' + values.map(v => v.toFixed(2)).join(', '));
    assert(Math.abs(mean - expected[index]) < 6, option.tier + ' actual mean: ' + mean);
  }
  assert(means.every((value, index) => !index || value > means[index - 1] + 2));
});

