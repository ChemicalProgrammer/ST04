import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {planScenarios,applyScenarioChanges,scenarioSignature,SCENARIO_FIELDS,reliabilitySensitivityCandidates,SCENARIO_DEFINITIONS,SCENARIO_INTERVENTIONS,scenarioCategoryAllows} from '../src/analysis/ScenarioPlanner.js';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES} from '../src/analysis/ScenarioSearch.js';
import {createScenarioDOE,analyzeScenarioDOE,analyzeScenarioANOVA} from '../src/analysis/ScenarioDOE.js';
const original=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8'));
const code=fs.readFileSync('apps-script/SimulationEngine.html','utf8');const ctx=vm.createContext({CURRENT_ENGINE_ID:'ST_CURRENT'});vm.runInContext(code.slice(code.indexOf('function simulationInputSignature('),code.indexOf('async function simulateBrowserBatch(')),ctx);
async function search(parallel,clockScale,included=[],doe=false){
 const record=structuredClone(original),sim=record.simulations[0];sim.unitOfFlow='units';sim.whatIf={searchDepth:'HIGH'};record.metadata.includeDOE=doe;
 const dom=new JSDOM('<article class="analysis-recommendation"></article>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.close=function(){};w.HTMLDialogElement.prototype.showModal=function(){};
 w.STErrors={register(){},capture(_,error){console.error(error.message);}};w.STScenarioText={};
 w.STPreferences={read(){return '';},write(){return true;}};w.STIcons={svg(){return '';}};
 w.STWhatIf={changeInfo(c){return {equipment:c.equipmentId,parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={plan:planScenarios,apply:applyScenarioChanges,signature:scenarioSignature,fields:SCENARIO_FIELDS,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,categoryAllows:scenarioCategoryAllows,reliabilitySensitivity:reliabilitySensitivityCandidates};
 w.STScenarioSearch={profiles:SCENARIO_SEARCH_PROFILES,run:scenarioSearchRun,profile:scenarioSearchProfile,needsMore:scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 let batches=0;w.SimulatorEngine={inputSignature:ctx.simulationInputSignature,async simulateBatch(input,options){batches++;return simulateBatch(JSON.parse(JSON.stringify(input)),{...options,summaryOnly:true,yieldControl:()=>Promise.resolve()});}};
 const now=Date.now.bind(Date);w.Date.now=()=>now()*clockScale;
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});
 Object.assign(w.ST_SCENARIO_SEARCH_LIMITS,{parallelCandidates:parallel,maxCandidates:12,maxSearchMs:1});
 const plan=planScenarios(sim),seen=new Set(),changes=plan.candidates.filter(p=>p.canApply&&p.tier==='HIGH').flatMap(p=>p.changes).filter(c=>{const k=c.equipmentId+':'+c.path;if(seen.has(k))return false;seen.add(k);return true;});
 assert(changes.length,'Photo case has High CAPEX candidates');
 const categoryChanges=Object.fromEntries(['ZERO','MEDIUM','HIGH'].map(t=>[t,plan.candidates.filter(p=>p.canApply&&p.tier===t).flatMap(p=>p.changes)]));
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:'HIGH',explore:true,categoryChanges,changes},()=>{},sim);
 for(const tier of included){const checkbox=host.querySelector('.scenario-include-category[data-tier="'+tier+'"]');checkbox.checked=true;checkbox.onchange();}
 if(doe){const choices=[...host.querySelectorAll('.scenario-doe-select')].filter(c=>!c.disabled);for(const checkbox of choices.slice(0,2)){checkbox.checked=true;checkbox.onchange();}}
 try{
 host.querySelector('.scenario-search').click();
 while(!sim.whatIf.evaluations?.[0]||['RUNNING','VALIDATING'].includes(sim.whatIf.evaluations[0].status))await new Promise(r=>setTimeout(r,20));
 const result=JSON.parse(JSON.stringify(sim.whatIf.evaluations[0]));
 assert(!['ERROR','CANCELLED'].includes(result.status),result.error||result.status);
 console.log(JSON.stringify({parallel,clockScale,included,doe,batches,status:result.status,trials:result.trials,stopReason:result.stopReason,base:result.independentCheck?.baseline.oee,candidate:result.independentCheck?.candidate.oee}));
 return result;
 }finally{dom.window.close();}
}
const brief=r=>({status:r.status,trials:r.trials,stopReason:r.stopReason,run:r.explorationRun,categoryInclusions:r.categoryInclusions,selectedChanges:r.evaluatedChanges,independentCheck:r.independentCheck,doe:r.doe?{factors:r.doe.factors,complete:r.doe.analysis?.complete,combinations:r.doe.observations.length}:null});
if(process.argv.includes('--reliability')){
 const sim=structuredClone(original.simulations[0]),run=scenarioSearchRun(sim.dynamicConfig,'MEDIUM');run.durationSeconds=1800;
 const measured=async(changes,r=run,offset=0)=>{const candidate=changes.length?applyScenarioChanges(sim,changes):sim;const response=await simulateBatch({case:{id:sim.id,unitOfFlow:'units',equipment:candidate.equipment},run:{...r,seed:r.seed+offset}},{summaryOnly:true,yieldControl:()=>Promise.resolve()});assert(response.ok,JSON.stringify(response.error));return {oee:response.result.batch.statistics.lineOeePercent.mean,throughput:response.result.batch.statistics.throughputPerMinute.mean};};
 const baseline=await measured([]),observations=[];
 for(const experiment of reliabilitySensitivityCandidates(sim)){const candidate=await measured(experiment.changes);observations.push({...experiment,candidate,deltaOeePoints:candidate.oee-baseline.oee,deltaThroughput:candidate.throughput-baseline.throughput});}
 observations.sort((a,b)=>b.deltaThroughput-a.deltaThroughput);const top=observations[0],validationRun=scenarioSearchRun(sim.dynamicConfig,'HIGH','validation'),independentBase=await measured([],validationRun,1000003),independentCandidate=await measured(top.changes,validationRun,1000003);
 const allChanges=reliabilitySensitivityCandidates(sim).filter(c=>c.kind==='JOINT').flatMap(c=>c.changes),allCandidate=await measured(allChanges,validationRun,1000003);
 const report={name:'Demo B',analysisOnly:true,seed:run.seed,levels:{mtbfMultiplier:2,mttrMultiplier:.5},run,baseline,observations,confirmation:{equipmentId:top.equipmentId,kind:top.kind,run:validationRun,seedOffset:1000003,baseline:independentBase,candidate:independentCandidate,deltaOeePoints:independentCandidate.oee-independentBase.oee,deltaThroughput:independentCandidate.throughput-independentBase.throughput},allEquipmentJointSensitivity:{candidate:allCandidate,deltaOeePoints:allCandidate.oee-independentBase.oee,deltaThroughput:allCandidate.throughput-independentBase.throughput},interpretation:'Exploratory reliability sensitivity, not a feasible replacement scenario, guaranteed benefit or plant measurement.'};
 fs.writeFileSync('docs/demo-b-reliability-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({baseline,leading:report.confirmation,allEquipmentJointSensitivity:report.allEquipmentJointSensitivity}));
}else if(process.argv.includes('--composition')){
 const isolated=await search(1,1),combined=await search(2,1,['ZERO','MEDIUM'],true);
 fs.writeFileSync('docs/demo-b-composition-results.json',JSON.stringify({name:'Demo B',candidateBudget:12,seed:20261013,isolated:brief(isolated),combined:brief(combined)},null,2)+'\n');
 console.log('Demo B category composition and two-factor DOE evaluated');
}else{
 const first=await search(1,1),second=await search(2,1000);
 assert.deepEqual(first.evaluatedChanges,second.evaluatedChanges);assert.deepEqual(first.independentCheck,second.independentCheck);assert.equal(first.trials,second.trials);
 fs.writeFileSync('docs/demo-b-test-results.json',JSON.stringify({name:'Demo B',seed:20261013,candidateBudget:12,first:brief(first),second:brief(second),conclusion:'Identical selected changes and independent confirmation with different concurrency and clocks.'},null,2)+'\n');
 console.log('Demo B reproducibility verified');
}
