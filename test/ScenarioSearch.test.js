import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES} from '../src/analysis/ScenarioSearch.js';
import {createScenarioDOE,analyzeScenarioDOE,analyzeScenarioANOVA,scenarioFSurvival} from '../src/analysis/ScenarioDOE.js';

test('What-If horizons are independent of playback and preserve commands and seed',()=>{
 const original={durationMode:'SHIFTS',durationSeconds:9999,rounds:40,shiftSeconds:3600,seed:55,commands:[{atVirtualSecond:60}]};
 for(const level of ['LIGHT','MEDIUM','HIGH']){const run=scenarioSearchRun(original,level);assert.equal(run.rounds,3);assert.equal(run.durationSeconds,scenarioSearchProfile(level).explorationSeconds);assert.equal(run.seed,55);assert.equal(run.durationMode,'FIXED');assert.equal(run.shiftSeconds,undefined);assert.deepEqual(run.commands,original.commands);}
 assert.equal(original.durationMode,'SHIFTS');assert.equal(original.rounds,40);assert.equal(scenarioSearchRun(original,'HIGH',true,6).durationSeconds,1800);
});
test('uncertain paired confirmation requests more rounds, consistent gains do not',()=>{
 const base={throughput:100,roundMetrics:[0,1,2].map(()=>({throughput:100}))};
 assert(scenarioConfirmationNeedsMore(base,{roundMetrics:[{throughput:101},{throughput:90},{throughput:120}]}));
 assert.equal(scenarioConfirmationNeedsMore(base,{roundMetrics:[{throughput:110},{throughput:110},{throughput:110}]}),false);
});
test('blocked ANOVA separates seed variation and recovers a known factorial effect',()=>{
 const design=createScenarioDOE([0,1].map(i=>({equipmentId:'e',path:'p'+i,before:1,low:1,high:2})));
 const observations=design.designPoints.map(point=>{const roundMetrics=[0,1,2].map((j)=>({seed:100+j,throughput:100+3*point.levels[0]+2*point.levels[0]*point.levels[1]+[0,10,-10][j]+point.levels[1]*[-1,0,1][j],oee:50+point.levels[0]+point.levels[1]*[-1,0,1][j]}));return {index:point.index,roundMetrics,throughput:roundMetrics.reduce((s,v)=>s+v.throughput,0)/3,oee:roundMetrics.reduce((s,v)=>s+v.oee,0)/3};});
 const result=analyzeScenarioANOVA(design,observations);assert(result.complete);assert.equal(result.metrics.throughput.residualDf,6);assert.equal(result.metrics.throughput.residualSS,8);assert.equal(result.metrics.throughput.seedBlockSS,800);assert.equal(result.metrics.throughput.effects[0].effect,6);assert.equal(result.metrics.throughput.effects[0].sumSquares,108);assert(result.metrics.throughput.effects[0].pValue<.001);
 observations[0].roundMetrics[0].seed=999;assert.equal(analyzeScenarioANOVA(design,observations).complete,false);
 assert.equal(analyzeScenarioANOVA(design,observations.slice(1)).complete,false);
});
test('F upper-tail probabilities match tabulated values',()=>{
 assert(Math.abs(scenarioFSurvival(4.9646027437307145,1,10)-.05)<1e-10);
 assert(Math.abs(scenarioFSurvival(1,1,1)-.5)<1e-10);
 assert.equal(scenarioFSurvival(0,1,10),1);
});

function harness(doe,depth='MEDIUM',uncertain=false){
 const dom=new JSDOM('<article class="analysis-recommendation"></article>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.close=function(){};w.HTMLDialogElement.prototype.showModal=function(){};
 w.STPreferences={read(){return '';},write(){return true;}};w.STIcons={svg(){return '<svg></svg>';}};w.STErrors={register(){},capture(){}};w.STScenarioText={HIGH:'High'};
 w.STScenarioSearch={profiles:SCENARIO_SEARCH_PROFILES,profile:scenarioSearchProfile,run:scenarioSearchRun,needsMore:scenarioConfirmationNeedsMore};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 w.STWhatIf={changeInfo(c){return {equipment:'Unit',parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={fields:{speed:[1,100,'u/s'],sensor:[1,100,'m']},signature(){return 'same';},plan(){return {candidates:[]};},apply(source,changes){const copy=JSON.parse(JSON.stringify(source));for(const c of changes)copy.equipment[0][c.path]=c.after;return copy;}};
 w.SimulatorEngine={validateSimulationInput(){return {ok:true};},inputSignature(input){return JSON.stringify(input);},async simulateBatch(input){calls.push(JSON.parse(JSON.stringify(input)));const gain=(input.case.equipment[0].speed-10)+(input.case.equipment[0].sensor-10);const rows=Array.from({length:input.run.rounds},(_,j)=>{const noise=uncertain&&input.run.seed>1000000&&gain>0?[0,-20,20,0,0,0][j]:0;return {seed:input.run.seed+j,summary:{lineOeePercent:50+gain/10,outputCount:(100+gain+noise)*input.run.durationSeconds/60}};});return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary:rows[0].summary,batch:{rows,statistics:{lineOeePercent:{mean:50+gain/10},throughputPerMinute:{mean:rows.reduce((sum,row)=>sum+row.summary.outputCount/input.run.durationSeconds*60,0)/rows.length}}}}};}};
 const sim={id:'sim',equipment:[{id:'e',speed:10,sensor:10}],dynamicConfig:{durationSeconds:99,rounds:40,seed:1},whatIf:{searchDepth:depth}},record={metadata:{includeDOE:doe},simulations:[sim]};
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates=1;
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:'HIGH',explore:true,changes:['speed','sensor'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))},()=>{},sim);
 if(doe){for(const checkbox of host.querySelectorAll('.scenario-doe-select')){checkbox.checked=true;checkbox.onchange();}}
 return {dom,w,sim,host,calls};
}
async function search(h){h.host.querySelector('.scenario-search').click();for(let i=0;i<200;i++){if(h.sim.whatIf.evaluations?.[0]&&!['RUNNING','VALIDATING'].includes(h.sim.whatIf.evaluations[0].status))return h.sim.whatIf.evaluations[0];await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Search did not finish');}
test('reserved DOE completes after exploration exhausts its budget; confirmation uses common horizons',async()=>{
 const h=harness(true);try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.doe.analysis.complete);assert.equal(result.doe.observations.length,4);assert.equal(result.independentCheck.durationSeconds,1200);assert.equal(result.independentCheck.rounds,3);assert(h.calls.some(call=>call.run.durationSeconds===600));assert(h.calls.some(call=>call.run.durationSeconds===1200));assert.equal(h.sim.dynamicConfig.durationSeconds,99);assert.equal(h.sim.dynamicConfig.rounds,40);assert.equal(h.host.querySelector('.scenario-create').disabled,false);}finally{h.dom.window.close();}
});
test('without DOE the winner is independently confirmed and no factorial stage is created',async()=>{
 const h=harness(false,'LIGHT');try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert.equal(result.doe,undefined);assert.equal(result.independentCheck.durationSeconds,600);assert(h.calls.every(call=>call.run.rounds===3));}finally{h.dom.window.close();}
});
test('High renders blocked ANOVA and expands uncertain confirmation to six rounds',async()=>{
 const h=harness(true,'HIGH',true);try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.doe.anova.complete);assert.equal(result.independentCheck.rounds,6);assert(h.host.textContent.includes('ANOVA with seed blocks'));}finally{h.dom.window.close();}
});
