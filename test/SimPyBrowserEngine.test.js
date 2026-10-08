import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {adaptSimPyInput,normalizeSimPyResult,createSimPyBrowserEngine,SIMPY_ENGINE_ID} from '../src/simulation/SimPyBrowserEngine.js';
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
 const result=normalizeSimPyResult(response.result,input,payload);assert.equal(result.engineVersion,'0.4.0-experimental');
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
