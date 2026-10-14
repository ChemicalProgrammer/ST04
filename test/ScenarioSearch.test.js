import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES,scenarioPairedEvidence} from '../src/analysis/ScenarioSearch.js';
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
 w.STScenarioSearch={profiles:SCENARIO_SEARCH_PROFILES,profile:scenarioSearchProfile,run:scenarioSearchRun,needsMore:scenarioConfirmationNeedsMore,pairedEvidence:scenarioPairedEvidence};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 w.STWhatIf={changeInfo(c){return {equipment:'Unit',parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={fields:{speed:[1,100,'u/s'],sensor:[1,100,'m']},signature(){return 'same';},plan(){return {candidates:[]};},apply(source,changes){const copy=JSON.parse(JSON.stringify(source));for(const c of changes)copy.equipment[0][c.path]=c.after;return copy;}};
 w.SimulatorEngine={validateSimulationInput(){return {ok:true};},inputSignature(input){return JSON.stringify(input);},async simulateBatch(input){calls.push(JSON.parse(JSON.stringify(input)));const gain=(input.case.equipment[0].speed-10)+(input.case.equipment[0].sensor-10);const rows=Array.from({length:input.run.rounds},(_,j)=>{const noise=uncertain&&input.run.seed>1000000&&gain>0?[0,-20,20,0,0,0][j]:0;return {seed:input.run.seed+j,summary:{lineOeePercent:50+gain/10,outputCount:(100+gain+noise)*input.run.durationSeconds/60}};});return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary:rows[0].summary,batch:{rows,statistics:{lineOeePercent:{mean:50+gain/10},throughputPerMinute:{mean:rows.reduce((sum,row)=>sum+row.summary.outputCount/input.run.durationSeconds*60,0)/rows.length}}}}};}};
 const sim={id:'sim',equipment:[{id:'e',speed:10,sensor:10}],dynamicConfig:{durationSeconds:99,rounds:40,seed:1},whatIf:{searchDepth:depth}},record={metadata:{includeDOE:doe},simulations:[sim]};
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates=1;
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:'HIGH',explore:true,changes:['speed','sensor'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))},()=>{},sim);
 if(doe){for(const checkbox of host.querySelectorAll('.scenario-doe-select')){checkbox.checked=true;checkbox.onchange();}}
 return {dom,w,sim,host,calls,project:{kind:'CUSTOM',tier:'HIGH',explore:true,changes:['speed','sensor'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))}};
}
async function search(h){h.host.querySelector('.scenario-search').click();for(let i=0;i<200;i++){if(h.sim.whatIf.evaluations?.[0]&&!['RUNNING','VALIDATING'].includes(h.sim.whatIf.evaluations[0].status))return h.sim.whatIf.evaluations[0];await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Search did not finish');}
test('reserved DOE completes after exploration exhausts its budget; confirmation uses common horizons',async()=>{
 const h=harness(true);try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.doe.analysis.complete);assert.equal(result.doe.observations.length,4);assert.equal(result.independentCheck.durationSeconds,1800);assert.equal(result.independentCheck.rounds,3);assert(h.calls.some(call=>call.run.durationSeconds===600));assert(h.calls.some(call=>call.run.durationSeconds===1800));assert.equal(h.sim.dynamicConfig.durationSeconds,99);assert.equal(h.sim.dynamicConfig.rounds,40);assert.equal(h.host.querySelector('.scenario-create').disabled,false);}finally{h.dom.window.close();}
});
test('without DOE the winner is independently confirmed and no factorial stage is created',async()=>{
 const h=harness(false,'LIGHT');try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert.equal(result.doe,undefined);assert.equal(result.independentCheck.durationSeconds,1800);assert(h.calls.every(call=>call.run.rounds===3));}finally{h.dom.window.close();}
});
test('High retains blocked ANOVA internally and expands uncertain confirmation to six rounds',async()=>{
 const h=harness(true,'HIGH',true);try{const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.doe.anova.complete);assert.equal(result.independentCheck.rounds,6);assert.equal(h.host.querySelector('.scenario-doe-results'),null);assert(!h.host.textContent.includes('ANOVA with seed blocks'));}finally{h.dom.window.close();}
});

