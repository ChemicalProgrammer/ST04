import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const host={addEventListener(){},dispatchEvent(){}};
 const ctx=vm.createContext({CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},window:host,setTimeout,clearTimeout,setInterval,clearInterval});
 const script=file=>fs.readFileSync('apps-script/'+file,'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
 vm.runInContext(script('SimulationEngine.html'),ctx);
 host.STScenarios={apply:(sim,changes)=>({...sim,equipment:sim.equipment.map(e=>({...e,rate:changes[0].after}))})};
 ctx.STScenarios=host.STScenarios;ctx.SimulatorEngine=host.SimulatorEngine;
 vm.runInContext(script('ScenarioExplorer.html'),ctx);
 let calls=0;
 host.SimulatorEngine.validateSimulationInput=()=>({ok:true}); // Minimal synthetic metric fixture.
 host.SimulatorEngine.simulateBatch=async(input)=>{calls++;return {ok:true,result:{summary:{lineOeePercent:50,outputCount:100},durationSeconds:input.run.durationSeconds,batch:{rows:Array.from({length:input.run.rounds||1},(_,i)=>({seed:(input.run.seed||1)+i,summary:{lineOeePercent:50,outputCount:100}}))}}};};
 return {host,calls:()=>calls};
}
test('shared What-If metrics reuse matching inputs across cards and invalidate changed seeds, rounds, equipment and engine',async()=>{
 const h=setup(),sim={id:'a',equipment:[{id:'m',rate:1}]},run={durationSeconds:60,seed:10,rounds:3};
 const evaluate=(model=sim,r=run,offset=0)=>h.host.STScenarioExplorer.evaluate(model,[],()=>false,offset,r);
 await evaluate();await evaluate({...sim,id:'different-card'});assert.equal(h.calls(),1);
 await evaluate(sim,{...run,seed:11});await evaluate(sim,{...run,rounds:4});await evaluate({...sim,equipment:[{id:'m',rate:2}]});await evaluate(sim,run,1000003);assert.equal(h.calls(),5);
 await assert.rejects(evaluate(sim,{...run,engineId:'DES_SIMPY_EXPERIMENTAL'}),/not validated/);
 await assert.rejects(h.host.STScenarioExplorer.evaluate(sim,[],()=>true,0,run),/BATCH_CANCELLED/);
});
test('only complete saved batches with exact input provenance may skip baseline computation',async()=>{
 for(const state of ['COMPLETE','PENDING','CANCELLED']){
  const h=setup(),run={durationSeconds:60,seed:10,rounds:3},sim={id:'a',equipment:[{id:'m',rate:1}],unitOfFlow:'bottles'};
  sim.results={inputSignature:h.host.SimulatorEngine.inputSignature({case:sim,run}),replicationStatus:{state},summary:{lineOeePercent:30,outputCount:80},durationSeconds:60,batch:{rows:Array.from({length:3},(_,i)=>({seed:10+i,summary:{lineOeePercent:30,outputCount:80}}))}};
  const value=await h.host.STScenarioExplorer.evaluate(sim,[],()=>false,0,run);assert.equal(h.calls(),state==='COMPLETE'?0:1);assert.equal(value.oee,state==='COMPLETE'?30:50);
 }
 const h=setup(),sim={equipment:[],results:{replicationStatus:{state:'COMPLETE'},summary:{lineOeePercent:90}}};
 await h.host.STScenarioExplorer.evaluate(sim,[],()=>false);assert.equal(h.calls(),1,'legacy results without provenance are recalculated');
});

test('cached metrics cannot bypass physical input validation',async()=>{
 const h=setup(),sim={id:'a',equipment:[{id:'m',rate:1}]},run={durationSeconds:60,seed:10,rounds:3};
 await h.host.STScenarioExplorer.evaluate(sim,[],()=>false,0,run);
 h.host.SimulatorEngine.validateSimulationInput=()=>({ok:false,error:{message:'Physical input rejected'}});
 await assert.rejects(h.host.STScenarioExplorer.evaluate(sim,[],()=>false,0,run),/Physical input rejected/);assert.equal(h.calls(),1);
});


test('persisted evaluations survive a fresh browser context and reject changed runs',async()=>{
 const run={durationSeconds:60,seed:10,rounds:3},sim={id:'persisted',equipment:[{id:'m',rate:1}]};
 const first=setup();await first.host.STScenarioExplorer.evaluate(sim,[],()=>false,0,run);
 assert.equal(sim.whatIf.measurements.length,1);
 const reopened=setup(),copy=JSON.parse(JSON.stringify(sim));
 const reused=await reopened.host.STScenarioExplorer.evaluate(copy,[],()=>false,0,run);
 assert.equal(reopened.calls(),0);assert.equal(reused.cacheSource,'SAVED_EVALUATION');
 await reopened.host.STScenarioExplorer.evaluate(copy,[],()=>false,0,{...run,seed:20});assert.equal(reopened.calls(),1);
});
test('incomplete round metrics never qualify for saved reuse',async()=>{
 const h=setup(),run={durationSeconds:60,seed:10,rounds:3},sim={id:'a',equipment:[{id:'m',rate:1}]};
 sim.results={inputSignature:h.host.SimulatorEngine.inputSignature({case:sim,run}),replicationStatus:{state:'COMPLETE'},summary:{lineOeePercent:30,outputCount:80},durationSeconds:60};
 const value=await h.host.STScenarioExplorer.evaluate(sim,[],()=>false,0,run);assert.equal(h.calls(),1);assert.equal(value.oee,50);
});
