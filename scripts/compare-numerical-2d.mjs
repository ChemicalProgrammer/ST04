import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const {simulateLine}=await import(root+'/src/simulation/LineSimulationEngine.js');
const profiles=await import(root+'/src/simulation/ProductProfiles.js');
const {resolveAccumulationZoneDefinition}=await import(root+'/src/simulation/FormatGeometryAdapter.js');
const script=name=>fs.readFileSync(root+'/apps-script/'+name+'.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const window={SimulatorEngine:{...profiles,resolveProductConveyor:(line,i)=>resolveAccumulationZoneDefinition(line,i).definition}};
const context=vm.createContext({window,document:{getElementById:()=>({addEventListener(){}})}});
vm.runInContext(script('ConveyorAnalysis'),context);
vm.runInContext(script('Simulation2DEngine'),context);
const source=script('Simulation2D');
vm.runInContext('let conveyorDimensions,conveyorWorksheets; const dimensionRows=()=>[]; const failuresFor=()=>[];'+source.slice(source.indexOf('  function prepare('),source.indexOf('  function validate()'))+';window.prepare=prepare;',context);
const machine=(id,rate,capacity=30)=>({id,name:id,type:'CUSTOM',nominalRatePerSecond:rate,initialMode:'AUTO',processData:{equipment:{internalCapacityBottles:capacity},upstream:{startupTimeSeconds:0},downstream:{rampUpTimeSeconds:0}}});
const belt=(id)=>({id,name:id,type:'CONVEYOR',nominalRatePerSecond:10,initialMode:'AUTO',processData:{accumulation:{speedMode:'MANUAL',usableLengthMm:2000,productLengthMm:60,movingGapMm:40,accumulatedGapMm:0,conveyorSpeedMmPerSecond:500,primeSensorPositionMm:1700,backupSensorPositionMm:300,backupRestartPositionMm:400,blockedTimeDelaySeconds:.5,clearTimeDelaySeconds:.5,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}});
// Load the production 2D input adapter without constructing the canvas/UI.
// Only dimension rendering and reliability generation are stubbed: every case disables failures.
const slow=belt('b');slow.processData.accumulation.conveyorSpeedMmPerSecond=120;
const ramp=[machine('a',130/60,100),belt('b'),machine('c',100/60,100)];
ramp[0].processData.upstream.startupTimeSeconds=1;
ramp[1].processData.accumulation.downstreamRampUpSeconds=3;
const cases=[
 {name:'Equal rates',equipment:[machine('a',2),belt('b'),machine('c',2)]},
 {name:'Downstream bottleneck',equipment:[machine('a',3),belt('b'),machine('c',2)]},
 {name:'V graph',equipment:[machine('a',3),belt('b'),machine('c',2),belt('d'),machine('e',3)]},
 {name:'Slow conveyor / blocked delay 0.5 s',equipment:[machine('a',3),slow,machine('c',2)]},
 {name:'Capacity of one bottle',equipment:[machine('a',2,1),belt('b'),machine('c',2,1)]},
 {name:'High rate / conveyor limited',equipment:[machine('a',10),belt('b'),machine('c',10)]},
 {name:'Startup and Prime ramp',equipment:ramp},
 {name:'Slow conveyor / blocked delay 0.75 s',equipment:[machine('a',3),{...slow,processData:{accumulation:{...slow.processData.accumulation,blockedTimeDelaySeconds:.75}}},machine('c',2)]},
 {name:'Scheduled downstream pause 120–180 s',equipment:[machine('a',3),belt('b'),machine('c',2)],commands:[{atVirtualSecond:120,equipmentId:'c',action:'PAUSE'},{atVirtualSecond:180,equipmentId:'c',action:'RUN'}]}
];
const bottles=belt('b');Object.assign(bottles.processData.accumulation,{productLengthMm:20,movingGapMm:10,conveyorSpeedMmPerSecond:2000});
const boxes=belt('boxes');Object.assign(boxes.processData.accumulation,{productLengthMm:100,movingGapMm:40,conveyorSpeedMmPerSecond:500});boxes.processData.flowUnits={input:'CASES',output:'CASES'};
const packer=machine('packer',1);packer.type='CASE_PACKER';packer.processData.flowUnits={input:'BOTTLES',output:'CASES'};
const sink=machine('sink',1);sink.type='PALLETIZER';sink.processData.flowUnits={input:'CASES',output:'CASES'};
const packing=[machine('source',12),bottles,packer,boxes,sink];
packing.forEach(item=>{item.processData.flowUnits??={input:'BOTTLES',output:'BOTTLES'};});
const format={id:'12',name:'12 bottles',bottlesPerCase:12,bottleLengthMm:20,caseLengthMm:100};
cases.push({name:'Packer 12 bottles per case',equipment:packing,format});
const durationSeconds=600,step2D=1/120;
const results=[];
for(const scenario of cases){
 const {name,equipment,format,commands=[]}=scenario;
 const run={durationSeconds,tickSeconds:.25,sampleEverySeconds:60,seed:7,machineResidenceEnabled:true,reliabilityEnabled:false,commands,
  ...(format?{productCatalog:[format],initialProductId:format.id}:{})};
 const response=simulateLine({case:{id:'parity',unitOfFlow:'bottles',equipment},run});
 assert.equal(response.ok,true,JSON.stringify(response.error));
 const numerical=response.result;
 const definitions=window.prepare(equipment,format,{},[]);
 const model=window.STSimulation2DEngine.create(definitions,7,undefined,{commands});
 model.configure({failures:false});
 for(let i=0;i<Math.round(durationSeconds/step2D);i++)model.step(step2D);
 const output2D=model.line.at(-1).produced*(model.line.at(-1).bottlesPerUnit||1);
 const inventory2D=model.line.reduce((total,item)=>total+(item.kind==='belt'?item.items.length*(item.bottlesPerUnit||1):item.resident.length*(item.inputBottleFactor||1)),0);
 const input2D=model.line[0].produced*(model.line[0].bottlesPerUnit||1)+model.line[0].resident.length*(model.line[0].inputBottleFactor||1);
 assert(Math.abs(numerical.summary.materialBalance.residualUnits)<1e-5,'Numerical material imbalance');
 assert.equal(input2D-output2D-inventory2D,0,'2D material imbalance');
 for(const item of model.line)assert(Math.abs(Object.values(item.durations).reduce((a,b)=>a+b,0)-durationSeconds)<1e-6,'2D state clock');
 for(const item of Object.values(numerical.equipmentMetrics))assert(Math.abs(Object.values(item.stateSeconds).reduce((a,b)=>a+b,0)-durationSeconds)<1e-6,'Numerical state clock');
 const differencePercent=100*(numerical.summary.outputCount/output2D-1);
 const row={name,input:{equipment,format,run},definitions2D:definitions,
  numerical:{outputBottleEquivalents:numerical.summary.outputCount,outputNative:format?numerical.products.rows[0].outputNative:numerical.summary.outputCount,materialBalance:numerical.summary.materialBalance,
   equipment:Object.fromEntries(Object.entries(numerical.equipmentMetrics).map(([id,item])=>[id,{output:item.outputCount,stateSeconds:item.stateSeconds}]))},
  twoD:{outputBottleEquivalents:output2D,outputNative:model.line.at(-1).produced,materialBalance:{input:input2D,output:output2D,inventory:inventory2D,residual:0},
   equipment:model.line.map(item=>({id:item.id,output:item.produced,inventory:item.kind==='belt'?item.items.length:item.resident.length,stateSeconds:item.durations}))},
  differencePercent,withinOnePercent:Math.abs(differencePercent)<=1};
 results.push(row);
 console.log(`${name}: numerical=${row.numerical.outputNative}, 2D=${row.twoD.outputNative}, delta=${differencePercent.toFixed(3)}% ${row.withinOnePercent?'WITHIN 1%':'DIVERGES'}`);
}
const report={referenceRevision:'34b0afe10e5c905e5e168f1fcd0363d02229ad86',sourceHashes:Object.fromEntries(['src/simulation/LineSimulationEngine.js','src/simulation/FormatGeometryAdapter.js','src/simulation/ProductProfiles.js','apps-script/Simulation2D.html','apps-script/Simulation2DEngine.html','apps-script/ConveyorAnalysis.html'].map(path=>[path,createHash('sha256').update(fs.readFileSync(root+'/'+path)).digest('hex')])),durationSeconds,numericalTickSeconds:.25,twoDTickSeconds:step2D,
 scope:'Continuous numerical engine ST_CURRENT vs independent 2D engine. Empty start; no random failures; one round; identical commands. 1% is a diagnostic threshold, not physical validation.',results};
const output=process.argv.find(arg=>arg.startsWith('--output='))?.slice(9);
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(process.argv.includes('--strict')&&results.some(row=>!row.withinOnePercent))process.exitCode=1;
