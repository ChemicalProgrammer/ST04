import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptSimPyInput,createSimPyBrowserEngine,SIMPY_ENGINE_ID} from '../src/simulation/SimPyBrowserEngine.js';
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/simpy-pipeline.json',import.meta.url)));

test('SimPy adapter resolves ST geometry without mutating the case and records omitted physics',()=>{
 const input=fixture(),before=JSON.stringify(input),payload=adaptSimPyInput(input);
 assert.equal(JSON.stringify(input),before);assert.equal(payload.machines.length,2);assert.equal(payload.conveyors.length,1);
 assert.equal(payload.metadata.stochasticSchedulesPaired,false);assert.equal(payload.metadata.ignoredFeatures[0].feature,'SPATIAL_CONVEYOR_AND_SENSORS');
 assert(payload.conveyors[0].speedMmPerSecond>0);assert(payload.conveyors[0].accumulatedPitchMm<=payload.conveyors[0].movingPitchMm);
});
test('SimPy rejects unsupported topology, conveyor controls and microstops rather than silently changing engines',()=>{
 const input=fixture();input.case.equipment.pop();assert.throws(()=>adaptSimPyInput(input),/alternating|required physical-line/);
 const control=fixture();control.run.commands=[{atVirtualSecond:1,equipmentId:control.case.equipment[1].id,action:'STOP'}];assert.throws(()=>adaptSimPyInput(control),/conveyor control/);
 const noise=fixture();noise.case.equipment[0].noiseProfile={microStop:{meanIntervalSeconds:5,minDurationSeconds:1,maxDurationSeconds:2}};assert.throws(()=>adaptSimPyInput(noise),/microstops|noise|required physical-line/);
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
