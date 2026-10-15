import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {applyProductProfile} from '../src/simulation/ProductProfiles.js';
import {resolveAccumulationZoneDefinition} from '../src/simulation/FormatGeometryAdapter.js';
function input(){
 const machine=(id,type,rate,input='BOTTLES',output=input)=>({id,name:id,type,nominalRatePerSecond:rate,initialMode:'AUTO',processData:{flowUnits:{input,output}}});
 const belt=(id,unit,length)=>({...machine(id,'CONVEYOR',999,unit),processData:{flowUnits:{input:unit,output:unit},accumulation:{usableLengthMm:1000,productLengthMm:length,productPitchMm:length+10,gapMm:10,movingGapMm:10,accumulatedGapMm:0,speedMode:'MANUAL',conveyorSpeedMmPerSecond:500,primeSensorPositionMm:900,backupSensorPositionMm:100,backupRestartPositionMm:200,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}});
 const equipment=[machine('source','FILLER',12),belt('bottles','BOTTLES',20),machine('packer','CASE_PACKER',2,'BOTTLES','CASES'),belt('boxes','CASES',100),machine('sink','PALLETIZER',2,'CASES')];
 const p={id:'a',name:'A',bottlesPerCase:12,bottleLengthMm:20,caseLengthMm:100,equipment:{bottles:{movingGapMm:10,accumulatedGapMm:0},boxes:{movingGapMm:10,accumulatedGapMm:0}}};
 return {case:{id:'products',unitOfFlow:'units',equipment},run:{durationSeconds:100,tickSeconds:.25,sampleEverySeconds:.25,seed:1,productCatalog:[p],initialProductId:'a',reliabilityEnabled:false}};
}
function run(i){const r=simulateLine(i);assert.equal(r.ok,true,JSON.stringify(r.error));return r.result;}
function conserved(r){assert(Math.abs(r.summary.materialBalance.residualUnits)<1e-5,JSON.stringify(r.summary.materialBalance));}
test('conversion consumes 12 bottles per case, preserves physical box capacity and bottle-equivalent balance',()=>{
 const i=input(),original=structuredClone(i),r=run(i);conserved(r);assert.deepEqual(i,original);
 const boxes=r.equipmentMetrics.sink.outputCount,bottles=r.summary.outputCount;assert(Math.abs(boxes*12-bottles)<1e-5);assert.equal(r.unitOfFlow,'bottles');
 assert.equal(r.accumulationZoneMetrics['boxes--physical-zone'].capacityUnits,10);assert.equal(r.products.rows[0].completeCases,Math.floor(boxes));assert.equal(r.equipmentMetrics.sink.unitOfFlow,'cases');
});
test('manual belt speed changes travel and throughput without changing packed capacity',()=>{
 const fast=run(input()),i=input();i.run.productCatalog[0].equipment.boxes.speedMmPerSecond=30;const slow=run(i);conserved(slow);
 assert(slow.summary.outputCount<fast.summary.outputCount);assert.equal(slow.accumulationZoneMetrics['boxes--physical-zone'].capacityUnits,10);assert.equal(slow.samples[0].accumulationZones[1].geometry.conveyorSpeedMmPerSecond,30);
});
test('changeover applies destination size, gaps, speed and pack ratio; clear-out is separate from production',()=>{
 const i=input(),b=structuredClone(i.run.productCatalog[0]);Object.assign(b,{id:'b',name:'B',bottlesPerCase:6,bottleLengthMm:40,caseLengthMm:200});b.equipment.boxes={movingGapMm:20,accumulatedGapMm:0,speedMmPerSecond:250};b.equipment.packer={ratePerMinute:120};i.run.productCatalog.push(b);i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:40,endSeconds:50,targetProductId:'b'}];
 const r=run(i);conserved(r);assert.equal(r.products.activeProductId,'b');assert.equal(r.products.rows.length,2);assert(r.products.clearoutBottleEquivalents>0);assert.equal(r.accumulationZoneMetrics['boxes--physical-zone'].capacityUnits,5);assert(r.events.some(e=>e.type==='PRODUCT_CHANGED'&&e.atVirtualSecond===50));
 const a=r.products.rows.find(p=>p.productId==='a'),other=r.products.rows.find(p=>p.productId==='b');assert(Math.abs(a.outputNative*12-a.outputBottleEquivalents)<1e-8);assert(Math.abs(other.outputNative*6-other.outputBottleEquivalents)<1e-8);assert(Math.abs(a.outputBottleEquivalents+other.outputBottleEquivalents-r.summary.outputCount)<1e-5);
 const before=r.samples.find(s=>s.virtualSecond===45),after=r.samples.find(s=>s.virtualSecond===50);assert.equal(before.outputCount,after.outputCount);assert.equal(r.summary.lineOeeReference,'PRODUCT_WEIGHTED_IDEAL_OUTPUT');
});
test('clear-out never erases cumulative equipment counts, repair state or source inputs',()=>{
 const i=input(),b={...structuredClone(i.run.productCatalog[0]),id:'b',name:'B'};i.run.productCatalog.push(b);i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:40,endSeconds:50,targetProductId:'b'}];i.run.commands=[{atVirtualSecond:30,equipmentId:'source',action:'STOP'}];
 const r=run(i);conserved(r);assert.equal(r.samples.at(-1).equipment[0].mode,'STOP');for(const e of Object.values(r.equipmentMetrics))assert(Math.abs(Object.values(e.stateSeconds).reduce((a,b)=>a+b,0)-100)<1e-8);
});
test('async and worker-style batch runs preserve catalog and reproduce sync totals',async()=>{
 const i=input(),r=run(i),a=await simulateLineAsync(i,{yieldBetweenChunks:false});assert.deepEqual(a.result.summary,r.summary);
 const b=await simulateBatch({...i,run:{...i.run,rounds:2}},{runRound:simulateLineAsync,workerFirstRound:true,laterSummaryOnly:true,concurrency:2});assert.equal(b.ok,true);assert.equal(b.result.batch.statistics.outputCount.mean,r.summary.outputCount);assert.equal(b.result.products.rows[0].bottlesPerCase,12);
});
test('invalid unit boundaries, pack sizes, destination and unsupported engine are rejected',()=>{
 for(const mutate of [i=>i.case.equipment[3].processData.flowUnits.input='BOTTLES',i=>i.run.productCatalog[0].bottlesPerCase=0,i=>i.run.initialProductId='missing',i=>i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:10,endSeconds:20,targetProductId:'missing'}],i=>i.run.engineId='DES_SIMPY_EXPERIMENTAL',i=>{delete i.run.productCatalog;delete i.run.initialProductId;i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:10,endSeconds:20,targetProductId:'a'}];}]){const i=input();mutate(i);assert.equal(simulateLine(i).ok,false);}
});
test('disabled events do not change product, and a stop without destination retains WIP',()=>{
 const i=input();i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:40,endSeconds:50}];const r=run(i);conserved(r);assert.equal(r.products.clearoutBottleEquivalents,0);assert.equal(r.products.rows.length,1);
 i.run.eventsEnabled=false;i.run.plannedStops[0].targetProductId='ignored';const off=run(i);assert.equal(off.products.activeProductId,'a');
});
test('profiles retain shared reliability and installation while overriding machine rates',()=>{
 const i=input(),base=i.case.equipment;base[0].noiseProfile={reliability:{mtbfMinutes:10,mttrMinutes:2}};i.run.productCatalog[0].equipment.source={ratePerMinute:120,startupSeconds:2};const resolved=applyProductProfile(base,i.run.productCatalog[0]);assert.equal(resolved[0].nominalRatePerSecond,2);assert.deepEqual(resolved[0].noiseProfile,base[0].noiseProfile);assert.equal(resolved[1].processData.accumulation.usableLengthMm,1000);
 const z=resolveAccumulationZoneDefinition(resolved,3).definition;assert.equal(z.productLengthMm,100);assert.equal(z.productPitchMm,110);
});

