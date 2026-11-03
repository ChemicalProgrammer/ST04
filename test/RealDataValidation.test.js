import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,calibration} from './helpers/RealDataHarness.js';
test('calibration applies the agreed spreadsheet formulas without changing the simulated output',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(calibration(d,'realLoss'),10.625);assert.equal(calibration(d,'simLoss'),.99);assert(Math.abs(calibration(d,'lossDifference')-9.635)<1e-9);
 assert(Math.abs(calibration(d,'adjusted')-55.635)<1e-9);assert(Math.abs(calibration(d,'residual')-(55.635-775/1440*100))<1e-9);assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
test('spreadsheet calibration uses gross loss even when the general comparison selects negative net loss',()=>{
 const w=setup();try{const f=fixture();f.record.validation={rateLossBasis:'NET',reportedOeePercent:53.5};f.result.summary.lineNetRateBalanceSeconds=-.0003*86400;
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),.99);assert(Math.abs(calibration(d,'adjusted')-55.635)<1e-9);assert(Math.abs(calibration(d,'residual')-2.135)<1e-9);assert(d.rows.find(r=>r.id==='rateLoss').simulated<0);
 }finally{w.close();}
});
test('only missing operands leave calibration unavailable and average compaction preserves measured counters',()=>{
 const w=setup();try{const f=fixture();f.result.batch={statistics:Object.fromEntries(Object.entries(f.result.summary).filter(([,v])=>typeof v==='number').map(([key,mean])=>[key,{mean}]))};
 let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),.99);
 delete f.result.batch.statistics.lineRateLossSeconds;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),null);assert.equal(calibration(d,'adjusted'),null);
 }finally{w.close();}
});
test('spreadsheet renders A–N in order and recalculates its visible cells immediately',async()=>{
 const {mount}=await import('./helpers/RealDataHarness.js');const w=setup();try{
 const f=fixture();f.record.runTimeSeconds=86400;f.record.validation.reportedOeePercent=53.8;mount(w,f);
 const table=w.document.querySelector('.real-data-calibration-table');
 assert.deepEqual([...table.tHead.rows[0].cells].map(c=>c.textContent),'ABCDEFGHIJKLMN'.split(''));
 assert.equal(table.tBodies[0].rows[0].cells.length,14);
 assert.equal(table.querySelector('[data-calibration="C"]').textContent.replaceAll(',',''),'1440');
 assert.equal(table.querySelector('[data-calibration="adjusted"]').textContent,'55.64 %');
 assert.equal(table.querySelector('[data-calibration="lossDifference"]').textContent,'9.64');
 assert.equal(table.querySelector('[data-calibration="residual"]').textContent,'1.84');
 const input=w.document.querySelector('[data-real-field="rateLossSeconds"]');input.value='144';input.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.querySelector('[data-calibration="realLoss"]').textContent,'10 %');
 assert.equal(w.document.querySelector('[data-calibration="adjusted"]').textContent,'56.26 %');
 }finally{w.close();}
});
