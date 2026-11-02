import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture} from './helpers/RealDataHarness.js';
test('failure minutes, shares and MTBF/MTTR theoretical percentage are distinct and totals exclude normal conveyors',()=>{
 const w=setup();try{const f=fixture(),d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;
 assert.equal(d.rows.length,2);assert.equal(d.totalReal,20);assert.equal(d.totalSim,30);assert.equal(d.delta,10);
 assert.equal(d.rows[0].realShare,75);assert(Math.abs(d.rows[0].simulatedShare-100*20/30)<1e-9);
 assert.equal(d.rows[0].unavailabilityPercent,100*5/105);assert.equal(d.rows[0].simulated,20);
 }finally{w.close();}
});
test('unknown general downtime is not silently interpreted as MTBF failure and missing real totals are honest',()=>{
 const w=setup();try{const f=fixture();f.record.equipment[0]={equipmentId:'f',stopClass:'UNKNOWN',downtimeSeconds:6000};
 let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;assert.equal(d.rows[0].real,null);assert.equal(d.totalReal,null);assert.equal(d.rows[1].realShare,null);assert.equal(d.totalSim,30);
 f.record.equipment[0].stopClass='FAILURES';d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;assert.equal(d.totalReal,105);
 f.record.equipment.forEach(r=>{r.failureSeconds=0;});f.result.equipmentMetrics.f.failureSeconds=0;f.result.equipmentMetrics.l.failureSeconds=0;
 d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;assert.equal(d.totalReal,0);assert.equal(d.totalSim,0);assert(d.rows.every(r=>r.realShare===0&&r.simulatedShare===0));
 }finally{w.close();}
});

test('failure downtime uses all rounds and selected round, with separate theoretical and observed proportions',()=>{
 const w=setup();try{
  const f=fixture();f.result.batch={representativeRound:2,rows:[{round:1,summary:f.result.summary,equipmentMetrics:f.result.equipmentMetrics},{round:2,summary:f.result.summary,equipmentMetrics:{...f.result.equipmentMetrics,f:{...f.result.equipmentMetrics.f,failureSeconds:2400}}}]};
  let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;assert.equal(d.totalSim,40);assert.equal(d.rows[0].simulatedShare,75);assert(Math.abs(d.rows[0].realUnavailabilityPercent-100*5/(6000/3/60+5))<1e-9);
  d=w.STRealData.compare(f.record,f.simulation,f.result,'2',{}).downtime;assert.equal(d.totalSim,50);
  delete f.result.batch.rows[1].equipmentMetrics.f.failureSeconds;
  d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;assert.equal(d.totalSim,null);assert.equal(d.rows[0].simulated,null);
 }finally{w.close();}
});

test('theoretical reliability uses saved simulation inputs when configuration has changed',()=>{
 const w=setup();try{
  const f=fixture(),before=JSON.stringify(f.simulation);
  f.result.inputSignature=JSON.stringify({equipment:f.simulation.equipment.map(e=>e.id==='f'?{...e,noiseProfile:{reliability:{mtbfMinutes:200,mttrMinutes:5}}}:e)});
  const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}).downtime;
  assert.equal(d.rows[0].configuredMtbf,200);assert.equal(d.rows[0].unavailabilityPercent,100*5/205);assert.equal(d.rows[0].simulated,20);assert.equal(JSON.stringify(f.simulation),before);
 }finally{w.close();}
});
