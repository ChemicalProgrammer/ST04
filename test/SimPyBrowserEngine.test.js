import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {adaptSimPyInput,normalizeSimPyResult,createSimPyBrowserEngine,compactSimPyResponse,SIMPY_ENGINE_ID} from '../src/simulation/SimPyBrowserEngine.js';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/simpy-pipeline.json',import.meta.url)));

test('SimPy adapter resolves ST geometry without mutating the case and maps spatial sensor physics',()=>{
 const input=fixture(),before=JSON.stringify(input),payload=adaptSimPyInput(input);
 assert.equal(JSON.stringify(input),before);assert.equal(payload.machines.length,2);assert.equal(payload.conveyors.length,1);
 assert.equal(payload.metadata.stochasticSchedulesPaired,false);assert.equal(payload.metadata.conveyorModel,'SPATIAL_FINITE_PRODUCTS');assert.deepEqual(payload.metadata.ignoredFeatures,[]);assert(payload.conveyors[0].primeSensorPositionMm>=0);assert(payload.conveyors[0].backupSensorPositionMm>=0);
 assert(payload.conveyors[0].speedMmPerSecond>0);assert(payload.conveyors[0].accumulatedPitchMm<=payload.conveyors[0].movingPitchMm);
});
test('SimPy rejects unsupported topology and noise while supporting conveyor controls rather than silently changing engines',()=>{
 const input=fixture();input.case.equipment.pop();assert.throws(()=>adaptSimPyInput(input),/alternating|required physical-line/);
 const control=fixture();control.run.commands=[{atVirtualSecond:1,equipmentId:control.case.equipment[1].id,action:'STOP'}];assert.equal(adaptSimPyInput(control).run.commands[0].action,'STOP');
 const noise=fixture();noise.case.equipment[0].noiseProfile={unsupportedNoise:{meanIntervalSeconds:5}};assert.throws(()=>adaptSimPyInput(noise),/microstops|noise|required physical-line/);
});
test('SimPy bounds replay frames and shift count',()=>{
 const input=fixture();input.run.durationSeconds=28800;input.run.sampleEverySeconds=.01;input.run.shiftSeconds=9600;
 const adapted=adaptSimPyInput(input);assert(Math.ceil(28800/adapted.run.sampleEverySeconds)+3+1<=10000);
 input.run.shiftSeconds=.001;assert.throws(()=>adaptSimPyInput(input),/1,000/);
});
test('Generated dispatch defaults to the current engine and refuses unknown engines or synchronous DES',()=>{
 const code=fs.readFileSync(new URL('../apps-script/SimulationEngine.html',import.meta.url),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,'');
 const host={addEventListener(){}};vm.runInNewContext(code,{window:host,setTimeout,clearTimeout});
 const input=fixture(),response=host.SimulatorEngine.simulateLine(input);assert.equal(response.ok,true);assert.equal(response.result.engineVersion,'0.12.0');
 input.run.engineId=SIMPY_ENGINE_ID;assert.equal(host.SimulatorEngine.simulateLine(input).error.code,'ASYNC_ENGINE_REQUIRED');
 input.run.engineId='TYPO';assert.throws(()=>host.SimulatorEngine.simulateLine(input),/Unknown simulation engine/);
});
test('Cancelling a synchronous Python worker terminates it and revokes its URL; queued runs cannot commit results',async()=>{
 let terminated=0,revoked=0,cancel=false,posts=0;
 class Worker {postMessage(){posts++;}terminate(){terminated++;}}
 const host={Worker,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){revoked++;}},setTimeout,clearTimeout,setInterval,clearInterval};
 const engine=createSimPyBrowserEngine(host,{}),input=fixture();
 const first=engine.run(input,{cancelled:()=>cancel}),second=engine.run(input,{cancelled:()=>cancel});
 setTimeout(()=>{cancel=true;},10);
 const outcomes=await Promise.allSettled([first,second]);assert(outcomes.every(r=>r.status==='rejected'&&r.reason.message==='BATCH_CANCELLED'));
 assert.equal(posts,1);assert.equal(terminated,1);assert.equal(revoked,1);
});
test('Missing Worker reports the dependency instead of blocking the UI with Python',async()=>{
 await assert.rejects(createSimPyBrowserEngine({},{}).run(fixture()),/Web Workers/);
});


