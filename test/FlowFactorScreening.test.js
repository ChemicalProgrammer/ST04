import test from 'node:test';
import assert from 'node:assert/strict';
import {screenFlowFactors} from '../src/analysis/FlowFactorScreening.js';
const model={equipment:[{id:'a'},{id:'b'}]},c=(id,path,after=20)=>({equipmentId:id,path,before:10,after}),targets=[{change:c('a','speed'),priority:70},{change:c('b','sensor'),priority:60}];
function value(run,gains,overflow=0){const rows=Array.from({length:3},(_,i)=>({seed:run.seed+i,throughput:100+gains[i],oee:50+gains[i]/10}));return {throughput:rows.reduce((s,r)=>s+r.throughput,0)/3,oee:rows.reduce((s,r)=>s+r.oee,0)/3,overflowUnits:overflow,roundMetrics:rows,warnings:overflow?[{equipmentId:'LINE',rule:'SIMULATED_OVERFLOW'}]:[]};}
test('clear conditional gains use three seeds and detect pairs with no isolated benefit',async()=>{
 const fixed=[{...c('a','noiseProfile.reliability.mttrMinutes',5),analysisOnly:true}],calls=[];
 const report=await screenFlowFactors(model,{targets,fixedChanges:fixed,run:{seed:10,durationSeconds:900},measure:async(s,changes,run)=>{assert.deepEqual(changes[0],fixed[0]);calls.push(run);return value(run,Array(3).fill(changes.length===3?20:0));}});
 assert.equal(calls.length,4);assert(calls.every(r=>r.rounds===3));assert.equal(report.selectedFactors.length,2);assert(report.observations.every(o=>o.selectionReason==='Suggested through a stable pair'));
});
test('uncertain candidates add distinct seeds and reuse the extra baseline without repeating initial seeds',async()=>{
 const calls=[];const report=await screenFlowFactors(model,{targets,maximumPairs:0,run:{seed:10,durationSeconds:900},measure:async(s,changes,run)=>{calls.push({run,changes});return value(run,changes.length?(run.seed===10?[0,10,20]:[10,10,10]):[0,0,0]);}});
 assert.equal(report.selectedFactors.length,2);assert(report.observations.every(o=>o.extended&&o.paired.rounds===6));assert.equal(calls.filter(c=>!c.changes.length&&c.run.seed===13).length,1);assert.equal(calls.filter(c=>c.changes.length&&c.run.seed===10).length,2);assert.equal(calls.length,6);
});
test('baseline spill is tolerated but increasing spill cannot qualify a speed factor',async()=>{
 const report=await screenFlowFactors(model,{targets:[targets[0]],run:{seed:1},measure:async(s,changes,run)=>value(run,Array(3).fill(changes.length?20:0),changes.length?11:10)});
 assert.equal(report.selectedFactors.length,0);assert.equal(report.observations[0].reason,'ENGINEERING_REVIEW_REQUIRED');
});
test('automatic suggestions default to three factors, cap screening and disclose omitted targets',async()=>{
 const many=Array.from({length:12},(_,i)=>({change:c(i%2?'a':'b','p'+i),priority:12-i}));
 const report=await screenFlowFactors(model,{targets:many,run:{seed:1},measure:async(s,changes,run)=>value(run,Array(3).fill(changes.length*10))});
 assert.equal(report.selectedFactors.length,3);assert.equal(report.screened,8);assert.equal(report.omitted,4);assert.equal(report.pairs.length,6);assert.equal(report.pairsOmitted,22);
});
test('cancellation cannot return partial suggestions',async()=>{
 let calls=0;await assert.rejects(()=>screenFlowFactors(model,{targets,run:{seed:1},cancelled:()=>calls>1,measure:async(s,changes,run)=>{calls++;return value(run,[10,10,10]);}}),/BATCH_CANCELLED/);
});

test('bounded shortlist covers conveyor speeds and sensors before repeated high-priority Prime reserves',async()=>{
 const diverse=[...Array.from({length:8},(_,i)=>({change:c('a'+i,'processData.geometry.lpPrimeMm'),priority:100-i})),{change:c('b','processData.accumulation.conveyorSpeedMmPerSecond'),priority:5},{change:c('b','processData.accumulation.backupSensorPositionMm'),priority:4},{change:c('b','processData.geometry.lactMm'),priority:3}];
 const report=await screenFlowFactors(model,{targets:diverse,maximumPairs:0,run:{seed:1},measure:async(s,changes,run)=>value(run,[0,0,0])});
 assert.equal(report.screened,8);assert(report.observations.some(o=>o.path.endsWith('conveyorSpeedMmPerSecond')));assert(report.observations.some(o=>o.path.endsWith('backupSensorPositionMm')));assert(report.observations.some(o=>o.path.endsWith('lactMm')));
});
