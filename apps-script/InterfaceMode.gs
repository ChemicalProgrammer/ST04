/** Default presentation mode; a local browser preference may override this default. */
function getInterfaceMode_() {
  var value = String(PropertiesService.getScriptProperties().getProperty('ST_UI_MODE') || '').trim().toUpperCase();
  return value === 'ADVANCE' || value === 'ADVANCED' ? 'ADVANCE' : 'BASIC';
}