test('Light ignores enabled DOE and invalid retained factor levels',async()=>{
 const h=harness(true,'LIGHT');try{for(const input of h.host.querySelectorAll('.scenario-doe-level'))input.value='';const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert.equal(result.doe,undefined);assert.equal(result.method,'BOUNDED_COORDINATE_SEARCH');}finally{h.dom.window.close();}
});
test('depth changes and card reopening preserve confirmed metrics, not provisional winner',async()=>{
 const h=harness(false);try{const result=await search(h);result.candidate.oee=72;result.independentCheck.candidate.oee=65;h.sim.whatIf.evaluations=[result];h.host.remove();const reopened=h.w.document.createElement('article');reopened.className='analysis-recommendation';h.w.document.body.append(reopened);h.w.STScenarioExplorer.attach(reopened,h.project,()=>{},h.sim);
 assert.match(reopened.querySelector('.scenario-basic-metric strong').textContent,/65/);
 const depth=reopened.querySelector('.scenario-search-depth');depth.value='HIGH';depth.onchange();assert.equal(h.sim.whatIf.evaluations[0].lastResult.independentCheck.candidate.oee,65);assert.equal(reopened.querySelector('.scenario-create').disabled,true);reopened.remove();
 const again=h.w.document.createElement('article');again.className='analysis-recommendation';h.w.document.body.append(again);h.w.STScenarioExplorer.attach(again,h.project,()=>{},h.sim);assert.match(again.querySelector('.scenario-basic-metric strong').textContent,/65/);assert.equal(again.querySelector('.scenario-search-depth').value,'HIGH');assert.equal(again.querySelector('.scenario-create').disabled,true);
 }finally{h.dom.window.close();}
});
test('final confirmation preserves a long configured horizon across search depths',()=>{
 for(const depth of ['LIGHT','MEDIUM','HIGH'])assert.equal(scenarioSearchRun({durationSeconds:28800,rounds:20},depth,'validation').durationSeconds,28800);
});
test('successful search preserves selected variables for the next search',async()=>{
 const h=harness(false);try{await search(h);assert([...h.host.querySelectorAll('.scenario-change > td:first-child input')].every(input=>input.checked));}finally{h.dom.window.close();}
});

test('stagnation does not stop before the first coordinate sweep reaches a useful later factor',async()=>{
 const h=harness(false);try{delete h.w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates;h.w.ST_SCENARIO_SEARCH_LIMITS.maxWithoutImprovement=1;const original=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async input=>{const copy=JSON.parse(JSON.stringify(input)),unit=copy.case.equipment[0];unit.sensor=unit.speed>10?10:unit.sensor;unit.speed=10;return original(copy);};const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.evaluatedChanges.some(c=>c.path==='sensor'));}finally{h.dom.window.close();}
});

test('one search/stop action replaces calculate and results explain selected and evaluated targets',async()=>{
 const h=harness(false);try{assert.equal(h.host.querySelectorAll('.scenario-search').length,1);assert.equal(h.host.querySelector('.scenario-evaluate'),null);assert.equal(h.host.querySelector('.scenario-doe-help'),null);
 h.host.querySelector('.scenario-results').click();let body=h.host.querySelector('.scenario-results-dialog .dialog-body');assert.match(body.textContent,/no evaluated scenario/);assert.equal(body.querySelectorAll('.scenario-results-changes tbody tr').length,2);
 const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED');h.host.querySelector('.scenario-results').click();body=h.host.querySelector('.scenario-results-dialog .dialog-body');assert.match(body.textContent,/Independently evaluated/);assert.equal(body.querySelectorAll('.scenario-results-metrics tbody tr').length,2);assert.equal(body.querySelectorAll('.scenario-results-changes tbody tr').length,result.evaluatedChanges.length);assert.equal(h.host.querySelector('.scenario-search').title,'Find best scenario');
 }finally{h.dom.window.close();}
});
test('the search action becomes stop and can cancel without launching another search',async()=>{
 const h=harness(false);try{const original=h.w.SimulatorEngine.simulateBatch;let release;h.w.SimulatorEngine.simulateBatch=async input=>{await new Promise(resolve=>release=resolve);return original(input);};const button=h.host.querySelector('.scenario-search');button.click();assert.match(button.title,/Finish search/);button.click();assert.match(button.title,/Cancel/);button.click();release();for(let i=0;i<20&&h.host.hasAttribute('aria-busy');i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,1);assert.equal(h.sim.whatIf.evaluations[0].status,'CANCELLED');assert.equal(h.host.querySelector('.scenario-create').disabled,true);assert.equal(button.title,'Find best scenario');}finally{h.dom.window.close();}
});

