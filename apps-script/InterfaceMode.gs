/** Deployment-wide presentation mode. No browser or user preference overrides it. */
function getInterfaceMode_() {
  var value = String(PropertiesService.getScriptProperties().getProperty('ST_UI_MODE') || '').trim().toUpperCase();
  return value === 'ADVANCE' || value === 'ADVANCED' ? 'ADVANCE' : 'BASIC';
}
