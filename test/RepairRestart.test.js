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

function repaired(edit={}){const i=input({durationSeconds:40,reliabilityEnabled:true,...edit});i.case.equipment[0].noiseProfile={reliability:{mtbfMinutes:.1,mttrMinutes:2/60}};i.case.equipment[0].processData.downstream.rampAfterRepair=true;return i;}
const starts=r=>r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.reason==='REPAIR_COMPLETED');
test('every repair produces one fresh ramp without repeating initial startup delay',()=>{
 const r=run(repaired()),requests=starts(r),repairs=r.events.filter(e=>e.equipmentId==='source'&&e.type==='REPAIR_COMPLETED');
 assert.equal(requests.length,3);assert.deepEqual(requests.map(e=>e.atVirtualSecond),repairs.map(e=>e.atVirtualSecond));
 assert(requests.every(e=>e.delaySeconds===0&&e.rampUpSeconds===4));assert.equal(r.equipmentMetrics.source.repairRestartCount,3);
 assert.equal(r.equipmentMetrics.source.startRampCount,4);assert.equal(r.equipmentMetrics.source.failureSeconds,6);
 // Recovery after four productive ticks; startup/zero-flow time no longer consumes MTBF.
 const rate=t=>r.samples.find(s=>s.virtualSecond===t+1).equipment.find(e=>e.id==='source').actualRatePerSecond;
 const recovery=requests[0].atVirtualSecond;assert.equal(rate(recovery),0);assert.equal(rate(recovery+1),2.5);assert.equal(rate(recovery+2),5);assert.equal(rate(recovery+3),7.5);assert.equal(rate(recovery+4),10);
 assert.equal(r.summary.repairRestartPolicy,'MTTR_STOP_TO_REPAIR_END_REPAIR_RAMP_OPT_IN');
});
test('repair restart waits for manual RUN and coalesces into one zero-delay request',()=>{
 const r=run(repaired({commands:[{equipmentId:'source',atVirtualSecond:8,action:'STOP'},{equipmentId:'source',atVirtualSecond:13,action:'RUN'}]}));
 assert.equal(starts(r)[0].atVirtualSecond,13);assert.equal(starts(r)[0].delaySeconds,0);
 const requests=r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.atVirtualSecond===13);assert.equal(requests.length,1);
 assert(r.samples.filter(s=>s.virtualSecond>8&&s.virtualSecond<=13).every(s=>s.equipment.find(e=>e.id==='source').actualRatePerSecond===0));
});
test('calendar RESUME and RESTART defer repair recovery without duplicate requests',()=>{
 for(const restartPolicy of ['RESUME','RESTART']){
  const r=run(repaired({plannedStops:[{category:'breakMinutes',startSeconds:8,endSeconds:13,restartPolicy}]}));
  assert.equal(starts(r)[0].atVirtualSecond,13);assert.equal(starts(r)[0].delaySeconds,0);
  assert.equal(r.events.filter(e=>e.equipmentId==='source'&&e.type==='EQUIPMENT_START_SEQUENCE_REQUESTED'&&e.atVirtualSecond===13).length,1);
  assert.equal(r.equipmentMetrics.source.plannedStopSeconds,5);
 }
});
test('zero ramp recovers immediately without delay or invented ramp counts',()=>{
 const i=repaired();i.case.equipment[0].processData.downstream.rampUpTimeSeconds=0;const r=run(i);
 assert(starts(r).length>0);assert(starts(r).every(e=>e.delaySeconds===0&&e.rampUpSeconds===0));assert.equal(r.equipmentMetrics.source.startRampSeconds,0);
 assert.equal(r.samples.find(s=>s.virtualSecond===starts(r)[0].atVirtualSecond+1).equipment.find(e=>e.id==='source').actualRatePerSecond,10);
});
test('frequent failures replace interrupted ramps rather than stacking delays or resuming stale progress',()=>{
 const i=repaired({durationSeconds:12});i.case.equipment[0].noiseProfile.reliability.mtbfMinutes=.00001;
 const r=run(i);assert(starts(r).length>1);assert(starts(r).every(e=>e.delaySeconds===0));assert(r.equipmentMetrics.source.startRampOutputUnits>0);for(const e of starts(r)){const tick=r.samples.find(s=>s.virtualSecond===e.atVirtualSecond+1);assert.equal(tick.equipment.find(x=>x.id==='source').actualRatePerSecond,0);}
});
test('async, summary-only and replication views retain the repair restart policy and counts',async()=>{
 const i=repaired(),sync=run(i),asyncResult=await simulateLineAsync(i,{yieldBetweenChunks:false,summaryOnly:true});assert(asyncResult.ok);assert.deepEqual(asyncResult.result.summary,sync.summary);assert.deepEqual(asyncResult.result.equipmentMetrics,sync.equipmentMetrics);
 const response=await simulateBatch({...i,run:{...i.run,rounds:3}},{summaryOnly:true});assert(response.ok);const r=response.result,mean=r.batch.rows.reduce((n,row)=>n+row.equipmentMetrics.source.repairRestartCount,0)/3;
 assert.equal(r.batch.equipmentStatistics.source.repairRestartCount.mean,mean);assert.equal(replicationView(r).equipmentMetrics.source.repairRestartCount,mean);
});

