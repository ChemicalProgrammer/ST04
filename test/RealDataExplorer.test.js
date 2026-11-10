import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
const choose=(w,id)=>{const button=w.document.querySelector('[data-explorer-select="'+id+'"]');assert(button,id);button.click();return w.document.querySelector('[data-explorer-panel="'+id+'"]');};
const visible=w=>[...w.document.querySelectorAll('[data-explorer-panel]')].filter(p=>!p.hidden);
test('explorer shows a collapsible navigation and exactly one content panel with unique input controls',()=>{
 const w=setup();try{mount(w);assert(w.document.querySelector('nav[aria-label="Conceptos del registro"]'));assert.equal(w.document.querySelectorAll('.real-data-explorer-nav input').length,0);
 assert.equal(visible(w).length,1);assert.equal(visible(w)[0].dataset.explorerPanel,'total');assert(visible(w)[0].querySelector('[data-real-field="durationSeconds"]'));
 const panel=choose(w,'external');assert.equal(visible(w).length,1);assert.equal(visible(w)[0],panel);assert(panel.querySelector('[data-real-field="timeBreakdown.external.holidaysSeconds"]'));
 assert.equal(w.document.querySelector('[data-explorer-select="external"]').getAttribute('aria-current'),'page');
 assert.equal(w.document.querySelector('[data-explorer-folder="external"]'),null);
 const effective=choose(w,'effective');assert.equal(effective.querySelector('details'),null);assert(effective.querySelector('[data-real-field="effectiveRuntimeSeconds"]'));assert(effective.querySelector('output'));
 assert.equal(w.document.querySelector('[data-explorer-folder="effective"]'),null);
 const ids=[...w.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
 const paths=[...w.document.querySelectorAll('[data-real-field]:not([data-equipment-id])')].map(e=>e.dataset.realField);assert.equal(new Set(paths).size,paths.length);
 }finally{w.close();}
});
test('edits keep the selected concept and folder state, and switching records restores navigation and saved values',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f);const id='external',panel=choose(w,id),folder=w.document.querySelector('[data-explorer-folder="production"]');folder.open=false;
 const input=panel.querySelector('[data-real-field="timeBreakdown.external.holidaysSeconds"]');input.focus();input.value='12.5';input.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.activeElement,input);assert.equal(visible(w)[0],panel);assert.match(w.document.querySelector('[data-explorer-minutes="external"]').textContent,/12.5 min/);assert.equal(folder.open,false);assert.equal(input.value,'12.5');assert.equal(owner.metadata.realData.records[0].timeBreakdown.external.holidaysSeconds,750);
 assert.equal(w.document.querySelector('[data-time-value="plant"]').value,'1427.5');
 w.document.getElementById('real-data-new').click();assert.equal(visible(w)[0].dataset.explorerPanel,'total');
 const select=w.document.getElementById('real-data-record');select.value='real';select.dispatchEvent(new w.Event('change'));
 assert.equal(visible(w)[0].dataset.explorerPanel,id);assert.equal(visible(w)[0].querySelector('[data-real-field="timeBreakdown.external.holidaysSeconds"]').value,'12.5');assert.equal(w.document.querySelector('[data-explorer-folder="production"]').open,false);assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
test('equipment pages expose the comparison metrics, preserve historical data and never change configured reliability',()=>{
 const w=setup();try{const f=fixture();Object.assign(f.record.equipment[0],{mtbfMinutes:91,mttrMinutes:4,notes:'history'});const configuration=JSON.stringify(f.simulation.equipment),saved=JSON.stringify(f.result),{owner}=mount(w,f);
 assert(w.document.querySelector('[data-explorer-panel="unscheduledMaintenance"] [data-equipment-editor="f"]'));
 for(const e of f.simulation.equipment){const panel=choose(w,'unscheduledMaintenance').querySelector('[data-equipment-editor="'+e.id+'"]');if(e.type==='CONVEYOR'){assert.equal(panel,null);continue;}const fields=[...panel.querySelectorAll('[data-real-equipment-field]')];assert.deepEqual(fields.map(f=>f.dataset.realEquipmentField),Array.from(w.STRealDataModel.equipmentFields,f=>f.field));assert.equal(panel.querySelector('select,textarea'),null);}
 const panel=choose(w,'unscheduledMaintenance').querySelector('[data-equipment-editor="f"]'),minutes=panel.querySelector('[data-real-equipment-field="failureSeconds"]'),count=panel.querySelector('[data-real-equipment-field="failureCount"]');minutes.value='20';minutes.dispatchEvent(new w.Event('input'));count.value='4';count.dispatchEvent(new w.Event('input'));
 const r=owner.metadata.realData.records[0].equipment.find(e=>e.equipmentId==='f');assert.equal(r.failureSeconds,1200);assert.equal(r.failureCount,4);assert.equal(r.mtbfMinutes,91);assert.equal(r.mttrMinutes,4);assert.equal(r.notes,'history');assert.equal(r.operatingSeconds,6000);assert.equal(JSON.stringify(f.simulation.equipment),configuration);assert.equal(JSON.stringify(f.result),saved);
 assert.equal(w.document.querySelector('[data-time-value="unplanned"]').value,'512');
 }finally{w.close();}
});
test('legacy downtime retains its original classification in the expanded maintenance inputs',()=>{
 const w=setup();try{const f=fixture();f.record.equipment[0]={equipmentId:'f',stopClass:'FAILURES',downtimeSeconds:17*60};f.record.equipment[1]={equipmentId:'l',stopClass:'UNKNOWN',downtimeSeconds:30*60};mount(w,f);
 assert.equal(choose(w,'unscheduledMaintenance').querySelector('[data-equipment-editor="f"]').querySelector('[data-real-equipment-field="failureSeconds"]').value,'17');const unknown=choose(w,'unscheduledMaintenance').querySelector('[data-equipment-editor="l"]');assert.equal(unknown.querySelector('[data-real-equipment-field="failureSeconds"]').value,'');assert.equal(unknown.querySelector('[data-real-equipment-field="reportedDowntimeSeconds"]').value,'30');
 }finally{w.close();}
});
test('editing unplanned downtime breakdown restores calculated mode and keeps the previous manual total',()=>{
 const w=setup();try{
  mount(w);
  const panel=choose(w,'unplanned');
  const toggle=panel.querySelector('[data-time-toggle="unplanned"]');
  const input=panel.querySelector('[data-real-field="timeBreakdown.unplanned.processShortagesSeconds"]');
  assert.equal(toggle.checked,true);
  assert.equal(input.disabled,false);
  input.value='15';
  input.dispatchEvent(new w.Event('input'));
  assert.equal(toggle.checked,false);
  assert.equal(panel.querySelector('[data-time-value="unplanned"]').value,'15');
  toggle.checked=true;
  toggle.dispatchEvent(new w.Event('change'));
  assert.equal(panel.querySelector('[data-time-value="unplanned"]').value,'512');
 }finally{w.close();}
});
