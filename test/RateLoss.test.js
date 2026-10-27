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

test('Rate Loss integrates final-output runtime and equivalent output without adding upstream ramp durations',()=>{
 const i=input();i.case.equipment.at(-1).nominalRatePerSecond=5;
 const r=run(i),s=r.summary;
 assert.equal(s.lineRunSeconds,r.equipmentMetrics.sink.runningSeconds);
 assert.equal(s.lineEffectiveRuntimeSeconds,s.outputCount/10);
 assert.equal(s.lineRateLossSeconds,s.lineRunSeconds-s.lineEffectiveRuntimeSeconds);
 assert(s.lineRateLossSeconds>0);
 const edited=structuredClone(i);edited.case.metadata={realData:{rateLossSeconds:9999}};
 assert.deepEqual(run(edited).summary,s);
});
test('full stops are excluded from runtime; zero production is not all Rate Loss',()=>{
 const i=input();i.case.equipment.at(-1).initialMode='STOP';
 const s=run(i).summary;assert.equal(s.lineRunSeconds,0);assert.equal(s.lineRateLossSeconds,0);assert.equal(s.lineEffectiveRuntimeSeconds,0);
});
test('each format uses its own reference rather than the full-period weighted OEE reference',()=>{
 const i=input({durationSeconds:30,plannedStops:[{category:'changeoverMinutes',startSeconds:10,endSeconds:12,targetProductId:'b',restartPolicy:'RESTART'}]});
 i.case.equipment.forEach(e=>{e.processData.flowUnits={input:'BOTTLES',output:'BOTTLES'};});
 i.run.productCatalog=[{id:'a',name:'A',bottlesPerCase:12,bottleLengthMm:50,caseLengthMm:200,equipment:{belt:{movingGapMm:0,accumulatedGapMm:0,dischargeGapMm:0,infeedGapMm:0},source:{ratePerMinute:600},sink:{ratePerMinute:240}}},{id:'b',name:'B',bottlesPerCase:6,bottleLengthMm:50,caseLengthMm:200,equipment:{belt:{movingGapMm:0,accumulatedGapMm:0,dischargeGapMm:0,infeedGapMm:0},source:{ratePerMinute:300},sink:{ratePerMinute:120}}}];i.run.initialProductId='a';
 const r=run(i),expected=r.products.rows.reduce((sum,p)=>sum+p.outputBottleEquivalents/(p.idealBottleOutput/p.durationSeconds),0);
 assert(Math.abs(r.summary.lineEffectiveRuntimeSeconds-expected)<0.00001);
 assert(Math.abs(r.summary.lineRateLossSeconds-(r.summary.lineRunSeconds-expected))<0.00001);
});
test('replications persist measured loss and means never turn incomplete measurements into zero',async()=>{
 const i=input();i.case.equipment.at(-1).nominalRatePerSecond=5;
 const response=await simulateBatch({...i,run:{...i.run,rounds:3}},{summaryOnly:true});assert(response.ok);
 const r=response.result,values=r.batch.rows.map(r=>r.summary.lineRateLossSeconds);
 assert.equal(r.batch.statistics.lineRateLossSeconds.mean,values.reduce((a,b)=>a+b)/3);
 assert.equal(replicationView(r).summary.lineRateLossSeconds,values.reduce((a,b)=>a+b)/3);
 assert.equal(replicationView(r,'2').summary.lineRateLossSeconds,values[1]);
 r.batch.rows[1].summary.lineRateLossSeconds=null;assert.equal(replicationView(r).summary.lineRateLossSeconds,null);
});