test('no stochastic failure or repair can occur before initial Prime authorization',()=>{
 const i=input({durationSeconds:40,reliabilityEnabled:true,commands:[{equipmentId:'source',atVirtualSecond:10,action:'RUN'}]});i.case.equipment[0].initialMode='STOP';i.case.equipment.at(-1).noiseProfile={reliability:{mtbfMinutes:.01,mttrMinutes:2/60}};i.case.equipment.at(-1).processData.downstream={rampUpTimeSeconds:4};
 const r=run(i),prime=r.events.find(e=>e.type==='PRIME_SENSOR_TRIGGERED'),repairs=r.events.filter(e=>e.equipmentId==='sink'&&e.type==='REPAIR_COMPLETED'),requests=r.events.filter(e=>e.equipmentId==='sink'&&e.reason==='REPAIR_COMPLETED');
 assert(prime);assert(repairs.every(e=>e.atVirtualSecond>prime.atVirtualSecond));assert(r.events.filter(e=>e.equipmentId==='sink'&&e.type==='FAILURE_STARTED').every(e=>e.atVirtualSecond>prime.atVirtualSecond));assert(requests.length);assert(requests.every(e=>e.atVirtualSecond>=prime.atVirtualSecond&&e.delaySeconds===0));
});
test('emergency latch prevents repair restart until RESET and RUN',()=>{
 const i=repaired({commands:[{equipmentId:'source',atVirtualSecond:4,action:'EMERGENCY_STOP'},{equipmentId:'source',atVirtualSecond:8,action:'RESET'},{equipmentId:'source',atVirtualSecond:10,action:'RUN'}]});
 const r=run(i);assert(starts(r).length);assert(starts(r).every(e=>e.atVirtualSecond>=10&&e.delaySeconds===0));assert(r.samples.filter(s=>s.virtualSecond>4&&s.virtualSecond<=10).every(s=>s.equipment.find(e=>e.id==='source').actualRatePerSecond===0));
});

test('missing and false repair-ramp settings recover at nominal speed while initial ramps remain configured',()=>{
 for(const setting of [undefined,false]){
  const i=repaired();if(setting===undefined)delete i.case.equipment[0].processData.downstream.rampAfterRepair;else i.case.equipment[0].processData.downstream.rampAfterRepair=setting;
  const r=run(i),requests=starts(r);assert(requests.length>0);assert(requests.every(e=>e.delaySeconds===0&&e.rampUpSeconds===0));
  assert.equal(r.samples.find(s=>s.virtualSecond===starts(r)[0].atVirtualSecond+1).equipment.find(e=>e.id==='source').actualRatePerSecond,10);
  assert.equal(r.equipmentMetrics.source.repairRampEnabled,false);assert.equal(r.equipmentMetrics.source.repairRestartCount,requests.length);
  assert.equal(r.events.find(e=>e.reason==='INITIAL_START').rampUpSeconds,4);
  const opt=run(repaired());assert(r.summary.outputCount>=opt.summary.outputCount);
 }
});
test('RUN after a separate manual stop still uses its configured ramp when repair ramps are off',()=>{
 const i=input({durationSeconds:20,commands:[{equipmentId:'source',atVirtualSecond:8,action:'STOP'},{equipmentId:'source',atVirtualSecond:12,action:'RUN'}]}),r=run(i),e=r.events.find(e=>e.reason==='COMMAND_RUN');
 assert.equal(e.rampUpSeconds,4);assert.equal(e.delaySeconds,2);assert.equal(r.equipmentMetrics.source.startRampCount,2);
});
test('repair-ramp flag is strictly boolean rather than treating imported strings as enabled',()=>{
 const i=repaired();i.case.equipment[0].processData.downstream.rampAfterRepair='true';const response=simulateLine(i);assert.equal(response.ok,false);assert(response.error.details.some(d=>d.path.endsWith('rampAfterRepair')));
});
