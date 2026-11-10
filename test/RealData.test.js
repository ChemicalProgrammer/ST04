import test from 'node:test';import assert from 'node:assert/strict';import {setup,fixture} from './helpers/RealDataHarness.js';
test('normalization and import retain legacy observations, quality, equipment times and provenance',()=>{
 const w=setup();try{const f=fixture();f.record.sourceSnapshot='archived source';f.record.notes='keep';f.record.equipment[0].notes='history';
 const r=w.STRealData.normalize(f.record);assert.equal(r.sourceSnapshot,'archived source');assert.equal(r.equipment[0].operatingSeconds,6000);
 for(const schema of ['st-real-data-v1','st-real-comparison-v1','st-real-comparison-v2']){
  const payload=schema==='st-real-data-v1'?{schema,records:[r]}:{schema,observation:r};
  const imported=w.STRealData.importRecords(payload);assert.equal(imported[0].notes,'keep');assert.equal(imported[0].equipment[0].notes,'history');assert.equal(imported[0].aem.goodOutputUnits,170500);
 }
 for(const edit of [{durationSeconds:-1},{production:-1},{bottlesPerCase:1.5},{qualityPercent:101}])assert.throws(()=>w.STRealData.normalize({...r,...edit}));
 }finally{w.close();}
});
test('saved engine results remain unchanged after all real calculations and report exports',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result);const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{});
 assert.equal(JSON.stringify(f.result),saved);const html=w.STRealData.reportHtml(d);assert(html.includes('<h2>Registro</h2>'));assert(html.includes('Downtime por equipo'));assert(!html.includes('4. Downtime por fallas'));assert(!html.includes('<one>'));assert(html.includes('Filler &lt;one&gt;'));
 }finally{w.close();}
});
test('template includes zero time defaults, input/output modes and unmeasured equipment fields',()=>{
 const w=setup();try{const f=fixture(),t=w.STRealData.template(f.simulation.equipment),r=t.records[0];
 assert.equal(r.equipment.length,2);assert.equal(r.aem.scrapSeconds,0);assert.equal(r.equipment[0].failureSeconds,null);assert.equal(r.equipment[0].operatingSeconds,null);
 assert.equal(w.STRealData.normalize({...r,durationSeconds:0}).durationSeconds,0);assert.equal(r.timeOverrides.external.enabled,false);
 const copy=w.STRealData.importRecords(t)[0];assert.equal(copy.equipment[1].equipmentId,'l');assert.equal(copy.equipment[1].starvedSeconds,null);assert.equal(copy.equipment[1].totalDowntimeSeconds,null);
 }finally{w.close();}
});