async function suggest(h){const b=h.host.querySelector('.scenario-doe-suggest');b.click();for(let i=0;i<250;i++){if(b.textContent==='Suggest factor combination'&&h.calls.length)return;await new Promise(r=>setTimeout(r,5));}throw Error('Screening did not finish');}
test('DOE suggestion screens paired targets, ranks measured gain and records screening in search evidence',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.querySelectorAll('.scenario-doe-select').forEach(c=>c.checked=false);
  await suggest(h);assert(h.calls.every(c=>c.run.durationSeconds===3600&&c.run.rounds===6&&c.run.seed===1));
  assert.equal(h.calls.length,4);assert.equal([...h.host.querySelectorAll('.scenario-doe-select')].filter(c=>c.checked).length,2);
  const result=await search(h);assert.equal(result.sensitivityScreening.observations.length,2);assert(result.sensitivityScreening.observations.every(o=>o.deltaThroughput>0));
 }finally{h.dom.window.close();}
});
test('DOE screening discovers variables that only improve jointly',async()=>{
 const h=harness(true,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;
  h.w.SimulatorEngine.simulateBatch=input=>{const copy=JSON.parse(JSON.stringify(input));if(copy.case.equipment[0].speed===10||copy.case.equipment[0].sensor===10){copy.case.equipment[0].speed=10;copy.case.equipment[0].sensor=10;}return original(copy);};
  await suggest(h);assert.match(h.host.querySelector('.scenario-factor-count').textContent,/suggested/);assert.match(h.host.querySelector('.scenario-suggestion-report').textContent,/Suggested through a stable pair/);
  assert([...h.host.querySelectorAll('.scenario-doe-select')].every(c=>c.checked),'manual selection preserved for coupled changes');
 }finally{h.dom.window.close();}
});
test('cancelled screening retains factors and restores controls',async()=>{
 const h=harness(true,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;let release;
  h.w.SimulatorEngine.simulateBatch=async input=>{await new Promise(r=>release=r);return original(input);};
  const button=h.host.querySelector('.scenario-doe-suggest');button.click();assert.equal(button.textContent,'Cancel screening');button.click();release();
  for(let i=0;i<100&&button.textContent!=='Suggest factor combination';i++)await new Promise(r=>setTimeout(r,5));
  assert([...h.host.querySelectorAll('.scenario-doe-select')].every(c=>c.checked));assert.equal(h.host.querySelector('.scenario-search').disabled,false);
 }finally{h.dom.window.close();}
});
test('new sensitivity suggestions invalidate a previously confirmed scenario',async()=>{
 const h=harness(true,'HIGH');try{await search(h);assert.equal(h.host.querySelector('.scenario-create').disabled,false);await suggest(h);assert.equal(h.host.querySelector('.scenario-create').disabled,true);assert.equal(h.sim.whatIf.evaluations[0].status,'NOT_EVALUATED');}finally{h.dom.window.close();}
});

