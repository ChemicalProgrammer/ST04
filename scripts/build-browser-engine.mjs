import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFiles = [
  'src/simulation/SeededRandom.js',
  'src/simulation/ConveyorEngineering.js',
  'src/simulation/FormatGeometryAdapter.js',
  'src/simulation/SimulationValidation.js',
  'src/simulation/LineSimulationEngine.js',
  'src/simulation/SimulationBatch.js',
  'src/simulation/SimulationWorkers.js',
  'src/simulation/SimPyBrowserEngine.js',
  'src/analysis/LinePerformanceAnalysis.js',
  'src/analysis/ScenarioPlanner.js',
  'src/analysis/ScenarioDOE.js',
  'src/analysis/ScenarioSearch.js',
  'src/analysis/ReliabilityTargetSearch.js',
  'src/analysis/FlowFactorScreening.js'
];
const targetFile = path.join(repositoryRoot, 'apps-script', 'SimulationEngine.html');
const pythonRoot=path.join(repositoryRoot,'src/simulation/python');
// Include the audited pure Python wheel, including its MIT license. Users only
// download the pinned Pyodide runtime; no package lookup or PyPI request occurs.
const pythonFiles=JSON.parse(execFileSync('python3',['-c',
  'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))',
  path.join(pythonRoot,'vendor/simpy-4.1.2-py3-none-any.whl')],{encoding:'utf8'}));
for(const name of ['st_des_engine.py','st_simpy_engine.py','st_spatial_engine.py'])pythonFiles[name]=fs.readFileSync(path.join(pythonRoot,name),'utf8');
// Remove documentation-only external project links from the deployed bundle.
// Preserve all license and copyright text.
for (const name of Object.keys(pythonFiles)) {
  pythonFiles[name] = pythonFiles[name].replace(/https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\/[^\s)<>]+/g, 'external project reference');
}

const source = sourceFiles.map(relativePath=>{
  const code=removeModuleSyntax(fs.readFileSync(path.join(repositoryRoot,relativePath),'utf8'));
  return code+(relativePath==='src/simulation/LineSimulationEngine.js'?'\n/* WORKER_MODEL_END */':'');
}).join('\n\n');

