import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {scenarioSearchRun,scenarioSearchProfile,scenarioConfirmationNeedsMore,SCENARIO_SEARCH_PROFILES,scenarioPairedEvidence} from '../src/analysis/ScenarioSearch.js';
import {screenFlowFactors} from '../src/analysis/FlowFactorScreening.js';
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

function harness(doe,depth='MEDIUM',uncertain=false,tier='HIGH',durationSeconds=99){
 const dom=new JSDOM('<article class="analysis-recommendation"></article>',{runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.close=function(){};w.HTMLDialogElement.prototype.showModal=function(){};
 w.STPreferences={read(){return '';},write(){return true;}};w.STIcons={svg(){return '<svg></svg>';}};w.STErrors={register(){},capture(){}};w.STScenarioText={HIGH:'High'};
 w.STScenarioSearch={screenFlow:screenFlowFactors,profiles:SCENARIO_SEARCH_PROFILES,profile:scenarioSearchProfile,run:scenarioSearchRun,needsMore:scenarioConfirmationNeedsMore,pairedEvidence:scenarioPairedEvidence};w.STScenarioDOE={design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
 w.STWhatIf={changeInfo(c){return {equipment:'Unit',parameter:c.path,before:c.before,after:c.after};}};
 w.STScenarios={fields:{speed:[1,100,'u/s'],sensor:[1,100,'m']},signature(){return 'same';},plan(){return {candidates:[]};},apply(source,changes){const copy=JSON.parse(JSON.stringify(source));for(const c of changes)copy.equipment[0][c.path]=c.after;return copy;}};
 w.SimulatorEngine={validateSimulationInput(){return {ok:true};},inputSignature(input){return JSON.stringify(input);},async simulateBatch(input){calls.push(JSON.parse(JSON.stringify(input)));const gain=(input.case.equipment[0].speed-10)+(input.case.equipment[0].sensor-10);const rows=Array.from({length:input.run.rounds},(_,j)=>{const noise=uncertain&&input.run.seed>1000000&&gain>0?[0,-20,20,0,0,0][j]:0;return {seed:input.run.seed+j,summary:{lineOeePercent:50+gain/10,outputCount:(100+gain+noise)*input.run.durationSeconds/60}};});return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary:rows[0].summary,batch:{rows,statistics:{lineOeePercent:{mean:50+gain/10},throughputPerMinute:{mean:rows.reduce((sum,row)=>sum+row.summary.outputCount/input.run.durationSeconds*60,0)/rows.length}}}}};}};
 const sim={id:'sim',equipment:[{id:'e',speed:10,sensor:10}],dynamicConfig:{durationSeconds:durationSeconds,rounds:40,seed:1},whatIf:{searchDepth:depth}},record={metadata:{includeDOE:doe},simulations:[sim]};
 w.eval(fs.readFileSync('apps-script/ScenarioExplorer.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);w.STScenarioExplorer.connectCase(()=>record,()=>{});w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates=1;
 const host=w.document.querySelector('article');w.STScenarioExplorer.attach(host,{kind:'CUSTOM',tier:tier,explore:true,changes:['speed','sensor'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))},()=>{},sim);
 if(doe){for(const checkbox of host.querySelectorAll('.scenario-doe-select')){checkbox.checked=true;checkbox.onchange();}}
 return {dom,w,sim,host,calls,project:{kind:'CUSTOM',tier:tier,explore:true,changes:['speed','sensor'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))}};
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
 h.host.querySelector('.scenario-results').click();let body=h.host.querySelector('.scenario-results-dialog .dialog-body');assert.match(body.textContent,/Proposed inputs/);assert.equal(body.querySelectorAll('.scenario-results-changes tbody tr').length,2);
 const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED');h.host.querySelector('.scenario-results').click();body=h.host.querySelector('.scenario-results-dialog .dialog-body');assert.equal(body.querySelectorAll('.scenario-results-metrics').length,0);assert.equal(body.querySelectorAll('.scenario-results-changes th').length,4);assert.equal(body.querySelectorAll('.scenario-results-changes tbody tr').length,result.evaluatedChanges.length);assert.equal(h.host.querySelector('.scenario-search').title,'Find best scenario');
 }finally{h.dom.window.close();}
});
test('the search action becomes stop and can cancel without launching another search',async()=>{
 const h=harness(false);try{const original=h.w.SimulatorEngine.simulateBatch;let release;h.w.SimulatorEngine.simulateBatch=async input=>{await new Promise(resolve=>release=resolve);return original(input);};const button=h.host.querySelector('.scenario-search');button.click();assert.match(button.title,/Finish search/);button.click();assert.match(button.title,/Cancel/);button.click();release();for(let i=0;i<20&&h.host.hasAttribute('aria-busy');i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(h.calls.length,1);assert.equal(h.sim.whatIf.evaluations[0].status,'CANCELLED');assert.equal(h.host.querySelector('.scenario-create').disabled,true);assert.equal(button.title,'Find best scenario');}finally{h.dom.window.close();}
});

async function suggest(h){const b=h.host.querySelector('.scenario-doe-suggest');b.click();for(let i=0;i<250;i++){if(b.textContent==='Suggest factor combination'&&h.calls.length)return;await new Promise(r=>setTimeout(r,5));}throw Error('Screening did not finish');}
test('DOE suggestion screens paired targets, ranks measured gain and records screening in search evidence',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.querySelectorAll('.scenario-doe-select').forEach(c=>c.checked=false);
  await suggest(h);assert(h.calls.every(c=>c.run.durationSeconds===900&&c.run.rounds===3&&c.run.seed===1));
  assert.equal(h.calls.length,4);assert.equal([...h.host.querySelectorAll('.scenario-doe-select')].filter(c=>c.checked).length,2);
  const result=await search(h);assert.equal(result.sensitivityScreening.observations.length,2);assert(result.sensitivityScreening.observations.every(o=>o.deltaThroughput>0));
 }finally{h.dom.window.close();}
});
test('DOE screening discovers variables that only improve jointly',async()=>{
 const h=harness(true,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;
  h.w.SimulatorEngine.simulateBatch=input=>{const copy=JSON.parse(JSON.stringify(input));if(copy.case.equipment[0].speed===10||copy.case.equipment[0].sensor===10){copy.case.equipment[0].speed=10;copy.case.equipment[0].sensor=10;}return original(copy);};
  await suggest(h);assert.match(h.host.querySelector('.scenario-factor-count').textContent,/suggested/);assert(h.sim.whatIf.evaluations[0].sensitivityScreening.observations.every(o=>o.selectionReason==='Suggested through a stable pair'));assert.equal(h.host.querySelector('.scenario-suggestion-report table'),null);
  assert([...h.host.querySelectorAll('.scenario-doe-select')].every(c=>c.checked),'manual selection preserved for coupled changes');
 }finally{h.dom.window.close();}
});
test('cancelled screening retains factors and restores controls',async()=>{
 const h=harness(true,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;let release;
  h.w.SimulatorEngine.simulateBatch=async (input,options)=>{options.progress(.42);await new Promise(r=>release=r);return original(input);};
  const button=h.host.querySelector('.scenario-doe-suggest');button.click();assert.equal(button.textContent,'Cancel screening');for(let i=0;i<20&&!release;i++)await new Promise(r=>setTimeout(r,1));assert.equal(h.host.querySelector('.scenario-screening-activity').hidden,false);assert.equal(h.host.querySelector('.scenario-screening-activity').getAttribute('aria-valuenow'),'0');assert.equal(h.host.querySelector('.scenario-suggestion-percent').textContent,'0%');assert(h.host.querySelector('.dialog-heading > .request-progress')); button.click();release?.();
  for(let i=0;i<100&&button.textContent!=='Suggest factor combination';i++)await new Promise(r=>setTimeout(r,5));
  assert([...h.host.querySelectorAll('.scenario-doe-select')].every(c=>c.checked));assert.equal(h.host.querySelector('.scenario-search').disabled,false);assert.equal(h.host.querySelector('.scenario-screening-activity').hidden,true);
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

test('High runs automatic reliability discovery before flow search and retains exploratory labeling and matched comparison',async()=>{
 const h=harness(false,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async input=>{const response=await original(input),gain=(10-(input.case.equipment[0]['noiseProfile.reliability.mttrMinutes']??10))*3;for(const row of response.result.batch.rows){row.summary.lineOeePercent+=gain/10;row.summary.outputCount+=gain*input.run.durationSeconds/60;}response.result.batch.statistics.lineOeePercent.mean+=gain/10;response.result.batch.statistics.throughputPerMinute.mean+=gain;return response;};
  let discoveryCalls=0;h.w.STScenarioSearch.reliabilityTargets=async(source,options)=>{discoveryCalls++;const baseline=await options.measure(source,[],options.run),c={equipmentId:'e',path:'noiseProfile.reliability.mttrMinutes',before:10,after:5,unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Model target'};return {calculations:1,coverage:{screened:1},selectedChanges:[c],candidateSets:[{changes:[c]}],baseline,status:'EXPLORATORY_TARGETS_FOUND'};};
  const result=await search(h);assert.equal(discoveryCalls,1);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.analysisOnly);assert(result.evaluatedChanges.some(c=>c.analysisOnly));assert(result.reliabilityTargetSearch);assert.match(h.host.textContent,/Base:/);assert.match(h.host.querySelector('.scenario-create').title,/exploratory/);
 }finally{h.dom.window.close();}
});
test('no improvement retains the baseline and does not display an inferior best CAPEX candidate',async()=>{
 const h=harness(false,'HIGH');try{const original=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=input=>original({...input,case:{...input.case,equipment:[{id:'e',speed:10,sensor:10}]}});const result=await search(h);assert.equal(result.status,'NO_DEMONSTRATED_IMPROVEMENT');assert.equal(result.candidate,null);assert.match(h.host.textContent,/Baseline retained/);assert.equal(h.host.querySelector('.scenario-basic-metric'),null);}finally{h.dom.window.close();}
});

test('unselected flow DOE factors are screened after reliability targets and ANOVA holds those targets fixed',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.querySelectorAll('.scenario-doe-select').forEach(c=>c.checked=false);
  const original=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async input=>{const response=await original(input),gain=(10-(input.case.equipment[0]['noiseProfile.reliability.mttrMinutes']??10))*3;for(const row of response.result.batch.rows){row.summary.lineOeePercent+=gain/10;row.summary.outputCount+=gain*input.run.durationSeconds/60;}response.result.batch.statistics.lineOeePercent.mean+=gain/10;response.result.batch.statistics.throughputPerMinute.mean+=gain;return response;};
  h.w.STScenarioSearch.reliabilityTargets=async(source,options)=>{const baseline=await options.measure(source,[],options.run),c={equipmentId:'e',path:'noiseProfile.reliability.mttrMinutes',before:10,after:5,unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Model target'};return {calculations:1,coverage:{screened:1},selectedChanges:[c],candidateSets:[{changes:[c]}],baseline,status:'EXPLORATORY_TARGETS_FOUND'};};
  const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED',result.message);assert(result.conditionalFlowDOE);assert.equal(result.conditionalFlowDOE.run.rounds,3);assert.equal(result.conditionalFlowDOE.selectedFactors.length,2);assert(result.doe.analysis.complete);assert(result.doe.anova.complete);assert(result.doe.fixedChanges.some(c=>c.analysisOnly));assert(result.reliabilityCounterfactual);
 }finally{h.dom.window.close();}
});

test('reliability equipment scope and limits persist across card reopening and invalidate cached results',()=>{
 const h=harness(false,'HIGH');try{
  h.host.remove();h.sim.equipment=[{id:'e',name:'Filler',type:'MACHINE',speed:10,sensor:10,noiseProfile:{reliability:{mtbfMinutes:10,mttrMinutes:2}}},{id:'e2',name:'Sleever',type:'MACHINE',noiseProfile:{reliability:{mtbfMinutes:5,mttrMinutes:2}}}];
  function attach(){const host=h.w.document.createElement('article');h.w.document.body.append(host);h.w.STScenarioExplorer.attach(host,h.project,()=>{},h.sim);return host;}
  let host=attach(),scope=host.querySelector('.scenario-reliability-scope');scope.value='MANUAL';scope.onchange();const check=host.querySelector('.scenario-reliability-equipment');check.checked=true;check.onchange();const max=host.querySelector('.scenario-reliability-mtbfMaximum'),min=host.querySelector('.scenario-reliability-mttrMinimum');max.value='15';max.onchange();min.value='1.2';min.onchange();
  assert.equal(h.sim.whatIf.reliabilitySettings.scope,'MANUAL');assert.deepEqual(Array.from(h.sim.whatIf.reliabilitySettings.equipmentIds),['e']);assert.equal(h.sim.whatIf.reliabilitySettings.equipmentLimits.e.mttrMinimum,1.2);assert.equal(host.querySelector('.scenario-create').disabled,true);
  host.remove();host=attach();assert.equal(host.querySelector('.scenario-reliability-scope').value,'MANUAL');assert.equal(host.querySelector('.scenario-reliability-equipment').checked,true);assert.equal(host.querySelector('.scenario-reliability-mtbfMaximum').value,'15');assert.equal(host.querySelector('.scenario-reliability-mttrMinimum').value,'1.2');
 }finally{h.dom.window.close();}
});

test('button suggestions and automatic search reuse the same conditional screen and retain its reliability targets',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.querySelectorAll('.scenario-doe-select').forEach(c=>c.checked=false);
  await suggest(h);const first=h.calls.length;assert.equal(first,4);
  const result=await search(h);assert.equal(result.conditionalFlowDOE.method,'ADAPTIVE_CONDITIONAL_FLOW_V3');assert.equal(result.conditionalFlowDOE.calculations,4);assert.equal(h.sim.whatIf.flowScreenings.length,1);assert(result.doe.analysis.complete);
  // Only one pair/single screening block at the exploration horizon is used.
  assert.equal(h.calls.filter(c=>c.run.durationSeconds===900&&c.run.rounds===3&&c.run.seed===1&&c.case.equipment[0].speed===10&&c.case.equipment[0].sensor===20).length,1);
 }finally{h.dom.window.close();}
});

test('engineering speed targets are refreshed in the retained reliability context and stay within supplied category scope',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.remove();h.sim.equipment[0].nominalRatePerSecond=10;h.sim.equipment[0].processData={equipment:{maximumSpeedBpm:1200}};h.w.STScenarios.fields.nominalRatePerSecond=[.001,1000000,'units/s'];
  h.w.STScenarios.plan=source=>({candidates:[{canApply:true,tier:'HIGH',priority:70,changes:[{equipmentId:'e',path:'nominalRatePerSecond',before:10,after:source.equipment[0]['noiseProfile.reliability.mttrMinutes']===5?15:20,unit:'units/s'}]}]});
  h.w.STScenarioSearch.reliabilityTargets=async()=>({selectedChanges:[{equipmentId:'e',path:'noiseProfile.reliability.mttrMinutes',before:10,after:5,unit:'min',analysisOnly:true}],candidateSets:[],calculations:0});
  const project={kind:'CUSTOM',tier:'HIGH',explore:true,changes:[{equipmentId:'e',path:'nominalRatePerSecond',before:10,after:20,unit:'units/s'}]};h.host=h.w.document.createElement('article');h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,project,()=>{},h.sim);h.w.STScenarioExplorer.connectCase(()=>({metadata:{includeDOE:true},simulations:[h.sim]}),()=>{});
  await suggest(h);const report=h.sim.whatIf.evaluations[0].sensitivityScreening;assert.equal(report.observations[0].after,15);assert(report.fixedReliabilityChanges.some(c=>c.after===5));assert.equal(h.host.querySelector('.scenario-speed-screen'),null);assert.equal(h.host.querySelector('.scenario-suggestion-percent').textContent,'100%');
 }finally{h.dom.window.close();}
});

