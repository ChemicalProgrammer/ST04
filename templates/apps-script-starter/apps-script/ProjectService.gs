function projectId_(id) {
  if (typeof id !== 'string' || !/^project-[a-f0-9-]{36}$/.test(id)) throw appError_('INVALID_ID', 'Choose a valid project.');
  return id;
}
function normalizeProjectInput_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw appError_('INVALID_PROJECT', 'Project data must be an object.');
  var name = typeof request.name === 'string' ? request.name.trim() : '';
  if (!name || name.length > 120) throw appError_('INVALID_PROJECT', 'Enter a project name of 1–120 characters.');
  var description = request.description === undefined ? '' : request.description;
  if (typeof description !== 'string' || description.length > 4000) throw appError_('INVALID_PROJECT', 'Description must be text of at most 4,000 characters.');
  if (APP_CONFIG.statuses.indexOf(request.status) < 0) throw appError_('INVALID_PROJECT', 'Choose a supported project status.');
  var dueDate = request.dueDate === undefined ? '' : request.dueDate;
  if (typeof dueDate !== 'string' || dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw appError_('INVALID_PROJECT', 'Enter a valid due date.');
  return {name: name, description: description, status: request.status, dueDate: dueDate};
}
function projectSummary_(record) {
  return {id: record.id, name: record.name, status: record.status, dueDate: record.dueDate, revision: record.revision, updatedAt: record.updatedAt};
}
function createProject_(request, user) {
  var input = normalizeProjectInput_(request);
  return withUserLock_(function() {
    var now = new Date().toISOString();
    var record = Object.assign({}, input, {id: 'project-' + Utilities.getUuid(), schemaVersion: 1, ownerEmail: user.email, revision: 1, createdAt: now, updatedAt: now});
    workspaceFolder_(true).createFile(record.id + '.json', JSON.stringify(record), MimeType.PLAIN_TEXT);
    return record;
  });
}
function expectedRevision_(request, record) {
  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision !== record.revision) throw appError_('CONFLICT', 'This project changed elsewhere. Reload the project before applying your changes. Your draft is still open.');
}
function saveProject_(request, user) {
  var input = normalizeProjectInput_(request);
  return withUserLock_(function() {
    var owned = ownedProject_(request.id, user);
    expectedRevision_(request, owned.record);
    var next = Object.assign({}, owned.record, input, {revision: owned.record.revision + 1, updatedAt: new Date().toISOString()});
    owned.file.setContent(JSON.stringify(next));
    return next;
  });
}
function deleteProject_(request, user) {
  if (!request || typeof request !== 'object') throw appError_('INVALID_PROJECT', 'Choose a project to delete.');
  return withUserLock_(function() {
    var owned = ownedProject_(request.id, user);
    expectedRevision_(request, owned.record);
    owned.file.setTrashed(true);
    return {id: owned.record.id};
  });
}
