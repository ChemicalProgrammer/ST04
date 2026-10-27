import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch,replicationView} from '../src/simulation/SimulationBatch.js';
function input(edit={}){
 const unit=(id,rate)=>({id,name:id,type:'CUSTOM',nominalRatePerSecond:rate,initialMode:'AUTO',processData:{}});
 const source={...unit('source',10),type:'FILLER',processData:{upstream:{startupTimeSeconds:2},downstream:{rampUpTimeSeconds:4}}};
 return {case:{id:'ramps',unitOfFlow:'bottles',equipment:[source,{...unit('belt',1000),type:'CONVEYOR',processData:{role:'CONVEYOR',accumulation:{usableLengthMm:100000,productLengthMm:1,productPitchMm:1,gapMm:0,conveyorSpeedMmPerSecond:1000000,primeSensorPositionMm:99999,backupSensorPositionMm:0,backupRestartPositionMm:100,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}},unit('sink',100)]},run:{durationSeconds:20,tickSeconds:1,sampleEverySeconds:1,seed:10,reliabilityEnabled:false,...edit}};
}
function run(i){const response=simulateLine(i);assert(response.ok,JSON.stringify(response.error));return response.result;}


function reliable(edit={}){const i=input({durationSeconds:120,reliabilityEnabled:true,...edit});i.case.equipment[0].processData={upstream:{startupTimeSeconds:0},downstream:{rampUpTimeSeconds:0}};i.case.equipment[0].noiseProfile={reliability:{mtbfMinutes:.1,mttrMinutes:2/60}};return i;}
const firstFailure=r=>r.events.find(e=>e.equipmentId==='source'&&e.type==='FAILURE_STARTED').atVirtualSecond;
test('an hour without product or Prime authorization causes zero failures and consumes zero MTBF',()=>{
 const i=reliable({durationSeconds:3600});i.case.equipment[0].initialMode='STOP';i.case.equipment.forEach(e=>e.noiseProfile={reliability:{mtbfMinutes:.1,mttrMinutes:2/60}});
 const r=run(i);assert.equal(r.summary.outputCount,0);
 for(const m of Object.values(r.equipmentMetrics)){assert.equal(m.failureCount,0);assert.equal(m.reliabilityExposureSeconds,0);assert.equal(m.reliabilityClockBasis,'POSITIVE_PROCESSED_FLOW_TICKS');}
});
test('startup delay shifts the first failure by the same duration without consuming operating time',()=>{
 const base=reliable(),delayed=structuredClone(base);delayed.case.equipment[0].processData.upstream.startupTimeSeconds=60;
 const a=run(base),b=run(delayed);assert.equal(firstFailure(b)-firstFailure(a),60);assert.equal(b.equipmentMetrics.source.stateSeconds.STARTING,60);
});
test('manual pauses and calendar stops freeze the clock without drawing a new failure interval',()=>{
 const base=reliable(),a=run(base);
 const manual=reliable({commands:[{equipmentId:'source',atVirtualSecond:1,action:'PAUSE'},{equipmentId:'source',atVirtualSecond:21,action:'RUN'}]});
 const calendar=reliable({plannedStops:[{category:'breakMinutes',startSeconds:1,endSeconds:21,restartPolicy:'RESUME'}]});
 assert.equal(firstFailure(run(manual))-firstFailure(a),20);assert.equal(firstFailure(run(calendar))-firstFailure(a),20);
});
test('productive ticks rather than equivalent output drive MTBF under partial flow and ramps',()=>{
 const i=reliable({durationSeconds:60});i.case.equipment[0].noiseProfile.reliability.mtbfMinutes=1000000;i.case.equipment[0].processData.downstream.rampUpTimeSeconds=4;i.case.equipment.at(-1).nominalRatePerSecond=5;
 const r=run(i);for(const m of Object.values(r.equipmentMetrics))assert.equal(m.reliabilityExposureSeconds,m.runningSeconds);
 assert(r.equipmentMetrics.source.startRampSeconds>0);const sink=r.equipmentMetrics.sink;assert(sink.reliabilityExposureSeconds>sink.productiveEquivalentSeconds);
});
test('complete Back-up stops do not consume exposure while response/residual productive ticks do',()=>{
 const i=reliable({durationSeconds:120});i.case.equipment[0].noiseProfile.reliability.mtbfMinutes=1000000;i.case.equipment[1].processData.accumulation={usableLengthMm:500,productLengthMm:50,productPitchMm:50,gapMm:0,conveyorSpeedMmPerSecond:500,backupSensorPositionMm:400,backupRestartPositionMm:450,primeSensorPositionMm:450,upstreamStopResponseSeconds:2,bottlesDischargedAtStop:3,downstreamRampUpSeconds:0};i.case.equipment.at(-1).initialMode='STOP';
 const r=run(i),m=r.equipmentMetrics.source;assert(m.backupStopSeconds>60);assert(m.stopTransitionSeconds>0);assert.equal(m.reliabilityExposureSeconds,m.runningSeconds);assert(m.reliabilityExposureSeconds<10);
});
test('repair duration stays fixed and only positive-flow exposure can initiate subsequent failures',()=>{
 const r=run(reliable()),failures=r.events.filter(e=>e.equipmentId==='source'&&e.type==='FAILURE_STARTED'),repairs=r.events.filter(e=>e.equipmentId==='source'&&e.type==='REPAIR_COMPLETED');
 assert(failures.length>2);for(let i=0;i<repairs.length;i++)assert.equal(repairs[i].atVirtualSecond-failures[i].atVirtualSecond,2);
 const m=r.equipmentMetrics.source;assert.equal(m.reliabilityExposureSeconds,m.runningSeconds);assert.equal(m.startRampSeconds,0);assert.equal(m.repairRestartCount,repairs.length);
 for(const f of failures){const previous=r.samples.find(s=>s.virtualSecond===f.atVirtualSecond).equipment.find(e=>e.id==='source');assert(previous.actualRatePerSecond>0);}
});
test('async, saved summaries and batch means preserve exposure; seeds remain reproducible',async()=>{
 const i=reliable(),sync=run(i),again=run(structuredClone(i));assert.deepEqual(sync,again);
 const asyncResult=await simulateLineAsync(i,{yieldBetweenChunks:false,summaryOnly:true});assert.deepEqual(asyncResult.result.summary,sync.summary);assert.deepEqual(asyncResult.result.equipmentMetrics,sync.equipmentMetrics);
 const response=await simulateBatch({...i,run:{...i.run,rounds:3}},{summaryOnly:true});assert(response.ok);const r=JSON.parse(JSON.stringify(response.result)),mean=r.batch.rows.reduce((sum,row)=>sum+row.equipmentMetrics.source.reliabilityExposureSeconds,0)/3;
 assert.equal(r.batch.equipmentStatistics.source.reliabilityExposureSeconds.mean,mean);assert.equal(replicationView(r).equipmentMetrics.source.reliabilityExposureSeconds,mean);assert.equal(replicationView(r,'2').equipmentMetrics.source.reliabilityClockBasis,'POSITIVE_PROCESSED_FLOW_TICKS');
});
