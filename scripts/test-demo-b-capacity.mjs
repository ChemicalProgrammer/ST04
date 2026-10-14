import fs from 'node:fs';
import {simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {applyScenarioChanges} from '../src/analysis/ScenarioPlanner.js';
import {diagnoseLineEfficiency} from '../src/analysis/LinePerformanceAnalysis.js';
const s=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0];
const change=index=>({equipmentId:s.equipment[index].id,path:'nominalRatePerSecond',before:s.equipment[index].nominalRatePerSecond,after:200/60,replacementMaximumBpm:220,external:true,interventionType:'REPLACEMENT',justification:'Illustrative capacity test only; not supplier data or an implementation recommendation.'});
const cases=[['Baseline without failures',[]],['Filler replacement',[change(4)]],['Combined machine replacements',[2,4,6,8,10].map(change)]];
const report={modelVersion:'0.13.0',run:{...s.dynamicConfig,durationSeconds:28800,reliabilityEnabled:false,rounds:1},interpretation:'Illustrative non-reference capacity hypotheses, not documented supplier targets. Original photo geometry and reference retained. One full eight-hour diagnostic run per case; no independent validation or economic recommendation.',results:[]};
for(const [name,changes] of cases){const candidate=changes.length?applyScenarioChanges(s,changes):s;const r=await simulateLineAsync({case:{id:s.id,unitOfFlow:'units',equipment:candidate.equipment},run:report.run},{summaryOnly:true,yieldBetweenChunks:false});if(!r.ok)throw Error(JSON.stringify(r.error));const d=diagnoseLineEfficiency(candidate.equipment,r.result);report.results.push({name,changes,summary:r.result.summary,diagnosis:d,warnings:candidate.scenarioWarnings||[]});console.log(JSON.stringify({name,oee:r.result.summary.lineOeePercent,ceiling:d.capacityCeilingPercent,residual:d.residualLossPp,limiting:d.limitingEquipment.map(e=>e.name)}));}
fs.writeFileSync('docs/demo-b-capacity-results.json',JSON.stringify(report,null,2)+'\n');
