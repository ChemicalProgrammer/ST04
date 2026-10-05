function doGet() {
  return HtmlService.createTemplateFromFile('WebApp')
    .evaluate()
    .setTitle('SimulatorTemplate');
}

function include_(filename) {
  return resolveTextResources_(HtmlService.createHtmlOutputFromFile(filename).getContent());
}

function getBootstrap() {
  return executeServerAction_(function(user) {
    return {
      user: user,
      settings: getUserSettings_(),
      gemini: getGeminiClientConfig_(),
      uiMode: getInterfaceMode_(),
      cases: listCases_(user)
    };
  });
}

function saveUserSettings(request) {
  return executeServerAction_(function() {
    return saveUserSettings_(request);
  });
}

function deleteGeminiApiKey() {
  return executeServerAction_(function() {
    return deleteGeminiApiKey_();
  });
}

function createCase(request) {
  return executeServerAction_(function(user) {
    return createCase_(request, user);
  });
}

function getCase(caseId) {
  return executeServerAction_(function(user) {
    return getCase_(caseId, user);
  });
}

function deleteCase(caseId) {
  return executeServerAction_(function(user) {
    return deleteCase_(caseId, user);
  });
}

function saveCase(request) {
  return executeServerAction_(function(user) {
    var saved=saveCase_(request, user);
    // The client already holds the draft; return only the acknowledgement.
    return {id:saved.id,name:saved.name,revision:saved.revision,updatedAt:saved.updatedAt,equipmentCount:saved.equipment.length};
  });
}

function cloneCase(caseId) {
  return executeServerAction_(function(user) {
    return cloneCase_(caseId, user);
  });
}

function createPublicDemoCase() {
  return executeServerAction_(function(user) {
    return createCase_(createPublicDemoCaseRequest_(), user);
  });
}

function executeServerAction_(action) {
  try {
    var user = requireCurrentUser_();
    return success_(action(user));
  } catch (error) {
    return failure_(error);
  }
}


function askGemini(request) {
  var response=executeServerAction_(function(user) { return askGemini_(request, user); });
  if(response.error?.code==='UNEXPECTED_ERROR')response.error={code:'GEMINI_START_FAILED',message:'Apps Script could not start the Gemini request. Reopen the case and try again; if it persists, sign out and back in.'};
  response.geminiVersion='gemini-20261005-1';return response;
}

function previewSheetImport(request) {
  var response = executeServerAction_(function(user) {
    try { return previewSheetImport_(request, user); }
    catch (error) {
      if (error && error.simulatorError) throw error;
      throw createSimulatorError_('SHEET_READ_FAILED', safeSheetErrorDetail_(error));
    }
  });
  response.importVersion = 'sheet-import-20260917-2';
  if (!response.ok) response.error.message = '[' + response.importVersion + ' / ' + response.error.code + '] ' + response.error.message;
  return response;
}

function createScenario(request) {
  return scenarioResponse_(function(user) { return createScenario_(request,user); });
}

function getScenarioSourceSignature(request) {
  return scenarioResponse_(function(user) { return getScenarioSourceSignature_(request,user); });
}

function scenarioResponse_(action) {
  var response=executeServerAction_(action);
  response.scenarioVersion='whatif-20260925-3';
  if(!response.ok)response.error.message='['+response.scenarioVersion+' / '+response.error.code+'] '+response.error.message;
  return response;
}
