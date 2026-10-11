function doGet() {
  return HtmlService.createTemplateFromFile('WebApp').evaluate().setTitle(APP_CONFIG.name);
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function getBootstrap() {
  return api_(function(user) { return {user: user, preferences: getPreferences_(), projects: listProjects_(user), app: {name: APP_CONFIG.name, version: APP_CONFIG.version, description: APP_CONFIG.description, developers: APP_CONFIG.developers}}; });
}
function listProjects() { return api_(listProjects_); }
function getProject(id) { return api_(function(user) { return ownedProject_(id, user).record; }); }
function createProject(request) { return api_(function(user) { return createProject_(request, user); }); }
function saveProject(request) { return api_(function(user) { return saveProject_(request, user); }); }
function deleteProject(request) { return api_(function(user) { return deleteProject_(request, user); }); }
function savePreferences(request) { return api_(function() { return savePreferences_(request); }); }
