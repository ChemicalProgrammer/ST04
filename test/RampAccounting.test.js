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
test('linear ramp accounting excludes initial delay and integrates actual native/bottle flow',()=>{
 const i=input(),before=structuredClone(i),r=run(i),m=r.equipmentMetrics.source;
 assert.equal(m.startRampSeconds,4);assert.equal(m.startRampOutputUnits,15);assert.equal(m.startRampBottleEquivalents,15);assert.equal(m.startRampCount,1);assert.equal(m.stopTransitionSeconds,0);assert.equal(m.stopTransitionBottleEquivalents,0);assert.deepEqual(i,before);
 const rampOutput=r.samples.filter(s=>s.virtualSecond>2&&s.virtualSecond<=6).reduce((n,s)=>n+s.equipment.find(e=>e.id==='source').actualRatePerSecond,0);assert.equal(rampOutput,m.startRampOutputUnits);
});
test('restarts add only the executed portion of a ramp and abrupt stops are not invented as deceleration',()=>{
 const r=run(input({durationSeconds:16,commands:[{equipmentId:'source',atVirtualSecond:8,action:'STOP'},{equipmentId:'source',atVirtualSecond:12,action:'RUN'}]})),m=r.equipmentMetrics.source;
 assert.equal(m.startRampSeconds,6);assert.equal(m.startRampOutputUnits,17.5);assert.equal(m.startRampCount,2);assert.equal(m.stopTransitionCount,0);assert.equal(m.stopTransitionSeconds,0);
});
test('failure/calendar/manual stop time is excluded; a retained ramp resumes without counting a new sequence',()=>{
 const i=input({durationSeconds:10,plannedStops:[{category:'breakMinutes',startSeconds:3,endSeconds:5,restartPolicy:'RESUME'}]}),r=run(i),m=r.equipmentMetrics.source;
 assert.equal(m.plannedStopSeconds,2);assert.equal(m.startRampSeconds,4);assert.equal(m.startRampCount,1);assert.equal(m.startRampOutputUnits,15);
 const abrupt=run(input({durationSeconds:5,commands:[{equipmentId:'source',atVirtualSecond:3,action:'EMERGENCY_STOP'}]})).equipmentMetrics.source;assert.equal(abrupt.startRampSeconds,1);assert.equal(abrupt.startRampOutputUnits,0);assert.equal(abrupt.stopTransitionSeconds,0);
});
test('Back-up stop response/residual counters integrate only observed stopping ticks and processed bottles',()=>{
 const i=input({durationSeconds:30});i.case.equipment[0].processData={};i.case.equipment[1]={id:'belt',name:'Belt',type:'CONVEYOR',nominalRatePerSecond:10,initialMode:'AUTO',processData:{role:'CONVEYOR',accumulation:{usableLengthMm:500,productLengthMm:50,productPitchMm:50,gapMm:0,conveyorSpeedMmPerSecond:500,backupSensorPositionMm:400,backupRestartPositionMm:450,primeSensorPositionMm:450,upstreamStopResponseSeconds:2,bottlesDischargedAtStop:3,downstreamRampUpSeconds:0}}};i.case.equipment.at(-1).initialMode='STOP';
 const r=run(i),m=r.equipmentMetrics.source,ticks=r.samples.filter(s=>s.virtualSecond>0).map(s=>s.equipment.find(e=>e.id==='source')).filter(e=>e.availabilityState==='BACKUP_STOPPING');
 assert(m.stopTransitionSeconds>0);assert.equal(m.stopTransitionCount,1);assert.equal(m.stopTransitionSeconds,ticks.length);assert.equal(m.stopTransitionOutputUnits,ticks.reduce((n,e)=>n+e.actualRatePerSecond,0));assert.equal(m.stopTransitionBottleEquivalents,m.stopTransitionOutputUnits);assert(m.stopTransitionSeconds<30);assert.equal(m.startRampSeconds,0);
});
test('bottle equivalents use each active format factor, including changes from 12 to 6 bottles/case',()=>{
 const i=input({durationSeconds:20,plannedStops:[{category:'changeoverMinutes',startSeconds:8,endSeconds:10,targetProductId:'b',restartPolicy:'RESTART'}]});
 i.case.equipment.forEach(e=>{e.nominalRatePerSecond=e.id==='source'?2:100;e.processData.flowUnits={input:'CASES',output:'CASES'};});i.case.equipment[0].type='CASE_PACKER';i.case.equipment[0].processData.flowUnits.input='BOTTLES';i.case.equipment[0].processData.upstream.startupTimeSeconds=0;
 i.run.productCatalog=[{id:'a',name:'12-pack',bottlesPerCase:12,bottleLengthMm:50,caseLengthMm:200,equipment:{belt:{movingGapMm:0,accumulatedGapMm:0,dischargeGapMm:0,infeedGapMm:0}}},{id:'b',name:'6-pack',bottlesPerCase:6,bottleLengthMm:50,caseLengthMm:200,equipment:{belt:{movingGapMm:0,accumulatedGapMm:0,dischargeGapMm:0,infeedGapMm:0}}}];i.run.initialProductId='a';
 const r=run(i),m=r.equipmentMetrics.source;assert.equal(m.unitOfFlow,'cases');assert.equal(m.startRampSeconds,8);assert.equal(m.startRampOutputUnits,6);assert.equal(m.startRampBottleEquivalents,54);assert.equal(m.startRampCount,2);
});
test('unknown bottle conversion stays null while native units and timing remain available',()=>{
 const i=input();i.case.unitOfFlow='units';const m=run(i).equipmentMetrics.source;assert.equal(m.startRampSeconds,4);assert.equal(m.startRampOutputUnits,15);assert.equal(m.startRampBottleEquivalents,null);assert.equal(m.stopTransitionBottleEquivalents,null);
});
test('async/summary/background batches retain counters and views average every round',async()=>{
 const i=input(),sync=run(i),asyncResult=await simulateLineAsync(i,{yieldBetweenChunks:false,summaryOnly:true});assert.deepEqual(asyncResult.result.equipmentMetrics,sync.equipmentMetrics);
 const response=await simulateBatch({...i,run:{...i.run,rounds:3}},{workerFirstRound:true,laterSummaryOnly:true,runRound:simulateLineAsync,concurrency:2});assert(response.ok);const r=response.result;assert.equal(r.batch.equipmentStatistics.source.startRampSeconds.mean,4);assert.equal(r.batch.equipmentStatistics.source.startRampBottleEquivalents.mean,15);assert.equal(replicationView(r).equipmentMetrics.source.startRampSeconds,4);assert.equal(replicationView(r,'2').equipmentMetrics.source.startRampBottleEquivalents,15);
});

test('repair intervals exclude ramp time; fresh recovery has no ramp by default',()=>{
 const i=input({durationSeconds:12,reliabilityEnabled:true});i.case.equipment[0].noiseProfile={reliability:{mtbfMinutes:.00001,mttrMinutes:.02}};
 const m=run(i).equipmentMetrics.source;assert.equal(m.failureSeconds,8);assert.equal(m.startRampSeconds,0);assert.equal(m.startRampOutputUnits,0);assert.equal(m.startRampCount,0);assert.equal(m.repairRestartCount,4);assert.equal(m.stopTransitionSeconds,0);
});
