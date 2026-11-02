import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture,row} from './helpers/RealDataHarness.js';
test('canonical comparison uses one effective time for AU OE RTE and keeps reported percentages separately',()=>{
 const w=setup();try{const f=fixture(),d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(row(d,'effective').real,775);assert.equal(row(d,'au').real,775/1440*100);assert.equal(row(d,'au').reported,53.8);
 assert.equal(row(d,'oe').real,775/1440*100);assert.equal(row(d,'rte').real,775/928*100);assert.equal(row(d,'updt').real,512/1440*100);
 assert.equal(new Set(d.rows.map(r=>r.id)).size,d.rows.length);assert.equal(d.rows.filter(r=>r.id==='effective').length,1);
 }finally{w.close();}
});
test('arithmetic keeps zero and missing values distinct, and warnings never hide available subtraction',()=>{
 const w=setup();try{const f=fixture();f.record.durationSeconds=43200;f.record.reportedProductionUnits=0;f.result.inputSignature='old';w.SimulatorEngine={inputSignature:()=> 'new'};
 const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{unitOfFlow:'bottles'});
 assert(d.stale);assert.equal(row(d,'bottles').real,0);assert.equal(row(d,'bottles').delta,row(d,'bottles').simulated);assert(d.warnings.some(w=>w.includes('período')));
 delete f.record.aem.scrapSeconds;delete f.record.aem.reworkSeconds;delete f.record.aem.goodOutputUnits;delete f.record.rateLossSeconds;
 const missing=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(row(missing,'rateLoss').real,null);
 }finally{w.close();}
});
test('scheduled period denominators and selected-round means use saved counters',()=>{
 const w=setup();try{const f=fixture();f.simulation.dynamicConfig.plantCalendar={enabled:true,mode:'SCHEDULED',totalMinutes:1440};f.result.plantCalendar={completePeriod:true,observedStopSeconds:120*60};
 let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert(Math.abs(row(d,'oe').simulated-65.27*1440/1320)<1e-9);
 f.simulation.dynamicConfig={};f.result.batch={representativeRound:2,rows:[{round:1,summary:{...f.result.summary,lineOeePercent:60,lineEffectiveRuntimeSeconds:86400*.6},equipmentMetrics:f.result.equipmentMetrics},{round:2,summary:{...f.result.summary,lineOeePercent:70,lineEffectiveRuntimeSeconds:86400*.7},equipmentMetrics:f.result.equipmentMetrics}]};
 d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});assert.equal(row(d,'oe').simulated,65);
 d=w.STRealData.compare(f.record,f.simulation,f.result,'2',{});assert(Math.abs(row(d,'oe').simulated-70)<1e-9);
 }finally{w.close();}
});

test('reported runtime stays visible when the AEM hierarchy calculates a different runtime',()=>{
 const w=setup();try{
  const f=fixture();f.record.runTimeSeconds=900*60;
  const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}),r=d.rows.find(r=>r.id==='Runtime AEM (T4)');
  assert.equal(r.real,928);assert.equal(r.reported,900);assert(d.warnings.some(w=>w.includes('difiere')));
  assert.equal(d.observation.runTimeSeconds,900*60);
 }finally{w.close();}
});
