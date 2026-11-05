import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,fixture,mount} from './helpers/RealDataHarness.js';

test('document example converts 75000 cases at 250 cases per hour to 18000 equivalent minutes',()=>{
 const w=setup();
 try{
  const record=w.STRealData.normalize({
   id:'example',name:'Ejemplo del documento',durationSeconds:31*86400,
   reportedProductionCases:75000,bottlesPerCase:12,referenceSpeedBpm:250*12/60,outputBasis:'GOOD',
   rateLossSeconds:0,downtimeSeconds:0,
   aem:{businessExternalDowntimeSeconds:0,plantDecisionDowntimeSeconds:0,scrapSeconds:0,reworkSeconds:0}
  });
  const h=w.STRealDataModel.timeHierarchy(record);
  assert.equal(h.values.effectiveProduction/60,18000);
  assert.equal(h.values.effective/60,18000);
  const comparison=w.STRealData.compare(record,null,null);
  assert.equal(comparison.rows.find(r=>r.id==='effective').real,18000);
  assert.equal(comparison.rows.find(r=>r.id==='bottles').real,900000);
 }finally{w.close();}
});

test('production is primary and balance remains a signed independent reconciliation',()=>{
 const w=setup();
 try{
  const f=fixture();
  f.record.aem.goodOutputUnits=700*220;
  const d=w.STRealData.compare(f.record,f.simulation,f.result);
  const row=id=>d.rows.find(r=>r.id===id);
  assert.equal(row('effective').real,700);
  assert.equal(row('effectiveProduction').real,700);
  assert.equal(row('effectiveBalance').real,775);
  assert.equal(row('effectiveReconciliation').real,-75);
  assert(Math.abs(row('effectiveReconciliation').simulated)<1e-8);
  const h=w.STRealDataModel.timeHierarchy(w.STRealData.normalize(f.record));
  assert.equal(h.values.effective/60,700);
  assert.equal(h.values.effectiveBalance/60,775);
  assert.equal(h.values.effectiveDifference/60,-75);
  assert(!h.warnings.some(text=>text.includes('effectiveDifference')));
 }finally{w.close();}
});

test('zero output is valid, unknown quality uses an identified fallback and zero reference cannot divide',()=>{
 const w=setup();
 try{
  const record=w.STRealData.normalize(fixture().record);
  record.aem.goodOutputUnits=0;
  assert.equal(w.STRealDataModel.timeHierarchy(record).values.effective,0);
  record.aem.goodOutputUnits=null;
  record.outputBasis='UNCONFIRMED';
  let h=w.STRealDataModel.timeHierarchy(record);
  assert.equal(h.values.effectiveProduction,null);
  assert.equal(h.values.effectiveDifference,null);
  assert.equal(h.values.effective/60,775);
  assert.equal(h.sources.effective,'Balance de tiempos provisional');
  record.outputBasis='GROSS';
  record.qualityPercent=90;
  assert.equal(w.STAemComparison.effectiveRuntimeFromProduction(record),170500*.9/220*60);
  record.referenceSpeedBpm=0;
  assert.equal(w.STAemComparison.effectiveRuntimeFromProduction(record),null);
 }finally{w.close();}
});

test('editing production, rate and losses recalculates both methods while preserving the calibration balance',()=>{
 const w=setup();
 try{
  const f=fixture(),saved=JSON.stringify(f.result);
  mount(w,f);
  const input=w.document.querySelector('[data-real-field="aem.goodOutputUnits"]');
  w.document.querySelector('[data-explorer-select="group:production"]').click();
  input.value=String(700*220);
  input.dispatchEvent(new w.Event('input'));
  w.document.querySelector('[data-explorer-select="effective"]').click();
  assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'700 min');
  assert.equal(w.document.querySelector('[data-effective-reconciliation="effectiveBalance"]').textContent,'775 min');
  assert.equal(w.document.querySelector('[data-effective-reconciliation="effectiveDifference"]').textContent,'-75 min');
  assert.equal(w.document.querySelector('[data-calibration="G"]').textContent,'775');
  const standard=w.document.querySelector('[data-real-field="referenceSpeedBpm"]');
  standard.value='200';
  standard.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'770 min');
  const loss=w.document.querySelector('[data-real-field="rateLossSeconds"]');
  loss.value='200';
  loss.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelector('[data-effective-reconciliation="effectiveBalance"]').textContent,'728 min');
  assert.equal(w.document.querySelector('[data-time-value="effective"]').textContent,'770 min');
  assert.equal(w.document.querySelector('[data-effective-reconciliation="effectiveDifference"]').textContent,'42 min');
  assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
