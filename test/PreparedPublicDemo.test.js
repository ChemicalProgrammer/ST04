import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
function factory(){const context=vm.createContext({Utilities:{base64Decode:value=>Buffer.from(value,'base64'),newBlob:bytes=>bytes,ungzip:bytes=>({getDataAsString:()=>gunzipSync(bytes).toString('utf8')})}});for(const name of ['PublicDemoCaseFactory.gs','PublicDemoResults.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),context);return context;}
test('prepared demo provides measured round means and compact actual playback frames for every scenario',()=>{
 const f=factory(),record=f.createPublicDemoCaseRequest_();
 const expected=[30.12,51.66,59.35,80.03];
 record.simulations.forEach((sim,index)=>{
  const r=sim.results;assert(r.preparedDemo);assert.equal(r.replicationStatus.state,'COMPLETE');assert.equal(r.batch.rows.length,3);assert.equal(r.batch.rounds,3);
  const mean=r.batch.rows.reduce((sum,row)=>sum+row.summary.lineOeePercent,0)/3;assert.equal(r.batch.statistics.lineOeePercent.mean,mean);assert(Math.abs(mean-expected[index])<.01);
  assert.equal(r.replay.samples.length,2);assert.equal(r.replay.samples[0].virtualSecond,0);assert.equal(r.replay.samples[1].virtualSecond,28800);
  assert(r.batch.equipmentStatistics['filler-1'].oeePercent.mean>0);assert(r.inputSignature);
 });
 assert(Buffer.byteLength(JSON.stringify(record))<3*1024*1024);
});
test('opening an unchanged demo can recover prepared results, while changed inputs and user results are preserved',()=>{
 const f=factory(),record=f.createPublicDemoCaseRequest_();record.simulations.forEach(s=>s.results=null);
 record.simulations[1].equipment[0].nominalRatePerSecond+=.1;
 record.simulations[2].results={custom:true};f.applyPreparedPublicDemoResults_(record);
 assert(record.simulations[0].results);assert.equal(record.simulations[1].results,null);assert(record.simulations[2].results.custom);assert(record.simulations[3].results);
});
