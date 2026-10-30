import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function setup(){const w=new JSDOM('<div id="target"></div>',{runScripts:'outside-only'}).window;w.__ST_TEXT__=x=>x;w.eval(fs.readFileSync('apps-script/Results.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));return w;}
test('effective runtime card follows available minus line downtime minus gross rate loss, without summing equipment',()=>{
 const w=setup();try{
  const r={durationSeconds:600,summary:{lineRunSeconds:420,lineRateLossSeconds:60,lineEffectiveRuntimeSeconds:400},equipmentMetrics:{a:{failureSeconds:9999}}};
  const d=w.STResults.effectiveRunTime(r);assert.equal(d.available,10);assert.equal(d.unplanned,3);assert.equal(d.rateLoss,1);assert.equal(d.minutes,6);
  w.STResults.renderEffectiveRunTimeCard(w.document.getElementById('target'),r);const c=w.document.querySelector('.effective-run-time-kpi');
  assert.equal(c.tagName,'ARTICLE');assert.equal(c.querySelector('span').textContent,'Effective Run Time');assert.equal(c.querySelector('strong').textContent,'6 min');assert(c.title.includes('10 − 3 − 1 = 6'));assert(c.title.includes('No se añade la recuperación'));assert.equal(c.title,c.getAttribute('aria-description'));
 }finally{w.close();}
});
test('effective runtime averages all rounds, selected round, or compact saved statistics',()=>{
 const w=setup();try{
  const r={durationSeconds:600,summary:{lineRunSeconds:600,lineRateLossSeconds:0},batch:{rows:[{summary:{lineRunSeconds:420,lineRateLossSeconds:60}},{summary:{lineRunSeconds:300,lineRateLossSeconds:60}}]}};
  assert.equal(w.STResults.effectiveRunTime(r).minutes,5);
  r.resultView={mode:'round'};assert.equal(w.STResults.effectiveRunTime(r).minutes,10);
  delete r.resultView;r.batch={statistics:{lineRunSeconds:{mean:360},lineRateLossSeconds:{mean:60}}};assert.equal(w.STResults.effectiveRunTime(r).minutes,5);
 }finally{w.close();}
});
test('calendar exclusions use the complete physical period and missing or inconsistent data remain unavailable',()=>{
 const w=setup();try{
  const r={durationSeconds:600,summary:{lineRunSeconds:300,lineRateLossSeconds:60},plantCalendar:{completePeriod:true,observedStopSeconds:120}};
  const sim={dynamicConfig:{plantCalendar:{enabled:true,mode:'SCHEDULED',totalMinutes:10,externalMinutes:1}}};
  const d=w.STResults.effectiveRunTime(r,sim);assert.equal(d.available,7);assert.equal(d.unplanned,2);assert.equal(d.minutes,4);
  r.plantCalendar.completePeriod=false;assert.equal(w.STResults.effectiveRunTime(r,sim).minutes,null);
  assert.equal(w.STResults.effectiveRunTime({durationSeconds:600,summary:{lineRunSeconds:300}}).minutes,null);
  assert.equal(w.STResults.effectiveRunTime({durationSeconds:600,summary:{lineRunSeconds:0,lineRateLossSeconds:0}}).minutes,0);
  assert.equal(w.STResults.effectiveRunTime({durationSeconds:600,summary:{lineRunSeconds:300,lineRateLossSeconds:400}}).minutes,null);
  assert.equal(w.STResults.effectiveRunTime({durationSeconds:600,summary:{lineRunSeconds:300,lineRateLossSeconds:60},batch:{rows:[{summary:{lineRunSeconds:300,lineRateLossSeconds:60}},{summary:{}}]}}).minutes,null);
 }finally{w.close();}
});
