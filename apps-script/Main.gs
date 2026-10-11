function doGet() {
  var output = HtmlService.createTemplateFromFile('WebApp')
    .evaluate()
    .setTitle(__ST_TEXT__('view.fp_flow_pilot'));
  try {
    output.setFaviconUrl('https://www.salesforceicons.com/SLDS/icons/utility/flow_alt_120.png');
  } catch (error) {
    console.warn('Flow Pilot favicon could not be configured: ' + error.message);
  }
  return output;
}

function include_(filename) {
  // Resolve resource attributes before HtmlOutput processes template delimiters.
  var source=HtmlService.createTemplateFromFile(filename).getRawContent();
  source=source.replace(/<\?!=\s*include_\('([A-Za-z0-9]+)'\);\s*\?>/g,function(_,name){return include_(name);});
  return resolveTextResources_(source);
}

function getClientSource_() {
  var sections = ['ClientCore', 'ClientCases', 'ClientEquipment', 'ClientSimulation', 'ClientPlayback', 'ClientUtils'];
  var source = sections.map(function(name) {
    return HtmlService.createTemplateFromFile(name).getRawContent();
  }).join('\n');
  return '<script>\n  (function() {\n' + source + '\n  })();\n</script>\n';
}

function includeClient_() {
  return resolveTextResources_(getClientSource_());
}

function getBootstrap() {
  var stage='IDENTITY';
  try {
    var user=requireCurrentUser_();
    stage='USER_SETTINGS';var settings=getUserSettings_();
    stage='CASE_CATALOG';var catalog=getCaseCatalog_(user);
    stage='GEMINI_CONFIG';var gemini=getGeminiClientConfig_();
    stage='INTERFACE_MODE';var uiMode=getInterfaceMode_();
    return startupResponse_({ok:true,data:{user:user,settings:settings,gemini:gemini,uiMode:uiMode,cases:catalog.cases,caseCatalog:{refreshRequired:catalog.refreshRequired,complete:catalog.complete}}},'READY');
  } catch (error) {
    if(error?.simulatorError)return startupResponse_({ok:false,error:error.simulatorError},stage);
    var reference='LOGIN-'+new Date().getTime().toString(36);
    // Do not send raw exceptions, account settings or credentials to the browser.
    console.error(JSON.stringify({event:'BOOTSTRAP_FAILURE',reference:reference,stage:stage,type:error?.name||'Error'}));
    var authorization=/authorization|authorisation|permission|autorizaci[oó]n|permisos/i.test(String(error?.message||''));
    var missingModule=error?.name==='ReferenceError';
    var message=authorization?'Account authorization is missing or incomplete. Reopen this web app with the intended account and authorize the requested permissions.':missingModule?'A required Apps Script module is missing from this deployment. Update all app modules and deploy a new version.':'Sign-in could not complete. The developer can locate this failure in Apps Script Executions using the reference below.';
    return startupResponse_({ok:false,error:{code:authorization?'SIGNIN_AUTHORIZATION_REQUIRED':missingModule?'SIGNIN_MODULE_MISSING':'SIGNIN_START_FAILED',message:message,details:['Reference: '+reference]}},stage);
  }
}

function startupResponse_(response,stage) {
  response.startupVersion='startup-20261008-2';
  if(!response.ok)response.error=Object.assign({},response.error,{details:['Stage: '+stage,'Startup server: '+response.startupVersion].concat(Array.isArray(response.error.details)?response.error.details:[])});
  return response;
}

function refreshCaseCatalog(request) {
  return executeServerAction_(function(user){return refreshCaseCatalog_(user,request?.cursor||null);});
}

function saveUserSettings(request) {
  return executeServerAction_(function() {
    return saveUserSettings_(request);
  });
}

function listGeminiModels() {
  return executeServerAction_(function() { return listGeminiModels_(); });
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
    return getCase_(caseId, user, true);
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

function createDemoCase() {
  return executeServerAction_(function(user) {
    var request=createDemoCaseRequest_();
    if(!request.simulations.every(function(sim){return !!sim.results?.summary;}))throw createSimulatorError_('DEMO_RESULTS_UNAVAILABLE','Add DemoResults.gs and deploy a new version before creating the prepared demo.');
    return createCase_(request, user);
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

function exportEquipmentSheet(request) {
  return executeServerAction_(function(user) { return exportEquipmentSheet_(request, user); });
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

function resetAppSettings() {
  return executeServerAction_(function(user) {
    return {user:user,settings:resetAppSettings_(),gemini:getGeminiClientConfig_(),uiMode:getInterfaceMode_(),cases:[],caseCatalog:{refreshRequired:false,complete:true}};
  });
}

