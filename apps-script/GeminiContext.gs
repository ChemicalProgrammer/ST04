// Bound request size independently of replay duration or the number of saved runs.
var GEMINI_CONTEXT_BUDGET_ = {contextCharacters:96000,historyCharacters:16000,maxEquipment:1000,maxOtherSimulations:30};
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
function buildGeminiContext_(caseData,simulationId) {
  var simulation=(caseData.simulations||[]).find(function(s){return s.id===simulationId;});
  if(!simulation)throw createSimulatorError_('SIMULATION_NOT_FOUND','Select an existing simulation before asking Gemini.');
  var result=simulation.results?.summary?simulation.results:null;
  var audits=STScenarioEngine_.audit(simulation),plan=STScenarioEngine_.plan(simulation);
  var context={version:'analysis-context-v2',case:{id:caseData.id,name:String(caseData.name||'').slice(0,160),unitOfFlow:caseData.unitOfFlow,revision:caseData.revision},selectedSimulation:{id:simulation.id,name:simulation.name,dynamicConfig:compactValues_(simulation.dynamicConfig,1),hasResults:!!result,summary:compactValues_(result?.summary,1),seed:result?.seed,durationSeconds:result?.durationSeconds,equipment:[]},otherSimulations:[],localProposals:plan.projects.map(function(p){return {tier:p.tier,kind:p.kind,basis:p.basis,canApply:p.canApply,changes:p.changes,evidence:p.evidence};}),coverage:{totalEquipment:simulation.equipment.length,includedEquipment:0,omittedEquipment:0,otherSimulationsOmitted:0,replayIncluded:false,eventsIncluded:false,sourceSheetRowsIncluded:false,commandsIncluded:false,commandCount:simulation.dynamicConfig?.commands?.length||0,details:'Full-run aggregates and selected physical inputs only. Raw replay, event logs, raw imports, command schedule and other simulations equipment are excluded. Engineering rules without inputs are not evaluated.'},limitations:plan.checks.filter(function(c){return c.status==='NOT_EVALUATED';}).slice(0,30)};
  if(result?.batch)context.selectedSimulation.replications={rounds:result.batch.rounds,baseSeed:result.batch.baseSeed,statistics:compactValues_(result.batch.statistics,2),evidenceRound:1,note:'Equipment metrics and local proposals use round 1; replication averages are separate.'};
  context.selectedSimulation.equipment=simulation.equipment.slice(0,GEMINI_CONTEXT_BUDGET_.maxEquipment).map(function(e){
    var audit=audits.find(function(a){return a.equipmentId===e.id;});
    return {id:e.id,name:String(e.name).slice(0,120),type:e.type,nominalRatePerSecond:e.nominalRatePerSecond,initialMode:e.initialMode,processData:compactValues_(e.processData,2),noiseProfile:compactValues_(e.noiseProfile,2),metrics:compactValues_(result?.equipmentMetrics?.[e.id],1),engineering:audit?{input:compactValues_(audit.engineering?.input,0),calculated:compactValues_(audit.engineering?.calculated,0),goals:(audit.engineering?.audit?.goals||[]).map(function(g){return {id:g.id,status:g.status};})}:null};
  });
  context.otherSimulations=(caseData.simulations||[]).filter(function(s){return s.id!==simulation.id;}).slice(0,GEMINI_CONTEXT_BUDGET_.maxOtherSimulations).map(function(s){return {id:s.id,name:String(s.name).slice(0,120),equipmentCount:s.equipment.length,seed:s.results?.seed,summary:compactValues_(s.results?.summary,0)};});
  function update(){context.coverage.includedEquipment=context.selectedSimulation.equipment.length;context.coverage.omittedEquipment=simulation.equipment.length-context.coverage.includedEquipment;context.coverage.otherSimulationsOmitted=Math.max(0,caseData.simulations.length-1-context.otherSimulations.length);return JSON.stringify(context);}
  var json=update();
  while(json.length>GEMINI_CONTEXT_BUDGET_.contextCharacters&&context.otherSimulations.length){context.otherSimulations.pop();json=update();}
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
