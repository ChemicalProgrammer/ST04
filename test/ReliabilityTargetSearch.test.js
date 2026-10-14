import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {searchReliabilityTargets} from '../src/analysis/ReliabilityTargetSearch.js';
import {applyScenarioChanges} from '../src/analysis/ScenarioPlanner.js';
const fixture=()=>structuredClone(JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0]);
function synthetic(simulation,changes){const s=changes.length?applyScenarioChanges(simulation,changes):simulation;const losses=s.dynamicConfig?.reliabilityEnabled===false?0:s.equipment.filter(e=>e.type!=='CONVEYOR').reduce((sum,e,index)=>{const r=e.noiseProfile.reliability;return sum+(r?[50,30,10,5,4,2,1][index]*r.mttrMinutes/(r.mtbfMinutes+r.mttrMinutes):0);},0);return {throughput:150-losses,oee:(150-losses)/2,warnings:[]};}
test('inverse reliability search uses conditional removal, bounded targets and explicit joint packages without changing the source',async()=>{
 const s=fixture(),before=structuredClone(s),runs=[],report=await searchReliabilityTargets(s,{run:{seed:7,durationSeconds:900,rounds:3},measure:async(model,changes,run)=>{runs.push(run);return synthetic(model,changes);}});
 assert.equal(report.status,'EXPLORATORY_TARGETS_FOUND');assert.equal(report.coverage.screened,7);assert(report.targetTests.some(t=>t.mechanism==='MTBF'));assert(report.targetTests.some(t=>t.mechanism==='MTTR'));assert(report.targetTests.some(t=>t.mechanism==='JOINT'));assert(report.candidateSets.some(t=>t.kind==='JOINT_MECHANISM_TARGETS'));assert(report.selectedChanges.every(c=>c.analysisOnly&&c.interventionType==='SENSITIVITY'&&c.after>0));assert(runs.every(r=>r.seed===7&&r.durationSeconds===900));assert.deepEqual(s,before);assert.equal(report.classification,'UNASSIGNED');
});
test('disabled reliability skips discovery and cancellation cannot return partial targets',async()=>{
 const s=fixture();s.dynamicConfig.reliabilityEnabled=false;let calls=0;assert.equal((await searchReliabilityTargets(s,{measure:()=>calls++})).status,'FAILURES_DISABLED');assert.equal(calls,0);
 s.dynamicConfig.reliabilityEnabled=true;await assert.rejects(()=>searchReliabilityTargets(s,{run:{},cancelled:()=>calls>2,measure:async(model,changes)=>{calls++;return synthetic(model,changes);}}),/BATCH_CANCELLED/);
});
test('exploratory target scenarios preserve their label on the server and cannot become an ordinary CAPEX recommendation',()=>{
 const s=fixture(),e=s.equipment[6],c={equipmentId:e.id,path:'noiseProfile.reliability.mttrMinutes',before:2,after:1,unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Exploratory model target'};
 const ctx=vm.createContext({createSimulatorError_:(code,message)=>Object.assign(Error(message),{code})});for(const file of ['ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),ctx);
 const proposal={title:'Exploratory targets',tier:'HIGH',basis:'STATIC',changes:[c]};assert.throws(()=>ctx.normalizeScenarioProposal_(proposal,s));const normalized=ctx.normalizeScenarioProposal_({...proposal,analysisOnly:true},s);assert(normalized.analysisOnly);assert(normalized.changes[0].analysisOnly);assert.equal(normalized.changes[0].interventionType,'SENSITIVITY');
});

test('server-created exploratory simulations remain unclassified and retain target metadata',()=>{
 const s=fixture(),ctx=vm.createContext({createSimulatorError_:(code,message)=>Object.assign(Error(message),{code})});for(const file of ['ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),ctx);
 const record={id:'case',revision:1,simulations:[s]};ctx.withCaseWriteLock_=fn=>fn();ctx.getOwnedCaseFile_=()=>({caseData:record,file:{}});ctx.ensureCaseSimulations_=value=>structuredClone(value);ctx.generateSimulationId_=()=> 'exploratory';ctx.Utilities={getUuid:()=> 'abcdefgh-uuid'};ctx.persistCaseRecord_=()=>({});
 const e=s.equipment[6],change={equipmentId:e.id,path:'noiseProfile.reliability.mttrMinutes',before:2,after:.5,unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Model target'};
 const response=ctx.createScenario_({caseId:'case',expectedRevision:1,simulationId:s.id,sourceSignature:ctx.STScenarioEngine_.signature(s),origin:'REVIEWED',proposal:{analysisOnly:true,title:'Exploratory reliability targets',tier:'HIGH',basis:'STATIC',changes:[change]}},{});const created=response.case.simulations.at(-1);assert.equal(created.scenario.capex,null);assert.equal(created.scenario.classification,'UNASSIGNED');assert.equal(created.scenario.plantValidated,false);assert(created.scenario.analysisOnly);assert.equal(created.equipment[6].noiseProfile.reliability.mttrMinutes,.5);assert.equal(created.scenario.validation,'EXPLORATORY_TARGETS_REQUIRE_FEASIBILITY_REVIEW');
});
