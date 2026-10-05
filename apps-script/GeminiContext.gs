// Bound request size independently of replay duration or the number of saved runs.
var GEMINI_CONTEXT_BUDGET_ = {contextCharacters:96000,requestCharacters:160000,historyCharacters:16000,maxEquipment:1000,maxOtherSimulations:30,maxSearchEvaluations:6,maxSearchTrials:12,maxEvidenceChanges:12,searchEvidenceCharacters:12000,maxLocalProposals:12,maxLocalChanges:24};
function compactValues_(object,depth) {
  if(!object||typeof object!=='object'||Array.isArray(object))return {};
  var result={};Object.keys(object).slice(0,48).forEach(function(key){
    if(['replay','events','samples','sourceImport','rows','__proto__','constructor','prototype'].includes(key))return;
    var value=object[key];
    if(typeof value==='number'&&isFinite(value)||typeof value==='boolean'||value===null)result[key]=value;
    else if(typeof value==='string')result[key]=value.slice(0,180);
    else if(depth>0&&value&&!Array.isArray(value))result[key]=compactValues_(value,depth-1);
  });return result;
}
// Compact search evidence is advisory data; approval remains in the simulator.
function compactSearchEvidence_(simulation) {
  var signature=STScenarioEngine_.signature(simulation),all=simulation.whatIf?.evaluations||[];
  var current=all.filter(function(e){return e.sourceSimulationId===simulation.id&&e.sourceSignature===signature;}).sort(function(a,b){return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));});
  function changes(items){return (items||[]).slice(0,GEMINI_CONTEXT_BUDGET_.maxEvidenceChanges).map(function(c){return {equipmentId:c.equipmentId,path:c.path,before:c.before,after:c.after,external:!!c.external,justification:typeof c.justification==='string'?c.justification.slice(0,240):undefined};});}
  function metrics(m){return m?{oee:m.oee,throughput:m.throughput}:undefined;}
  var entries=current.slice(0,GEMINI_CONTEXT_BUDGET_.maxSearchEvaluations).map(function(e){
    var trials=e.trialHistory||[],selected=(e.selections||[]).filter(function(c){return c.selected;});
    return {title:String(e.title||'').slice(0,160),scope:e.searchScope,status:e.status,method:e.method,updatedAt:e.updatedAt,run:compactValues_(e.run,0),searchStoppedEarly:!!e.searchStoppedEarly,trials:e.trials,infeasibleTrials:e.infeasibleTrials,
      baseline:metrics(e.baseline),best:metrics(e.candidate),changes:changes(e.evaluatedChanges),changesOmitted:Math.max(0,(e.evaluatedChanges||[]).length-GEMINI_CONTEXT_BUDGET_.maxEvidenceChanges),
      limits:selected.slice(0,GEMINI_CONTEXT_BUDGET_.maxEvidenceChanges).map(function(c){return {equipmentId:c.equipmentId,path:c.path,limit:c.limit,direction:c.limitDirection,unit:c.unit};}),limitsOmitted:Math.max(0,selected.length-GEMINI_CONTEXT_BUDGET_.maxEvidenceChanges),
      independentCheck:e.independentCheck?{passed:e.independentCheck.passed,seed:e.independentCheck.seed,rounds:e.independentCheck.rounds,baseline:metrics(e.independentCheck.baseline),candidate:metrics(e.independentCheck.candidate)}:undefined,
      warningCount:(e.warnings||[]).length,doe:e.doe?{combinations:e.doe.combinations,completed:(e.doe.observations||[]).length,complete:!!e.doe.analysis?.complete}:undefined,
      tested:trials.slice(-GEMINI_CONTEXT_BUDGET_.maxSearchTrials).map(function(t){return {changes:changes(t.changes),changesOmitted:Math.max(0,(t.changes||[]).length-GEMINI_CONTEXT_BUDGET_.maxEvidenceChanges),feasible:t.feasible,oee:t.oee,throughput:t.throughput,warningCount:t.warningCount};}),
      testedOmitted:Math.max(0,trials.length-GEMINI_CONTEXT_BUDGET_.maxSearchTrials)+(e.trialHistoryOmitted||0),trialHistoryAvailable:Array.isArray(e.trialHistory)};
  });
  while(entries.length&&JSON.stringify(entries).length>GEMINI_CONTEXT_BUDGET_.searchEvidenceCharacters)entries.pop();
  return {evaluations:entries,totalCurrent:current.length,omitted:current.length-entries.length,staleExcluded:all.length-current.length,details:'Bounded saved search evidence only; tested is a partial history, not all combinations. Missing trial history on older evaluations is unknown. Running/cancelled results are provisional. No plant validation.'};
}
function buildGeminiContext_(caseData,simulationId) {
  var simulation=(caseData.simulations||[]).find(function(s){return s.id===simulationId;});
  if(!simulation)throw createSimulatorError_('SIMULATION_NOT_FOUND','Select an existing simulation before asking Gemini.');
  var result=simulation.results?.summary?simulation.results:null;
  // Planner candidate validation clones inputs: keep replay and saved search history
  // out of that working copy as well as out of the HTTP payload.
  var planning={id:simulation.id,equipment:simulation.equipment,dynamicConfig:simulation.dynamicConfig,unitOfFlow:simulation.unitOfFlow,results:result?{summary:result.summary,equipmentMetrics:result.equipmentMetrics,accumulationZoneMetrics:result.accumulationZoneMetrics,durationSeconds:result.durationSeconds,unitOfFlow:result.unitOfFlow}:null};
  var audits=STScenarioEngine_.audit(planning),plan=STScenarioEngine_.plan(planning),searchEvidence=compactSearchEvidence_(simulation);
  var context={version:'analysis-context-v2',case:{id:caseData.id,name:String(caseData.name||'').slice(0,160),unitOfFlow:caseData.unitOfFlow,revision:caseData.revision},selectedSimulation:{id:simulation.id,name:simulation.name,dynamicConfig:compactValues_(simulation.dynamicConfig,1),hasResults:!!result,summary:compactValues_(result?.summary,1),seed:result?.seed,durationSeconds:result?.durationSeconds,equipment:[]},otherSimulations:[],searchEvidence:searchEvidence,localProposals:plan.projects.slice(0,GEMINI_CONTEXT_BUDGET_.maxLocalProposals).map(function(p){return {tier:p.tier,kind:p.kind,basis:p.basis,canApply:p.canApply,changes:p.changes.slice(0,GEMINI_CONTEXT_BUDGET_.maxLocalChanges),changesOmitted:Math.max(0,p.changes.length-GEMINI_CONTEXT_BUDGET_.maxLocalChanges),evidence:compactValues_(p.evidence,1)};}),coverage:{totalEquipment:simulation.equipment.length,includedEquipment:0,omittedEquipment:0,otherSimulationsOmitted:0,replayIncluded:false,eventsIncluded:false,sourceSheetRowsIncluded:false,commandsIncluded:false,commandCount:simulation.dynamicConfig?.commands?.length||0,details:'Full-run aggregates and selected physical inputs only. Raw replay, event logs, raw imports, command schedule and other simulations equipment are excluded. Engineering rules without inputs are not evaluated.'},limitations:plan.checks.filter(function(c){return c.status==='NOT_EVALUATED';}).slice(0,30)};
  if(result?.batch)context.selectedSimulation.replications={rounds:result.batch.rounds,baseSeed:result.batch.baseSeed,statistics:compactValues_(result.batch.statistics,2),evidenceRound:1,note:'Equipment metrics and local proposals use round 1; replication averages are separate.'};
  context.selectedSimulation.equipment=simulation.equipment.slice(0,GEMINI_CONTEXT_BUDGET_.maxEquipment).map(function(e){
    var audit=audits.find(function(a){return a.equipmentId===e.id;});
    return {id:e.id,name:String(e.name).slice(0,120),type:e.type,nominalRatePerSecond:e.nominalRatePerSecond,initialMode:e.initialMode,processData:compactValues_(e.processData,2),noiseProfile:compactValues_(e.noiseProfile,2),metrics:compactValues_(result?.equipmentMetrics?.[e.id],1),engineering:audit?{input:compactValues_(audit.engineering?.input,0),calculated:compactValues_(audit.engineering?.calculated,0),goals:(audit.engineering?.audit?.goals||[]).map(function(g){return {id:g.id,status:g.status};})}:null};
  });
  context.otherSimulations=(caseData.simulations||[]).filter(function(s){return s.id!==simulation.id;}).slice(0,GEMINI_CONTEXT_BUDGET_.maxOtherSimulations).map(function(s){return {id:s.id,name:String(s.name).slice(0,120),equipmentCount:s.equipment.length,seed:s.results?.seed,summary:compactValues_(s.results?.summary,0)};});
  function update(){context.coverage.searchEvaluationsIncluded=context.searchEvidence.evaluations.length;context.coverage.searchEvaluationsOmitted=context.searchEvidence.totalCurrent-context.searchEvidence.evaluations.length;context.searchEvidence.omitted=context.coverage.searchEvaluationsOmitted;context.coverage.localProposalsOmitted=plan.projects.length-context.localProposals.length;context.coverage.includedEquipment=context.selectedSimulation.equipment.length;context.coverage.omittedEquipment=simulation.equipment.length-context.coverage.includedEquipment;context.coverage.otherSimulationsOmitted=Math.max(0,caseData.simulations.length-1-context.otherSimulations.length);return JSON.stringify(context);}
  var json=update();
  while(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters&&context.otherSimulations.length){context.otherSimulations.pop();json=update();}
  while(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters&&context.localProposals.length){context.localProposals.pop();json=update();}
  while(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters&&context.searchEvidence.evaluations.length){context.searchEvidence.evaluations.pop();json=update();}
  while(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters&&context.selectedSimulation.equipment.length){context.selectedSimulation.equipment.pop();json=update();}
  if(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters)throw createSimulatorError_('GEMINI_CONTEXT_LIMIT','The compact analysis is still too large. Reduce the selected equipment scope.');
  return {json:json,coverage:context.coverage,simulation:simulation,characters:json.length};
}
function compactGeminiHistory_(history) {
  if(!Array.isArray(history)||history.length>24)throw createSimulatorError_('INVALID_HISTORY','Clear the conversation and try again.');
  history.forEach(function(m){if(!m||!['user','model'].includes(m.role)||typeof m.text!=='string'||m.text.length>32000)throw createSimulatorError_('INVALID_HISTORY','Clear the conversation and try again.');});
  var selected=[],size=0;
  for(var i=history.length-1;i>=0;i--){if(size+history[i].text.length>GEMINI_CONTEXT_BUDGET_.historyCharacters)break;selected.unshift({role:history[i].role,parts:[{text:history[i].text}]});size+=history[i].text.length;}
  // Conversations sent to Gemini begin with a user turn.
  while(selected.length&&selected[0].role!=='user')selected.shift();
  return {contents:selected,omitted:history.length-selected.length};
}
