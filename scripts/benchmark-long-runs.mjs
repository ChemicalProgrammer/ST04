import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import {simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../apps-script/DemoCaseFactory.gs',import.meta.url),'utf8'),scope);
const model=JSON.parse(JSON.stringify(scope.createDemoCaseRequest_()));model.id='benchmark';
const durations=process.argv.slice(2).filter(a=>!a.startsWith('--')).map(Number);if(!durations.length)durations.push(28800,86400,2592000);
for(const durationSeconds of durations){
 const start=performance.now();let peakHeap=process.memoryUsage().heapUsed;
 const response=await simulateLineAsync({case:model,run:{durationSeconds,tickSeconds:.25,sampleEverySeconds:Math.max(5,Math.ceil(durationSeconds/2000)),seed:17,reliabilityEnabled:true,commands:[],historyFormat:'COMPACT',calculationMode:process.argv.includes('--record')?'FAST':'SUMMARY'}},{summaryOnly:!process.argv.includes('--record'),detail:true,yieldBetweenChunks:false,progress:()=>{peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);}});
 if(!response.ok)throw Error(JSON.stringify(response.error));
 console.log(JSON.stringify({durationSeconds,ticks:durationSeconds/.25,elapsedSeconds:(performance.now()-start)/1000,peakHeapMB:peakHeap/1024/1024,samples:response.result.samples.length,resultBytes:Buffer.byteLength(JSON.stringify(response.result)),output:response.result.summary.outputCount,oee:response.result.summary.lineOeePercent,node:process.version}));
}