test('manual four-factor DOE remains complete and bypasses automatic shortlist reduction',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.remove();h.sim.equipment[0].third=10;h.sim.equipment[0].fourth=10;h.w.STScenarios.fields.third=h.w.STScenarios.fields.fourth=[1,100,'u/s'];
  const project={...h.project,changes:['speed','sensor','third','fourth'].map(path=>({equipmentId:'e',path,before:10,after:20,unit:'u/s'}))};h.host=h.w.document.createElement('article');h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,project,()=>{},h.sim);
  h.host.querySelectorAll('.scenario-doe-select').forEach(c=>{c.checked=true;c.onchange();});const result=await search(h);assert.equal(result.doe.factors.length,4);assert.equal(result.doe.observations.length,16);assert(result.doe.analysis.complete);assert(result.doe.anova.complete);assert.equal(result.conditionalFlowDOE,undefined);
 }finally{h.dom.window.close();}
});

test('scenario configuration has three sections and results only expose changed inputs',async()=>{
 const h=harness(false,'HIGH');try{
  assert.deepEqual([...h.host.querySelectorAll('.scenario-config-tabs button')].map(n=>n.textContent),['Search','Equipment','Conveyors']);assert.equal(h.host.querySelectorAll('.scenario-config-section > h3').length,0);await search(h);h.host.querySelector('.scenario-results').click();const body=h.host.querySelector('.scenario-results-dialog .dialog-body');assert.match(body.textContent,/Changed inputs/);assert.doesNotMatch(body.textContent,/Replace this equipment|maintenance|Purpose|Evaluation reuse|seed|Conditional equipment reliability ranking/);
 }finally{h.dom.window.close();}
});