test('SimPy adapter retains machine ramps and microstops instead of declaring them omitted',()=>{
 const input=fixture();input.case.equipment[0].restartRampUpSeconds=7;input.case.equipment[0].noiseProfile.microStop={probabilityPerMinute:2,minDurationSeconds:.5,maxDurationSeconds:2};
 const payload=adaptSimPyInput(input);assert.equal(payload.machines[0].rampUpSeconds,7);assert.deepEqual(payload.machines[0].microStop,input.case.equipment[0].noiseProfile.microStop);assert(!payload.metadata.ignoredFeatures.some(f=>f.feature==='MACHINE_RAMP'));
});


test('Spatial adapter and actual SimPy result preserve physical metrics and finite JSON',()=>{
 const input=fixture();input.run.durationSeconds=60;input.run.shiftSeconds=20;
 input.case.equipment[1].noiseProfile.microStop={probabilityPerMinute:5,minDurationSeconds:.5,maxDurationSeconds:1};
 const payload=adaptSimPyInput(input);
 const code='import sys,json; sys.path[:0]=["src/simulation/python","src/simulation/python/vendor/simpy-4.1.2-py3-none-any.whl"]; from st_simpy_engine import simulate_line; print(json.dumps(simulate_line(json.load(sys.stdin)),allow_nan=False))';
 const response=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(payload),encoding:'utf8'}));assert.equal(response.ok,true);
 const compact=compactSimPyResponse(JSON.parse(JSON.stringify(response)),payload);
 assert(compact.result.samples.length<response.result.samples.length);assert.equal(compact.result.events.length,0);
 const reduced=normalizeSimPyResult(compact.result,input,payload);
 const result=normalizeSimPyResult(response.result,input,payload);
 for(const key of ['summary','equipmentMetrics','accumulationZoneMetrics','shifts','diagnostics'])assert.deepEqual(reduced[key],result[key],key);
 assert.equal(result.engineVersion,'0.4.0-experimental');
 assert.equal(result.summary.materialBalance.residualUnits,0);assert.equal(result.summary.totalOverflowUnits,0);assert.equal(result.summary.lineOeePercent,null);assert.equal(result.shifts.length,3);
 assert(result.summary.totalMicroStopSeconds>0);const zone=result.samples.at(-1).accumulationZones[0];assert.equal(zone.physicalModelEnabled,true);assert.equal(zone.prime.configured,true);assert(Array.isArray(zone.positionsMm));assert.equal(zone.overflowUnits,0);
 function finite(value){if(typeof value==='number')assert(Number.isFinite(value));if(value&&typeof value==='object')Object.values(value).forEach(finite);}finite(result);assert.doesNotThrow(()=>JSON.parse(JSON.stringify(result)));
});


test('Python download failure retries the second source and closes both failed workers',async()=>{
 const urls=[],workers=[];let revoked=0;
 class Worker {constructor(){workers.push(this);}postMessage(task){urls.push(task.indexURL);queueMicrotask(()=>this.onmessage({data:{id:task.id,type:'error',phase:'runtime',message:'Network blocked'}}));}terminate(){this.closed=true;}}
 const host={Worker,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){revoked++;}},setTimeout,clearTimeout,setInterval,clearInterval};
 await assert.rejects(createSimPyBrowserEngine(host,{}).run(fixture()),error=>error.code==='SIMPY_RUNTIME_LOAD_FAILED'&&error.message.includes('cdn.jsdelivr.net')&&error.message.includes('unpkg.com'));
 assert.deepEqual(urls,['https://cdn.jsdelivr.net/pyodide/v0.27.7/full/','https://unpkg.com/pyodide@0.27.7/']);assert(workers.every(w=>w.closed));assert.equal(revoked,2);
});

