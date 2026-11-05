import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,fixture,mount} from './helpers/RealDataHarness.js';

test('tree uses subtraction while comparison requires reported Effective Runtime',()=>{
 const w=setup();try{
  const f=fixture();f.record.reportedEfficiencyPercent=null;f.record.aem.goodOutputUnits=700*220;
  assert.equal(w.STRealDataModel.timeHierarchy(w.STRealData.normalize(f.record)).values.effective/60,775);
  let d=w.STRealData.compare(f.record,f.simulation,f.result);
  assert.equal(d.rows.find(r=>r.id==='effective').real,null);
  assert.equal(d.rows.find(r=>r.id==='au').real,null);
  assert(!d.rows.some(r=>['effectiveProduction','effectiveBalance','effectiveReconciliation'].includes(r.id)));
  f.record.effectiveRuntimeSeconds=600*60;
  d=w.STRealData.compare(f.record,f.simulation,f.result);
  assert.equal(d.rows.find(r=>r.id==='effective').real,600);
  assert.equal(d.rows.find(r=>r.id==='effective').realSource,'reportado');
  assert(Math.abs(d.rows.find(r=>r.id==='au').real-600/1440*100)<1e-10);
  f.record.effectiveRuntimeSeconds=0;
  assert.equal(w.STRealData.compare(f.record,f.simulation,f.result).rows.find(r=>r.id==='effective').real,0);
 }finally{w.close();}
});

test('reported input updates comparison immediately, persists once and leaves balance and simulation independent',()=>{
 const w=setup();try{
  const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f);
  w.document.querySelector('[data-explorer-select="effective"]').click();
  const input=w.document.querySelector('[data-real-field="effectiveRuntimeSeconds"]');
  assert.equal(w.document.querySelectorAll('[data-real-field="effectiveRuntimeSeconds"]').length,1);
  assert(!w.document.querySelector('[data-effective-reconciliation]'));
  assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'775 min');
  input.value='600';input.dispatchEvent(new w.Event('input'));
  assert.equal(owner.metadata.realData.records[0].effectiveRuntimeSeconds,600*60);
  const effective=()=>w.STRealData.compare(owner.metadata.realData.records[0],f.simulation,f.result).rows.find(r=>r.id==='effective');
  assert.equal(effective().real,600);
  const loss=w.document.querySelector('[data-real-field="rateLossSeconds"]');loss.value='200';loss.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'728 min');
  assert.equal(effective().real,600);
  assert.equal(w.document.querySelector('[data-calibration="G"]').textContent,'728');
  input.value='';input.dispatchEvent(new w.Event('input'));assert.equal(effective().real,null);
  assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
