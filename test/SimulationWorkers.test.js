import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Worker} from 'node:worker_threads';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {createSimulationWorkerPool} from '../src/simulation/SimulationWorkers.js';
function data(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/DemoCaseFactory.gs','utf8'),ctx);return {case:JSON.parse(JSON.stringify(ctx.createDemoCaseRequest_())),run:{durationSeconds:30,tickSeconds:.25,sampleEverySeconds:1,seed:4294967294,rounds:5,commands:[]}};}
function browser({blocked=false}={}){
 const all=[],urls=new Map(),handlers={};let active=0,maxActive=0;
 class BrowserWorker{
  constructor(url){if(blocked)throw Error('Blocked by policy');const code=urls.get(url);assert(!code.includes('createSimPyBrowserEngine'),'JS workers must not load Python runtime plumbing');assert(!code.includes('planScenarios'),'JS workers need no scenario planners');this.thread=new Worker("const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=data=>parentPort.postMessage(data);parentPort.on('message',data=>self.onmessage({data}));\n"+code,{eval:true});active++;maxActive=Math.max(maxActive,active);all.push(this);this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',()=>this.onerror?.());}
  postMessage(value){this.thread.postMessage(value);}
  terminate(){if(this.dead)return;this.dead=true;active--;this.thread.terminate();}
 }
 const window={Worker:BrowserWorker,Blob:class{constructor(parts){this.code=parts.join('');}},URL:{createObjectURL(blob){const id='url-'+urls.size;urls.set(id,blob.code);return id;},revokeObjectURL(id){urls.delete(id);}},navigator:{hardwareConcurrency:8},addEventListener:(type,fn)=>handlers[type]=fn};
 const ctx=vm.createContext({window,setTimeout,clearTimeout,setInterval,clearInterval});vm.runInContext(fs.readFileSync('apps-script/SimulationEngine.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1],ctx);
 return {engine:window.SimulatorEngine,maxActive:()=>maxActive,close(){handlers.pagehide?.();all.forEach(w=>w.terminate());}};
}
const plain=value=>JSON.parse(JSON.stringify(value));
test('real worker threads preserve ordered seeds, events, statistics and metrics without later replays',async()=>{
 const h=browser();try{
  const input=data();input.run.commands=[{atVirtualSecond:5,equipmentId:input.case.equipment[0].id,action:'STOP'},{atVirtualSecond:12,equipmentId:input.case.equipment[0].id,action:'RUN'}];
  const expected=await simulateBatch(input,{laterSummaryOnly:true}),progress=[];
  const actual=await h.engine.simulateBatch(input,{progress:value=>progress.push(value)});
  for(const key of ['summary','equipmentMetrics','accumulationZoneMetrics','shifts','samples','events','batch'])assert.deepEqual(plain(actual.result[key]),plain(expected.result[key]));
  assert.equal(actual.result.batch.replays.length,0);assert.deepEqual(plain(actual.result.batch.rows.map(r=>r.seed)),[4294967294,4294967295,0,1,2]);assert(h.maxActive()>1);assert(h.maxActive()<=4);assert(progress.every((value,i)=>i===0||value>=progress[i-1]));assert.equal(progress.at(-1),1);
  const [a,b]=await Promise.all([h.engine.simulateBatch(input,{summaryOnly:true}),h.engine.simulateBatch(input,{summaryOnly:true})]);assert.deepEqual(plain(a.result.batch.statistics),plain(b.result.batch.statistics));assert(h.maxActive()<=4,'cards share the global worker limit');
 }finally{h.close();}
});
test('blocked workers fall back to sequential calculation with identical results',async()=>{
 const h=browser({blocked:true});try{const input=data(),expected=await simulateBatch(input,{laterSummaryOnly:true});const [actual,other]=await Promise.all([h.engine.simulateBatch(input),h.engine.simulateBatch(input)]);assert.equal(actual.result.inputSignature,h.engine.inputSignature(input));delete actual.result.inputSignature;delete other.result.inputSignature;assert.deepEqual(plain(actual),plain(expected));assert.deepEqual(plain(other),plain(expected));assert.equal(h.maxActive(),0);}finally{h.close();}
});
test('worker and fallback stream round-one frames before its final result without changing calculations',async()=>{
 for(const blocked of [false,true]){
  const h=browser({blocked});try{
   const input=data();input.run.durationSeconds=600;let firstReady=false;const chunks=[];
   const result=await h.engine.simulateBatch(input,{onFirstProgress:partial=>{assert(!firstReady);assert(partial.provisional);assert.equal(partial.batch,undefined);chunks.push(plain(partial));},onFirstRound:()=>firstReady=true});
   assert(chunks.length>1);assert.equal(chunks[0].calculatedThroughSeconds,0);assert.deepEqual(chunks[0].samples.map(s=>s.virtualSecond),[0]);
   const samples=chunks.flatMap(chunk=>chunk.samples);
   assert.equal(new Set(samples.map(s=>s.virtualSecond)).size,samples.length,'frames are deltas, not repeated full replays');
   const expected=await simulateBatch(input,{laterSummaryOnly:true});assert.equal(result.result.inputSignature,h.engine.inputSignature(input));delete result.result.inputSignature;assert.deepEqual(plain(result.result),plain(expected.result));
   assert.deepEqual(samples,plain(result.result.samples));
  }finally{h.close();}
 }
});
test('cancelling active worker rounds returns no partial batch and permits a new batch',async()=>{
 const h=browser();try{const input=data();input.run.durationSeconds=36000;let cancelled=false;await assert.rejects(h.engine.simulateBatch(input,{summaryOnly:true,cancelled:()=>cancelled,progress:()=>cancelled=true}),/BATCH_CANCELLED/);const next=await h.engine.simulateBatch(data(),{summaryOnly:true});assert(next.ok);assert.equal(next.result.batch.rows.length,5);}finally{h.close();}
});
test('out-of-order round completion preserves row order and propagates physical validation failures',async()=>{
 const input=data();const expected=await simulateBatch(input,{laterSummaryOnly:true});const completed=[];
 const response=await simulateBatch(input,{laterSummaryOnly:true,concurrency:4,runRound:async(input,options)=>{await new Promise(r=>setTimeout(r,input.run.seed%3*5));const response=await simulateLineAsync(input,options);completed.push(input.run.seed);return response;}});
 assert.deepEqual(response.result.batch,expected.result.batch);assert.equal(completed.length,4);
 const invalid=await simulateBatch(input,{runRound:async()=>({ok:false,error:{code:'TEST_VALIDATION'}})});assert.equal(invalid.ok,false);assert.equal(invalid.error.code,'TEST_VALIDATION');
});
test('cancelling one pool task cannot corrupt another task or accept a stale worker message',async()=>{
 const workers=[];const pool=createSimulationWorkerPool(()=>{const worker={postMessage(message){this.task=message;},terminate(){this.dead=true;}};workers.push(worker);setTimeout(()=>worker.onmessage({data:{type:'ready'}}),0);return worker;},1);
 let cancel=false;
 try{
  const first=pool.run({}, {cancelled:()=>cancel});const rejection=assert.rejects(first,/BATCH_CANCELLED/);await new Promise(r=>setTimeout(r,5));cancel=true;await rejection;
  const second=pool.run({});await new Promise(r=>setTimeout(r,5));workers[0].onmessage({data:{type:'result',id:workers[0].task.id,response:{ok:false}}});const current=workers[1];current.onmessage({data:{type:'result',id:current.task.id,response:{ok:true}}});assert.deepEqual(await second,{ok:true});
 }finally{pool.close();}
});

