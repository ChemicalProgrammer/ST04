function listCases_(user) { return getCaseCatalog_(user).cases; }

function createCase_(request, user) { return withCaseWriteLock_(function(){return createCaseUnlocked_(request,user);}); }
function createCaseUnlocked_(request, user) {
  var caseData = createNewCaseRecord_(request, user);
  var folders = getWorkspaceFolders_();
  if (folders.cases.getFilesByName(caseData.id+'.case.json').hasNext() || folders.cases.getFoldersByName(caseData.id).hasNext()) {
    throw createSimulatorError_('CASE_ALREADY_EXISTS', 'A case with this identifier already exists.');
  }
  var file = persistCaseRecord_(caseData, null);
  if(typeof updateCaseIndex_==='function')updateCaseIndex_(caseData,file,user);
  return toCaseSummary_(caseData, file);
}

function cloneCase_(caseId, user) {
  var source = getCase_(caseId, user);
  var copy = JSON.parse(JSON.stringify(source));
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.revision;
  copy.name = __ST_TEXT__('casegallery.copy_prefix') + source.name;
  copy.metadata = copy.metadata || {};
  copy.metadata.clonedFromCaseId = source.id;
  copy.metadata.clonedFromCaseName = source.name;
  return createCase_(copy, user);
}

function getCase_(caseId, user, migrateOnOpen) {
  function load() {
    var owned=getOwnedCaseFile_(caseId,user),record=ensureCaseSimulations_(owned.caseData);
    if(migrateOnOpen&&!owned.folder) {
      try {
        var file=persistCaseRecord_(record,owned);
        record.storageVersion='case-folder-1';
        if(typeof updateCaseIndex_==='function')updateCaseIndex_(record,file,user);
      }catch(error){
        // Keep legacy data usable if Drive conversion fails; retry on open/save.
        record.storageMigrationPending=true;
        console.error(JSON.stringify({event:'CASE_MIGRATION_FAILURE',type:error?.name||'Error'}));
      }
    }
    return record;
  }
  return migrateOnOpen?withCaseWriteLock_(load):load();
}

function deleteCase_(caseId, user) { return withCaseWriteLock_(function(){return deleteCaseUnlocked_(caseId,user);}); }
function deleteCaseUnlocked_(caseId, user) {
  var owned = getOwnedCaseFile_(caseId, user, true);
  var summary = { id: owned.caseData.id, name: owned.caseData.name };
  if(owned.folder) {
    // A legacy file may remain if migration cleanup previously failed.
    var legacy=getWorkspaceFolders_().cases.getFilesByName(owned.caseData.id+'.case.json');
    while(legacy.hasNext()) {var file=legacy.next(),record=tryReadCaseFile_(file);if(record&&record.id===owned.caseData.id&&record.ownerEmail===user.email)file.setTrashed(true);}
  }
  (owned.folder || owned.file).setTrashed(true);
  if(typeof updateCaseIndex_==='function')updateCaseIndex_(owned.caseData,owned.file,user,true);
  return summary;
}

function withCaseWriteLock_(action) {
  var lock=LockService.getUserLock();
  if(!lock.tryLock(10000))throw createSimulatorError_('CASE_BUSY','Another save is in progress. Try again.');
  try{return action();}finally{lock.releaseLock();}
}
function saveCase_(request, user) { return withCaseWriteLock_(function(){return saveCaseUnlocked_(request,user);}); }
function saveCaseUnlocked_(request, user) {
  if (!request || typeof request !== 'object') {
    throw createSimulatorError_('INVALID_CASE', 'The case must be an object.');
  }

  var stage='READ';
  try {
  // Full editor requests already contain simulations; read only the manifest.
  var owned = getOwnedCaseFile_(request.id, user, Array.isArray(request.simulations));
  var current = owned.caseData;
  if (Number(request.expectedRevision) !== Number(current.revision)) {
    throw createSimulatorError_('CASE_CONFLICT', 'This Case was changed elsewhere. Reload it before saving.');
  }

  stage='NORMALIZE';
  var next = buildUpdatedCase_(request, current, user);
  stage='WRITE';
  owned.file = persistCaseRecord_(next, owned);
  if(typeof updateCaseIndex_==='function')updateCaseIndex_(next,owned.file,user);
  return next;
  }catch(error){
    if(error&&error.simulatorError)throw error;
    var reference='SAVE-'+new Date().getTime().toString(36);
    console.error(JSON.stringify({event:'CASE_SAVE_FAILURE',reference:reference,stage:stage,type:error?.name||'Error'}));
    throw createSimulatorError_('CASE_SAVE_FAILED','The case could not be saved at stage '+stage+'. Your draft is retained. Retry or reopen after exporting your data. Reference: '+reference);
  }
}

