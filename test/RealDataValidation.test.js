import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,calibration,setUnplannedMinutes} from './helpers/RealDataHarness.js';
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
 const f=fixture();f.record.runTimeSeconds=928*60;f.record.validation.reportedOeePercent=53.8;mount(w,f);
 const table=w.document.querySelector('.real-data-calibration-table');
 assert.equal(table.tHead.rows.length,1);assert.equal(table.tHead.rows[0].cells.length,14);assert.equal(table.querySelectorAll('.real-data-sheet-letters,.real-data-calibration-highlight').length,0);
 assert.equal(table.tBodies[0].rows[0].cells.length,14);
 assert.equal(table.querySelector('[data-calibration="C"]').textContent.replaceAll(',',''),'928');
 assert.equal(table.querySelector('[data-calibration="adjusted"]').textContent,'55.64 %');
 assert.equal(table.querySelector('[data-calibration="lossDifference"]').textContent,'9.64');
 assert.equal(table.querySelector('[data-calibration="residual"]').textContent,'1.84');
 const input=w.document.querySelector('[data-real-field="rateLossSeconds"]');input.value='144';input.dispatchEvent(new w.Event('input'));
 assert.equal(w.document.querySelector('[data-calibration="realLoss"]').textContent,'10 %');
 assert.equal(w.document.querySelector('[data-calibration="adjusted"]').textContent,'56.26 %');
 }finally{w.close();}
});

test('only calibration uses available minus unplanned downtime minus rate loss, updating on input',async()=>{
 const {mount}=await import('./helpers/RealDataHarness.js');const w=setup();try{
 const f=fixture();f.record.runTimeSeconds=900*60;f.record.effectiveRuntimeSeconds=622*60;
 f.record.aem.scrapSeconds=20*60;f.record.aem.reworkSeconds=10*60;
 const saved=JSON.stringify(f.result);mount(w,f);
 const cell=id=>w.document.querySelector('[data-calibration="'+id+'"]');
 assert.equal(cell('G').textContent,'775');
 assert.equal(w.document.querySelector('[data-real-field="runTimeSeconds"]'),null);assert.equal(cell('C').textContent,'900');assert.equal(cell('G').textContent,'775');
 setUnplannedMinutes(w,500);
 assert.equal(cell('G').textContent,'787');
 const loss=w.document.querySelector('[data-real-field="rateLossSeconds"]');loss.value='150';loss.dispatchEvent(new w.Event('input'));
 assert.equal(cell('G').textContent,'790');assert.equal(JSON.stringify(f.result),saved);
 setUnplannedMinutes(w,null);assert.equal(cell('G').textContent.replaceAll(',',''),'1290');
 }finally{w.close();}
});
test('calibration formula does not overwrite the general AEM effective time',()=>{
 const w=setup();try{const f=fixture();f.record.effectiveRuntimeSeconds=622*60;f.record.runTimeSeconds=900*60;
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(d.calibration.columns.find(c=>c.letter==='G').value,775);
 assert.equal(d.rows.find(r=>r.id==='effective').real,775);
 f.record.aem.goodOutputUnits=220*600;
 const changed=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(changed.rows.find(r=>r.id==='effective').real,600);
 assert.equal(changed.calibration.columns.find(c=>c.letter==='G').value,775);
 }finally{w.close();}
});
