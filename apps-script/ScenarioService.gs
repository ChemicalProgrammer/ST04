function getScenarioSourceSignature_(request,user) {
  var record=getCase_(request.caseId,user);
  if(Number(request.expectedRevision)!==Number(record.revision))throw createSimulatorError_('CASE_CONFLICT','The case changed. Review the latest version before creating a scenario.');
  var source=record.simulations.find(function(s){return s.id===request.simulationId;});
  if(!source)throw createSimulatorError_('SIMULATION_NOT_FOUND','The source simulation no longer exists.');
  return {revision:record.revision,simulationId:source.id,signature:STScenarioEngine_.signature(source)};
}

function createScenario_(request,user) {
  return withCaseWriteLock_(function() {
    var owned=getOwnedCaseFile_(request.caseId,user),record=ensureCaseSimulations_(owned.caseData);
    var prepared=prepareScenarioFromRecord_(request,record,user);
    owned.file=persistCaseRecord_(record,owned);if(typeof updateCaseIndex_==='function')updateCaseIndex_(record,owned.file,user);return prepared;
  });
}
function prepareScenarioFromRecord_(request,record,user) {
    if(Number(request.expectedRevision)!==Number(record.revision))throw createSimulatorError_('CASE_CONFLICT','The case changed. Review the latest version before creating a scenario.');
    var source=record.simulations.find(function(s){return s.id===request.simulationId;});
    if(!source)throw createSimulatorError_('SIMULATION_NOT_FOUND','The source simulation no longer exists.');
    var sourceSignature=STScenarioEngine_.signature(source),submitted=request.proposal;
    if(request.origin==='LOCAL'){
      // Recompute the recommendation from the supplied source. A local
      // proposal is valid only if its exact edits still match a current candidate.
      // Browser fingerprints are not needed to establish that equivalence.
      submitted=resolveLocalScenarioProposal_(submitted,source);
    }else if(['GEMINI','REVIEWED'].includes(request.origin)){
      if(request.sourceSignature!==sourceSignature)throw createSimulatorError_('SCENARIO_STALE','The simulation inputs changed. Request a new proposal.');
    }else throw createSimulatorError_('INVALID_SCENARIO','The scenario origin is invalid.');
    var proposal=normalizeScenarioProposal_(submitted,source),copy;
    try{copy=STScenarioEngine_.apply(source,proposal.changes);}catch(error){throw createSimulatorError_('INVALID_SCENARIO','The proposed inputs did not pass the physical model checks.',[String(error.message)]);}
    copy.id=generateSimulationId_(record.simulations.length)+'-'+Utilities.getUuid().slice(0,8);
    copy.name=proposal.title.slice(0,120);copy.clonedFromSimulationId=source.id;copy.results=null;copy.geminiHistory=[];delete copy.whatIf;
    copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
    copy.scenario={analysisOnly:proposal.analysisOnly,classification:proposal.analysisOnly?'UNASSIGNED':'INTERVENTION_SCOPE',kind:proposal.kind,title:proposal.title,capex:proposal.analysisOnly?null:proposal.tier,evidenceBasis:proposal.basis,sourceSimulationId:source.id,sourceSimulationName:source.name,sourceSignature:sourceSignature,changes:proposal.changes,evidence:proposal.evidence,origin:request.origin,plantValidated:false,validation:proposal.analysisOnly?'EXPLORATORY_TARGETS_REQUIRE_FEASIBILITY_REVIEW':proposal.evidence.engineeringReview?'ENGINEERING_REVIEW_REQUIRED':proposal.evidence.independentValidation==='NOT_REPRODUCED_REQUIRES_VALIDATION'?'NOT_REPRODUCED_REQUIRES_VALIDATION':copy.scenarioWarnings?.length?'ENGINEERING_REVIEW_REQUIRED':'INPUTS_VALIDATED_NOT_SIMULATED',engineeringWarnings:copy.scenarioWarnings||[],createdAt:copy.createdAt};
    record.simulations.push(copy);record.revision++;record.updatedAt=copy.createdAt;
    return {case:record,simulationId:copy.id};
}
function resolveLocalScenarioProposal_(proposal,source) {
  if(!proposal||proposal.sourceSimulationId!==source.id||!Array.isArray(proposal.changes)||!proposal.changes.length)throw createSimulatorError_('INVALID_SCENARIO','The local scenario source or changes are invalid.');
  var current=STScenarioEngine_.plan(source).candidates.find(function(candidate){
    return candidate.canApply&&candidate.kind===proposal.kind&&candidate.tier===proposal.tier&&candidate.basis===proposal.basis&&
      candidate.equipmentId===proposal.equipmentId&&candidate.changes.length===proposal.changes.length&&
      candidate.changes.every(function(change,index){
        var submitted=proposal.changes[index];
        return submitted&&change.equipmentId===submitted.equipmentId&&change.path===submitted.path&&change.before===submitted.before&&change.after===submitted.after;
      });
  });
  if(!current)throw createSimulatorError_('SCENARIO_REVIEW_REQUIRED','The saved inputs now produce a different recommendation. Reopen What-If to review the updated proposal.');
  // Evidence is always recomputed by the server; only the display title comes
  // from the client, and its type and length are validated by the shared service.
  return Object.assign({},current,{title:proposal.title});
}
function normalizeScenarioProposal_(proposal,source) {
  if(!proposal||!['ZERO','MEDIUM','HIGH'].includes(proposal.tier)||!['STATIC','DYNAMIC','HYBRID'].includes(proposal.basis)||!Array.isArray(proposal.changes))throw createSimulatorError_('INVALID_SCENARIO','The scenario format is invalid.');
  if(proposal.basis!=='STATIC'&&!source.results?.summary)throw createSimulatorError_('INVALID_SCENARIO','Dynamic evidence requires a completed simulation.');
  var title=typeof proposal.title==='string'?proposal.title.trim().slice(0,120):'';
  if(!title)throw createSimulatorError_('INVALID_SCENARIO','A scenario title is required.');
  // Field allowlist, value bounds, expected before values, topology and audits are shared with the browser.
  try{STScenarioEngine_.apply(source,proposal.changes);}catch(error){throw createSimulatorError_('INVALID_SCENARIO','The scenario contains an invalid or stale change.',[String(error.message)]);}
  var exploratory=proposal.analysisOnly===true;if(exploratory&&!proposal.changes.some(c=>c.analysisOnly===true))throw createSimulatorError_('INVALID_SCENARIO','An exploratory scenario requires explicit exploratory changes.');
  var changes=proposal.changes.map(function(c){return {equipmentId:c.equipmentId,path:c.path,before:c.before,after:c.after,...(c.analysisOnly===true?{analysisOnly:true}:{}),...(c.replacementMaximumBpm!==undefined?{replacementMaximumBpm:c.replacementMaximumBpm}:{}),...(c.originTier?{originTier:c.originTier}:{}),unit:STScenarioEngine_.fields[c.path][2],...(c.external===true?{external:true,...(typeof c.justification==='string'?{justification:c.justification.slice(0,600),interventionType:c.interventionType,costClass:STScenarioEngine_.interventions[c.interventionType]?.costClass}:{})}:{})};});
  if(proposal.changes.some(function(c){return !(exploratory&&c.analysisOnly===true&&c.interventionType==='SENSITIVITY'&&c.path.startsWith('noiseProfile.reliability.')||STScenarioEngine_.categoryAllows(c,c.originTier||proposal.tier))||c.originTier&&(['ZERO','MEDIUM','HIGH'].indexOf(c.originTier)>['ZERO','MEDIUM','HIGH'].indexOf(proposal.tier));}))throw createSimulatorError_('INVALID_SCENARIO','Intervention scope does not match CAPEX category, or exploratory sensitivity was submitted as a target.');
  var evidence={};
  if(proposal.evidence&&typeof proposal.evidence==='object'&&!Array.isArray(proposal.evidence))Object.keys(proposal.evidence).slice(0,12).forEach(function(key){
    if(!/^[a-zA-Z][a-zA-Z0-9]{0,60}$/.test(key)||['constructor','prototype'].includes(key))return;
    var value=proposal.evidence[key];if(typeof value==='number'&&isFinite(value)||value===null)evidence[key]=value;else if(typeof value==='string')evidence[key]=value.slice(0,600);
  });
  // Keep the conservative draft classification even if generic evidence hit its key budget.
  if(proposal.evidence?.independentValidation==='NOT_REPRODUCED_REQUIRES_VALIDATION')evidence.independentValidation='NOT_REPRODUCED_REQUIRES_VALIDATION';
  return {analysisOnly:exploratory,title:title,kind:typeof proposal.kind==='string'?proposal.kind.slice(0,60):'CUSTOM',tier:proposal.tier,basis:proposal.basis,changes:changes,evidence:evidence};
}

