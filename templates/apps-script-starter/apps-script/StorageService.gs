function workspaceFolder_(create) {
  var props = PropertiesService.getUserProperties(), id = props.getProperty('PROJECTS_FOLDER_V1');
  if (id) {
    try {
      var folder = DriveApp.getFolderById(id);
      if (folder.isTrashed()) throw Error('Trashed');
      return folder;
    } catch (error) { throw appError_('WORKSPACE_UNAVAILABLE', 'The saved workspace folder is unavailable. Restore access before continuing.'); }
  }
  if (!create) return null;
  var folder = DriveApp.createFolder(APP_CONFIG.folderName);
  props.setProperty('PROJECTS_FOLDER_V1', folder.getId());
  return folder;
}
function readProjectFile_(file, user) {
  var value;
  try { value = JSON.parse(file.getBlob().getDataAsString('UTF-8')); }
  catch (error) { throw appError_('INVALID_RECORD', 'A project file could not be read. Restore a valid version before continuing.'); }
  if (value.ownerEmail !== user.email) throw appError_('NOT_FOUND', 'The project was not found in this account.');
  if (value.schemaVersion !== 1 || !Number.isInteger(value.revision) || value.revision < 1) throw appError_('UNSUPPORTED_RECORD', 'This project has an unsupported data format.');
  if (file.getName() !== projectId_(value.id) + '.json') throw appError_('INVALID_RECORD', 'The project identifier does not match its file.');
  normalizeProjectInput_(value);
  return value;
}
function ownedProject_(id, user) {
  id = projectId_(id);
  var folder = workspaceFolder_(false), files = folder && folder.getFilesByName(id + '.json');
  if (!files || !files.hasNext()) throw appError_('NOT_FOUND', 'The project was not found in this account.');
  var file = files.next();
  if (files.hasNext()) throw appError_('DUPLICATE_RECORD', 'Duplicate project files were found. Resolve the duplicate before saving.');
  return {file: file, record: readProjectFile_(file, user)};
}
function listProjects_(user) {
  var folder = workspaceFolder_(false), result = [];
  if (!folder) return result;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (!/^project-[a-f0-9-]{36}\.json$/.test(file.getName())) continue;
    try { result.push(projectSummary_(readProjectFile_(file, user))); }
    catch (error) { if (error.appError && error.appError.code === 'NOT_FOUND') continue; throw error; }
  }
  return result.sort(function(a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
}
