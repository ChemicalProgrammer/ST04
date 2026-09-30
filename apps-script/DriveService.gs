function verifyWorkspaceRoot_(folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    folder.getName();
    return folder;
  } catch (error) {
    throw createSimulatorError_('WORKSPACE_FOLDER_UNAVAILABLE', 'The configured workspace folder cannot be opened by the current user.');
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
