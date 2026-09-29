import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateLine } from '../src/simulation/LineSimulationEngine.js';

function run(sourceRate, sinkRate) {
  const response = simulateLine({case:{id:'accounting',unitOfFlow:'bottles',equipment:[
    {id:'source',name:'Source',type:'FILLER',nominalRatePerSecond:sourceRate,initialMode:'AUTO'},
    {id:'belt',name:'Belt',type:'CONVEYOR',nominalRatePerSecond:10,initialMode:'AUTO',processData:{accumulation:{usableLengthMm:1000,productLengthMm:10,gapMm:0,primeSensorPositionMm:900,backupSensorPositionMm:0,conveyorSpeedMmPerSecond:1000,backupRestartPositionMm:0,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}},
    {id:'sink',name:'Sink',type:'PACKER',nominalRatePerSecond:sinkRate,initialMode:'AUTO'}
  ]},run:{durationSeconds:100,tickSeconds:1,sampleEverySeconds:1,seed:1}});
  return response;
}

test('partial input loss does not count flowing ticks as STARVED',()=>{
  const {ok,result}=run(5,10); assert.equal(ok,true);
  const m=result.equipmentMetrics.sink;
  assert.ok(m.partialStarvationLossSeconds>0);
  assert.equal(m.runningSeconds+m.starvedSeconds+m.blockedSeconds+m.waitingForPrimeSeconds+m.backupStopSeconds,100);
  assert.equal(result.samples.at(-1).equipment.at(-1).availabilityState,'RUNNING');
  assert.equal(result.summary.totalPartialStarvationLossSeconds,
    Object.values(result.equipmentMetrics).reduce((n,m)=>n+m.partialStarvationLossSeconds,0));
});

test('partial downstream loss is reported independently of BLOCKED state time',()=>{
  const {ok,result}=run(10,5); assert.equal(ok,true);
  const metrics=Object.values(result.equipmentMetrics);
  assert.ok(metrics.some(m=>m.partialBlockingLossSeconds>0));
  for(const m of metrics) assert.equal(m.runningSeconds+m.starvedSeconds+m.blockedSeconds+m.waitingForPrimeSeconds+m.backupStopSeconds,100);
});

test('conveyor transfer is derived from physical speed and pitch',()=>{
  const {result}=run(200,200);
  const belt=result.equipmentMetrics.belt;
  assert.ok(belt.outputCount>1000,'legacy nominal conveyor rate must not cap the physical belt');
  assert.ok(belt.outputCount<=100*100,'physical speed / pitch caps transfer');
  assert.equal(result.samples.at(-1).accumulationZones[0].geometry.transferCapacityPerSecond,100);
});
