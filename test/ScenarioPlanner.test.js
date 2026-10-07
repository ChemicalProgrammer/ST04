import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {planScenarios,applyScenarioChanges,scenarioSignature,scenarioAudit,scenarioVariableCatalog} from '../src/analysis/ScenarioPlanner.js';
function fixture(){const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/PublicDemoCaseFactory.gs','utf8'),c);return {id:'a',name:'Simulation A',equipment:JSON.parse(JSON.stringify(c.createPublicDemoCaseRequest_().equipment)),dynamicConfig:{durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:17,commands:[]},results:null};}
test('static design produces three explicit categories without inventing dynamic metrics',()=>{
 const sim=fixture(),snapshot=JSON.stringify(sim),plan=planScenarios(sim);
 assert.deepEqual(plan.projects.map(p=>p.tier),['ZERO','MEDIUM','HIGH']);assert(plan.projects.every(p=>p.basis==='STATIC'));assert.equal(JSON.stringify(sim),snapshot);
 const project=plan.projects.find(p=>p.canApply);assert(project);const copy=applyScenarioChanges(sim,project.changes);assert.equal(copy.dynamicConfig.seed,17);assert.equal(copy.results,null);assert.notDeepEqual(copy.equipment,sim.equipment);
 assert(plan.checks.some(c=>c.rule==='TURN_TRAP_AND_FILLED_DIAMETER'&&c.status==='NOT_EVALUATED'));
});
test('plant reliability is not changed without explicit external evidence',()=>{
 const sim=fixture();sim.equipment[0].noiseProfile.reliability={mtbfMinutes:8,mttrMinutes:2};sim.results={summary:{},equipmentMetrics:{[sim.equipment[0].id]:{failureSeconds:45,availabilityPercent:80}},durationSeconds:60};
 const plan=planScenarios(sim),p=plan.projects.find(p=>p.tier==='MEDIUM');assert.equal(p.canApply,false);assert.equal(p.disabledReason,'SCENARIO_INSUFFICIENT_EVIDENCE');
 assert(!plan.candidates.some(candidate=>candidate.changes.some(change=>change.path.startsWith('noiseProfile.reliability.'))));
 for(const path of ['noiseProfile.reliability.mtbfMinutes','noiseProfile.reliability.mttrMinutes']){
  const before=path.endsWith('mtbfMinutes')?8:2;
  assert.throws(()=>applyScenarioChanges(sim,[{equipmentId:sim.equipment[0].id,path,before,after:before*1.2}]),/SCENARIO_EXTERNAL_EVIDENCE_REQUIRED/);
 }
 assert.equal(sim.equipment[0].noiseProfile.reliability.mtbfMinutes,8);
});
test('unsafe, stale and unrelated mutations cannot become scenario buttons',()=>{
 const sim=fixture(),p=planScenarios(sim).projects.find(p=>p.canApply),change=p.changes[0];
 for(const replacement of [{path:'__proto__.polluted'},{equipmentId:'other'},{after:-10},{after:Infinity},{before:123456}])assert.throws(()=>applyScenarioChanges(sim,[{...change,...replacement}]));
 const signature=scenarioSignature(sim);sim.dynamicConfig.seed++;assert.notEqual(scenarioSignature(sim),signature);
});
test('high CAPEX recovery uses recalculated geometry rather than a fixed length multiplier',()=>{
 const sim=fixture(),e=sim.equipment[1];e.processData.geometry.lactMm=1000;e.processData.geometry.lpPrimeMm=200;e.processData.accumulation.backupSensorPositionMm=100;
 const plan=planScenarios(sim),p=plan.candidates.find(p=>p.kind==='BUFFER_RECOVERY'&&p.equipmentId===e.id);assert(p);assert(p.canApply,p.disabledReason);
 const copy=applyScenarioChanges(sim,p.changes),after=scenarioAudit(copy).find(a=>a.equipmentId===e.id).engineering;
 assert(after.calculated.recoveryLengthMm>0);assert(after.input.backupSensorPositionMm>=after.calculated.recommendedBackupSensorPositionMm);assert.equal(sim.equipment[1].processData.geometry.lactMm,1000);
});

test('scenario fingerprint survives server equipment normalization and JSON key order',()=>{
 const sim=fixture(),signature=scenarioSignature(sim);
 const browserCopy=JSON.parse(JSON.stringify(sim));
 browserCopy.equipment=browserCopy.equipment.map(unit=>({
  uiExpanded:true,processData:Object.fromEntries(Object.entries(unit.processData||{}).reverse()),
  noiseProfile:unit.noiseProfile||{},characteristics:unit.characteristics||{},
  initialMode:unit.initialMode,nominalRatePerSecond:String(unit.nominalRatePerSecond),
  name:' '+unit.name+' ',type:unit.type,id:unit.id
 }));
 browserCopy.dynamicConfig=Object.fromEntries(Object.entries(browserCopy.dynamicConfig).reverse());
 assert.equal(scenarioSignature(browserCopy),signature);
 browserCopy.dynamicConfig.seed++;
 assert.notEqual(scenarioSignature(browserCopy),signature);
});

test('external reliability changes require evidence and physically beneficial directions',()=>{
 const sim=fixture(),e=sim.equipment[0];e.noiseProfile.reliability={mtbfMinutes:8,mttrMinutes:2};
 const change={equipmentId:e.id,path:'noiseProfile.reliability.mtbfMinutes',before:8,after:12,external:true,justification:'Bearing replacement supported by vendor reliability target'};
 const updated=applyScenarioChanges(sim,[change]);assert.equal(updated.equipment[0].noiseProfile.reliability.mtbfMinutes,12);assert.equal(sim.equipment[0].noiseProfile.reliability.mtbfMinutes,8);
 assert.throws(()=>applyScenarioChanges(sim,[{...change,after:4}]),/SCENARIO_RELIABILITY_DIRECTION/);
 assert.throws(()=>applyScenarioChanges(sim,[{...change,external:false}]),/SCENARIO_EXTERNAL_EVIDENCE_REQUIRED/);
 assert.equal(applyScenarioChanges(sim,[{...change,path:'noiseProfile.reliability.mttrMinutes',before:2,after:1}]).equipment[0].noiseProfile.reliability.mttrMinutes,1);
});

test('worksheet regressions are reviewable evidence while invalid sensor geometry is rejected',()=>{
 const sim=fixture(),e=sim.equipment[1];e.processData.accumulation.blockedTimeDelaySeconds=10;e.processData.accumulation.clearTimeDelaySeconds=10;
 const change={equipmentId:e.id,path:'processData.accumulation.blockedTimeDelaySeconds',before:10,after:0};
 const copy=applyScenarioChanges(sim,[change]);assert(copy.scenarioWarnings.some(w=>w.rule==='SENSOR_DEBOUNCE'&&w.before==='PASS'));assert.equal(e.processData.accumulation.blockedTimeDelaySeconds,10);
 assert.throws(()=>applyScenarioChanges(sim,[{equipmentId:e.id,path:'processData.accumulation.backupSensorPositionMm',before:e.processData.accumulation.backupSensorPositionMm??null,after:999999}]),/SCENARIO_INVALID_PHYSICS/);
});
test('sensor hypotheses cover all eligible conveyors and machine targets respect documented maxima',()=>{
 const sim=fixture(),plan=planScenarios(sim);
 const conveyors=sim.equipment.filter(e=>e.type==='CONVEYOR'&&e.processData.geometry?.lpPrimeMm>0);
 for(const e of conveyors)assert(plan.candidates.some(p=>p.equipmentId===e.id&&p.kind==='SENSOR_WINDOW'&&p.tier==='ZERO'));
 const machine=sim.equipment[0],path='nominalRatePerSecond';machine.processData.equipment.maximumSpeedBpm=machine.nominalRatePerSecond*60;
 assert.throws(()=>applyScenarioChanges(sim,[{equipmentId:machine.id,path,before:machine.nominalRatePerSecond,after:machine.nominalRatePerSecond+1}]),/SCENARIO_INSTALLED_SPEED_LIMIT/);
 const source=JSON.stringify(sim);for(const p of plan.candidates.filter(p=>p.kind==='V_CURVE'))assert(p.changes.every(c=>c.after*60<=sim.equipment.find(e=>e.id===c.equipmentId).processData.equipment.maximumSpeedBpm));assert.equal(JSON.stringify(sim),source);
});

 test('variable catalog covers machines and conveyors without inventing targets or mutating inputs',()=>{
 const sim=fixture(),snapshot=JSON.stringify(sim),catalog=scenarioVariableCatalog(sim);
 for(const machine of sim.equipment.filter(e=>e.type!=='CONVEYOR')){
  for(const key of ['mtbfMinutes','mttrMinutes']){
   const variable=catalog.find(c=>c.equipmentId===machine.id&&c.path.endsWith(key));assert(variable);assert(variable.external);assert.equal(variable.after,variable.before);assert.equal(variable.justification,'');
  }
 }
 assert(catalog.some(c=>c.path==='processData.geometry.lactMm'));
 assert(catalog.some(c=>c.disabledReason?.includes('Reference machine')));
 assert.equal(JSON.stringify(sim),snapshot);
});
