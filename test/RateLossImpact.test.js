import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch,replicationView} from '../src/simulation/SimulationBatch.js';
function ui(){const w=new JSDOM(fs.readFileSync('apps-script/ReportTemplates.html','utf8')+'<section id="target"></section>',{runScripts:'outside-only'}).window;w.__ST_TEXT__=x=>x;for(const name of ['Reports.html','Results.html'])w.eval(fs.readFileSync('apps-script/'+name,'utf8').replace(/^<script>|<\/script>\s*$/g,''));return w;}
function input(){return {case:{unitOfFlow:'bottles',equipment:[{id:'a',name:'Source',type:'FILLER',nominalRatePerSecond:10},{id:'belt',name:'Belt',type:'CONVEYOR',nominalRatePerSecond:1000,processData:{role:'CONVEYOR',accumulation:{usableLengthMm:100000,productLengthMm:1,productPitchMm:1,gapMm:0,conveyorSpeedMmPerSecond:1000000,primeSensorPositionMm:99999,backupSensorPositionMm:0,backupRestartPositionMm:100,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}},{id:'b',name:'Outlet',type:'CUSTOM',nominalRatePerSecond:5}].map(e=>({initialMode:'AUTO',processData:{},...e}))},run:{durationSeconds:20,tickSeconds:1,sampleEverySeconds:1,seed:1,reliabilityEnabled:false,rounds:2}};}
test('engine records equivalent output and percentage points without changing production',async()=>{
 const i=input(),r=simulateLine(i);assert(r.ok,JSON.stringify(r.error));const s=r.result.summary;
 assert.equal(s.lineRateLossOutputEquivalents,s.lineRateLossSeconds*10);
 assert.equal(s.lineNetRateBalanceOutputEquivalents,s.lineRateLossOutputEquivalents-s.lineRateRecoveryOutputEquivalents);
 assert.equal(s.lineRateLossEfficiencyPp,100*s.lineRateLossOutputEquivalents/200);
 const b=await simulateBatch(i,{summaryOnly:true});assert(b.ok);
 const mean=replicationView(b.result);assert.equal(mean.summary.lineRateLossOutputEquivalents,b.result.batch.statistics.lineRateLossOutputEquivalents.mean);
 b.result.batch.rows[1].summary.lineRateLossOutputEquivalents=null;
 assert.equal(replicationView(b.result).summary.lineRateLossOutputEquivalents,null);
});
test('active-format conversion preserves different volume impacts even when net equivalent time is zero',()=>{
 const code=fs.readFileSync('src/simulation/LineSimulationEngine.js','utf8'),a=code.indexOf('function moveFlow('),b=code.indexOf('\nfunction addFlowToZone(',a),move=Function('currentProductRow',code.slice(a,b)+';return moveFlow;')(()=>({outputNative:0,outputBottleEquivalents:0}));
 const r={product:{},equipment:[{outputBottleFactor:1}],productRows:{},outputCount:0,lineRunSeconds:0,lineEffectiveRuntimeSeconds:0,lineRateShortfallSeconds:0,lineRateRecoverySeconds:0,lineRateShortfallOutputEquivalents:0,lineRateRecoveryOutputEquivalents:0,lineRateReferenceValid:true,run:{tickSeconds:1}};
 r.inputBottleEquivalents=0;r.productReferenceRate=10;move(r,0,5,false);r.productReferenceRate=20;move(r,0,30,false);
 assert.equal(r.lineRateShortfallSeconds,.5);assert.equal(r.lineRateRecoverySeconds,.5);
 assert.equal(r.lineRateShortfallOutputEquivalents,5);assert.equal(r.lineRateRecoveryOutputEquivalents,10);
 assert.notEqual(r.lineRateShortfallOutputEquivalents,r.lineRateShortfallSeconds*15,'whole-period mean reference would be wrong');
});
test('legacy constant-format result reproduces Case C conversions and renders signed points',()=>{
 const w=ui();try{
  const result={durationSeconds:42240,unitOfFlow:'bottles',summary:{lineRateLossSeconds:420.1801644,lineRateRecoverySeconds:401.9971901,lineNetRateBalanceSeconds:18.1829742,lineOeePacemakerRatePerSecond:220/60,idealBottleOutput:154880},equipmentMetrics:{},products:{rows:[{durationSeconds:42240,idealBottleOutput:154880}]}};
  const data=w.STReports.rateLossImpact(result);assert(Math.abs(data.rows[0][2]-1540.6606028)<1e-6);assert(Math.abs(data.rows[0][3]+.9947447074)<1e-9);
  assert(Math.abs(data.rows[1][3]-.9516978932)<1e-9);assert(Math.abs(data.rows[2][2]-66.6709054)<1e-6);
  w.STResults.renderRamps(w.document.getElementById('target'),result,[]);const table=w.document.querySelector('.line-rate-loss-impact-table');
  assert.equal(table.tBodies[0].rows.length,3);assert.equal(table.tBodies[0].rows[0].cells[3].textContent,'-0.995');assert.equal(table.tBodies[0].rows[2].cells[3].textContent,'-0.043');assert([...table.querySelectorAll('thead th')].every(th=>th.title));
  const report=new JSDOM(w.STReports.rateLossImpactHtml(result));assert(report.window.document.body.textContent.includes('Efficiency impact (pp)'));assert.equal(report.window.document.querySelectorAll('tbody tr').length,3);report.window.close();
 }finally{w.close();}
});
test('mean points average per-round ratios and selected views do not reuse batch means',()=>{
 const w=ui();try{
  const summary=(v,d)=>({lineRateLossSeconds:60,lineRateLossOutputEquivalents:v,lineRateLossEfficiencyPp:100*v/d,lineRateImpactDenominatorOutput:d}),result={summary:summary(999,1000),batch:{rows:[{summary:summary(10,100)},{summary:summary(10,200)}]}};
  assert.equal(w.STReports.rateLossImpact(result).rows[0][3],-7.5);
  result.resultView={mode:'round'};result.summary=summary(10,100);assert.equal(w.STReports.rateLossImpact(result).rows[0][3],-10);
  delete result.resultView;result.batch={statistics:{lineRateLossSeconds:{mean:60},lineRateLossOutputEquivalents:{mean:10},lineRateLossEfficiencyPp:{mean:7.5}}};assert.equal(w.STReports.rateLossImpact(result).rows[0][3],-7.5);
 }finally{w.close();}
});
test('legacy mixed references, incomplete rounds, missing counters and unsupported engines do not invent volume loss',()=>{
 const w=ui();try{
  const summary={lineRateLossSeconds:60,lineOeePacemakerRatePerSecond:15,idealBottleOutput:1000};const result={summary,products:{rows:[{durationSeconds:10,idealBottleOutput:100},{durationSeconds:10,idealBottleOutput:200}]}};
  let d=w.STReports.rateLossImpact(result);assert.equal(d.rows[0][1],1);assert.equal(d.rows[0][2],null);assert.equal(d.rows[0][3],null);
  result.summary={...summary,lineRateLossOutputEquivalents:5,lineRateLossEfficiencyPp:.5};assert.equal(w.STReports.rateLossImpact(result).rows[0][2],5);
  result.batch={rows:[{summary:result.summary},{summary:{}}]};assert.equal(w.STReports.rateLossImpact(result).rows[0][2],null);
  result.engineId='DES_SIMPY_EXPERIMENTAL';assert.equal(w.STReports.rateLossImpact(result).rows[0][1],null);
  const native={summary:{...summary,lineRateLossOutputEquivalents:0,lineRateLossEfficiencyPp:0},unitOfFlow:'cases'};d=w.STReports.rateLossImpact(native);assert.equal(d.headers[2],'Output equivalents');assert.equal(d.rows[0][2],0);
 }finally{w.close();}
});