test('configuration tabs show one panel at a time and support keyboard navigation',()=>{
 const h=harness(false,'HIGH');try{
  const tabs=h.host.querySelectorAll('.scenario-config-tabs [role=tab]'),panels=h.host.querySelectorAll('[role=tabpanel]');assert.equal(tabs.length,3);assert.equal([...panels].filter(p=>!p.hidden).length,1);assert.equal(panels[0].hidden,false);tabs[1].click();assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);assert.equal(tabs[1].getAttribute('aria-selected'),'true');tabs[1].dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(panels[2].hidden,false);assert.equal(tabs[2].tabIndex,0);
 }finally{h.dom.window.close();}
});

test('saved scenario results include optimized machine speed, sensor position and conveyor geometry',()=>{
 const h=harness(false,'HIGH');try{
  const changes=[{equipmentId:'e',path:'nominalRatePerSecond',before:10,after:12,unit:'units/s'},{equipmentId:'e',path:'processData.accumulation.backupSensorPositionMm',before:100,after:150,unit:'mm'},{equipmentId:'e',path:'processData.geometry.lactMm',before:1000,after:1200,unit:'mm'}];
  h.host.remove();h.sim.whatIf.evaluations=[{cardId:JSON.stringify(['sim','CAPEX','HIGH']),sourceSignature:'same',sourceSimulationId:'sim',status:'IMPROVEMENT_REPRODUCED',searchPolicyVersion:'MATCHED_CAPEX_V9',baseline:{oee:50,throughput:100},candidate:{oee:60,throughput:120},independentCheck:{passed:true,baseline:{oee:50,throughput:100},candidate:{oee:60,throughput:120}},evaluatedChanges:changes}];
  h.host=h.w.document.createElement('article');h.w.document.body.append(h.host);h.w.STScenarioExplorer.attach(h.host,h.project,()=>{},h.sim);h.host.querySelector('.scenario-results').click();const rows=[...h.host.querySelectorAll('.scenario-results-changes tbody tr')];assert.equal(rows.length,3);assert.match(rows[0].textContent,/600 units\/min720 units\/min/);assert.match(rows[1].textContent,/100 mm150 mm/);assert.match(rows[2].textContent,/1000 mm1200 mm/);assert.equal(h.host.querySelectorAll('.scenario-audit-warnings input').length,0);
 }finally{h.dom.window.close();}
});

