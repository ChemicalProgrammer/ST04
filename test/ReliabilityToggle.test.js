import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
import {adaptSimPyInput} from '../src/simulation/SimPyBrowserEngine.js';
import {reliabilitySensitivityCandidates,planScenarios} from '../src/analysis/ScenarioPlanner.js';
function input(){const simulation=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0];for(const e of simulation.equipment)if(e.type!=='CONVEYOR')e.noiseProfile.reliability={mtbfMinutes:1,mttrMinutes:.1};return {case:{id:'reliability-toggle',equipment:simulation.equipment},run:{durationSeconds:600,tickSeconds:.25,sampleEverySeconds:30,seed:20261013,commands:[]}};}
test('disabled reliability removes failures without modifying equipment or other flow losses',()=>{
 const a=input(),before=structuredClone(a.case.equipment),on=simulateLine(a),off=simulateLine({...a,run:{...a.run,reliabilityEnabled:false}});
 assert(on.ok);assert(off.ok);assert(on.result.events.some(e=>e.type==='FAILURE_STARTED'));assert(!off.result.events.some(e=>e.type==='FAILURE_STARTED'||e.type==='REPAIR_COMPLETED'));
 assert(Object.values(off.result.equipmentMetrics).every(e=>e.failureSeconds===0));assert.deepEqual(a.case.equipment,before);
 assert(off.result.summary.lineOeePercent<100,'flow losses must not be erased to force 100%');
 assert.deepEqual(simulateLine({...a,run:{...a.run,reliabilityEnabled:true}}),on);
});
test('DES adapter and CAPEX planner respect disabled reliability',()=>{
 const a=input(),payload=adaptSimPyInput({...a,run:{...a.run,reliabilityEnabled:false}});assert(payload.machines.every(e=>!e.reliability));assert(adaptSimPyInput(a).machines.some(e=>e.reliability));
 const simulation={id:'off',equipment:a.case.equipment,dynamicConfig:{...a.run,reliabilityEnabled:false},whatIf:{externalOptions:[{tier:'HIGH',changes:[{equipmentId:a.case.equipment[0].id,path:'noiseProfile.reliability.mtbfMinutes',before:1,after:2,external:true,interventionType:'REPLACEMENT',justification:'supplier'}]}]}};
 assert.deepEqual(reliabilitySensitivityCandidates(simulation),[]);assert(!planScenarios(simulation).candidates.some(c=>c.kind==='RELIABILITY_INTERVENTION'));
});

test('cache signature separates failure-free runs and preserves enabled/default equivalence',async()=>{
 const {default:vm}=await import('node:vm');const source=fs.readFileSync('apps-script/SimulationEngine.html','utf8');const fn=source.slice(source.indexOf('function simulationInputSignature(input){'),source.indexOf('async function simulateBrowserBatch('));
 const a=input(),signature=run=>vm.runInNewContext(fn+'simulationInputSignature(input)',{input:{...a,run},CURRENT_ENGINE_ID:'ST_CURRENT'});
 assert.equal(signature(a.run),signature({...a.run,reliabilityEnabled:true}));assert.notEqual(signature(a.run),signature({...a.run,reliabilityEnabled:false}));
});
