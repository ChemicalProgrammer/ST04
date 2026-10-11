function verifyWorkspaceRoot_(folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    folder.getName();
    return folder;
  } catch (error) {
    throw createSimulatorError_('WORKSPACE_FOLDER_UNAVAILABLE', 'This account cannot open the workspace folder. Check the folder ID (or paste its Drive folder URL), sign in with the account that owns it or has access, and authorize Drive access. The deployment must execute as User accessing the web app.');
  }
}

// Execution-local only: never reuse authorization or folder handles across RPCs.
var ST_WORKSPACE_FOLDERS_ = null;
function getWorkspaceFolders_() {
  var settings = getUserSettings_();
  if (ST_WORKSPACE_FOLDERS_ && ST_WORKSPACE_FOLDERS_.id === settings.workspaceRootFolderId) return ST_WORKSPACE_FOLDERS_.folders;
  var root = verifyWorkspaceRoot_(settings.workspaceRootFolderId);
  var folders = {root:root}, children = {};
  // Saving a case needs only Cases; resolve other folders when actually used.
  ['cases','artifacts','exports'].forEach(function(key) {
    var names = {cases:'SimulatorTemplate Cases',artifacts:'SimulatorTemplate Artifacts',exports:'SimulatorTemplate Exports'};
    Object.defineProperty(folders,key,{enumerable:true,get:function() {
      if (!children[key]) children[key] = getOrCreateChildFolder_(root,names[key]);
      return children[key];
    }});
  });
  ST_WORKSPACE_FOLDERS_ = {id:settings.workspaceRootFolderId,folders:folders};
  return folders;
}

function getOrCreateChildFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}


