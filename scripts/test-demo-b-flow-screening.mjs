import fs from 'node:fs';
import {screenFlowFactors} from '../src/analysis/FlowFactorScreening.js';
import {planScenarios,applyScenarioChanges} from '../src/analysis/ScenarioPlanner.js';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
const simulation=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0];
const fixed=JSON.parse(fs.readFileSync('docs/demo-b-reliability-target-results.json','utf8')).discovery.selectedChanges;
const plan=planScenarios(applyScenarioChanges(simulation,fixed)),unique=new Map();
for(const p of plan.candidates.filter(p=>p.canApply))for(const change of p.changes)if(!change.path.startsWith('noiseProfile.reliability.')){const key=change.equipmentId+':'+change.path;if(!unique.has(key)||unique.get(key).priority<p.priority)unique.set(key,{change,priority:p.priority});}
const run={...simulation.dynamicConfig,durationSeconds:900,rounds:3};
const start=Date.now();const report=await screenFlowFactors(simulation,{fixedChanges:fixed,targets:[...unique.values()],run,measure:async(model,changes,r)=>{
 const candidate=applyScenarioChanges(model,changes),response=await simulateBatch({case:{id:model.id,unitOfFlow:'units',equipment:candidate.equipment},run:r},{summaryOnly:true,yieldControl:()=>Promise.resolve()});if(!response.ok)throw Error(JSON.stringify(response.error));const stats=response.result.batch.statistics,overflow=stats.totalOverflowUnits?.mean||0;
 return {oee:stats.lineOeePercent.mean,throughput:stats.throughputPerMinute.mean,overflowUnits:overflow,warnings:[...(candidate.scenarioWarnings||[]),...(overflow>1e-6?[{equipmentId:'LINE',rule:'SIMULATED_OVERFLOW',after:overflow}]:[])],roundMetrics:response.result.batch.rows.map(row=>({seed:row.seed,oee:row.summary.lineOeePercent,throughput:row.summary.outputCount/r.durationSeconds*60}))};
},progress:info=>console.log(JSON.stringify(info))});
fs.writeFileSync('docs/demo-b-flow-screening-results.json',JSON.stringify({scope:'Controlled screening only, all available category targets; not a complete High search or independent validation',elapsedSeconds:(Date.now()-start)/1000,report},null,2)+'\n');console.log(JSON.stringify({elapsedSeconds:(Date.now()-start)/1000,calculations:report.calculations,screened:report.screened,pairs:report.pairs.length,selectedFactors:report.selectedFactors,outcome:report.outcome}));
