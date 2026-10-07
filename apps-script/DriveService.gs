function verifyWorkspaceRoot_(folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    folder.getName();
    return folder;
  } catch (error) {
    throw createSimulatorError_('WORKSPACE_FOLDER_UNAVAILABLE', 'This Google account cannot open the workspace folder. Check the folder ID (or paste its Drive folder URL), sign in with the account that owns it or has access, and authorize Drive access. The deployment must execute as User accessing the web app.');
  }
}

function getWorkspaceFolders_() {
  var settings = getUserSettings_();
  var root = verifyWorkspaceRoot_(settings.workspaceRootFolderId);
  return {
    root: root,
    cases: getOrCreateChildFolder_(root, 'SimulatorTemplate Cases'),
    artifacts: getOrCreateChildFolder_(root, 'SimulatorTemplate Artifacts'),
    exports: getOrCreateChildFolder_(root, 'SimulatorTemplate Exports')
  };
}

function getOrCreateChildFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