test('Python model errors do not trigger runtime fallback or silently change engines',async()=>{
 let posts=0;
 class Worker {postMessage(task){posts++;queueMicrotask(()=>this.onmessage({data:{id:task.id,type:'error',phase:'model',message:'Invalid Python model'}}));}terminate(){}}
 const host={Worker,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,setInterval,clearInterval};
 await assert.rejects(createSimPyBrowserEngine(host,{}).run(fixture()),error=>error.code==='SIMPY_MODEL_FAILED'&&error.message==='Invalid Python model');assert.equal(posts,1);
});

test('DES pool uses two independent runtimes, reuses them and bounds queued jobs',async()=>{
 let live=0,maxLive=0;const workers=[];
 class Worker {constructor(){workers.push(this);live++;maxLive=Math.max(maxLive,live);}postMessage(task){this.task=task;}terminate(){live--;}}
 const host={Worker,Blob,navigator:{hardwareConcurrency:8,deviceMemory:8},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,setInterval,clearInterval};
 const engine=createSimPyBrowserEngine(host,{});assert.equal(engine.size,2);
 let cancelled=false;
 const jobs=Array.from({length:5},()=>engine.run(fixture(),{cancelled:()=>cancelled}));
 const settled=Promise.allSettled(jobs);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(workers.length,2);assert.equal(maxLive,2);
 cancelled=true;const results=await settled;assert(results.every(r=>r.reason.message==='BATCH_CANCELLED'));assert.equal(live,0);engine.close();
 const small=createSimPyBrowserEngine({...host,navigator:{hardwareConcurrency:8,deviceMemory:2}},{});assert.equal(small.size,1);small.close();
});

test('DES streams provisional round-one frames before completion without changing final physics',async()=>{
 const input=fixture();input.run.durationSeconds=60;input.run.shiftSeconds=20;
 const payload=adaptSimPyInput(input);
 const code=`import sys,json,itertools
from unittest.mock import patch
sys.path[:0]=["src/simulation/python","src/simulation/python/vendor/simpy-4.1.2-py3-none-any.whl"]
from st_simpy_engine import simulate_line
payload=json.load(sys.stdin)
reference=simulate_line(payload)
partials=[]
with patch("st_simpy_engine.time.perf_counter",side_effect=itertools.count()):
    final=simulate_line(payload,on_partial=lambda text:partials.append(json.loads(text)))
reference['result']['diagnostics'].pop('wallTimeSeconds')
final['result']['diagnostics'].pop('wallTimeSeconds')
print(json.dumps(dict(reference=reference,final=final,partials=partials),allow_nan=False))`;
 const evidence=JSON.parse(execFileSync('python3',['-c',code],{input:JSON.stringify(payload),encoding:'utf8'}));
 assert.deepEqual(evidence.final,evidence.reference);assert(evidence.partials.length>1);assert(evidence.partials[0].calculatedThroughSeconds<60);
 const partials=[];let completed=false;
 class Worker {
  postMessage(task){assert.equal(task.stream,true);queueMicrotask(()=>{
   this.onmessage({data:{type:'ready',id:task.id}});
   for(const result of evidence.partials)this.onmessage({data:{type:'partial',id:task.id,result}});
   this.onmessage({data:{type:'result',id:task.id,response:evidence.final}});
  });}terminate(){}
 }
 const host={Worker,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout,clearTimeout,setInterval,clearInterval};
 const engine=createSimPyBrowserEngine(host,{});
 const response=await engine.run(input,{onPartial:partial=>{assert.equal(completed,false);assert.equal(partial.provisional,true);assert.equal(partial.durationSeconds,60);assert(partial.calculatedThroughSeconds>0&&partial.calculatedThroughSeconds<60);assert.equal(partial.summary.lineOeePercent,null);partials.push(partial);}});completed=true;
 assert.equal(response.ok,true);assert.equal(response.result.provisional,undefined);assert.deepEqual(response.result,normalizeSimPyResult(evidence.final.result,input,payload));
 const merged=[];for(const partial of partials){const last=merged.at(-1)?.virtualSecond??-1;merged.push(...partial.samples.filter(f=>f.virtualSecond>last));}
 assert.deepEqual(merged,response.result.samples.filter(f=>f.virtualSecond<60));
 assert(partials.at(-1).shifts.length>=2);engine.close();
});

