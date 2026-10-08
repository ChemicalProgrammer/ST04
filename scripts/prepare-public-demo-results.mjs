// Rebuild measured demo fixtures after changing inputs or simulation mathematics.
import fs from 'node:fs';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
const factory=vm.createContext({});
vm.runInContext(fs.readFileSync('apps-script/PublicDemoCaseFactory.gs','utf8'),factory);
const record=JSON.parse(JSON.stringify(factory.createPublicDemoCaseRequest_()));
const engine=fs.readFileSync('apps-script/SimulationEngine.html','utf8');
const start=engine.indexOf('function simulationInputSignature('),end=engine.indexOf('async function simulateBrowserBatch(',start);
const signatureContext=vm.createContext({CURRENT_ENGINE_ID:'ST_CURRENT'});
vm.runInContext(engine.slice(start,end),signatureContext);
const data={revision:record.metadata.demoRevision,input:record.simulations.map(s=>({equipment:s.equipment,run:s.dynamicConfig})),results:[]};
for(const simulation of record.simulations){
 const input={case:{id:'public-demo',unitOfFlow:record.unitOfFlow,equipment:simulation.equipment},run:simulation.dynamicConfig};
 const response=await simulateBatch(input,{laterSummaryOnly:true,yieldControl:()=>Promise.resolve()});
 if(!response.ok)throw Error(JSON.stringify(response));
 const result=response.result,signature=signatureContext.simulationInputSignature(input);
 const replay={...result,samples:[result.samples[0],result.samples.at(-1)],events:[],inputSignature:signature,engineId:'ST_CURRENT'};
 delete replay.batch;
 delete replay.summary;delete replay.equipmentMetrics;delete replay.accumulationZoneMetrics;
 const coverage={savedReplaySampled:true,savedSamplesReduced:true,savedEventsOmitted:result.events.length,description:'Prepared demo retains the initial and final frames; rerun to inspect full playback.'};
 replay.detailCoverage={...result.detailCoverage,...coverage};
 data.results.push({unitOfFlow:record.unitOfFlow,engineId:'ST_CURRENT',inputSignature:signature,seed:input.run.seed,durationSeconds:input.run.durationSeconds,
  completedAt:new Date().toISOString(),preparedDemo:true,summary:result.summary,equipmentMetrics:result.equipmentMetrics,accumulationZoneMetrics:result.accumulationZoneMetrics,
  shifts:result.shifts,replicationStatus:{state:'COMPLETE',completedRounds:input.run.rounds,totalRounds:input.run.rounds},batch:{...result.batch,replays:[]},replay});
 console.log(simulation.id+': '+result.batch.statistics.lineOeePercent.mean.toFixed(2)+'%');
}
const encoded=gzipSync(JSON.stringify(data)).toString('base64');
fs.writeFileSync('apps-script/PublicDemoResults.gs','// GENERATED measured results. Rebuild with node scripts/prepare-public-demo-results.mjs.\nfunction preparedPublicDemoResults_(){return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode('+JSON.stringify(encoded)+'),"application/x-gzip")).getDataAsString("UTF-8"));}\n');
