function getUserSettings_() {
  var raw = PropertiesService.getUserProperties().getProperty('USER_SETTINGS_JSON');
  if (!raw) return createDefaultUserSettings_();

  try {
    return normalizeUserSettings_(JSON.parse(raw));
  } catch (error) {
    throw createSimulatorError_('INVALID_USER_SETTINGS', 'The saved user settings are not valid JSON.');
  }
}

function saveUserSettings_(request) {
  var settings = normalizeUserSettings_(request);
  var gemini = request.gemini ? normalizeGeminiSettings_(request.gemini) : null;
  verifyWorkspaceRoot_(settings.workspaceRootFolderId);
  PropertiesService.getUserProperties().setProperty('USER_SETTINGS_JSON', JSON.stringify(settings));
  if (gemini) {
    var props=PropertiesService.getUserProperties();
    props.setProperty('GEMINI_MODEL',gemini.model);
    if(gemini.generation!==undefined)props.setProperty('GEMINI_GENERATION_JSON',JSON.stringify(gemini.generation));
    if(gemini.prompts!==undefined)saveGeminiPrompts_(gemini.prompts);
    if(gemini.clearKey) props.deleteProperty('GEMINI_API_KEY');
    else if(gemini.key) props.setProperty('GEMINI_API_KEY',gemini.key);
  }
  return settings;
}

function createDefaultUserSettings_() {
  return {
    schemaVersion: '1.0',
    workspaceRootFolderId: '',
    preferredPlaybackRate: 1
  };
}

function normalizeUserSettings_(settings) {
  if (!settings || typeof settings !== 'object') {
    throw createSimulatorError_('INVALID_USER_SETTINGS', 'Settings must be an object.');
  }

  var rootId = typeof settings.workspaceRootFolderId === 'string' ? settings.workspaceRootFolderId.trim() : '';
  if (/^https:\/\//i.test(rootId)) {
    var folderLink=rootId.match(/^https:\/\/drive\.google\.com\/(?:[^?#]*\/)?folders\/([a-zA-Z0-9_-]+)(?:[/?#]|$)/i);
    if(!folderLink)throw createSimulatorError_('INVALID_USER_SETTINGS', 'Paste a Drive folder URL or its folder ID, not a file or spreadsheet link.');
    rootId=folderLink[1];
  }
  if (!rootId) {
    throw createSimulatorError_('INVALID_USER_SETTINGS', 'workspaceRootFolderId is required.');
  }

  var playbackRate = Number(settings.preferredPlaybackRate || 1);
  if(playbackRate===1.5)playbackRate=2;
  if (![0.5,1,2,5,10,20,50,100,200,500,1000].includes(playbackRate)) {
    throw createSimulatorError_('INVALID_USER_SETTINGS', 'Choose a supported playback speed.');
  }

  return {
    schemaVersion: '1.0',
    workspaceRootFolderId: rootId,
    preferredPlaybackRate: playbackRate
  };
}

// Reset only this app's account configuration; Drive contents remain untouched.
function resetAppSettings_() {
  var properties=PropertiesService.getUserProperties();
  Object.keys(properties.getProperties()).forEach(function(key){
    if(['USER_SETTINGS_JSON','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_GENERATION_JSON','GEMINI_PROMPTS_JSON'].indexOf(key)!==-1||/^GEMINI_PROMPTS_PART_\d+$/.test(key))properties.deleteProperty(key);
  });
  return createDefaultUserSettings_();
}

