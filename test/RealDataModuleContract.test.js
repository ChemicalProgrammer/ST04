import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
test('WebApp loads calculation model before controller and includes a single workspace with unique IDs',()=>{
 const app=fs.readFileSync('apps-script/WebApp.html','utf8');assert(app.indexOf("include_('AemComparison')")<app.indexOf("include_('RealDataModel')"));assert(app.indexOf("include_('RealDataModel')")<app.indexOf("include_('RealData')"));
 const w=setup();try{mount(w);const ids=[...w.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);for(const name of ['AemComparison','RealDataModel','RealData'])new Function(fs.readFileSync('apps-script/'+name+'.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));}finally{w.close();}
});
test('register creation and switching preserves observations; absent simulation still computes real values',()=>{
 const w=setup();try{const f=fixture(),{owner}=mount(w,f);w.document.getElementById('real-data-new').click();assert.equal(owner.metadata.realData.records.length,2);
 const select=w.document.getElementById('real-data-record');select.value='real';select.dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelector('[data-real-field="rateLossSeconds"]').value,'153');
 const real=w.STRealData.compare(f.record,f.simulation,null,'average',{});assert.equal(real.rows.find(r=>r.id==='effective').real,775);assert.equal(real.rows.find(r=>r.id==='au').simulated,null);assert.equal(owner.metadata.realData.records[0].name,'Día de planta');
 }finally{w.close();}
});
