import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
function factory(){const context=vm.createContext({Utilities:{base64Decode:value=>Buffer.from(value,'base64'),newBlob:bytes=>bytes,ungzip:bytes=>({getDataAsString:()=>gunzipSync(bytes).toString('utf8')})}});for(const name of ['DemoCaseFactory.gs','DemoResults.gs','ScenarioEngine.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),context);return context;}
test('prepared demo provides measured round means and compact actual playback frames for every scenario',()=>{
 const f=factory(),record=f.createDemoCaseRequest_();
 const expected=[50.19,53.88,65.01,80.49];
 record.simulations.forEach((sim,index)=>{
  const r=sim.results;assert(r.preparedDemo);assert.equal(r.replicationStatus.state,'COMPLETE');assert.equal(r.batch.rows.length,3);assert.equal(r.batch.rounds,3);
  const mean=r.batch.rows.reduce((sum,row)=>sum+row.summary.lineOeePercent,0)/3;assert.equal(r.batch.statistics.lineOeePercent.mean,mean);assert(Math.abs(mean-expected[index])<.01);
  assert.equal(r.replay.samples.length,2);assert.equal(r.replay.samples[0].virtualSecond,0);assert.equal(r.replay.samples[1].virtualSecond,28800);
  assert(r.batch.equipmentStatistics['filler-1'].oeePercent.mean>0);assert(r.inputSignature);
 });
 assert(Buffer.byteLength(JSON.stringify(record))<3*1024*1024);
});
test('opening an unchanged demo can recover prepared results, while changed inputs and user results are preserved',()=>{
 const f=factory(),record=f.createDemoCaseRequest_();record.simulations.forEach(s=>s.results=null);
 record.simulations[1].equipment[0].nominalRatePerSecond+=.1;
 record.simulations[2].results={custom:true};f.applyPreparedDemoResults_(record);
 assert(record.simulations[0].results);assert.equal(record.simulations[1].results,null);assert(record.simulations[2].results.custom);assert(record.simulations[3].results);
});
test('saved normalized demos with empty result objects recover measured cards despite field order changes',()=>{
 const f=factory();for(const name of ['ApiResponse.gs','CaseService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),f);
 const record=f.createDemoCaseRequest_();record.simulations=f.normalizeSimulations_(record.simulations,[],{});
 record.simulations.forEach(s=>{s.results={};s.dynamicConfig.engineId='ST_CURRENT';s.equipment=s.equipment.map(unit=>Object.fromEntries(Object.entries(unit).reverse()));});
 f.applyPreparedDemoResults_(record);
 record.simulations.forEach(s=>assert(s.results.summary&&s.results.batch.statistics.lineOeePercent));
 record.simulations[1].results={};record.simulations[1].equipment[0].nominalRatePerSecond+=.1;f.applyPreparedDemoResults_(record);assert.equal(Object.keys(record.simulations[1].results).length,0);
});
test('demo RPC creates a runnable configuration when prepared results are unavailable',()=>{
 const f=vm.createContext({});for(const name of ['TextResources.gs','ApiResponse.gs','DemoCaseFactory.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),f);
 f.requireCurrentUser_=()=>({email:'owner@test'});let created;f.createCase_=request=>{created=request;return {id:request.id};};
 const response=f.createDemoCase();assert(response.ok);assert.equal(response.data.id,created.id);assert.equal(response.data.demoResultsPrepared,false);
 assert.equal(created.simulations.length,4);created.simulations.forEach(sim=>{assert.equal(sim.equipment.length,13);assert.equal(sim.results,null);});
});

test('demo RPC persists all four prepared simulations through case normalization',()=>{
 const f=factory();for(const name of ['TextResources.gs','ApiResponse.gs','CaseService.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),f);
 f.requireCurrentUser_=()=>({email:'owner@test'});
 f.LockService={getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
 f.getWorkspaceFolders_=()=>({cases:{getFilesByName:()=>({hasNext:()=>false}),getFoldersByName:()=>({hasNext:()=>false})}});
 let saved;f.persistCaseRecord_=record=>{saved=record;return {getId:()=> 'saved-demo'};};
 const response=f.createDemoCase();assert(response.ok,JSON.stringify(response));assert.equal(response.data.demoResultsPrepared,true);
 assert.equal(saved.ownerEmail,'owner@test');assert.equal(saved.simulations.length,4);
 saved.simulations.forEach(sim=>assert(sim.results.summary&&sim.results.batch.rounds===3));
});

test('prepared scenario summaries are stored, repaired and retained as history when inputs change',()=>{
 const f=factory(),record=f.createDemoCaseRequest_(),base=record.simulations[0];
 assert.equal(base.whatIf.evaluations.length,3);
 base.whatIf.evaluations.forEach((entry,index)=>{
  const sim=record.simulations[index+1];assert.equal(entry.candidate.oee,sim.results.batch.statistics.lineOeePercent.mean);
  assert.equal(entry.candidate.throughput,sim.results.batch.statistics.throughputPerMinute.mean);
  assert.equal(entry.sourceSignature,f.STScenarioEngine_.signature(base));assert.equal(entry.status,'PREPARED_DEMO');assert.equal(entry.independentCheck,undefined);
 });
 base.whatIf.evaluations=[];f.applyPreparedDemoResults_(record);assert.equal(base.whatIf.evaluations.length,3);
 record.simulations[1].equipment[0].nominalRatePerSecond+=1;f.applyPreparedDemoResults_(record);assert.equal(base.whatIf.evaluations.length,3);assert.notEqual(base.whatIf.evaluations.find(e=>e.linkedSimulationId===record.simulations[1].id).linkedSignature,f.STScenarioEngine_.signature(record.simulations[1]));
 base.equipment[0].nominalRatePerSecond+=1;f.applyPreparedDemoResults_(record);assert.equal(base.whatIf.evaluations.length,3);assert(base.whatIf.evaluations.every(e=>e.sourceSignature!==f.STScenarioEngine_.signature(base)));
});

test('saved demo labels and scenario origins migrate without changing results or IDs',()=>{
 const f=factory(),record=f.createDemoCaseRequest_(),results=record.simulations.map(s=>s.results),id=record.id;
 record.name='Public'+' demo — saved';
 record.metadata.dataClassification=['PUBLIC','DEMONSTRATION_ONLY'].join('_');
 record.engineConfig.modelMode=['PUBLIC','DEMONSTRATION_EQUIVALENT_BOTTLES'].join('_');
 record.simulations[1].scenario.origin=['PUBLIC','DEMO'].join('_');
 record.simulations[0].whatIf.evaluations.forEach(e=>e.origin=['PUBLIC','DEMO_PREPARED'].join('_'));
 f.applyPreparedDemoResults_(record);
 assert.equal(record.name,'demo — saved');assert.equal(record.metadata.dataClassification,'DEMO_ONLY');
 assert.equal(record.engineConfig.modelMode,'DEMO_EQUIVALENT_BOTTLES');assert.equal(record.simulations[1].scenario.origin,'DEMO');
 assert(record.simulations[0].whatIf.evaluations.every(e=>e.origin==='DEMO_PREPARED'));
 assert.equal(record.id,id);record.simulations.forEach((s,i)=>assert.equal(s.results,results[i]));
});