function createNewCaseRecord_(request, user) {
  if (!request || typeof request !== 'object') {
    throw createSimulatorError_('INVALID_CASE', 'The case must be an object.');
  }

  var name = requireCaseName_(request.name);
  var id = request.id ? requireCaseId_(request.id) : generateCaseId_(name);
  var equipment = normalizeEquipmentList_(request.equipment || []);
  var simulations = normalizeSimulations_(request.simulations, equipment, request.engineConfig);
  var now = new Date().toISOString();
  return {
    schemaVersion: '1.0',
    id: id,
    name: name,
    unitOfFlow: normalizeUnitOfFlow_(request.unitOfFlow),
    equipment: equipment,
    engineConfig: normalizeObject_(request.engineConfig),
    simulations: simulations,
    activeSimulationId: simulations.some(function(sim){return sim.id===request.activeSimulationId;})?request.activeSimulationId:simulations[0].id,
    metadata: normalizeCaseMetadata_(request.metadata),
    stateIds: normalizeStringList_(request.stateIds),
    ownerEmail: user.email,
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
}

function buildUpdatedCase_(request, current, user) {
  var activeEquipment = normalizeEquipmentList_(request.equipment);
  var simulations = normalizeSimulations_(request.simulations, activeEquipment, request.engineConfig);
  return {
    schemaVersion: current.schemaVersion || '1.0',
    id: current.id,
    name: requireCaseName_(request.name),
    unitOfFlow: normalizeUnitOfFlow_(request.unitOfFlow),
    equipment: activeEquipment,
    engineConfig: normalizeObject_(request.engineConfig || current.engineConfig),
    simulations: simulations,
    activeSimulationId: simulations.some(function(sim){return sim.id===request.activeSimulationId;})?request.activeSimulationId:simulations[0].id,
    metadata: request.metadata === undefined ? normalizeCaseMetadata_(current.metadata) : normalizeCaseMetadata_(request.metadata),
    stateIds: normalizeStringList_(current.stateIds),
    ownerEmail: user.email,
    revision: Number(current.revision || 0) + 1,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };
}

function ensureCaseSimulations_(caseData) {
  if (Array.isArray(caseData.simulations) && caseData.simulations.length) return caseData;
  var next = JSON.parse(JSON.stringify(caseData));
  next.simulations = normalizeSimulations_(null, next.equipment || [], next.engineConfig || {});
  return next;
}

function normalizeSimulations_(simulations, fallbackEquipment, fallbackConfig) {
  if(Array.isArray(simulations)&&!simulations.length)throw createSimulatorError_('INVALID_CASE','Keep at least one simulation in a case.');
  var ids={};
  var source = Array.isArray(simulations) && simulations.length ? simulations : [{
    id: 'simulation-a', name: 'Simulation A', equipment: fallbackEquipment || [],
    dynamicConfig: normalizeObject_(fallbackConfig), results: null
  }];
  return source.map(function(simulation, index) {
    if(simulation.id&&ids[simulation.id])throw createSimulatorError_('INVALID_CASE','Simulation identifiers must be unique.');
    if(simulation.id)ids[simulation.id]=true;
    var simulationEquipment = normalizeEquipmentList_(simulation.equipment === undefined ? fallbackEquipment : simulation.equipment || []);
    return {
      id: typeof simulation.id === 'string' && simulation.id ? simulation.id : generateSimulationId_(index),
      name: typeof simulation.name === 'string' && simulation.name ? simulation.name.slice(0, 120) : 'Simulation ' + simulationLetter_(index),
      equipment: simulationEquipment,
      dynamicConfig: normalizeObject_(simulation.dynamicConfig),
      playbackRate: [0.5,1,2,5,10,20,50,100,200,500,1000].includes(Number(simulation.playbackRate))?Number(simulation.playbackRate):1,
      results: normalizeObject_(simulation.results),
      scenario: normalizeObject_(simulation.scenario),
      whatIf: normalizeObject_(simulation.whatIf),
      sourceImport: normalizeObject_(simulation.sourceImport),
      geminiHistory: normalizeGeminiConversation_(simulation.geminiHistory),
      clonedFromSimulationId: typeof simulation.clonedFromSimulationId === 'string' ? simulation.clonedFromSimulationId : null,
      createdAt: typeof simulation.createdAt === 'string' ? simulation.createdAt : new Date().toISOString(),
      updatedAt: typeof simulation.updatedAt === 'string' ? simulation.updatedAt : new Date().toISOString()
    };
  });
}

// Keep presentation nodes and draft/reveal flags out of persisted conversations.
function normalizeGeminiConversation_(history) {
  if(history===undefined)return [];
  if(!Array.isArray(history))throw createSimulatorError_('INVALID_CASE','Gemini history must be a list.');
  return history.map(function(message){
    if(!message||!['user','model'].includes(message.role)||typeof message.text!=='string')throw createSimulatorError_('INVALID_CASE','Gemini history contains an invalid message.');
    return {role:message.role,text:message.text,scope:message.scope==='GENERAL'?'GENERAL':'CASE',createdAt:typeof message.createdAt==='string'?message.createdAt:undefined,
      proposals:message.role==='model'&&Array.isArray(message.proposals)?JSON.parse(JSON.stringify(message.proposals)):[],
      context:message.role==='model'&&message.context?normalizeObject_(message.context):undefined,historyOmitted:Number.isFinite(message.historyOmitted)?message.historyOmitted:0};
  });
}

function generateSimulationId_(index) { return 'simulation-' + simulationLetter_(index).toLowerCase() + '-' + new Date().getTime(); }
function simulationLetter_(index) { return String.fromCharCode(65 + index); }

function getOwnedCaseFile_(caseId, user, metadataOnly) {
  var normalizedId = requireCaseId_(caseId);
  var root=getWorkspaceFolders_().cases,folders=root.getFoldersByName(normalizedId);
  if(folders.hasNext()) {
    var folder=folders.next(),manifests=folder.getFilesByName('case.json');
    if(manifests.hasNext()) {
      var manifest=manifests.next(),record=tryReadCaseFile_(manifest);
      if(!record||record.id!==normalizedId||record.ownerEmail!==user.email)throw createSimulatorError_('CASE_NOT_FOUND','The requested Case could not be found.');
      if(metadataOnly)return {file:manifest,folder:folder,caseData:record};
      if(record.storageVersion!=='case-folder-1'||!Array.isArray(record.simulationFiles))throw createSimulatorError_('INVALID_CASE','The case manifest is invalid.');
      record.simulations=record.simulationFiles.map(function(entry){
        if(!entry||!/^simulation-[a-z0-9-]+\.json$/i.test(entry.fileName))throw createSimulatorError_('INVALID_CASE','The simulation manifest is invalid.');
        var matches=folder.getFilesByName(entry.fileName),simulation=matches.hasNext()?tryReadCaseFile_(matches.next()):null;
        if(!simulation||simulation.id!==entry.id)throw createSimulatorError_('INVALID_CASE','A saved simulation could not be read.');
        return simulation;
      });
      return {file:manifest,folder:folder,caseData:record};
    }
  }
  var files=root.getFilesByName(normalizedId+'.case.json'),file=files.hasNext()?files.next():null;
  var caseData=file?tryReadCaseFile_(file):null;
  if(!caseData||caseData.id!==normalizedId||caseData.ownerEmail!==user.email)throw createSimulatorError_('CASE_NOT_FOUND','The requested Case could not be found.');
  return {file:file,caseData:caseData};
}

// Stage immutable simulation files, then commit their references in case.json.
// A failed write leaves the previous manifest and simulations readable.
function persistCaseRecord_(record,owned) {
  var root=getWorkspaceFolders_().cases,folder=owned&&owned.folder;
  if(!folder){var matches=root.getFoldersByName(record.id);folder=matches.hasNext()?matches.next():root.createFolder(record.id);}
  var previous=owned&&owned.folder?owned.caseData.simulationFiles||[]:[],staged=[],refs=[];
  var manifestFiles=folder.getFilesByName('case.json'),manifest=manifestFiles.hasNext()?manifestFiles.next():null;
  if(manifest&&(!owned||!owned.folder))throw createSimulatorError_('CASE_CONFLICT','A case folder already contains a saved case. Reload before saving.');
  try {
    record.simulations.forEach(function(simulation,index){
      var json=JSON.stringify(simulation),digest=simulationContentDigest_(json),old=previous.find(function(e){return e.id===simulation.id;}),oldFiles=old?folder.getFilesByName(old.fileName):null,oldFile=oldFiles&&oldFiles.hasNext()?oldFiles.next():null;
      if(oldFile&&(old.digest&&digest?old.digest===digest:oldFile.getBlob().getDataAsString()===json)){refs.push({id:old.id,fileName:old.fileName,digest:digest});return;}
      var name='simulation-'+index+'-'+Utilities.getUuid()+'.json';
      staged.push(folder.createFile(name,json,MimeType.PLAIN_TEXT));refs.push({id:simulation.id,fileName:name,digest:digest});
    });
    var general=Object.assign({},record,{storageVersion:'case-folder-1',simulationFiles:refs});delete general.simulations;
    var json=JSON.stringify(general);
    if(manifest)manifest.setContent(json);else manifest=folder.createFile('case.json',json,MimeType.PLAIN_TEXT);
  }catch(error){staged.forEach(function(file){try{file.setTrashed(true);}catch(ignore){}});throw error;}
  // Cleanup is best effort after the authoritative manifest has committed.
  try {
    previous.forEach(function(entry){if(!refs.some(function(e){return e.fileName===entry.fileName;})){var files=folder.getFilesByName(entry.fileName);if(files.hasNext())files.next().setTrashed(true);}});
    if(owned&&!owned.folder)owned.file.setTrashed(true);
  }catch(error){console.error(JSON.stringify({event:'CASE_STORAGE_CLEANUP_FAILED',type:error.name||'Error'}));}
  return manifest;
}

// SHA-256 fingerprints avoid downloading unchanged simulation files on Save.
function simulationContentDigest_(json) {
  if(typeof Utilities.computeDigest!=='function')return null;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,json,Utilities.Charset.UTF_8).map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}

