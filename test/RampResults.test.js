import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function setup(){
 const dom=new JSDOM(fs.readFileSync('apps-script/ReportTemplates.html','utf8')+fs.readFileSync('apps-script/ReportResultsTemplate.html','utf8')+'<section id="ramp-test"></section>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(fs.readFileSync('apps-script/TextResources.gs','utf8'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const p of ['Reports.html','Results.html'])w.eval(fs.readFileSync('apps-script/'+p,'utf8').replace(/^<script>|<\/script>\s*$/g,''));
 return {dom,w};
}
const metrics=(seconds,bottles)=>({startRampSeconds:seconds,startRampBottleEquivalents:bottles,stopTransitionSeconds:2,stopTransitionBottleEquivalents:3});
test('ramp table uses all rounds, selected view and unavailable values rather than the first round or fake zero',()=>{
 const h=setup();try{
  const result={summary:{},equipmentMetrics:{a:metrics(99,999)},batch:{rows:[{equipmentMetrics:{a:metrics(4,10)}},{equipmentMetrics:{a:metrics(8,30)}}]}},equipment=[{id:'a',name:'<Source>'},{id:'missing',name:'Old equipment'}],rows=h.w.STReports.rampRows(result,equipment);
  assert.equal(rows[0][1],6);assert.equal(rows[0][2],20);assert.equal(rows[1][1],null);
  const target=h.w.document.getElementById('ramp-test');h.w.STResults.renderRamps(target,result,equipment);const cells=[...target.querySelectorAll('tbody tr')];assert.equal(cells.length,2);assert.equal(cells[0].children[1].textContent,'6');assert.equal(cells[1].children[1].textContent,'—');assert.equal(target.querySelectorAll('Source').length,0);
  result.resultView={mode:'round',round:1};result.batch=undefined;result.equipmentMetrics.a=metrics(4,10);assert.equal(h.w.STReports.rampRows(result,equipment)[0][1],4);
  result.batch={equipmentStatistics:{a:{startRampSeconds:{mean:7},startRampBottleEquivalents:{mean:18}}}};delete result.resultView;assert.equal(h.w.STReports.rampRows(result,equipment)[0][1],7);
  result.batch={rows:[{equipmentMetrics:{a:metrics(4,10)}},{equipmentMetrics:{a:{}}}]};assert.equal(h.w.STReports.rampRows(result,equipment)[0][1],null);result.resultView={mode:'average'};assert.equal(h.w.STReports.rampRows(result,equipment)[0][1],null);
 }finally{h.w.close();}
});

test('stored simulation JSON retains per-equipment phase totals and each replication',async()=>{
 const vm=await import('node:vm'),client=fs.readFileSync('apps-script/ClientSimulation.html','utf8'),start=client.indexOf('    function createStoredSimulationResult('),end=client.indexOf('\n    function ',start+10),c={cloneJson:value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),retainedReplaySamples:values=>values||[],compactStoredReplays(){}};vm.createContext(c);vm.runInContext(client.slice(start,end),c);
 const metric={startRampSeconds:4,startRampBottleEquivalents:15,startRampOutputUnits:15,stopTransitionSeconds:3,stopTransitionBottleEquivalents:7,stopTransitionOutputUnits:7},result={summary:{outputCount:100},equipmentMetrics:{source:metric},seed:1,durationSeconds:20,samples:[],batch:{rounds:2,rows:[{round:1,equipmentMetrics:{source:metric}},{round:2,equipmentMetrics:{source:{...metric,startRampBottleEquivalents:19}}}],replays:[]}};
 const saved=c.createStoredSimulationResult(result,{seed:1,durationSeconds:20}),reloaded=JSON.parse(JSON.stringify(saved));assert.equal(reloaded.equipmentMetrics.source.startRampSeconds,4);assert.equal(reloaded.equipmentMetrics.source.stopTransitionBottleEquivalents,7);assert.equal(reloaded.batch.rows[1].equipmentMetrics.source.startRampBottleEquivalents,19);assert.equal(reloaded.replay.equipmentMetrics.source.startRampOutputUnits,15);
});

test('Rate Loss appears in Results help and printable reports as the selected or mean measured value',()=>{
 const h=setup();try{
  const summary=(run,effective)=>({outputCount:10,lineOeePercent:50,lineRunSeconds:run,lineEffectiveRuntimeSeconds:effective,lineRateLossSeconds:run-effective}),result={durationSeconds:600,summary:summary(480,300),equipmentMetrics:{},batch:{rows:[{summary:summary(480,300)},{summary:summary(540,300)}]}};
  assert.equal(h.w.STReports.rateLossRows(result)[2][1],3.5);
  h.w.STResults.renderRamps(h.w.document.getElementById('ramp-test'),result,[]);
  assert(h.w.document.getElementById('ramp-test').textContent.includes('Rate Loss: 3.5 min'));
  assert(h.w.document.querySelector('#ramp-test details').textContent.includes('comparison-only'));
  delete result.batch;assert.equal(h.w.STReports.rateLossRows(result)[2][1],3);
  delete result.summary.lineRateLossSeconds;assert.equal(h.w.STReports.rateLossRows(result)[2][1],null);
 }finally{h.w.close();}
});
