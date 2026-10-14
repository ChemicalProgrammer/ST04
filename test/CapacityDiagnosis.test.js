import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
import {diagnoseLineEfficiency} from '../src/analysis/LinePerformanceAnalysis.js';
import {applyScenarioChanges,planScenarios,scenarioCategoryAllows} from '../src/analysis/ScenarioPlanner.js';
import {createScenarioDOE} from '../src/analysis/ScenarioDOE.js';
const fixture=()=>structuredClone(JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0]);
const replacement=s=>({equipmentId:s.equipment[4].id,path:'nominalRatePerSecond',before:s.equipment[4].nominalRatePerSecond,after:200/60,replacementMaximumBpm:220,external:true,interventionType:'REPLACEMENT',justification:'Illustrative test input, not a supplier specification.'});
test('capacity accounting uses the reference and replicated OEE without adding overlapping equipment losses',()=>{
 const s=fixture(),d=diagnoseLineEfficiency(s.equipment,{durationSeconds:480,summary:{lineOeePercent:80},batch:{rounds:3,statistics:{lineOeePercent:{mean:92.4}}},equipmentMetrics:{[s.equipment[4].id]:{starvedSeconds:100,blockedSeconds:100}}});
 assert.equal(d.referenceBpm,193);assert.equal(d.minimumBpm,180);assert(Math.abs(d.capacityCeilingPercent-180/193*100)<1e-9);assert(Math.abs(d.achievedPercent+d.capacityGapPp+d.residualLossPp-100)<1e-9);assert.equal(d.rounds,3);assert(d.residualLossPp<1);
 assert(Math.abs(d.equipmentTime.find(e=>e.id===s.equipment[4].id).percent.starvedSeconds-100/480*100)<1e-9);
 assert.equal(diagnoseLineEfficiency(s.equipment,null).residualLossPp,null);assert(!diagnoseLineEfficiency(s.equipment,{engineId:'DES_SIMPY_EXPERIMENTAL',summary:{lineOeePercent:80}}).accountingAvailable);
});
test('replacement changes both nominal and installed capacity atomically and preserves reference and source',()=>{
 const s=fixture(),c=replacement(s),copy=applyScenarioChanges(s,[c]);assert.equal(copy.equipment[4].processData.equipment.maximumSpeedBpm,220);assert.equal(copy.equipment[4].nominalRatePerSecond,200/60);assert.equal(s.equipment[4].nominalRatePerSecond,3);assert.equal(copy.equipment[0].nominalRatePerSecond,s.equipment[0].nominalRatePerSecond);
 assert(scenarioCategoryAllows(c,'HIGH'));assert(!scenarioCategoryAllows(c,'MEDIUM'));assert(!scenarioCategoryAllows(c,'ZERO'));
 assert.throws(()=>applyScenarioChanges(s,[{...c,justification:''}]),/EVIDENCE/);assert.throws(()=>applyScenarioChanges(s,[{...c,replacementMaximumBpm:190}]),/SPEED/);assert.throws(()=>applyScenarioChanges(s,[{...c,equipmentId:s.equipment[0].id,before:s.equipment[0].nominalRatePerSecond}]),/SPEED/);
 s.dynamicConfig.reliabilityEnabled=false;s.whatIf={externalOptions:[{tier:'HIGH',changes:[c]}]};assert(planScenarios(s).candidates.some(p=>p.kind==='CAPACITY_REPLACEMENT'&&p.canApply));
});
test('replacement evidence survives DOE and server normalization',()=>{
 const s=fixture(),c=replacement(s),design=createScenarioDOE([{...c,low:c.before,high:c.after}]);assert.equal(design.designPoints[1].changes[0].replacementMaximumBpm,220);assert.equal(applyScenarioChanges(s,design.designPoints[1].changes).equipment[4].processData.equipment.maximumSpeedBpm,220);
 const ctx=vm.createContext({createSimulatorError_:(code,message)=>Object.assign(Error(message),{code})});for(const f of ['ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+f,'utf8'),ctx);const out=ctx.normalizeScenarioProposal_({title:'Replace filler',tier:'HIGH',basis:'STATIC',changes:[c]},s);assert.equal(out.changes[0].replacementMaximumBpm,220);assert.equal(out.changes[0].interventionType,'REPLACEMENT');assert.throws(()=>ctx.normalizeScenarioProposal_({title:'Wrong tier',tier:'MEDIUM',basis:'STATIC',changes:[c]},s));
});
test('Results presents pp accounting and explicitly distinguishes observed time',()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window;w.SimulatorEngine={diagnoseLineEfficiency};w.eval(fs.readFileSync('apps-script/Results.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);try{w.STResults.renderEfficiency(w.document.querySelector('main'),fixture().equipment,{durationSeconds:480,summary:{lineOeePercent:92.4},equipmentMetrics:{}});assert.match(w.document.body.textContent,/6.74/);assert.match(w.document.body.textContent,/0.86/);assert.match(w.document.body.textContent,/not additive OEE losses/);}finally{w.close();}
});

test('capacity editor accepts a documented replacement while failures are disabled and exposes it in High only',()=>{
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window,s=fixture(),cards=[];s.dynamicConfig.reliabilityEnabled=false;
 w.STScenarios={plan:planScenarios,apply:applyScenarioChanges,signature:()=> 'test',fields:{},definitions:{ZERO:{},MEDIUM:{},HIGH:{}},interventions:{REPLACEMENT:{tier:'HIGH',costClass:'CAPEX',label:'Replacement'}},categoryAllows:scenarioCategoryAllows};
 w.STWhatIf={card(project){cards.push(project);return w.document.createElement('article');}};w.STScenarioText={};
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);
 try{w.STScenarioExplorer.tools(w.document.querySelector('main'),s,planScenarios(s),()=>{});const panel=w.document.querySelector('.scenario-interventions'),selects=panel.querySelectorAll('select');selects[0].value=s.equipment[4].id;selects[1].value='nominalRatePerSecond';selects[1].onchange();assert(selects[2].disabled);panel.querySelector('[aria-label="Replacement operating speed (units/min)"]').value=200;panel.querySelector('[aria-label="Replacement maximum speed (units/min)"]').value=220;panel.querySelector('[aria-label="Intervention and target justification"]').value='Supplier trial target';panel.querySelector('.scenario-add-intervention').onclick();assert.equal(s.whatIf.externalOptions[0].tier,'HIGH');assert.equal(s.whatIf.externalOptions[0].changes[0].after,200/60);assert(cards.at(-2).categoryChanges.HIGH.some(c=>c.replacementMaximumBpm===220));}finally{w.close();}
});

test('proposal generator identifies missing capacity/reliability targets instead of inventing interventions',()=>{
 const s=fixture();s.dynamicConfig.reliabilityEnabled=false;const off=planScenarios(s);assert.equal(off.proposalNeeds.filter(n=>n.kind==='CAPACITY_TARGET_REQUIRED').length,5);assert(!off.proposalNeeds.some(n=>n.kind==='RELIABILITY_TARGET_REQUIRED'));assert(!off.candidates.some(c=>c.kind==='CAPACITY_REPLACEMENT'));
 s.dynamicConfig.reliabilityEnabled=true;const on=planScenarios(s);const first=on.proposalNeeds[0];assert.equal(first.name,'De-Pucker');assert(Math.abs(first.availabilityPercent-100*5/7)<1e-9);
 s.whatIf={externalOptions:[{tier:'HIGH',changes:[replacement(s)]}]};assert(!planScenarios(s).proposalNeeds.some(n=>n.equipmentId===s.equipment[4].id&&n.kind==='CAPACITY_TARGET_REQUIRED'));
 s.whatIf.externalOptions[0].changes[0].justification='';assert(planScenarios(s).proposalNeeds.some(n=>n.equipmentId===s.equipment[4].id&&n.kind==='CAPACITY_TARGET_REQUIRED'));
});

test('Results uses the matched validation block to separate conditional reliability loss from capacity and residual',()=>{
 const s=fixture(),dom=new JSDOM('<main></main>',{runScripts:'outside-only'}),w=dom.window;
 w.SimulatorEngine={diagnoseLineEfficiency};w.STScenarios={signature:()=> 'current'};s.whatIf={evaluations:[{sourceSignature:'current',reliabilityCounterfactual:{run:{durationSeconds:28800,rounds:3,seed:31},baseline:{oee:39.2},failureFree:{oee:92.4},deltaOeePp:53.2}}]};
 w.eval(fs.readFileSync('apps-script/Results.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);try{w.STResults.renderEfficiency(w.document.querySelector('main'),s.equipment,{durationSeconds:28800,summary:{lineOeePercent:39.2}},s);assert.match(w.document.body.textContent,/Matched reliability counterfactual balance/);assert.match(w.document.body.textContent,/53.2/);assert.match(w.document.body.textContent,/seed 31/);assert.match(w.document.body.textContent,/totals 100 pp/);}finally{w.close();}
});
