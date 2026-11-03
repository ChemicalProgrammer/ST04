import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setup,fixture,mount,setUnplannedMinutes} from './helpers/RealDataHarness.js';
test('comparison and report share exact formulas and reported values without permanent explanation columns',()=>{
 const w=setup();try{const f=fixture();mount(w,f);
 const table=w.document.querySelector('#real-data-comparison table');assert.equal(table.tHead.rows[0].cells.length,5);
 const au=w.document.querySelector('[data-metric="au"]');assert(au.cells[0].title.includes('Effective Runtime / Plant Available Time'));assert(au.textContent.includes('Reportado: 53.8'));
 assert.equal(au.cells[2].getAttribute('aria-description'),au.cells[2].title);assert.equal(au.cells[2].tabIndex,0);
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}),report=new JSDOM(w.STRealData.reportHtml(d));
 assert.equal(report.window.document.querySelector('[data-metric="au"] th').title,au.cells[0].title);assert.equal(report.window.document.querySelectorAll('section').length,3);assert.equal(report.window.document.querySelectorAll('one').length,0);report.window.close();
 }finally{w.close();}
});
test('comparison groups follow the time hierarchy, remove unexplained codes and retain selection on input',()=>{
 const w=setup();try{const f=fixture();mount(w,f);
 const panel=w.document.getElementById('real-data-comparison'),groups=[...panel.querySelectorAll('article[data-comparison-group]')];
 assert.equal(groups.length,8);assert.deepEqual(groups.map(e=>e.dataset.comparisonGroup),['calendar','planned','operation','losses','production','inputs','indicators','equipment-downtime']);
 const ids=[...panel.querySelectorAll('[data-metric]')].map(e=>e.dataset.metric);assert.equal(ids.length,new Set(ids).size);
 const allText=panel.textContent+' '+[...panel.querySelectorAll('[title]')].map(e=>e.title).join(' ');assert(!/\b(?:AEM|T[1-5])\b/.test(allText));
 panel.querySelector('[data-comparison-select="operation"]').click();
 setUnplannedMinutes(w,500);
 assert.equal(panel.querySelector('[data-comparison-group="operation"]').hidden,false);assert.equal(panel.querySelector('[data-comparison-group="losses"]').hidden,true);
 assert.equal(panel.querySelector('[data-comparison-group="calendar"]').hidden,true);
 assert.equal(panel.querySelector('[data-metric="Unplanned Downtime"]').cells[2].textContent,'500');
 const result=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}),report=new JSDOM(w.STRealData.reportHtml(result));
 assert.equal(report.window.document.querySelectorAll('[data-comparison-group]').length,8);
 assert(!/\b(?:AEM|T[1-5])\b/.test([...report.window.document.querySelectorAll('[data-comparison-group]')].map(e=>e.textContent).join(' ')));report.window.close();
 }finally{w.close();}
});