test('CAPEX mutations do not trigger height animations on sibling cards',async()=>{
 const h=harness(false);try{
  h.w.requestAnimationFrame=callback=>h.w.setTimeout(callback,0);let animations=0;h.w.HTMLElement.prototype.animate=function(){animations++;return {cancel(){},finished:Promise.resolve()};};
  h.w.eval(fs.readFileSync('apps-script/Motion.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);const container=h.w.document.createElement('div');container.className='scenario-tier-grid';h.w.document.body.append(container);
  const cards=[0,1].map(i=>{const card=h.w.document.createElement('article');card.className='analysis-recommendation';card.dataset.motionKey='card-'+i;card.height=100;card.getBoundingClientRect=()=>({height:card.height});container.append(card);return card;});h.w.STMotion.watchCards(container);cards[0].height=130;cards[0].textContent='New metrics';cards[1].height=140;cards[1].textContent='Idle sibling';await new Promise(resolve=>setTimeout(resolve,10));assert.equal(animations,0);
 }finally{h.dom.window.close();}
});

test('configuration separates conveyor inputs while preserving controls and DOE search options',()=>{
 const h=harness(true,'HIGH');try{
  h.sim.equipment.push({id:'belt',type:'CONVEYOR',sensor:10});h.host.replaceChildren();
  const project={...h.project,changes:[h.project.changes[0],{equipmentId:'belt',path:'sensor',before:10,after:20,unit:'m'}]};
  h.w.STScenarioExplorer.attach(h.host,project,()=>{},h.sim);
  const panels=h.host.querySelectorAll('[role=tabpanel]');
  assert(panels[0].querySelector('.scenario-search-depth'));assert(panels[0].querySelector('.scenario-doe-enabled'));
  assert.equal(panels[1].querySelectorAll('.scenario-changes tbody tr').length,0);assert.equal(h.host.querySelector('.scenario-advanced-store').hidden,true);assert.equal(panels[2].querySelectorAll('.scenario-changes tbody tr').length,1);
  assert.match(h.host.querySelector('.scenario-advanced-store .scenario-changes tbody').textContent,/speed/);assert.match(panels[2].querySelector('.scenario-changes tbody').textContent,/sensor/);
  assert.equal(panels[0].querySelector('.scenario-use-all'),null);h.host.querySelectorAll('.scenario-changes tbody input[type=checkbox]').forEach(c=>c.checked=false);
  const beltUse=panels[2].querySelector('.scenario-conveyor-use-all');beltUse.checked=true;beltUse.onchange();assert.equal(h.host.querySelector('.scenario-advanced-store tbody input[type=checkbox]').checked,false);assert.equal(panels[2].querySelector('tbody input[type=checkbox]').checked,true);
  const beltDOE=panels[2].querySelector('.scenario-conveyor-doe-all');beltDOE.checked=true;beltDOE.onchange();assert.equal(panels[2].querySelector('.scenario-doe-select').checked,true);beltDOE.checked=false;beltDOE.onchange();assert.equal(panels[2].querySelector('.scenario-doe-select').checked,false);
  const toggle=panels[0].querySelector('.scenario-doe-enabled');toggle.checked=false;toggle.onchange();assert.equal(panels[2].querySelector('.scenario-factor-count').hidden,true);toggle.checked=true;toggle.onchange();assert.equal(panels[2].querySelector('.scenario-factor-count').hidden,false);
  assert.equal(panels[2].querySelector('.scenario-doe-suggest').nextElementSibling.className,'scenario-factor-count');assert.equal(panels[2].querySelector('.scenario-factor-count').nextElementSibling.className,'scenario-suggestion-percent');
  assert.equal(h.host.querySelector('.scenario-reliability-source'),null);assert.doesNotMatch(panels[1].textContent,/Source \/ basis/);

 }finally{h.dom.window.close();}
});

test('completed searches keep cards concise and disclose actual DOE execution in results',async()=>{
 const h=harness(true,'HIGH');try{
  await search(h);assert.equal(h.host.querySelector('.scenario-preview-status').textContent,'');assert.equal(h.host.querySelector('.scenario-search-progress').textContent,'');assert.equal(h.host.querySelector('.scenario-progress-label').hidden,true);assert.equal(h.host.querySelector('.scenario-audit-warnings'),null);
  h.host.querySelector('.scenario-results').click();assert.match(h.host.querySelector('.scenario-flow-summary').textContent,/DOE: 4 \/ 4 combinations completed. ANOVA completed./);
  assert.equal(h.host.querySelector('.scenario-doe').tagName,'SECTION');assert.equal(h.host.querySelector('.scenario-suggestion-report').hidden,true);
  assert.doesNotMatch(h.host.querySelectorAll('[role=tabpanel]')[2].textContent,/Conveyor variables|select and enter/);
 }finally{h.dom.window.close();}
});

test('compact configuration places DOE actions in conveyors and keeps search choices in two groups',()=>{
 const h=harness(true,'HIGH');try{
  const panels=h.host.querySelectorAll('[role=tabpanel]');
  assert(panels[0].querySelector('.scenario-search-primary .scenario-search-depth'));
  assert(panels[0].querySelector('.scenario-search-choices .scenario-doe-enabled'));
  assert.equal(panels[0].querySelector('.scenario-search-choices .scenario-use-all'),null);
  assert.equal(panels[0].querySelector('.scenario-doe-suggest'),null);assert(panels[2].querySelector('.scenario-doe-suggest'));
  assert(![...h.host.querySelectorAll('button')].some(b=>b.textContent==='Clear factor selection'));
  assert.equal(h.host.querySelector('.scenario-preview-context'),null);
  assert(panels[1].querySelector('.scenario-reliability-intro .scenario-explore-reliability'));assert(panels[1].querySelector('.scenario-reliability-heading .scenario-reliability-count'));
  assert.equal(panels[1].querySelector('.scenario-edit-details'),null);
  h.host.querySelector('.scenario-configure').click();assert.equal(panels[1].querySelector('.scenario-edit-details'),null);
 }finally{h.dom.window.close();}
});

test('manual DOE retains nonfactor changes from a review candidate when no unflagged winner exists',async()=>{
 const h=harness(true,'HIGH');try{
  h.host.replaceChildren();h.sim.equipment[0].mttr=10;h.w.STScenarios.fields.mttr=[1,100,'min'];
  const apply=h.w.STScenarios.apply;h.w.STScenarios.apply=(s,c)=>{const value=apply(s,c);value.scenarioWarnings=[{equipmentId:'e',rule:'REVIEW',before:0,after:1}];return value;};
  const simulate=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async input=>{const response=await simulate(input),gain=input.case.equipment[0].mttr-10;response.result.batch.statistics.lineOeePercent.mean+=gain;response.result.batch.statistics.throughputPerMinute.mean+=gain;response.result.batch.rows.forEach(row=>{row.summary.lineOeePercent+=gain;row.summary.outputCount+=gain*input.run.durationSeconds/60;});return response;};
  h.w.STScenarioExplorer.attach(h.host,{...h.project,changes:[...h.project.changes,{equipmentId:'e',path:'mttr',before:10,after:20,unit:'min'}]},()=>{},h.sim);
  [...h.host.querySelectorAll('.scenario-doe-select')].slice(0,2).forEach(c=>{c.checked=true;c.onchange();});
  const result=await search(h);assert(result.doe.fixedChanges.some(c=>c.path==='mttr'&&c.after===20));assert.equal(result.doe.observations.length,4);assert(result.warnings.length);
 }finally{h.dom.window.close();}
});

test('screening with no measured flow gain retains manual selection and explains the outcomes',async()=>{
 const h=harness(true,'HIGH');try{
  const original=h.w.SimulatorEngine.simulateBatch;
  h.w.SimulatorEngine.simulateBatch=input=>{const copy=JSON.parse(JSON.stringify(input));copy.case.equipment[0].speed=10;copy.case.equipment[0].sensor=10;return original(copy);};
  await suggest(h);assert.match(h.host.querySelector('.scenario-factor-count').textContent,/No stable suggestions; selected factors kept.*3 without gain/);assert([...h.host.querySelectorAll('.scenario-doe-select')].every(c=>c.checked));assert.doesNotMatch(h.host.textContent,/Why these DOE variables/);
 }finally{h.dom.window.close();}
});

// Distinguish selection errors from normal differences between independent seed blocks.
function responseAt(input,oee,throughput=oee*2){
 const rows=Array.from({length:input.run.rounds},(_,j)=>({seed:input.run.seed+j,summary:{lineOeePercent:oee,outputCount:throughput*input.run.durationSeconds/60}}));
 return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary:rows[0].summary,batch:{rows,statistics:{lineOeePercent:{mean:oee},throughputPerMinute:{mean:throughput}}}}};
}
for(const [tier,depth] of [['ZERO','LIGHT'],['MEDIUM','MEDIUM']]){
 test(tier+' ranks finalists over the configured full horizon instead of retaining a short-run winner',async()=>{
  const h=harness(false,depth,false,tier,7200);try{
   delete h.w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates;
   h.w.SimulatorEngine.simulateBatch=async input=>{
    h.calls.push(JSON.parse(JSON.stringify(input)));const e=input.case.equipment[0],speed=e.speed>10,sensor=e.sensor>10;
    const oee=!speed&&!sensor?39:input.run.durationSeconds<7200?(speed&&sensor?40:39.5):speed?(sensor?37:38):41;
    return responseAt(input,oee);
   };
   const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED');
   assert.equal(result.screening.candidate.oee,40);assert.equal(result.rankingRun.durationSeconds,7200);
   assert.equal(result.candidate.oee,41);assert.equal(result.independentCheck.candidate.oee,41);
   assert(result.evaluatedChanges.every(c=>c.path==='sensor'));assert.match(h.host.querySelector('.scenario-baseline-note').textContent,/120 min/);
  }finally{h.dom.window.close();}
 });
 test(tier+' retries uncertain confirmation and never presents a rejected candidate or recalculated base as the final scenario',async()=>{
  const h=harness(false,depth,false,tier);try{
   let provisionalSeen=false;
   h.w.SimulatorEngine.simulateBatch=async input=>{
    const changed=input.case.equipment[0].speed>10||input.case.equipment[0].sensor>10;
    if(input.run.seed>1000000){provisionalSeen ||= /Provisional estimate/.test(h.host.textContent);return responseAt(input,changed?36:37);}
    return responseAt(input,changed?40:39);
   };
   const result=await search(h);assert(provisionalSeen);assert.equal(result.status,'NOT_REPRODUCED');
   assert.equal(result.independentCheck.rounds,6);assert.equal(result.independentCheck.baseline.oee,37);
   assert.deepEqual([...h.host.querySelectorAll('.scenario-basic-metric strong')].map(e=>e.textContent),['—','—']);
   assert.match(h.host.querySelector('.scenario-baseline-note').textContent,/No confirmed improvement.*37.00/);
   assert.match(h.host.querySelector('.scenario-create').title,/for validation/);
   h.host.remove();const reopened=h.w.document.createElement('article');reopened.className='analysis-recommendation';h.w.document.body.append(reopened);h.w.STScenarioExplorer.attach(reopened,h.project,()=>{},h.sim);
   assert.equal(reopened.querySelector('.scenario-basic-metric strong').textContent,'—');assert.match(reopened.textContent,/did not reproduce/);
  }finally{h.dom.window.close();}
 });
 test(tier+' uses matching validation seeds to compare a confirmed scenario with its base',async()=>{
  const h=harness(false,depth,false,tier);try{
   h.w.SimulatorEngine.simulateBatch=async input=>{const changed=input.case.equipment[0].speed>10||input.case.equipment[0].sensor>10;return responseAt(input,input.run.seed>1000000?(changed?37:35):(changed?40:39));};
   const result=await search(h);assert.equal(result.status,'IMPROVEMENT_REPRODUCED');
   assert.equal(h.host.querySelector('.scenario-basic-metric strong').textContent,'37.0%');
   assert.match(h.host.querySelector('.scenario-basic-change').textContent,/\+2.00 pp/);
   assert.match(h.host.querySelector('.scenario-baseline-note').textContent,/Confirmed.*35.00.*matching seeds/);
  }finally{h.dom.window.close();}
 });
 test(tier+' expands noisy positive confirmation to six paired rounds',async()=>{
  const h=harness(false,depth,true,tier);try{const result=await search(h);assert.equal(result.independentCheck.rounds,6);assert.equal(result.status,'IMPROVEMENT_REPRODUCED');}finally{h.dom.window.close();}
 });
}

test('older CAPEX results require recalculation before creation with the full-horizon policy',async()=>{
 const h=harness(false);try{
  const result=await search(h);result.searchPolicyVersion='CONDITIONAL_DOE_V8';h.sim.whatIf.evaluations=[result];h.host.remove();
  const reopened=h.w.document.createElement('article');reopened.className='analysis-recommendation';h.w.document.body.append(reopened);h.w.STScenarioExplorer.attach(reopened,h.project,()=>{},h.sim);
  assert.match(reopened.textContent,/full-horizon comparison policy/);assert(reopened.querySelector('.scenario-create').disabled);assert(reopened.querySelector('.scenario-basic-metric strong'));
 }finally{h.dom.window.close();}
});
