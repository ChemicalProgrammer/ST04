import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
test('comparison exposes Spanish formulas per column, AU operands and identical report tooltips',()=>{
 const w=new JSDOM(fs.readFileSync('apps-script/RealDataPanel.html','utf8'),{runScripts:'outside-only'}).window;
 try{
  w.eval(fs.readFileSync('apps-script/RealData.html','utf8').replace(/<\/?script>/g,''));
  const record={id:'r',name:'Example',durationSeconds:600,reportedEfficiencyPercent:77,reportedUpdtPercent:20,runTimeSeconds:480,rateLossSeconds:120,downtimeSeconds:120,aem:{plantAvailableSeconds:600,productionAvailableSeconds:600},equipment:[{equipmentId:'a',downtimeSeconds:60,stopClass:'FAILURES'}]};
  const result={durationSeconds:600,summary:{outputCount:100,lineOeePercent:62.5,lineRunSeconds:480,lineEffectiveRuntimeSeconds:375,lineRateLossSeconds:105,lineRateRecoverySeconds:0,lineNetRateBalanceSeconds:105,lineRateLossBasis:'MEASURED'},equipmentMetrics:{a:{failureSeconds:60}}};
  const sim={id:'s',equipment:[{id:'a',name:'Filler <x>'}],dynamicConfig:{},results:result};
  const owner={id:'case',metadata:{realData:{records:[w.STRealData.normalize(record)]}}};w.STRealData.init({activeCase:owner},{changed(){}});w.STRealData.render(owner,sim);
  const table=w.document.querySelector('#real-data-comparison table');
  for(const cell of table.querySelectorAll('th,td')){assert(cell.title.length>30);assert.equal(cell.getAttribute('aria-description'),cell.title);assert.equal(cell.tabIndex,0);}
  const rows=[...table.tBodies[0].rows],au=rows.find(r=>r.cells[0].textContent==='AU');
  assert(au.cells[3].title.includes('100 × Effective Runtime / Plant Available Time'));
  assert(au.cells[2].title.includes('Dato real reportado'));assert(au.cells[6].title.includes('100 × 6 / 10 = 60 %'));
  assert(au.cells[4].title.includes('62.5 − 77 = -14.5 pp.'));
  assert(au.cells[5].title.includes('/ |real|'));
  assert.equal(au.cells[2].textContent,'77');assert.equal(au.cells[6].textContent,'60');
  const downtime=w.document.querySelector('#real-data-downtime-comparison tbody tr');
  assert(downtime.cells[3].title.includes('estado de falla / 60'));assert(downtime.cells[3].title.includes('no se suman como downtime único'));
  const validation=w.document.querySelectorAll('#real-data-validation tbody tr');assert([...validation].every(r=>r.cells[1].title&&r.cells[2].title));
  const data=w.STRealData.compare(record,sim,result,'average',owner,{simple:true});
  const report=new JSDOM(w.STRealData.reportHtml(data));const reportAu=[...report.window.document.querySelectorAll('tbody tr')].find(r=>r.cells[0].textContent==='AU');
  assert.equal(reportAu.cells[3].title,au.cells[3].title);assert.equal(reportAu.cells[6].title,au.cells[6].title);assert(!report.window.document.querySelector('x'));report.window.close();
 }finally{w.close();}
});