test('nested bottle/case presentations override legacy dimensions and use the correct physical size by stage',()=>{
 const i=input(),p=i.run.productCatalog[0];p.presentations={bottle:{lengthMm:25,widthMm:20,heightMm:100},case:{lengthMm:200,widthMm:150,heightMm:120,bottlesPerCase:6}};
 const r=run(i);conserved(r);assert.equal(r.accumulationZoneMetrics['bottles--physical-zone'].capacityUnits,40);assert.equal(r.accumulationZoneMetrics['boxes--physical-zone'].capacityUnits,5);assert.equal(r.products.rows[0].bottlesPerCase,6);assert(Math.abs(r.summary.outputCount-r.equipmentMetrics.sink.outputCount*6)<1e-5);
});
test('product-specific presentation selections resolve conversion without modifying installation units',()=>{
 const i=input();for(const e of i.case.equipment)e.processData.flowUnits={input:'BOTTLES',output:'BOTTLES'};
 const p=i.run.productCatalog[0];p.equipment.packer={inputUnit:'BOTTLES',outputUnit:'CASES'};p.equipment.boxes={inputUnit:'CASES',outputUnit:'CASES',movingGapMm:10};p.equipment.sink={inputUnit:'CASES',outputUnit:'CASES'};
 const before=structuredClone(i.case.equipment),r=run(i);conserved(r);assert.equal(r.equipmentMetrics.sink.unitOfFlow,'cases');assert.equal(r.accumulationZoneMetrics['boxes--physical-zone'].capacityUnits,10);assert.deepEqual(i.case.equipment,before);
});
test('unused partial product applicability is retained in the catalog; using it cannot silently bypass equipment',()=>{
 const i=input(),partial=structuredClone(i.run.productCatalog[0]);partial.id='boxed';partial.name='Boxed presentation';partial.presentations={bottle:{},case:{lengthMm:200,bottlesPerCase:12}};delete partial.bottleLengthMm;
 for(const e of i.case.equipment)partial.equipment[e.id]={applies:['boxes','sink'].includes(e.id),inputUnit:'CASES',outputUnit:'CASES'};
 i.run.productCatalog.push(partial);const r=run(i);conserved(r);i.run.initialProductId='boxed';let result=simulateLine(i);assert.equal(result.ok,false);assert.match(JSON.stringify(result.error),/no bypass/);
 i.run.initialProductId='a';i.run.plannedStops=[{category:'changeoverMinutes',startSeconds:30,endSeconds:40,targetProductId:'boxed'}];result=simulateLine(i);assert.equal(result.ok,false);
});
test('presentation continuity and supported machine conversions are validated for each active product',()=>{
 for(const mutate of [p=>{p.equipment.boxes.inputUnit='BOTTLES';p.equipment.boxes.outputUnit='CASES';},p=>{p.equipment.packer={inputUnit:'CASES',outputUnit:'BOTTLES'};},p=>{p.equipment.sink={inputUnit:'BOTTLES',outputUnit:'BOTTLES'};}]){const i=input();mutate(i.run.productCatalog[0]);assert.equal(simulateLine(i).ok,false);}
});

test('an incomplete unused catalog product does not block a compatible run; choosing it requires complete presentation geometry',()=>{
 const i=input(),draft=structuredClone(i.run.productCatalog[0]);draft.id='draft';draft.name='Draft format';delete draft.bottleLengthMm;delete draft.caseLengthMm;i.run.productCatalog.push(draft);conserved(run(i));i.run.initialProductId='draft';const result=simulateLine(i);assert.equal(result.ok,false);assert.match(JSON.stringify(result.error),/length along the conveyor/);
});
