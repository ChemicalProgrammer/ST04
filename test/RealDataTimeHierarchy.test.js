import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
const clean=v=>JSON.parse(JSON.stringify(v));
function change(w,path,value){const input=w.document.querySelector('[data-real-field="'+path+'"]');assert(input,path);const panel=input.closest('[data-explorer-panel]');if(panel)w.document.querySelector('[data-explorer-select="'+panel.dataset.explorerPanel+'"]').click();input.focus();input.value=value;input.dispatchEvent(new w.Event('input'));return input;}
function toggle(w,id,checked){const e=w.document.querySelector('[data-time-toggle="'+id+'"]');w.document.querySelector('[data-explorer-select="'+id+'"]').click();e.checked=checked;e.dispatchEvent(new w.Event('change'));return e;}
const numeric=(w,id)=>Number(w.document.querySelector('[data-time-value="'+id+'"]').value);
test('missing leaves remain blank while the general tree balance and focus stay intact',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f),node=id=>w.document.querySelector('[data-time-node="'+id+'"]');
 const children=id=>[...w.document.querySelector('[data-explorer-folder="'+id+'"]').querySelectorAll(':scope > .real-data-explorer-children > .real-data-explorer-entry > summary > button, :scope > .real-data-explorer-children > .real-data-explorer-entry > button')].map(e=>e.dataset.explorerSelect);
 assert.deepEqual(children('total'),['external','plant']);assert.deepEqual(children('plant'),['decision','production']);assert.deepEqual(children('production'),['unplanned','runtime']);assert.deepEqual(children('runtime'),['losses','effective']);
 assert(!w.document.getElementById('real-data-editor').textContent.includes('Sin pérdidas: completar con 0'));
 const blank=w.document.querySelector('[data-real-field="timeBreakdown.external.holidaysSeconds"]');assert.equal(blank.value,'');assert.equal(blank.placeholder,'0');
 const folder=w.document.querySelector('[data-explorer-folder="production"]');folder.open=false;const input=change(w,'timeBreakdown.external.productionDayLossesSeconds','82');
 assert.equal(numeric(w,'external'),82);assert.equal(numeric(w,'plant'),1358);assert.equal(folder.open,false);assert.equal(w.document.activeElement,input);
 change(w,'timeBreakdown.external.productionDayLossesSeconds','');assert.equal(numeric(w,'external'),0);assert.equal(numeric(w,'plant'),1440);assert.equal(owner.metadata.realData.records[0].timeBreakdown.external.productionDayLossesSeconds,null);
 assert.equal(JSON.stringify(f.result),saved);
 const sample=w.STRealData.template(f.simulation.equipment).records[0];assert.equal(sample.timeBreakdown.unplanned.unscheduledMaintenanceSeconds,0);assert.equal(sample.rateLossSeconds,0);
 }finally{w.close();}
});
test('checkbox switches input/output, preserves manual value and breakdown and prevents double counting',()=>{
 const w=setup();try{const f=fixture(),{owner}=mount(w,f);change(w,'timeBreakdown.external.productionDayLossesSeconds','10');
 const output=w.document.querySelector('[data-time-value="external"]');assert.equal(output.readOnly,true);assert.equal(output.value,'10');
 toggle(w,'external',true);assert.equal(output.readOnly,false);assert.equal(output.value,'');
 change(w,'timeOverrides.external.valueSeconds','25');assert.equal(numeric(w,'external'),25);assert.equal(numeric(w,'plant'),1415);
 assert.equal(w.document.querySelector('[data-real-field="timeBreakdown.external.productionDayLossesSeconds"]').disabled,true);
 toggle(w,'external',false);assert.equal(output.value,'10');assert.equal(output.readOnly,true);assert.equal(numeric(w,'plant'),1430);
 toggle(w,'external',true);assert.equal(output.value,'25');change(w,'timeOverrides.external.valueSeconds','');assert.equal(numeric(w,'external'),0);
 const r=owner.metadata.realData.records[0];assert.equal(r.timeBreakdown.external.productionDayLossesSeconds,600);assert.equal(r.timeOverrides.external.valueSeconds,null);
 const restored=w.STRealData.normalize(clean(r));assert.equal(w.STRealDataModel.timeHierarchy(restored).values.external,0);
 const imported=w.STRealData.importRecords({schema:'st-real-data-v1',records:[clean(r)]});assert.equal(imported[0].timeOverrides.external.enabled,true);
 }finally{w.close();}
});
test('legacy totals start as manual inputs and all manual time sections propagate into their dependent balances',()=>{
 const w=setup();try{const f=fixture(),{owner}=mount(w,f);assert.equal(w.document.querySelector('[data-time-toggle="unplanned"]').checked,true);assert.equal(numeric(w,'unplanned'),512);
 toggle(w,'plant',true);change(w,'timeOverrides.plant.valueSeconds','1300');assert.equal(numeric(w,'production'),1300);assert.equal(numeric(w,'runtime'),788);
 let d=w.STRealData.compare(owner.metadata.realData.records[0],f.simulation,f.result,'average',{});assert.equal(d.rows.find(r=>r.id==='Plant Available Time (T2)').real,1300);assert.equal(d.rows.find(r=>r.id==='Plant Available Time (T2)').realSource,'capturado manualmente');
 toggle(w,'runtime',true);change(w,'timeOverrides.runtime.valueSeconds','600');d=w.STRealData.compare(owner.metadata.realData.records[0],f.simulation,f.result,'average',{});assert.equal(d.rows.find(r=>r.id==='Runtime AEM (T4)').real,600);assert(d.warnings.some(v=>v.includes('Runtime')&&v.includes('balance')));
 toggle(w,'losses',true);change(w,'timeOverrides.losses.valueSeconds','200');assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'400 min');
 assert.equal(owner.metadata.realData.records[0].downtimeSeconds,512*60);
 const withoutOutput=clean(owner.metadata.realData.records[0]);withoutOutput.aem.goodOutputUnits=null;const fromManualLoss=w.STRealData.compare(withoutOutput,f.simulation,f.result,'average',{});assert.equal(fromManualLoss.rows.find(r=>r.id==='effective').real,null);
 const report=new JSDOM(w.STRealData.reportHtml(d));assert(report.window.document.body.textContent.includes('1300')||report.window.document.body.textContent.includes('1,300'));report.window.close();
 }finally{w.close();}
});
test('registration frames sections, omits main notes and nests equipment under unscheduled maintenance without summing failures into line stops',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f),editor=w.document.getElementById('real-data-editor');
 const equipment=editor.querySelector('[data-real-equipment-field="failureSeconds"]');assert(editor.querySelector('[data-explorer-panel="unscheduledMaintenance"] [data-equipment-editor="f"]'));assert(editor.querySelector('[data-explorer-folder="unplanned"] [data-explorer-select="unscheduledMaintenance"]'));
 for(const text of ['Producción y calidad','Indicadores reportados'])assert([...editor.querySelectorAll('.real-data-explorer-link')].some(e=>e.textContent===text));
 assert.equal(editor.querySelector('[data-real-field="notes"]:not([data-equipment-id])'),null);
 const effective=editor.querySelector('[data-time-node="effective"]');assert.equal(effective.tagName,'ARTICLE');assert.equal(effective.querySelector('summary'),null);assert(effective.querySelector('[data-real-field="effectiveRuntimeSeconds"]'));
 const paths=[...editor.querySelectorAll('[data-real-field]:not([data-equipment-id])')].map(e=>e.dataset.realField);assert.equal(new Set(paths).size,paths.length);
 equipment.value='100';equipment.dispatchEvent(new w.Event('input'));assert.equal(numeric(w,'unplanned'),512);assert.equal(owner.metadata.realData.records[0].equipment[0].failureSeconds,6000);assert.equal(JSON.stringify(f.result),saved);
 const css=fs.readFileSync('apps-script/RealDataStyles.html','utf8');assert(css.includes('.real-data-explorer { display:grid'));assert(css.includes('.real-data-explorer-panel { border:'));
 }finally{w.close();}
});
test('hierarchy reports negative balances and uses legacy quality quantities while empty quality counts as zero',()=>{
 const w=setup();try{const r=w.STRealData.normalize(fixture().record);r.timeBreakdown.unplanned.enabled=true;r.timeOverrides.unplanned={enabled:false,valueSeconds:512*60};r.timeBreakdown.unplanned.unscheduledMaintenanceSeconds=1500*60;
 let h=w.STRealDataModel.timeHierarchy(r);assert.equal(h.values.runtime,-60*60);assert(h.warnings.some(v=>v.includes('Runtime')));
 r.aem.scrapSeconds=null;r.aem.scrapUnits=220;r.aem.reworkSeconds=null;r.aem.reworkUnits=null;h=w.STRealDataModel.timeHierarchy(r);assert.equal(h.values.scrap,60);assert.equal(h.values.rework,0);assert.equal(h.values.losses,154*60);
 const old=w.STRealData.normalize(fixture().record);const before=JSON.stringify(old);assert.equal(w.STRealDataModel.timeHierarchy(old).values.effective,775*60);assert.equal(JSON.stringify(old),before);
 }finally{w.close();}
});
