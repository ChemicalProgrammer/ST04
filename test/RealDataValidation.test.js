import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,calibration} from './helpers/RealDataHarness.js';
test('calibration applies the agreed spreadsheet formulas without changing the simulated output',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(calibration(d,'realLoss'),10.625);assert.equal(calibration(d,'simLoss'),.99);assert(Math.abs(calibration(d,'lossDifference')-9.635)<1e-9);
 assert(Math.abs(calibration(d,'adjusted')-55.635)<1e-9);assert(Math.abs(calibration(d,'residual')-(55.635-775/1440*100))<1e-9);assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
test('net negative loss, reported Opera and stale warnings do not suppress arithmetic',()=>{
 const w=setup();try{const f=fixture();f.record.validation={rateLossBasis:'NET',reportedOeePercent:53.5};f.result.summary.lineNetRateBalanceSeconds=-.0003*86400;
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),-.03);assert(Math.abs(calibration(d,'adjusted')-54.615)<1e-9);assert(Math.abs(calibration(d,'residual')-1.115)<1e-9);
 }finally{w.close();}
});
test('only missing operands leave calibration unavailable and average compaction preserves measured counters',()=>{
 const w=setup();try{const f=fixture();f.result.batch={statistics:Object.fromEntries(Object.entries(f.result.summary).filter(([,v])=>typeof v==='number').map(([key,mean])=>[key,{mean}]))};
 let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),.99);
 delete f.result.batch.statistics.lineRateLossSeconds;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(calibration(d,'simLoss'),null);assert.equal(calibration(d,'adjusted'),null);
 }finally{w.close();}
});
