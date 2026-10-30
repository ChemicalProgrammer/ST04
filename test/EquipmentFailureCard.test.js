import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function setup(){
 const w=new JSDOM('<div id="target"></div>',{runScripts:'outside-only'}).window;
 w.__ST_TEXT__=x=>x;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.eval(fs.readFileSync('apps-script/Results.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));
 return w;
}
const equipment=[{id:'a',name:'Filler <one>'},{id:'b',name:'Labeller'}];
test('failure card opens equipment minutes, percentage and matching total; dialog closes and restores focus',()=>{
 const w=setup();try{
  const result={summary:{totalFailureSeconds:9999},equipmentMetrics:{a:{failureSeconds:120,pausedSeconds:600},b:{failureSeconds:60,blockedSeconds:600}}};
  const target=w.document.getElementById('target');w.STBasicMode={isBasic:()=>true};
  w.STResults.renderFailureCard(target,result,equipment);const button=target.querySelector('button');
  assert.equal(button.querySelector('strong').textContent,'3 min');assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  button.focus();button.click();
  const dialog=w.document.querySelector('dialog');assert(dialog.open);
  const table=dialog.querySelector('table');assert.equal(table.tBodies[0].rows.length,2);
  assert.equal(table.tBodies[0].rows[0].cells[0].textContent,'Filler <one>');assert.equal(table.querySelectorAll('one').length,0);
  assert.equal(table.tBodies[0].rows[0].cells[1].textContent,'2');assert.equal(table.tBodies[0].rows[0].cells[2].textContent,'66.67');
  assert.equal(table.tFoot.rows[0].cells[1].textContent,'3');assert.equal(table.tFoot.rows[0].cells[2].textContent,'100');
  assert(dialog.textContent.includes('no es tiempo único de parada'));dialog.querySelector('button').click();
  assert.equal(w.document.querySelector('dialog'),null);assert.equal(w.document.activeElement,button);
 }finally{w.close();}
});
test('failure breakdown uses all round counters or statistics and honors selected round',()=>{
 const w=setup();try{
  const result={equipmentMetrics:{a:{failureSeconds:600},b:{failureSeconds:600}},batch:{rows:[{equipmentMetrics:{a:{failureSeconds:120},b:{failureSeconds:60}}},{equipmentMetrics:{a:{failureSeconds:240},b:{failureSeconds:60}}}]}};
  let d=w.STResults.failureBreakdown(result,equipment);assert.equal(d.total,4);assert.equal(d.rows[0].percent,75);
  result.resultView={mode:'round'};assert.equal(w.STResults.failureBreakdown(result,equipment).total,20);
  delete result.resultView;result.batch={equipmentStatistics:{a:{failureSeconds:{mean:180}},b:{failureSeconds:{mean:60}}}};
  assert.equal(w.STResults.failureBreakdown(result,equipment).total,4);
 }finally{w.close();}
});
test('missing counters stay unavailable, zero remains zero, and unlisted equipment contributes',()=>{
 const w=setup();try{
  let d=w.STResults.failureBreakdown({equipmentMetrics:{a:{failureSeconds:0},b:{failureSeconds:0}}},equipment);
  assert.equal(d.total,0);assert.equal(d.rows[0].percent,0);
  d=w.STResults.failureBreakdown({equipmentMetrics:{a:{failureSeconds:60}}},equipment);assert.equal(d.total,null);assert.equal(d.rows[0].percent,null);
  d=w.STResults.failureBreakdown({batch:{rows:[{equipmentMetrics:{a:{failureSeconds:60}}},{equipmentMetrics:{}}]}},[equipment[0]]);
  assert.equal(d.total,null);
  d=w.STResults.failureBreakdown({equipmentMetrics:{a:{failureSeconds:60},b:{failureSeconds:120},belt:{failureSeconds:0}}},equipment);
  assert.equal(d.rows.length,3);assert.equal(d.total,3);
  assert.equal(w.STResults.failureBreakdown({},[]).total,null);
 }finally{w.close();}
});
