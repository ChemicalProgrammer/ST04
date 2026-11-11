import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch,replicationView} from '../src/simulation/SimulationBatch.js';
import {stopReliabilityProfile} from '../src/simulation/StopReliability.js';
import {adaptSimPyInput,normalizeSimPyResult} from '../src/simulation/SimPyBrowserEngine.js';
import {applyScenarioChanges} from '../src/analysis/ScenarioPlanner.js';

function input(){
 const source=JSON.parse(fs.readFileSync('test/fixtures/simpy-pipeline.json','utf8'));
 source.run={...source.run,durationSeconds:3600,tickSeconds:.25,sampleEverySeconds:30,seed:123,commands:[]};
 for(const unit of source.case.equipment)unit.noiseProfile={};
 const machine=source.case.equipment[0];
 machine.noiseProfile.reliability={mtbfMinutes:.8,mttrMinutes:.5};
 machine.processData={...machine.processData,equipment:{...machine.processData?.equipment,stopInputs:{minor:{mtbfMinutes:1,mttrMinutes:.2},major:{mtbfMinutes:4,mttrMinutes:1.7}}}};
 return source;
}
function run(value){const response=simulateLine(value);assert(response.ok,JSON.stringify(response.error));return response.result;}
function check(result,id){
 const metrics=result.equipmentMetrics[id];
 assert(metrics.minorFailureCount>0);assert(metrics.majorFailureCount>0);
 assert.equal(metrics.generalFailureCount,0);
 assert.equal(metrics.failureCount,metrics.minorFailureCount+metrics.majorFailureCount);
 assert(Math.abs(metrics.failureSeconds-metrics.minorFailureSeconds-metrics.majorFailureSeconds)<1e-5);
 const events=result.events.filter(event=>event.equipmentId===id&&event.type==='FAILURE_STARTED');
 assert(events.some(event=>event.stopClass==='MINOR'&&event.durationSeconds===12));
 assert(events.some(event=>event.stopClass==='MAJOR'&&event.durationSeconds===102));
 assert(events.every(event=>event.durationSeconds!==30));
}

test('minor and major events retain their durations instead of the equivalent mean',()=>{
 const value=input(),before=JSON.stringify(value),result=run(value),id=value.case.equipment[0].id;
 check(result,id);assert.equal(JSON.stringify(value),before);
 assert.deepEqual(run(value),result);
 const combined=structuredClone(value);delete combined.case.equipment[0].processData.equipment.stopInputs;
 const general=run(combined);
 assert(general.events.filter(event=>event.type==='FAILURE_STARTED').every(event=>event.stopClass==='GENERAL'&&event.durationSeconds===30));
 assert(general.equipmentMetrics[id].generalFailureCount>0);
 assert.notEqual(result.summary.outputCount,general.summary.outputCount);
});

test('zero category, failure toggle and partial final repairs retain consistent counters',()=>{
 const value=input(),id=value.case.equipment[0].id;
 value.case.equipment[0].processData.equipment.stopInputs.major={mtbfMinutes:0,mttrMinutes:0};
 let result=run(value);
 assert.equal(result.equipmentMetrics[id].majorFailureCount,0);
 assert.equal(result.equipmentMetrics[id].majorFailureSeconds,0);
 result=run({...value,run:{...value.run,reliabilityEnabled:false}});
 assert.equal(result.equipmentMetrics[id].failureCount,0);
 assert.equal(result.summary.totalMinorFailureSeconds,0);
 value.run.durationSeconds=1;
 value.case.equipment[0].processData.equipment.stopInputs.minor={mtbfMinutes:.00001,mttrMinutes:10};
 result=run(value);
 assert(result.equipmentMetrics[id].failureSeconds<600);
 assert.equal(result.equipmentMetrics[id].failureSeconds,result.equipmentMetrics[id].minorFailureSeconds);
});

test('both stop classes honor the repair ramp option and do not repeat startup delay',()=>{
 const value=input(),unit=value.case.equipment[0],id=unit.id;
 unit.restartRampUpSeconds=3;unit.startupDelaySeconds=2;
 unit.processData.downstream={...unit.processData.downstream,rampAfterRepair:true};
 const result=run(value),requests=result.events.filter(event=>event.equipmentId===id&&event.reason==='REPAIR_COMPLETED');
 assert(requests.some(event=>event.stopClass==='MINOR'));assert(requests.some(event=>event.stopClass==='MAJOR'));
 assert(requests.every(event=>event.delaySeconds===0&&event.rampUpSeconds===3));
 unit.processData.downstream.rampAfterRepair=false;
 assert(run(value).events.filter(event=>event.equipmentId===id&&event.reason==='REPAIR_COMPLETED').every(event=>event.rampUpSeconds===0));
});

test('async, summary and batch means keep the split metrics',async()=>{
 const value=input();value.run.durationSeconds=300;
 const expected=run(value),response=await simulateLineAsync(value,{yieldBetweenChunks:false,summaryOnly:true});
 assert(response.ok);assert.deepEqual(response.result.equipmentMetrics,expected.equipmentMetrics);
 const batch=await simulateBatch({...value,run:{...value.run,rounds:3}},{summaryOnly:true});
 assert(batch.ok);const id=value.case.equipment[0].id,rows=batch.result.batch.rows;
 const mean=rows.reduce((sum,row)=>sum+row.equipmentMetrics[id].majorFailureSeconds,0)/rows.length;
 assert.equal(replicationView(batch.result).equipmentMetrics[id].majorFailureSeconds,mean);
});

