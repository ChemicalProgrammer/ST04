function normalizePreferences_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw appError_('INVALID_SETTINGS', 'Settings must be an object.');
  if (['system', 'light', 'dark'].indexOf(value.theme) < 0) throw appError_('INVALID_SETTINGS', 'Choose a supported theme.');
  if (['indigo', 'teal', 'blue'].indexOf(value.accent) < 0) throw appError_('INVALID_SETTINGS', 'Choose a supported accent.');
  return {theme: value.theme, accent: value.accent};
}
function getPreferences_() {
  var raw = PropertiesService.getUserProperties().getProperty('PROJECTS_PREFERENCES_V1');
  if (!raw) return {theme: 'system', accent: 'indigo'};
  try { return normalizePreferences_(JSON.parse(raw)); }
  catch (error) { throw appError_('INVALID_SETTINGS', 'Saved preferences could not be read. Contact the app owner.'); }
}
function savePreferences_(value) {
  var settings = normalizePreferences_(value);
  PropertiesService.getUserProperties().setProperty('PROJECTS_PREFERENCES_V1', JSON.stringify(settings));
  return settings;
}