function requireCaseId_(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) {
    throw createSimulatorError_('INVALID_CASE', 'Case id must contain only letters, numbers, and hyphens.');
  }
  return id;
}

function requireCaseName_(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw createSimulatorError_('INVALID_CASE', 'Case name is required.');
  }
  return name.trim();
}

function normalizeUnitOfFlow_(unitOfFlow) {
  return typeof unitOfFlow === 'string' && unitOfFlow.trim() ? unitOfFlow.trim() : 'units';
}

function normalizeEquipmentList_(equipment) {
  if (!Array.isArray(equipment)) {
    throw createSimulatorError_('INVALID_CASE', 'equipment must be an array.');
  }

  var seenIds = {};
  return equipment.map(function(unit, index) {
    var path = 'equipment[' + index + ']';
    if (!unit || typeof unit !== 'object') {
      throw createSimulatorError_('INVALID_CASE', path + ' must be an object.');
    }
    var id = requireEquipmentId_(unit.id, path);
    if (seenIds[id]) throw createSimulatorError_('INVALID_CASE', path + '.id must be unique.');
    seenIds[id] = true;
    if (supportedEquipmentTypes_().indexOf(unit.type) === -1) {
      throw createSimulatorError_('INVALID_CASE', path + '.type is not supported.');
    }
    if (typeof unit.name !== 'string' || !unit.name.trim()) {
      throw createSimulatorError_('INVALID_CASE', path + '.name is required.');
    }
    if(unit.unitOfFlow!==undefined&&(typeof unit.unitOfFlow!=='string'||unit.unitOfFlow.trim().length>40)){
      throw createSimulatorError_('INVALID_CASE', path + '.unitOfFlow must be text of at most 40 characters.');
    }
    if (!isPositiveFiniteNumber_(unit.nominalRatePerSecond)) {
      throw createSimulatorError_('INVALID_CASE', path + '.nominalRatePerSecond must be greater than zero.');
    }
    if (['AUTO', 'MANUAL', 'PAUSE', 'STOP'].indexOf(unit.initialMode) === -1) {
      throw createSimulatorError_('INVALID_CASE', path + '.initialMode is not supported.');
    }
    return {
      id: id,
      type: unit.type,
      name: unit.name.trim(),
      unitOfFlow: unit.unitOfFlow?.trim()||undefined,
      nominalRatePerSecond: Number(unit.nominalRatePerSecond),
      initialMode: unit.initialMode,
      characteristics: normalizeObject_(unit.characteristics),
      noiseProfile: normalizeObject_(unit.noiseProfile),
      processData: normalizeProcessData_(unit.processData)
    };
  });
}