test('invalid splits are identified before execution and scenario targets change each category proportionally',()=>{
 const value=input(),unit=value.case.equipment[0];
 unit.processData.equipment.stopInputs.major.mttrMinutes=null;
 const invalid=simulateLine(value);assert.equal(invalid.ok,false);
 assert(invalid.error.details.some(detail=>detail.path.endsWith('stopInputs.major')));
 unit.processData.equipment.stopInputs.major.mttrMinutes=1.7;
 const changed=applyScenarioChanges({equipment:value.case.equipment,dynamicConfig:value.run},[{
  equipmentId:unit.id,path:'noiseProfile.reliability.mttrMinutes',before:.5,after:.25,external:true,interventionType:'MAINTENANCE',justification:'Measured repair improvement.'
 }]);
 const profile=stopReliabilityProfile(changed.equipment[0]);
 assert(Math.abs(profile.mttrMinutes-.25)<1e-10);
 assert.equal(changed.equipment[0].processData.equipment.stopInputs.major.mttrMinutes,.85);
});

test('the actual spatial SimPy engine records both categories and its normalized counters sum to total own failures',()=>{
 const value=input(),payload=adaptSimPyInput(value),id=value.case.equipment[0].id;
 assert.equal(payload.machines[0].reliability.stopClasses.length,2);
 const code='import sys,json; sys.path[:0]=["src/simulation/python","src/simulation/python/vendor/simpy-4.1.2-py3-none-any.whl"]; from st_simpy_engine import simulate_line; print(json.dumps(simulate_line(json.load(sys.stdin)),allow_nan=False))';
 const response=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(payload),encoding:'utf8'}));
 assert(response.ok,JSON.stringify(response.error));
 const result=normalizeSimPyResult(response.result,value,payload);
 check(result,id);
 const metric=result.equipmentMetrics[id];assert.equal(metric.generalFailureSeconds,0);
 assert.equal(result.summary.totalMinorFailureSeconds,metric.minorFailureSeconds);
});

test('results render a grouped stop breakdown for new runs and show unknown values for saved runs without category data',async()=>{
 const {JSDOM}=await import('jsdom'),{window:w}=new JSDOM('<section id="operation"></section>',{runScripts:'outside-only'});
 const code=fs.readFileSync('apps-script/Results.html','utf8');
 w.number=(value)=>Number.isFinite(value)?String(value):'—';w.unitLabel=value=>value||'bottles';
 w.eval(code.slice(code.indexOf('  function renderEquipmentOperatingResults('),code.indexOf('  function render(result,activeCase,simulation)')));
 const value=input(),result=run(value),target=w.document.getElementById('operation');
 w.renderEquipmentOperatingResults(target,result,result,value.case.equipment);
 const table=target.querySelectorAll('table')[1];
 assert.deepEqual([...table.querySelectorAll('th[scope="colgroup"]')].map(cell=>cell.textContent),['Minor stops','Major stops','General / unclassified']);
 assert.equal(table.tBodies[0].rows.length,2);
 const first=table.tBodies[0].rows[0];
 assert.equal(first.cells[1].textContent,String(result.equipmentMetrics[value.case.equipment[0].id].minorFailureCount));
 for(const metrics of Object.values(result.equipmentMetrics))for(const field of ['minorFailureCount','minorFailureSeconds','majorFailureCount','majorFailureSeconds','generalFailureCount','generalFailureSeconds'])delete metrics[field];
 w.renderEquipmentOperatingResults(target,result,result,value.case.equipment);
 assert.equal(target.querySelectorAll('table')[1].tBodies[0].rows[0].cells[1].textContent,'—');
 w.close();
});

test('run-level stop category controls preserve equipment inputs and work in both engines',()=>{
 const value=input(),id=value.case.equipment[0].id;
 const before=structuredClone(value.case.equipment);
 for(const [disabled,enabled] of [['major','minor'],['minor','major']]){
  const scenario={...value,run:{...value.run,reliabilityCategories:{[disabled]:false}}};
  const metrics=run(scenario).equipmentMetrics[id];
  assert.equal(metrics[disabled+'FailureCount'],0);
  assert(metrics[enabled+'FailureCount']>0);
  const profile=adaptSimPyInput(scenario).machines[0].reliability;
  assert.deepEqual(profile.stopClasses.map(stop=>stop.stopClass),[enabled.toUpperCase()]);
  assert.equal(profile.mtbfMinutes,before[0].processData.equipment.stopInputs[enabled].mtbfMinutes);
 }
 const allSplitDisabled={...value,run:{...value.run,reliabilityCategories:{minor:false,major:false}}};
 assert.equal(run(allSplitDisabled).equipmentMetrics[id].failureCount,0);
 assert.equal(adaptSimPyInput(allSplitDisabled).machines[0].reliability,undefined);
 assert.deepEqual(value.case.equipment,before);
 delete value.case.equipment[0].processData.equipment.stopInputs;
 value.run.reliabilityCategories={general:false};
 assert.equal(run(value).equipmentMetrics[id].failureCount,0);
 assert.equal(adaptSimPyInput(value).machines[0].reliability,undefined);
});
