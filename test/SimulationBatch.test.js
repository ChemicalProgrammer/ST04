import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch,summarizeReplications} from '../src/simulation/SimulationBatch.js';
function input(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/PublicDemoCaseFactory.gs','utf8'),ctx);return {case:JSON.parse(JSON.stringify(ctx.createPublicDemoCaseRequest_())),run:{durationSeconds:600,tickSeconds:.25,sampleEverySeconds:1,seed:17,commands:[]}};}
test('async ticks and shift boundaries preserve the single-run physical result',async()=>{
 const data=input(),single=simulateLine(data);const asyncResult=await simulateLineAsync({...data,run:{...data.run,shiftSeconds:200}},{detail:true});
 assert.deepEqual(asyncResult.result.summary,single.result.summary);assert.deepEqual(asyncResult.result.equipmentMetrics,single.result.equipmentMetrics);
 assert.equal(asyncResult.result.shifts.length,3);
 for(const [shiftKey,summaryKey] of [['outputCount','outputCount'],['starvedSeconds','totalStarvedSeconds'],['failureSeconds','totalFailureSeconds']])assert(Math.abs(asyncResult.result.shifts.reduce((n,s)=>n+s[shiftKey],0)-single.result.summary[summaryKey])<.001);
});
test('batch statistics match independent seeded runs and retain bounded replays for later rounds',async()=>{
 const data=input();data.run.rounds=3;const batch=await simulateBatch(data);
 const outputs=[17,18,19].map(seed=>simulateLine({...data,run:{...data.run,seed}}).result.summary.outputCount);
 assert.deepEqual(batch.result.batch.statistics.outputCount,summarizeReplications(outputs));
 assert.deepEqual(batch.result.batch.rows.map(r=>r.seed),[17,18,19]);assert.equal(batch.result.samples.length,601);
 assert.deepEqual(batch.result.batch.replays.map(r=>r.seed),[18,19]);assert(batch.result.batch.replays.every(r=>r.samples.length<=121&&r.samples[0].virtualSecond===0&&r.samples.at(-1).virtualSecond===600));
 assert(batch.result.batch.rows.every(r=>!r.samples&&!r.events));assert.equal(batch.result.batch.equipmentStatistics[data.case.equipment[0].id].outputCount.n,3);
});
test('scheduled events affect every seed and the first replay keeps its requested frames',async()=>{
 const data=input();data.run={...data.run,rounds:2,commands:[{atVirtualSecond:0,equipmentId:data.case.equipment[0].id,action:'STOP'}]};
 const batch=await simulateBatch(data);
 assert.equal(batch.result.samples.length,601);assert.equal(batch.result.batch.replays.length,1);
 for(const row of batch.result.batch.rows)assert.equal(row.summary.outputCount,0);
 assert.equal(batch.result.batch.replays[0].samples.at(-1).outputCount,0);
});
test('batch cancellation and invalid limits never return partial success',async()=>{
 const data=input();await assert.rejects(simulateBatch({...data,run:{...data.run,rounds:101}}),/INVALID_BATCH_ROUNDS/);
 let cancel=false;await assert.rejects(simulateBatch(data,{progress:()=>{cancel=true;},cancelled:()=>cancel}),/BATCH_CANCELLED/);
 await assert.rejects(simulateLineAsync({...data,run:{...data.run,shiftSeconds:-1}}),/INVALID_SHIFT_DURATION/);
 assert.equal(summarizeReplications([2]).standardDeviation,null);
});
test('100 short replications record distinct reproducible seeds with bounded replay',async()=>{
 const data=input();data.run={...data.run,durationSeconds:2,rounds:100};const r=await simulateBatch(data);
 assert.equal(r.result.batch.rows.length,100);assert.equal(new Set(r.result.batch.rows.map(r=>r.seed)).size,100);
 assert(r.result.samples.length<=121);assert(r.result.events.length<=2000);
});
test('summary-only batches preserve every numerical output and omit replay and events',async()=>{
 const data=input();data.run={...data.run,durationSeconds:60,rounds:3};
 const full=await simulateBatch(data),compact=await simulateBatch(data,{summaryOnly:true});
 for(const key of ['summary','equipmentMetrics','accumulationZoneMetrics','shifts'])assert.deepEqual(compact.result[key],full.result[key]);
 for(const key of ['statistics','equipmentStatistics','rows'])assert.deepEqual(compact.result.batch[key],full.result.batch[key]);
 assert.equal(compact.result.samples.length,0);assert.equal(compact.result.events.length,0);assert.equal(compact.result.batch.replays.length,0);
 let cancel=false;await assert.rejects(simulateBatch(data,{summaryOnly:true,cancelled:()=>cancel,progress:()=>cancel=true}),/BATCH_CANCELLED/);
});
