import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

function setup(){
 const dom=new JSDOM(fs.readFileSync('apps-script/ReportTemplates.html','utf8')+'<section id="target"></section>',{runScripts:'outside-only'}),w=dom.window;
 w.__ST_TEXT__=key=>key;
 for(const name of ['Reports.html','Results.html'])w.eval(fs.readFileSync('apps-script/'+name,'utf8').replace(/^<script>|<\/script>\s*$/g,''));
 return w;
}
const equipment=[{id:'a',name:'Filler'},{id:'b',name:'Conveyor <one>'}];
const metrics=(run,effective)=>({runningSeconds:run,productiveEquivalentSeconds:effective});

test('equipment rate total sums net equivalent seconds and does not substitute line loss',()=>{
 const w=setup();try{
  const result={summary:{lineRateLossSeconds:3},equipmentMetrics:{a:metrics(120,90),b:metrics(120,60)}};
  const d=w.STReports.equipmentRateLoss(result,equipment);
  assert.equal(d.rows[0].rateLossSeconds,30);assert.equal(d.rows[1].rateLossSeconds,60);
  assert.equal(d.total.rateLossSeconds,90);assert.equal(result.summary.lineRateLossSeconds,3);
  w.STResults.renderRamps(w.document.getElementById('target'),result,equipment);
  const table=w.document.querySelector('.equipment-rate-loss-table');assert.equal(table.tBodies[0].rows.length,2);
  assert.equal(table.tFoot.rows[0].cells[3].textContent,'1.5');assert.equal(table.querySelectorAll('one').length,0);
  const html=w.STReports.equipmentRateLossHtml(result,equipment);
  assert(html.includes('Total equipment (overlapping)'));assert(html.includes('Conveyor &lt;one&gt;'));assert(html.includes('not unique line Rate Loss'));
 }finally{w.close();}
});

test('all-round mean and selected round use their matching equipment counters',()=>{
 const w=setup();try{
  const result={equipmentMetrics:{a:metrics(999,0)},batch:{rows:[{equipmentMetrics:{a:metrics(120,90)}},{equipmentMetrics:{a:metrics(180,90)}}]}};
  assert.equal(w.STReports.equipmentRateLoss(result,[equipment[0]]).total.rateLossSeconds,60);
  result.resultView={mode:'round'};result.equipmentMetrics={a:metrics(120,90)};
  assert.equal(w.STReports.equipmentRateLoss(result,[equipment[0]]).total.rateLossSeconds,30);
  delete result.resultView;result.batch={equipmentStatistics:{a:{runningSeconds:{mean:150},productiveEquivalentSeconds:{mean:90}}}};
  assert.equal(w.STReports.equipmentRateLoss(result,[equipment[0]]).total.rateLossSeconds,60);
 }finally{w.close();}
});

test('missing counters, incomplete rounds, empty selections and unsupported engines remain unavailable',()=>{
 const w=setup();try{
  for(const result of [{equipmentMetrics:{a:metrics(120,90)}},{equipmentMetrics:{a:metrics(120,null),b:metrics(10,10)}},{batch:{rows:[{equipmentMetrics:{a:metrics(120,90),b:metrics(120,90)}},{equipmentMetrics:{a:metrics(120,90)}}]}},{engineId:'DES_SIMPY_EXPERIMENTAL',equipmentMetrics:{a:metrics(120,90),b:metrics(120,90)}}]){
   assert.equal(w.STReports.equipmentRateLoss(result,equipment).total.rateLossSeconds,null);
  }
  assert.equal(w.STReports.equipmentRateLoss({},[]).total.rateLossSeconds,null);
  const d=w.STReports.equipmentRateLoss({equipmentMetrics:{a:metrics(0,0),b:metrics(0,0)}},equipment);
  assert.equal(d.total.rateLossSeconds,0);
 }finally{w.close();}
});

test('above-reference equipment balance stays signed rather than hiding recovery',()=>{
 const w=setup();try{
  const d=w.STReports.equipmentRateLoss({equipmentMetrics:{a:metrics(60,90),b:metrics(60,45)}},equipment);
  assert.equal(d.rows[0].rateLossSeconds,-30);assert.equal(d.total.rateLossSeconds,-15);
 }finally{w.close();}
});

test('both Results tables explain every header and report tooltips use the same definitions',()=>{
 const w=setup();try{
  const result={summary:{},equipmentMetrics:{a:metrics(120,90),b:metrics(120,60)}};
  w.STResults.renderRamps(w.document.getElementById('target'),result,equipment);
  for(const [selector,tips] of [['.equipment-rate-loss-table',w.STReports.equipmentRateLossHeaderTips],['.ramp-accounting-table',w.STReports.rampHeaderTips]]){
   const headers=[...w.document.querySelectorAll(selector+' thead th')];assert.equal(headers.length,tips.length);
   headers.forEach((th,i)=>{assert.equal(th.title,tips[i]);assert(th.title.length>30);assert.equal(th.getAttribute('aria-description'),th.title);assert.equal(th.tabIndex,0);});
  }
  const report=new JSDOM(w.STReports.equipmentRateLossHtml(result,equipment));
  [...report.window.document.querySelectorAll('thead th')].forEach((th,i)=>assert.equal(th.title,w.STReports.equipmentRateLossHeaderTips[i]));report.window.close();
  assert(w.STReports.rampHeaderTips[1].includes('not equivalent lost production time'));
  assert(w.STReports.rampHeaderTips[6].includes('repair ramps disabled'));
  assert(w.STReports.equipmentRateLossHeaderTips[3].includes('overlap'));
 }finally{w.close();}
});