test('fixed candidate budget and DOE produce the same winner despite different wall clocks',async()=>{
 const a=harness(true,'HIGH'),b=harness(true,'HIGH');try{
  Object.assign(a.w.ST_SCENARIO_SEARCH_LIMITS,{maxSearchMs:0,parallelCandidates:1});Object.assign(b.w.ST_SCENARIO_SEARCH_LIMITS,{maxSearchMs:0,parallelCandidates:2});
  const now=Date.now.bind(Date);b.w.Date.now=()=>now()*10000;
  const x=await search(a),y=await search(b);
  assert.equal(x.reproducibility.policy,'CANDIDATE_BUDGET');assert.equal(y.reproducibility.warmStart,false);
  assert.equal(x.doe.observations.length,4);assert.equal(y.doe.observations.length,4);
  assert.deepEqual(JSON.parse(JSON.stringify(x.evaluatedChanges)),JSON.parse(JSON.stringify(y.evaluatedChanges)));
  assert.deepEqual(JSON.parse(JSON.stringify(x.independentCheck)),JSON.parse(JSON.stringify(y.independentCheck)));
 }finally{a.dom.window.close();b.dom.window.close();}
});
function categoryHarness(tier){
 const h=harness(false,'HIGH');h.sim.equipment[0].extra=10;h.w.STScenarios.fields.extra=[1,100,'s'];
 const c=(path,after)=>({equipmentId:'e',path,before:10,after,unit:'u/s'});
 h.project={kind:'CUSTOM',tier,searchScope:tier,explore:true,changes:[],categoryChanges:{ZERO:[c('sensor',20)],MEDIUM:[c('extra',30)],HIGH:[c('speed',20)]}};
 h.host.remove();h.host=h.w.document.createElement('article');h.host.className='analysis-recommendation';h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,h.project,()=>{},h.sim);return h;
}
test('High includes Zero and Medium independently, persists scope and excludes deselected fields from search',async()=>{
 const h=categoryHarness('HIGH');try{
  const boxes=h.host.querySelectorAll('.scenario-include-category');assert.equal(boxes.length,2);assert([...boxes].every(b=>!b.checked));
  boxes.forEach(b=>{b.checked=true;b.onchange();});const result=await search(h);
  assert.deepEqual(JSON.parse(JSON.stringify(result.categoryInclusions)),{ZERO:true,MEDIUM:true});assert.deepEqual(JSON.parse(JSON.stringify(result.requestedChanges.map(c=>c.path).sort())),['extra','sensor','speed']);
  h.host.remove();h.host=h.w.document.createElement('article');h.host.className='analysis-recommendation';h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,h.project,()=>{},h.sim);
  assert([...h.host.querySelectorAll('.scenario-include-category')].every(b=>b.checked));
  const zero=h.host.querySelector('.scenario-include-category[data-tier="ZERO"]');zero.checked=false;zero.onchange();assert(h.host.querySelector('.scenario-create').disabled);
  const again=await search(h);assert(again.requestedChanges.every(c=>c.path!=='sensor'));assert.equal(again.categoryInclusions.MEDIUM,true);
 }finally{h.dom.window.close();}
});
test('Medium offers only the Zero inclusion and current-tier targets win duplicate fields',()=>{
 const h=categoryHarness('MEDIUM');try{
  assert.equal(h.host.querySelectorAll('.scenario-include-category').length,1);assert.equal(h.host.querySelector('.scenario-include-category').dataset.tier,'ZERO');
  const zero=h.host.querySelector('.scenario-include-category');zero.checked=true;zero.onchange();assert.equal([...h.host.querySelectorAll('.scenario-change')].filter(r=>!r.hidden).length,2);
 }finally{h.dom.window.close();}
});
test('duplicate category parameters retain the current target and excluded scope removes DOE factors',()=>{
 const h=categoryHarness('HIGH');try{
  h.project.categoryChanges.ZERO=[{equipmentId:'e',path:'speed',before:10,after:12,unit:'u/s'},{equipmentId:'e',path:'sensor',before:10,after:20,unit:'u/s'}];
  h.host.remove();h.host=h.w.document.createElement('article');h.host.className='analysis-recommendation';h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,h.project,()=>{},h.sim);
  const zero=h.host.querySelector('.scenario-include-category[data-tier="ZERO"]');zero.checked=true;zero.onchange();
  const speedRows=[...h.host.querySelectorAll('.scenario-change')].filter(r=>r.textContent.includes('speed'));assert.equal(speedRows.length,1);assert.match(speedRows[0].textContent,/20/);
  h.w.STScenarioExplorer.setDOE(true);
  const sensorRow=[...h.host.querySelectorAll('.scenario-change')].find(r=>r.textContent.includes('sensor')),factor=sensorRow.querySelector('.scenario-doe-select');factor.checked=true;factor.onchange();assert(factor.checked);
  zero.checked=false;zero.onchange();assert.equal(factor.checked,false);assert(sensorRow.hidden);
 }finally{h.dom.window.close();}
});

test('paired screening rejects unstable gains and accepts consistent blocks',()=>{
 const base={throughput:100,oee:50,roundMetrics:Array.from({length:6},(_,seed)=>({seed,throughput:100}))};
 const next=d=>({oee:51,roundMetrics:d.map((delta,seed)=>({seed,throughput:100+delta}))});
 assert.equal(scenarioPairedEvidence(base,next([2,2,2,2,2,2])).stable,true);assert.equal(scenarioPairedEvidence(base,next([20,20,20,-10,-10,-10])).stable,false);
 const bad=next([2,2,2,2,2,2]);bad.roundMetrics[0].seed=99;assert.equal(scenarioPairedEvidence(base,bad).stable,false);
});
test('computer comparison controls are removed from scenario configuration',()=>{const h=harness(true,'HIGH');try{assert.equal(h.host.querySelector('.scenario-experiment-compare'),null);assert(!h.host.textContent.includes('Compare experiment between computers'));}finally{h.dom.window.close();}});

test('overflow appearing only in independent confirmation requires review instead of an approved improvement',async()=>{
 const h=harness(false,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async input=>{const response=await original(input),changed=input.case.equipment[0].speed>10||input.case.equipment[0].sensor>10;response.result.batch.statistics.totalOverflowUnits={mean:changed&&input.run.seed>1000000?120:0};return response;};
  const result=await search(h);assert.equal(result.status,'ENGINEERING_REVIEW_REQUIRED');assert(result.warnings.some(w=>w.rule==='SIMULATED_OVERFLOW'&&w.after===120));assert.match(h.host.querySelector('.scenario-create').title,/review/);
 }finally{h.dom.window.close();}
});