const output = `<script>
(function engineRuntime(window) {
'use strict';

/* WORKER_MODEL_START */
${source}

function simulationWorkerMain(){
self.onmessage=async function(event){
    const task=event.data;
    try {
      let lastProgressAt=0;
      const response=await simulateLineAsync(task.input,{detail:task.detail,summaryOnly:task.summaryOnly,yieldBetweenChunks:false,onPartial:task.stream?result=>self.postMessage({type:'partial',id:task.id,result}):undefined,progress:value=>{const now=Date.now();if(value===0||value===1||now-lastProgressAt>=50){lastProgressAt=now;self.postMessage({type:'progress',id:task.id,value});}}});
      self.postMessage({type:'result',id:task.id,response});
    }catch(error){self.postMessage({type:'error',id:task.id,message:error.message});}
  };
self.postMessage({type:'ready'});
}

let workerPool,workerSource,workersUnavailable=false;
const simPyRuntime=createSimPyBrowserEngine(window,${JSON.stringify(pythonFiles).replace(/</g,'\\u003c')});
function selectedEngine(input){
  const id=input.run.engineId||CURRENT_ENGINE_ID;
  if(![CURRENT_ENGINE_ID,SIMPY_ENGINE_ID].includes(id))throw new Error('Unknown simulation engine: '+id);
  return id;
}
async function simulateSelectedLine(input,options={}){
  return selectedEngine(input)===SIMPY_ENGINE_ID?simPyRuntime.run(input,options):simulateLineAsync(input,options);
}
async function calculateBrowserBatch(input,options={}){
  if(selectedEngine(input)===SIMPY_ENGINE_ID)return simulateBatch(input,{...options,runRound:simPyRuntime.run,workerFirstRound:true,concurrency:options.parallel===false?1:simPyRuntime.size,laterSummaryOnly:options.laterSummaryOnly!==false});
  let published=false;
  const onFirstRound=options.onFirstRound?result=>{if(!published){published=true;options.onFirstRound(result);}}:undefined;
  const settings={...options,onFirstRound,laterSummaryOnly:options.laterSummaryOnly!==false};
  const count=input.run.rounds||1;
  if((count<2&&!options.summaryOnly)||options.parallel===false||workersUnavailable||typeof window.Worker!=='function'||!window.Blob||!window.URL?.createObjectURL)return simulateBatch(input,settings);
  if(!workerPool){
    const size=Math.min(4,Math.max(1,(window.navigator?.hardwareConcurrency||3)-1));
    workerSource=workerSource||["'use strict';\\n",engineRuntime.toString().split('/* WORKER_MODEL_START */')[1].split('/* WORKER_MODEL_END */')[0],'('+simulationWorkerMain.toString()+')();'].join('');
    workerPool=createSimulationWorkerPool(()=>{
      const url=window.URL.createObjectURL(new window.Blob([workerSource],{type:'text/javascript'}));
      try{return new window.Worker(url);}finally{window.URL.revokeObjectURL(url);}
    },size);
  }
  try{return await simulateBatch(input,{...settings,runRound:workerPool.run,workerFirstRound:true,concurrency:workerPool.size});}
  catch(error){
    if(error.message!=='SIMULATION_WORKER_UNAVAILABLE')throw error;
    workersUnavailable=true;workerPool?.close(new Error('SIMULATION_WORKER_UNAVAILABLE'));workerPool=null;
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
    return simulateBatch(input,settings);
  }
}
// Exact canonical provenance; include all run inputs and model fields, never
// reuse metrics on a hash collision. Bump the namespace after engine changes.
function simulationInputSignature(input){
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));return value;}
  const run={...input.run};if(run.reliabilityEnabled!==false)delete run.reliabilityEnabled;
  return JSON.stringify(canonical({version:'ST_CURRENT:0.13.0/DES:0.4.0/cache:2',unitOfFlow:input.case.unitOfFlow||'units',equipment:input.case.equipment,run:{durationSeconds:300,tickSeconds:.25,sampleEverySeconds:5,seed:1,commands:[],rounds:1,engineId:CURRENT_ENGINE_ID,...run}}));
}
async function simulateBrowserBatch(input,options={}){
  const signature=simulationInputSignature(input);
  const response=await calculateBrowserBatch(input,options);
  if(response.ok)response.result.inputSignature=signature;
  return response;
}
window.addEventListener?.('pagehide',()=>{workerPool?.close();workerPool=null;});
window.SimulatorEngine = {
  simulateLine: function(input){if(selectedEngine(input)===SIMPY_ENGINE_ID)return {ok:false,error:{code:'ASYNC_ENGINE_REQUIRED',message:'SimPy requires simulateLineAsync.'}};return simulateLine(input);},
  simulateBatch: simulateBrowserBatch,
  inputSignature: simulationInputSignature,
  simulateLineAsync: simulateSelectedLine,
  validateSimulationInput: validateSimulationInput,
  calculateConveyorEngineering: calculateConveyorEngineering,
  analyzeLinePerformance: analyzeLinePerformance,diagnoseLineEfficiency:diagnoseLineEfficiency
};
window.STScenarioDOE = {design:createScenarioDOE,analyze:analyzeScenarioDOE,anova:analyzeScenarioANOVA};
window.STScenarioSearch = {screenFlow:screenFlowFactors,reliabilityTargets:searchReliabilityTargets,profiles:SCENARIO_SEARCH_PROFILES,profile:scenarioSearchProfile,run:scenarioSearchRun,needsMore:scenarioConfirmationNeedsMore,pairedEvidence:scenarioPairedEvidence};
window.STScenarios = {plan:planScenarios,efficiency:diagnoseLineEfficiency,diagnose:diagnoseScenarioLosses,apply:applyScenarioChanges,signature:scenarioSignature,audit:scenarioAudit,fields:SCENARIO_FIELDS,catalog:scenarioVariableCatalog,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,categoryAllows:scenarioCategoryAllows,reliabilitySensitivity:reliabilitySensitivityCandidates};
})(window);
</script>
`;

fs.writeFileSync(targetFile, output);

const scenarioSources = ['src/simulation/ConveyorEngineering.js','src/simulation/FormatGeometryAdapter.js','src/simulation/SimulationValidation.js','src/analysis/LinePerformanceAnalysis.js','src/analysis/ScenarioPlanner.js'];
fs.writeFileSync(path.join(repositoryRoot,'apps-script','ScenarioEngine.gs'),
  'var STScenarioEngine_ = (function(){\n'+
  scenarioSources.map(file=>removeModuleSyntax(fs.readFileSync(path.join(repositoryRoot,file),'utf8'))).join('\n')+
  '\nreturn {plan:planScenarios,efficiency:diagnoseLineEfficiency,diagnose:diagnoseScenarioLosses,apply:applyScenarioChanges,signature:scenarioSignature,audit:scenarioAudit,fields:SCENARIO_FIELDS,catalog:scenarioVariableCatalog,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,categoryAllows:scenarioCategoryAllows,reliabilitySensitivity:reliabilitySensitivityCandidates};\n})();\n');

function removeModuleSyntax(moduleSource) {
  return moduleSource
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
}


