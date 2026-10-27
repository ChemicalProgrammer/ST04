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

function repaired(edit={}){const i=input({durationSeconds:40,reliabilityEnabled:true,...edit});i.case.equipment[0].noiseProfile={reliability:{mtbfMinutes:.1,mttrMinutes:2/60}};return i;}
const starts=r=>r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.reason==='REPAIR_COMPLETED');
test('every repair produces one fresh ramp without repeating initial startup delay',()=>{
 const r=run(repaired()),requests=starts(r),repairs=r.events.filter(e=>e.equipmentId==='source'&&e.type==='REPAIR_COMPLETED');
 assert.equal(requests.length,3);assert.deepEqual(requests.map(e=>e.atVirtualSecond),repairs.map(e=>e.atVirtualSecond));
 assert(requests.every(e=>e.delaySeconds===0&&e.rampUpSeconds===4));assert.equal(r.equipmentMetrics.source.repairRestartCount,3);
 assert.equal(r.equipmentMetrics.source.startRampCount,4);assert.equal(r.equipmentMetrics.source.failureSeconds,6);
 // First recovery: ramp starts at tick 5, then 25/50/75 percent. Initial two-second delay is not repeated.
 const rate=t=>r.samples.find(s=>s.virtualSecond===t+1).equipment.find(e=>e.id==='source').actualRatePerSecond;
 assert.equal(rate(5),0);assert.equal(rate(6),2.5);assert.equal(rate(7),5);assert.equal(rate(8),7.5);assert.equal(rate(9),10);
 assert.equal(r.summary.repairRestartPolicy,'PROVISIONAL_MTTR_TO_PRODUCTION_EXCLUDES_RAMP_NO_EXTRA_DELAY');
});
test('repair restart waits for manual RUN and coalesces into one zero-delay request',()=>{
 const r=run(repaired({commands:[{equipmentId:'source',atVirtualSecond:4,action:'STOP'},{equipmentId:'source',atVirtualSecond:9,action:'RUN'}]}));
 assert.equal(starts(r)[0].atVirtualSecond,9);assert.equal(starts(r)[0].delaySeconds,0);
 const requests=r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.atVirtualSecond===9);assert.equal(requests.length,1);
 assert(r.samples.filter(s=>s.virtualSecond>4&&s.virtualSecond<=9).every(s=>s.equipment.find(e=>e.id==='source').actualRatePerSecond===0));
});
test('calendar RESUME and RESTART defer repair recovery without duplicate requests',()=>{
 for(const restartPolicy of ['RESUME','RESTART']){
  const r=run(repaired({plannedStops:[{category:'breakMinutes',startSeconds:4,endSeconds:9,restartPolicy}]}));
  assert.equal(starts(r)[0].atVirtualSecond,9);assert.equal(starts(r)[0].delaySeconds,0);
  assert.equal(r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.atVirtualSecond===9).length,1);
  assert.equal(r.equipmentMetrics.source.plannedStopSeconds,5);
 }
});
test('zero ramp recovers immediately without delay or invented ramp counts',()=>{
 const i=repaired();i.case.equipment[0].processData.downstream.rampUpTimeSeconds=0;const r=run(i);
 assert(starts(r).length>0);assert(starts(r).every(e=>e.delaySeconds===0&&e.rampUpSeconds===0));assert.equal(r.equipmentMetrics.source.startRampSeconds,0);
 assert.equal(r.samples.find(s=>s.virtualSecond===6).equipment.find(e=>e.id==='source').actualRatePerSecond,10);
});
test('frequent failures replace interrupted ramps rather than stacking delays or resuming stale progress',()=>{
 const i=repaired({durationSeconds:12});i.case.equipment[0].noiseProfile.reliability.mtbfMinutes=.00001;
 const r=run(i);assert(starts(r).length>1);assert(starts(r).every(e=>e.delaySeconds===0));assert.equal(r.equipmentMetrics.source.startRampOutputUnits,0);
});
test('async, summary-only and replication views retain the repair restart policy and counts',async()=>{
 const i=repaired(),sync=run(i),asyncResult=await simulateLineAsync(i,{yieldBetweenChunks:false,summaryOnly:true});assert(asyncResult.ok);assert.deepEqual(asyncResult.result.summary,sync.summary);assert.deepEqual(asyncResult.result.equipmentMetrics,sync.equipmentMetrics);
 const response=await simulateBatch({...i,run:{...i.run,rounds:3}},{summaryOnly:true});assert(response.ok);const r=response.result,mean=r.batch.rows.reduce((n,row)=>n+row.equipmentMetrics.source.repairRestartCount,0)/3;
 assert.equal(r.batch.equipmentStatistics.source.repairRestartCount.mean,mean);assert.equal(replicationView(r).equipmentMetrics.source.repairRestartCount,mean);
});

test('repair completion before Prime authorization stays pending until the sensor allows restart',()=>{
 const i=input({durationSeconds:40,reliabilityEnabled:true,commands:[{equipmentId:'source',atVirtualSecond:10,action:'RUN'}]});i.case.equipment[0].initialMode='STOP';i.case.equipment.at(-1).noiseProfile={reliability:{mtbfMinutes:.01,mttrMinutes:2/60}};i.case.equipment.at(-1).processData.downstream={rampUpTimeSeconds:4};
 const r=run(i),prime=r.events.find(e=>e.type==='PRIME_SENSOR_TRIGGERED'),repairs=r.events.filter(e=>e.equipmentId==='sink'&&e.type==='REPAIR_COMPLETED'),requests=r.events.filter(e=>e.equipmentId==='sink'&&e.reason==='REPAIR_COMPLETED');
 assert(prime);assert(repairs.some(e=>e.atVirtualSecond<prime.atVirtualSecond));assert(requests.length);assert(requests.every(e=>e.atVirtualSecond>=prime.atVirtualSecond&&e.delaySeconds===0));
});
test('emergency latch prevents repair restart until RESET and RUN',()=>{
 const i=repaired({commands:[{equipmentId:'source',atVirtualSecond:4,action:'EMERGENCY_STOP'},{equipmentId:'source',atVirtualSecond:8,action:'RESET'},{equipmentId:'source',atVirtualSecond:10,action:'RUN'}]});
 const r=run(i);assert(starts(r).length);assert(starts(r).every(e=>e.atVirtualSecond>=10&&e.delaySeconds===0));assert(r.samples.filter(s=>s.virtualSecond>4&&s.virtualSecond<=10).every(s=>s.equipment.find(e=>e.id==='source').actualRatePerSecond===0));
});
