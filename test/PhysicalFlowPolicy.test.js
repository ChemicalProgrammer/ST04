import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
import {advancePackagePositions} from '../src/simulation/DiscretePackageEngine.js';
const script=name=>fs.readFileSync('apps-script/'+name+'.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function equipment(capacity=30){
 const machine=(id,rate)=>({id,name:id,type:'CUSTOM',initialMode:'AUTO',nominalRatePerSecond:rate,processData:{equipment:{internalCapacityBottles:capacity},flowUnits:{input:'BOTTLES',output:'BOTTLES'}}});
 return [machine('source',2),{id:'belt',name:'Belt',type:'CONVEYOR',initialMode:'AUTO',nominalRatePerSecond:10,processData:{flowUnits:{input:'BOTTLES',output:'BOTTLES'},accumulation:{speedMode:'MANUAL',usableLengthMm:1000,productLengthMm:20,movingGapMm:10,accumulatedGapMm:0,conveyorSpeedMmPerSecond:500,primeSensorPositionMm:900,backupSensorPositionMm:100,backupRestartPositionMm:200,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0,blockedTimeDelaySeconds:.5,clearTimeDelaySeconds:.5}}},machine('sink',10)];
}
function run(line,product){const response=simulateLine({case:{id:'policy',unitOfFlow:'bottles',equipment:line},run:{durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:7,reliabilityEnabled:false,machineResidenceEnabled:true,...(product?{productCatalog:[product],initialProductId:product.id}:{})}});assert.equal(response.ok,true,JSON.stringify(response.error));return response.result;}
test('capacity is a storage ceiling and does not synthesize a residence delay',()=>{
 const small=run(equipment(1)),large=run(equipment(100));
 const first=r=>r.samples.find(s=>s.equipment[0].outputCount>0).virtualSecond;
 assert.equal(first(small),first(large));assert(first(large)<=1);
 assert.equal(small.equipmentMetrics.source.outputCount,large.equipmentMetrics.source.outputCount);
 assert.equal(large.samples.at(-1).equipment[0].estimatedResidenceSeconds,0);
 for(const result of [small,large]){assert.equal(result.summary.materialBalance.residualUnits,0);for(const m of Object.values(result.equipmentMetrics))assert(Number.isInteger(m.outputCount));}
});
test('a twelve-bottle packer releases complete cases and preserves equivalents at every sample',()=>{
 const line=equipment(30);Object.assign(line[2],{type:'CASE_PACKER',nominalRatePerSecond:1/6});line[2].processData.flowUnits.output='CASES';
 const result=run(line,{id:'12',name:'12 pack',bottlesPerCase:12,bottleLengthMm:20,caseLengthMm:100});
 assert(result.products.rows[0].outputNative>0);assert(Number.isInteger(result.products.rows[0].outputNative));
 for(const sample of result.samples){assert.equal(sample.outputCount,sample.equipment.at(-1).outputCount*12);assert(Number.isInteger(sample.equipment.at(-1).outputCount));}
 assert.equal(result.summary.materialBalance.residualUnits,0);
});
test('explicit residence is productive internal work, not starvation',()=>{
 const line=equipment(30);line[0].processData.equipment.residenceTimeSeconds=10;
 const result=run(line),early=result.samples.find(s=>s.virtualSecond===5).equipment[0];
 assert.equal(early.outputCount,0);assert.equal(early.availabilityState,'RUNNING');assert(early.runningSeconds>4);
});
test('photoeye timers keep working with a stopped belt and reset on an interrupted clear delay',()=>{
 const window={SimulatorEngine:{advancePackagePositions}};vm.runInNewContext(script('Simulation2DEngine'),{window});
 const model=window.STSimulation2DEngine.create([{id:'belt',kind:'belt',length:1000,speed:100,packageLength:60,pitch:100,packedGap:0,prime:null,backup:200,blockDelay:.5,clearDelay:.5}]);
 const belt=model.line[0];belt.items=[{x:200}];model.control('belt','STOP');model.step(.25);model.step(.25);
 assert.equal(belt.items[0].x,200);assert.equal(belt.backupBlocked,true);
 belt.items=[];model.step(.25);assert.equal(belt.backupBlocked,true);
 belt.items=[{x:200}];model.step(.1);assert.equal(belt.backupElapsed,0);
 belt.items=[];model.step(.25);assert.equal(belt.backupBlocked,true);model.step(.25);assert.equal(belt.backupBlocked,false);
});
test('conveyor dimension samples draw two matching units with independent width and edge gap',()=>{
 const source=script('Simulation2D'),draws=[],dimensions=[];
 const window={STSimulation2DMachines:{drawBottle(...args){draws.push(['bottle',...args.slice(1)]);},drawCase(...args){draws.push(['case',...args.slice(1)]);}}};
 const ctx={save(){},restore(){},measureText(text){return{width:text.length*5};}};
 const context=vm.createContext({window,appearance:{bottle:'oval-jug',liquid:'#123456',cases:'#987654'},bottleStages:new Map([['belt',7]]),sceneScale:.09,telemetryFont:'6.75px system-ui',num:String,
  productWidth:item=>(item.packageWidth||item.packageLength)*.09,productHeight:()=>25,
  CanvasDimension:class{constructor(...args){dimensions.push(args);}draw(){}}});
 vm.runInContext(source.slice(source.indexOf('  function drawConveyorUnitDimensions('),source.indexOf('  function drawBelt('))+';this.drawSample=drawConveyorUnitDimensions;',context);
 const item={id:'belt',unit:'BOTTLES',packageWidth:130,packageLength:98,pitch:141};
 context.drawSample(ctx,item,100,100,'#111','#08f','#fff','#777','#999',null);
 assert.equal(draws.length,2);assert(draws.every(d=>d[0]==='bottle'&&d.at(-2)==='oval-jug'&&d.at(-1)===7));
 assert.deepEqual(dimensions.map(d=>d[0]),['Width · 130 mm','Gap · 43 mm']);
 draws.length=0;dimensions.length=0;item.unit='CASES';item.pitch=98;
 context.drawSample(ctx,item,100,100,'#111','#08f','#fff','#777','#999',null);
 assert.equal(draws.length,2);assert(draws.every(d=>d[0]==='case'));assert.equal(dimensions[1][0],'Gap · 0 mm');
});
