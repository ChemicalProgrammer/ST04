import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {planScenarios,applyScenarioChanges,scenarioSignature,SCENARIO_FIELDS} from '../src/analysis/ScenarioPlanner.js';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES} from '../src/analysis/ScenarioSearch.js';
import {createScenarioDOE,analyzeScenarioDOE,analyzeScenarioANOVA} from '../src/analysis/ScenarioDOE.js';
const original=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8'));
const code=fs.readFileSync('apps-script/SimulationEngine.html','utf8');const ctx=vm.createContext({CURRENT_ENGINE_ID:'ST_CURRENT'});vm.runInContext(code.slice(code.indexOf('function simulationInputSignature('),code.indexOf('async function simulateBrowserBatch(')),ctx);
async function search(parallel,clockScale){
 const record=structuredClone(original),sim=record.simulations[0];sim.unitOfFlow='units';sim.whatIf={searchDepth:'HIGH'};
 const dom=new JSDOM('<article class="analysis-recommendation"></article>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.close=function(){};w.HTMLDialogElement.prototype.showModal=function(){};
 w.STErrors={register(){},capture(_,error){console.error(error.message);}};w.STScenarioText={};
 w.STPreferences={read(){return '';},write(){return true;}};w.STIcons={svg(){return '';}};
 w.STWhatIf={changeInfo(c){return {equipment:c.equipmentId,parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={plan:planScenarios,apply:applyScenarioChanges,signature:scenarioSignature,fields:SCENARIO_FIELDS};
 w.STScenarioSearch={profiles:SCENARIO_SEARCH_PROFILES,run:scenarioSearchRun,profile:scenarioSearchProfile,needsMore:scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 let batches=0;w.SimulatorEngine={inputSignature:ctx.simulationInputSignature,async simulateBatch(input,options){batches++;return simulateBatch(JSON.parse(JSON.stringify(input)),{...options,summaryOnly:true,yieldControl:()=>Promise.resolve()});}};
 const now=Date.now.bind(Date);w.Date.now=()=>now()*clockScale;
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});
 Object.assign(w.ST_SCENARIO_SEARCH_LIMITS,{parallelCandidates:parallel,maxCandidates:12,maxSearchMs:1});
 const plan=planScenarios(sim),seen=new Set(),changes=plan.candidates.filter(p=>p.canApply&&p.tier==='HIGH').flatMap(p=>p.changes).filter(c=>{const k=c.equipmentId+':'+c.path;if(seen.has(k))return false;seen.add(k);return true;});
 assert(changes.length,'Photo case has High CAPEX candidates');
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:'HIGH',explore:true,changes},()=>{},sim);
 try{
 host.querySelector('.scenario-search').click();
 while(!sim.whatIf.evaluations?.[0]||['RUNNING','VALIDATING'].includes(sim.whatIf.evaluations[0].status))await new Promise(r=>setTimeout(r,20));
 const result=JSON.parse(JSON.stringify(sim.whatIf.evaluations[0]));
 assert(!['ERROR','CANCELLED'].includes(result.status),result.error||result.status);
 console.log(JSON.stringify({parallel,clockScale,batches,status:result.status,trials:result.trials,stopReason:result.stopReason,base:result.independentCheck?.baseline.oee,candidate:result.independentCheck?.candidate.oee}));
 return result;
 }finally{dom.window.close();}
}
const first=await search(1,1),second=await search(2,1000);
assert.deepEqual(first.evaluatedChanges,second.evaluatedChanges);assert.deepEqual(first.independentCheck,second.independentCheck);assert.equal(first.trials,second.trials);
const brief=r=>({status:r.status,trials:r.trials,stopReason:r.stopReason,run:r.explorationRun,selectedChanges:r.evaluatedChanges,independentCheck:r.independentCheck});
fs.writeFileSync('docs/demo-b-test-results.json',JSON.stringify({name:'Demo B',seed:20261013,candidateBudget:12,first:brief(first),second:brief(second),conclusion:'Identical selected changes and independent confirmation with different concurrency and clocks.'},null,2)+'\n');
console.log('Demo B reproducibility verified');