function supportedEquipmentTypes_() {
  return ['BLOWER', 'BLOWMOLDER', 'CONVEYOR', 'PACEMAKER', 'PUCKER', 'FILLER', 'DEPUCKER', 'SLEEVER', 'CASE_PACKER', 'PALLETIZER', 'CUSTOM'];
}

function normalizeProcessData_(processData) {
  if (processData === undefined) return {};
  if (!processData || typeof processData !== 'object' || Array.isArray(processData)) {
    throw createSimulatorError_('INVALID_CASE', 'processData must be an object when provided.');
  }
  return processData;
}

function normalizeCaseMetadata_(metadata) {
  if (metadata === undefined) return {};
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw createSimulatorError_('INVALID_CASE', 'metadata must be an object when provided.');
  }
  return metadata;
}

function requireEquipmentId_(id, path) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) {
    throw createSimulatorError_('INVALID_CASE', path + '.id must contain only letters, numbers, and hyphens.');
  }
  return id;
}

function normalizeObject_(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStringList_(value) {
  return Array.isArray(value) ? value.filter(function(item) { return typeof item === 'string'; }) : [];
}

function isPositiveFiniteNumber_(value) {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

function generateCaseId_(name) {
  var base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'case';
  return base + '-' + new Date().getTime();
}

function tryReadCaseFile_(file) {
  try {
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (error) {
    return null;
  }
}

function toCaseSummary_(caseData, file) {
  var metadata = caseData.metadata && typeof caseData.metadata === 'object' && !Array.isArray(caseData.metadata) ? caseData.metadata : {};
  return {
    id: caseData.id,
    name: caseData.name,
    equipmentCount: Array.isArray(caseData.equipment) ? caseData.equipment.length : 0,
    isSimulationReady: Array.isArray(caseData.equipment) && caseData.equipment.length >= 2,
    revision: Number(caseData.revision || 1),
    updatedAt: caseData.updatedAt,
    fileId: file.getId(),
    dataClassification: typeof metadata.dataClassification === 'string' ? metadata.dataClassification : null
  };
}
