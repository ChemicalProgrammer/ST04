import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
test('comparison and report share exact formulas and reported values without permanent explanation columns',()=>{
 const w=setup();try{const f=fixture();mount(w,f);
 const table=w.document.querySelector('#real-data-comparison table');assert.equal(table.tHead.rows[0].cells.length,5);
 const au=w.document.querySelector('[data-metric="au"]');assert(au.cells[0].title.includes('Effective Runtime / Plant Available Time'));assert(au.textContent.includes('Reportado: 53.8'));
 assert.equal(au.cells[2].getAttribute('aria-description'),au.cells[2].title);assert.equal(au.cells[2].tabIndex,0);
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}),report=new JSDOM(w.STRealData.reportHtml(d));
 assert.equal(report.window.document.querySelector('[data-metric="au"] th').title,au.cells[0].title);assert.equal(report.window.document.querySelectorAll('section').length,4);assert.equal(report.window.document.querySelectorAll('one').length,0);report.window.close();
 }finally{w.close();}
});
