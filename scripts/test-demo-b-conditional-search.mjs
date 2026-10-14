import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {screenFlowFactors} from '../src/analysis/FlowFactorScreening.js';
import {searchReliabilityTargets} from '../src/analysis/ReliabilityTargetSearch.js';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {planScenarios,applyScenarioChanges,scenarioSignature,SCENARIO_FIELDS,reliabilitySensitivityCandidates,SCENARIO_DEFINITIONS,SCENARIO_INTERVENTIONS,scenarioCategoryAllows} from '../src/analysis/ScenarioPlanner.js';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES,scenarioPairedEvidence} from '../src/analysis/ScenarioSearch.js';
import {createScenarioDOE,analyzeScenarioDOE,analyzeScenarioANOVA} from '../src/analysis/ScenarioDOE.js';
const original=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8'));
const code=fs.readFileSync('apps-script/SimulationEngine.html','utf8');const ctx=vm.createContext({CURRENT_ENGINE_ID:'ST_CURRENT'});vm.runInContext(code.slice(code.indexOf('function simulationInputSignature('),code.indexOf('async function simulateBrowserBatch(')),ctx);
async function controlledSearch(parallel,clockScale,included=[],doe=false,suggestion=false){
 const record=structuredClone(original),sim=record.simulations[0];sim.unitOfFlow='units';sim.whatIf={searchDepth:'HIGH'};record.metadata.includeDOE=doe;
 const dom=new JSDOM('<article class="analysis-recommendation"></article>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.close=function(){};w.HTMLDialogElement.prototype.showModal=function(){};
 w.STErrors={register(){},capture(_,error){console.error(error.message);}};w.STScenarioText={};
 w.STPreferences={read(){return '';},write(){return true;}};w.STIcons={svg(){return '';}};
 w.STWhatIf={changeInfo(c){return {equipment:c.equipmentId,parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={plan:planScenarios,apply:applyScenarioChanges,signature:scenarioSignature,fields:SCENARIO_FIELDS,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,categoryAllows:scenarioCategoryAllows,reliabilitySensitivity:reliabilitySensitivityCandidates};
 w.STScenarioSearch={screenFlow:screenFlowFactors,reliabilityTargets:searchReliabilityTargets,profiles:SCENARIO_SEARCH_PROFILES,run:scenarioSearchRun,profile:scenarioSearchProfile,needsMore:scenarioConfirmationNeedsMore,pairedEvidence:scenarioPairedEvidence,SCENARIO_SEARCH_PROFILES};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 // Reuse the separately measured inverse-search result: this controlled test
 // exercises conditional screening, search and independent confirmation.
 w.STScenarioSearch.reliabilityTargets=async()=>JSON.parse(fs.readFileSync('docs/demo-b-reliability-target-results.json','utf8')).discovery;
 let batches=0;w.SimulatorEngine={inputSignature:ctx.simulationInputSignature,async simulateBatch(input,options){batches++;return simulateBatch(JSON.parse(JSON.stringify(input)),{...options,summaryOnly:true,yieldControl:()=>Promise.resolve()});}};
 const now=Date.now.bind(Date);w.Date.now=()=>now()*clockScale;
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});
 Object.assign(w.ST_SCENARIO_SEARCH_LIMITS,{parallelCandidates:parallel,maxCandidates:12,maxSearchMs:1});
 const plan=planScenarios(sim),seen=new Set(),changes=plan.candidates.filter(p=>p.canApply&&p.tier==='HIGH').flatMap(p=>p.changes).filter(c=>{const k=c.equipmentId+':'+c.path;if(seen.has(k))return false;seen.add(k);return true;});
 assert(changes.length,'Photo case has High CAPEX candidates');
 const categoryChanges=Object.fromEntries(['ZERO','MEDIUM','HIGH'].map(t=>[t,plan.candidates.filter(p=>p.canApply&&p.tier===t).flatMap(p=>p.changes)]));
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:suggestion?'ZERO':'HIGH',explore:true,categoryChanges,changes:suggestion?plan.candidates.filter(p=>p.canApply&&p.kind==='SENSOR_WINDOW').slice(0,4).flatMap(p=>p.changes):changes},()=>{},sim);
 for(const tier of included){const checkbox=host.querySelector('.scenario-include-category[data-tier="'+tier+'"]');checkbox.checked=true;checkbox.onchange();}
 if(doe)host.querySelectorAll('.scenario-doe-select').forEach(c=>c.checked=false);
 try{
 if(suggestion){const b=host.querySelector('.scenario-doe-suggest');await b.onclick();assert(sim.whatIf.evaluations?.[0]?.sensitivityScreening,host.querySelector('.scenario-factor-count').textContent);const result=JSON.parse(JSON.stringify(sim.whatIf.evaluations[0].sensitivityScreening));assert(result?.screenedTargets>0,'Sensitivity screening failed');return result;}
 host.querySelector('.scenario-search').click();
 while(!sim.whatIf.evaluations?.[0]||['RUNNING','VALIDATING'].includes(sim.whatIf.evaluations[0].status))await new Promise(r=>setTimeout(r,20));
 const result=JSON.parse(JSON.stringify(sim.whatIf.evaluations[0]));
 assert(!['ERROR','CANCELLED'].includes(result.status),result.error||result.status);
 console.log(JSON.stringify({parallel,clockScale,included,doe,batches,status:result.status,trials:result.trials,stopReason:result.stopReason,base:result.independentCheck?.baseline.oee,candidate:result.independentCheck?.candidate.oee}));
 return result;
 }finally{dom.window.close();}
}
const start=Date.now(),result=await controlledSearch(2,1,['ZERO','MEDIUM'],true);
assert(result.conditionalFlowDOE?.method==='ADAPTIVE_CONDITIONAL_FLOW_V1');assert(result.independentCheck,'Full-horizon confirmation missing');
assert(result.independentCheck.durationSeconds===28800,'Eight-hour configured horizon must be retained');
const report={scope:'Controlled twelve-candidate flow search; previously measured reliability targets; all categories included; independent eight-hour confirmation. Not an exhaustive search or plant validation.',elapsedSeconds:(Date.now()-start)/1000,status:result.status,phaseAudit:result.phaseAudit,conditionalFlowDOE:result.conditionalFlowDOE,changes:result.evaluatedChanges,confirmation:result.independentCheck,warnings:result.warnings};
fs.writeFileSync('docs/demo-b-conditional-search-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({elapsedSeconds:report.elapsedSeconds,status:report.status,base:report.confirmation.baseline.oee,candidate:report.confirmation.candidate.oee,passed:report.confirmation.passed}));
