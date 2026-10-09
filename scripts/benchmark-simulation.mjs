// Compare exact seeded results with an older checkout, without changing tick
// size, duration, rounds or the physics. No network or Python runtime required.
// node scripts/benchmark-simulation.mjs --baseline /path/to/old/ST01
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';

const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
const argument=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const baselineRoot=argument('--baseline');
if(!baselineRoot)throw new Error('Provide --baseline with the path to an older checkout.');
const baseline=await import(pathToFileURL(path.resolve(baselineRoot,'src/simulation/LineSimulationEngine.js')));
const rounds=Number(argument('--rounds')||3),durationSeconds=Number(argument('--duration')||28800);
if(!Number.isInteger(rounds)||rounds<1||rounds>100||!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error('Invalid benchmark options.');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'apps-script/PublicDemoCaseFactory.gs'),'utf8'),context);
const record=JSON.parse(JSON.stringify(context.createPublicDemoCaseRequest_())),rows=[];
const options={summaryOnly:true,yieldBetweenChunks:false};
const inputFor=(sim,seed,duration=durationSeconds)=>({case:{id:record.id,unitOfFlow:record.unitOfFlow,equipment:sim.equipment},run:{...sim.dynamicConfig,durationSeconds:duration,seed}});
for(const sim of record.simulations){
  // Short warm-up avoids counting module/JIT startup as sustained performance.
  const warm=inputFor(sim,sim.dynamicConfig.seed,60);
  assert.deepEqual(await simulateLineAsync(warm,options),await baseline.simulateLineAsync(warm,options));
  let beforeMs=0,afterMs=0;
  for(let round=0;round<rounds;round++){
    const input=inputFor(sim,(sim.dynamicConfig.seed+round)>>>0),responses={};
    const runners=round%2?[['after',simulateLineAsync],['before',baseline.simulateLineAsync]]:[['before',baseline.simulateLineAsync],['after',simulateLineAsync]];
    for(const [name,runner] of runners){const started=performance.now();responses[name]=await runner(input,options);const elapsed=performance.now()-started;if(name==='before')beforeMs+=elapsed;else afterMs+=elapsed;}
    assert.deepEqual(responses.after,responses.before,sim.id+' seed '+input.run.seed+' differs');
  }
  // Events and replay samples must remain identical too, not just averages.
  const detailed=inputFor(sim,sim.dynamicConfig.seed,600);
  assert.deepEqual(await simulateLineAsync(detailed,{detail:true,yieldBetweenChunks:false}),await baseline.simulateLineAsync(detailed,{detail:true,yieldBetweenChunks:false}));
  const row={simulation:sim.id,rounds,durationSeconds,beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),speedup:Number((beforeMs/afterMs).toFixed(2)),exactMatch:true};
  rows.push(row);console.log(JSON.stringify(row));
}
const beforeMs=rows.reduce((n,r)=>n+r.beforeMs,0),afterMs=rows.reduce((n,r)=>n+r.afterMs,0);
const report={roundsPerSimulation:rounds,durationSeconds,rows,total:{beforeMs,afterMs,speedup:Number((beforeMs/afterMs).toFixed(2)),reductionPercent:Number((100*(1-afterMs/beforeMs)).toFixed(1)),exactMatch:true}};
console.log(JSON.stringify(report.total));
if(argument('--output'))fs.writeFileSync(path.resolve(argument('--output')),JSON.stringify(report,null,2)+'\n');
