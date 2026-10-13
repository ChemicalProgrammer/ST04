import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import * as planner from '../src/analysis/ScenarioPlanner.js';
import {createScenarioDOE} from '../src/analysis/ScenarioDOE.js';
import {scenarioSearchRun} from '../src/analysis/ScenarioSearch.js';
const fixture=()=>structuredClone(JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0]);
const change=(sim,type='REPLACEMENT')=>{const e=sim.equipment[0];return {equipmentId:e.id,path:'noiseProfile.reliability.mttrMinutes',before:e.noiseProfile.reliability.mttrMinutes,after:e.noiseProfile.reliability.mttrMinutes/2,external:true,interventionType:type,justification:'Replace complete machine; target from documented supplier trial.'};};
function service(){const ctx=vm.createContext({createSimulatorError_:(code,message)=>Object.assign(new Error(message),{code})});for(const f of ['ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+f,'utf8'),ctx);return ctx;}
test('intervention scope classifies reliability independently of gain and distinguishes maintenance OPEX',()=>{
 const s=fixture();for(const [type,tier] of [['OPERATIONAL','ZERO'],['MAINTENANCE','ZERO'],['RETROFIT','MEDIUM'],['REPLACEMENT','HIGH']]){const c=change(s,type);assert(planner.scenarioCategoryAllows(c,tier));assert.doesNotThrow(()=>planner.applyScenarioChanges(s,[c]));for(const other of ['ZERO','MEDIUM','HIGH'].filter(t=>t!==tier))assert(!planner.scenarioCategoryAllows(c,other));}
 assert.equal(planner.SCENARIO_INTERVENTIONS.MAINTENANCE.costClass,'OPEX');
 assert.throws(()=>planner.applyScenarioChanges(s,[{...change(s),justification:''}]),/EVIDENCE/);
 assert.throws(()=>planner.applyScenarioChanges(s,[{...change(s),interventionType:undefined}]),/EVIDENCE/);
 assert.throws(()=>planner.applyScenarioChanges(s,[{...change(s),after:3}]),/DIRECTION/);
});
test('sensitivity tests MTBF, MTTR and joint effects but cannot be submitted as a scenario',()=>{
 const s=fixture(),cases=planner.reliabilitySensitivityCandidates(s);assert.equal(cases.length,21);assert.deepEqual(cases.slice(0,3).map(c=>c.kind),['MTBF','MTTR','JOINT']);
 const c=cases[0].changes[0];assert(c.analysisOnly);assert.doesNotThrow(()=>planner.applyScenarioChanges(s,[c]));assert(!planner.scenarioCategoryAllows(c,'HIGH'));
 assert.throws(()=>service().normalizeScenarioProposal_({title:'Exploratory',tier:'HIGH',basis:'STATIC',changes:[c]},s),/exploratory sensitivity/);
 const disabled=structuredClone(s);delete disabled.equipment[0].noiseProfile.reliability;assert.equal(planner.reliabilitySensitivityCandidates(disabled).length,18);
});
test('documented replacement targets enter planner and survive server normalization; wrong category is rejected',()=>{
 const s=fixture(),c=change(s);s.whatIf={externalOptions:[{tier:'HIGH',changes:[c]}]};assert(planner.planScenarios(s).candidates.some(p=>p.kind==='RELIABILITY_INTERVENTION'&&p.canApply));
 const ctx=service(),p={title:'Replacement',tier:'HIGH',basis:'STATIC',changes:[c]};const result=ctx.normalizeScenarioProposal_(p,s);assert.equal(result.changes[0].interventionType,'REPLACEMENT');assert.equal(result.changes[0].costClass,'CAPEX');assert.throws(()=>ctx.normalizeScenarioProposal_({...p,tier:'MEDIUM'},s),/scope/);
 const combined=ctx.normalizeScenarioProposal_({...p,changes:[{...change(s,'MAINTENANCE'),originTier:'ZERO'}]},s);assert.equal(combined.changes[0].originTier,'ZERO');assert.equal(combined.changes[0].costClass,'OPEX');
});
test('DOE preserves intervention scope and lower-category origin for a combined High search',()=>{
 const s=fixture(),c={...change(s,'RETROFIT'),originTier:'MEDIUM'},design=createScenarioDOE([{...c,low:c.after,high:c.before}]);const edited=design.designPoints[0].changes[0];assert.equal(edited.interventionType,'RETROFIT');assert.equal(edited.originTier,'MEDIUM');assert.doesNotThrow(()=>planner.applyScenarioChanges(s,[edited]));
});
test('reliability UI uses paired experiments, independent confirmation and saves no implementation targets',async()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window,s=fixture(),calls=[];
 w.STScenarios={plan:planner.planScenarios,apply:planner.applyScenarioChanges,signature:planner.scenarioSignature,fields:planner.SCENARIO_FIELDS,definitions:planner.SCENARIO_DEFINITIONS,interventions:planner.SCENARIO_INTERVENTIONS,categoryAllows:planner.scenarioCategoryAllows,reliabilitySensitivity:s=>planner.reliabilitySensitivityCandidates(s).slice(0,3)};
 w.STWhatIf={card(){return w.document.createElement('article');}};w.STScenarioText={};w.STScenarioSearch={run:scenarioSearchRun};
 w.SimulatorEngine={inputSignature:input=>JSON.stringify(input),async simulateBatch(input){calls.push(input);const r=input.case.equipment[0].noiseProfile.reliability,oee=100*r.mtbfMinutes/(r.mtbfMinutes+r.mttrMinutes);return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary:{lineOeePercent:oee,outputCount:oee*input.run.durationSeconds/60},batch:{rows:[0,1,2].map(i=>({seed:input.run.seed+i,summary:{lineOeePercent:oee,outputCount:oee*input.run.durationSeconds/60}}))}}};}};
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>({metadata:{},simulations:[s]}),()=>{});
 try{w.STScenarioExplorer.tools(w.document.querySelector('main'),s,planner.planScenarios(s),()=>{});const b=w.document.querySelector('.scenario-reliability-screening button');await b.onclick();assert.equal(calls.length,6,w.document.querySelector(".scenario-reliability-screening").textContent);assert(calls.slice(0,4).every(c=>c.run.durationSeconds===1800&&c.run.seed===s.dynamicConfig.seed));assert.equal(calls[4].run.seed,s.dynamicConfig.seed+1000003);assert.equal(s.whatIf.reliabilitySensitivity.observations.length,3);assert.equal(s.whatIf.externalOptions,undefined);assert(s.whatIf.reliabilitySensitivity.confirmation);assert(w.document.querySelector('.scenario-reliability-screening table'));const previous=s.whatIf.reliabilitySensitivity;s.dynamicConfig.seed++;const runner=w.SimulatorEngine.simulateBatch;w.SimulatorEngine.simulateBatch=async(...args)=>{b.onclick();return runner(...args);};await b.onclick();assert.equal(s.whatIf.reliabilitySensitivity,previous);assert(w.document.querySelector('.scenario-reliability-screening').textContent.includes('cancelled'));}finally{dom.window.close();}
});
