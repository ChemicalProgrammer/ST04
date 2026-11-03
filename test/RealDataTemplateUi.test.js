import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
test('the workspace captures all inputs once and recalculates on input without moving focus',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f);
 assert.equal(w.document.querySelectorAll('.real-data-block').length,3);assert.equal(w.document.querySelectorAll('#real-data-validation,#real-data-aem-comparison').length,0);
 const inputs=[...w.document.querySelectorAll('#real-data-editor [data-real-field]')].filter(e=>!e.dataset.equipmentId);
 assert.equal(new Set(inputs.map(e=>e.dataset.realField)).size,inputs.length);
 for(const key of ['aem.goodOutputUnits','aem.scrapSeconds','aem.reworkSeconds','referenceSpeedBpm','validation.reportedOeePercent'])assert(inputs.some(e=>e.dataset.realField===key));
 w.document.querySelector('[data-explorer-select="losses"]').click();const input=w.document.querySelector('[data-real-field="rateLossSeconds"]');input.focus();input.value='200.5';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(w.document.activeElement,input);assert.equal(input.value,'200.5');assert.equal(owner.metadata.realData.records[0].rateLossSeconds,200.5*60);
 const adjusted=w.document.querySelector('td[data-calibration="adjusted"]');assert(adjusted.textContent!=='—');assert.equal(JSON.stringify(f.result),saved);
 const known=w.document.getElementById('real-data-known-only'),before=w.document.querySelectorAll('#real-data-comparison tr[data-metric]').length;known.checked=false;known.dispatchEvent(new w.Event('change'));assert(w.document.querySelectorAll('#real-data-comparison tr[data-metric]').length>=before);
 }finally{w.close();}
});
test('failure inputs persist separately from general downtime and existing UNKNOWN records keep their classification',()=>{
 const w=setup();try{const f=fixture();f.record.equipment[0]={equipmentId:'f',stopClass:'UNKNOWN',downtimeSeconds:500*60};const {owner}=mount(w,f);
 assert.equal(w.document.querySelector('[data-real-equipment-field="downtimeSeconds"][data-equipment-id="f"]'),null);w.document.querySelector('[data-explorer-select="unscheduledMaintenance"]').click();
 const own=w.document.querySelector('[data-real-equipment-field="failureSeconds"][data-equipment-id="f"]');own.focus();own.value='15';own.dispatchEvent(new w.Event('input'));
 const r=owner.metadata.realData.records[0].equipment[0];assert.equal(r.failureSeconds,900);assert.equal(r.downtimeSeconds,30000);assert.equal(r.stopClass,'UNKNOWN');assert.equal(w.document.activeElement,own);
 assert.equal(w.document.getElementById('real-data-review'),null);
 assert.equal(w.document.getElementById('real-data-downtime-comparison'),null);
 w.document.querySelector('[data-comparison-select="equipment-downtime"]').click();
 const comparison=w.document.querySelector('[data-comparison-group="equipment-downtime"]');
 assert.equal(comparison.hidden,false);
 assert.deepEqual([...comparison.querySelectorAll('thead th')].map(cell=>cell.textContent),['Equipo','Real (min)','Simulado (min)','Real (%)','Simulado (%)']);
 assert(comparison.textContent.includes('Total de equipos'));
 }finally{w.close();}
});
