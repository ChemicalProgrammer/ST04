// Conservative name recognition for worksheets whose category is simply Machine.
function inferSheetMachineType_(name) {
  var text=String(name||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,' ');
  var patterns=[
    ['BLOWMOLDER',/\bBLOW\s*MO[UL]+DER\b/],
    ['DEPUCKER',/\bDE\s*PUCKER\b/],
    ['PUCKER',/\bPUCKER\b/],
    ['FILLER',/\bFILLER\b/],
    ['SLEEVER',/\bSLEEVER\b/],
    ['CASE_PACKER',/\bCASE\s*PACKER\b/],
    ['PALLETIZER',/\bPALLETI[ZS]ER\b/],
    ['BLOWER',/\bBLOWER\b/]
  ];
  if(patterns[1][1].test(text))return 'DEPUCKER';
  var matches=patterns.filter(function(item){return item[1].test(text);});
  return matches.length===1?matches[0][0]:'CUSTOM';
}
// Fixed plant worksheet contract. Reads only; never writes to the source Sheet.
// Column and metadata mappings live here so a layout change is localized.
function sheetImportColumns_(layout) {
  var columns=[
    ['A','type','Type'], ['B','name','Equipment name'], ['C','critical','Critical machine'],
    ['D','mtbfMinutes','MTBF (min)'], ['E','mttrMinutes','MTTR (min)'], ['F','maximumSpeedBpm','Machine max speed (bpm)'],
    ['G','lactMm','Total length (mm)'], ['H','lpPrimeMm','Prime zone (mm)'],
    ['I','actualDischargeMm','Discharge actual (mm)'], ['J','actualCodingMm','Coding actual (mm)'],
    ['K','packageLengthMm','Package length (mm)'], ['L','dischargePitchMm','Discharge pitch (mm)'],
    ['M','startupTimeSeconds','Upstream startup time (s)'], ['N','bottlesDischargedAtStop','Bottles discharged at stop'],
    ['O','infeedPitchMm','Downstream infeed pitch (mm)'], ['P','rampUpTimeSeconds','Downstream ramp-up including Prime delay (s)'],
    ['Q','conveyorSpeedFactorVsDischargeVelocityPercent','Speed factor vs discharge (%)'],
    ['R','codingConveyorSpeedFactorVsPreviousConveyorPercent','Coding speed factor vs previous (%)'],
    ['S','conveyorSpeedFactorVsPreviousConveyorPercent','Conveyor speed factor vs previous (%)'],
    ['T','blockedTimeDelaySeconds','Back-up blocked delay (s)'], ['U','clearTimeDelaySeconds','Back-up clear delay (s)'],
    ['V','insuranceFactorUnits','Insurance factor (packages)'], ['W','overspeedVsInfeedScrewPercent','Overspeed vs infeed screw (%)']
  ];
  if(layout==='plant-sheet-v2'){
    columns=columns.map(function(c,i){return [String.fromCharCode(65+i+(i>=6?2:0)),c[1],c[2]];});
    columns.splice(6,0,['G','conveyorSpeedMPerMinute','Conveyor Speed (m/min)'],['H','declaredAccumulationSeconds','Accumulation (s)']);
  }
  return columns;
}
function detectSheetImportLayout_(headers){
  var g=headers.map(function(row){return String(row[0]||'');}).join(' ').toLowerCase(),h=headers.map(function(row){return String(row[1]||'');}).join(' ').toLowerCase();
  var speed=/conveyor\s*speed/.test(g),accumulation=/accumulation/.test(h);
  if(speed&&accumulation&&/m\s*\/\s*min\b/.test(g)&&/(?:\(\s*s\s*\)|\bseconds?\b|\bsec\b)/.test(h))return 'plant-sheet-v2';
  if(speed||accumulation)throw createSimulatorError_('INVALID_SHEET_LAYOUT','The updated layout requires G = Conveyor Speed (m/min) and H = Accumulation (s).');
  return 'plant-sheet-v1';
}

function previewSheetImport_(request, user) {
  if (!request || typeof request !== 'object') throw createSimulatorError_('INVALID_SHEET_REQUEST','Enter a spreadsheet URL or spreadsheet ID.');
  if(request.caseSnapshot)browserCaseSnapshot_(request,user);else getCase_(request.caseId, user);
  var reference = parseSheetReference_(request.spreadsheet);
  var book = openImportSpreadsheet_(reference.id);
  var name = typeof request.sheetName === 'string' ? request.sheetName.trim() : '';
  var sheets = book.getSheets();
  var sheet = name ? book.getSheetByName(name) : reference.gid !== null ? sheets.filter(function(s){return String(s.getSheetId()) === reference.gid;})[0] : sheets[0];
  if (!sheet) throw createSimulatorError_('SHEET_TAB_NOT_FOUND','The worksheet was not found. Enter its exact tab name.');
  var lastRow = sheet.getLastRow();
  if (lastRow > 1009) throw createSimulatorError_('SHEET_TOO_LARGE','This importer supports up to 1,000 equipment rows (rows 10–1009). Remove extra content below the equipment table or use a dedicated worksheet.');
  if (sheet.getMaxColumns() < 23 || sheet.getMaxRows() < 10) throw createSimulatorError_('INVALID_SHEET_LAYOUT','Expected metadata in C1:C7 and equipment in A10:W.');
  var layout=detectSheetImportLayout_(sheet.getRange(8,7,2,2).getValues()),width=sheetImportColumns_(layout).length,lastColumn=String.fromCharCode(64+width);
  if(sheet.getMaxColumns()<width)throw createSimulatorError_('INVALID_SHEET_LAYOUT','Expected equipment in A10:'+lastColumn+'.');
  var metadataRange = sheet.getRange(1,3,7,1);
  var metadata = metadataRange.getValues().map(function(row){return row[0];});
  if (Object.prototype.toString.call(metadata[5]) === '[object Date]') metadata[5] = Utilities.formatDate(metadata[5],book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  var count = Math.max(0,lastRow-9), rows = [], formats = [];
  if (count) {var range=sheet.getRange(10,1,count,width);rows=range.getValues();formats=range.getNumberFormats();}
  // The plant template may include shift-time summaries below the equipment table.
  var footer=rows.findIndex(function(row){return !String(row[0]||'').trim()&&!String(row[1]||'').trim()&&row.some(function(value){return /^total\s+time$/i.test(String(value||'').trim());});});
  if(footer>=0){rows=rows.slice(0,footer);formats=formats.slice(0,footer);count=rows.length;}
  var result = parseEquipmentSheet_(metadata, rows, formats,layout);
  result.source = {schemaVersion:layout,spreadsheetId:reference.id,sheetId:sheet.getSheetId(),sheetName:sheet.getName(),readAt:new Date().toISOString(),equipmentRange:'A10:'+lastColumn+(count?count+9:10)};
  return result;
}

function openImportSpreadsheet_(spreadsheetId) {
  // Sheets is authoritative. A Drive metadata failure must not block a readable Sheet.
  var sheetError;
  try { return SpreadsheetApp.openById(spreadsheetId); }
  catch (error) { sheetError = error; }
  var detail = safeSheetErrorDetail_(sheetError), driveDetail = '';
  try {
    var file = DriveApp.getFileById(spreadsheetId);
    var mime = file.getMimeType();
    if (mime !== 'application/vnd.google-apps.spreadsheet') {
      throw createSimulatorError_(
        'SHEET_NOT_NATIVE',
        'This file is ' + (mime || 'not a native spreadsheet') + '. Open the file in Sheets and use File → Save as Sheets, then paste the URL of the new copy.'
      );
    }
  } catch (error) {
    if (error && error.simulatorError) throw error;
    driveDetail = 'Drive diagnostic: ' + safeSheetErrorDetail_(error);
  }
  var authorization = /authoriz|permission|scope|privilege|autoriz|permiso/i.test(detail);
  throw createSimulatorError_(authorization ? 'SHEET_AUTHORIZATION_REQUIRED' : 'SHEET_OPEN_FAILED',
    'The spreadsheet could not be opened. The service reported: ' + detail,
    driveDetail ? [driveDetail] : []);
}

function safeSheetErrorDetail_(error) {
  var message = error && error.message ? String(error.message) : String(error || 'Unknown spreadsheet service error');
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function parseSheetReference_(input) {
  var text = typeof input === 'string' ? input.trim() : '';
  var match = text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/[^\s]*)?$/);
  var id = match ? match[1] : /^[a-zA-Z0-9_-]{10,200}$/.test(text) ? text : null;
  if (!id) throw createSimulatorError_('INVALID_SHEET_URL','Use a spreadsheet URL or spreadsheet ID.');
  var gid = text.match(/[?#&]gid=(\d+)/);
  return {id:id,gid:gid?gid[1]:null};
}

function parseEquipmentSheet_(metadataCells, rows, formats,layout) {
  layout=layout||'plant-sheet-v1';
  var errors=[],warnings=[],equipment=[],sourceRows=[],columns=sheetImportColumns_(layout);
  function col(key){return columns.find(function(c){return c[1]===key;})[0];}
  function issue(list,cell,message){list.push({cell:cell,message:message});}
  function missing(value){return value===null||value===undefined||typeof value==='string'&&(/^(?:NA|N\/A)$/i.test(value.trim())||!value.trim());}
  function numeric(value,cell,format) {
    if(missing(value))return null;
    var number;
    if(typeof value==='number')number=value;
    else if(typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*%?$/i.test(value.trim()))number=Number(value.trim().replace(/%$/,''));
    else {issue(errors,cell,'Expected a numeric cell or NA. For decimal commas, use a numeric Sheets cell rather than text.');return null;}
    // Sheets stores 5% as 0.05; a plain numeric 5 remains five percentage points.
    if(typeof value==='number'&&format&&/%/.test(String(format).replace(/"[^"]*"|\\./g,'')))number*=100;
    if(!isFinite(number)||number<0){issue(errors,cell,'Must be a finite number greater than or equal to zero.');return null;}
    return number;
  }
  var metadata={},metaFields=['site','packagingLine','formatName','containerSizeOz','bottlesPerCase','dateOfAnalysis','by'];
  metaFields.forEach(function(key,i){var v=metadataCells[i];if(i===3&&typeof v==='string')v=v.trim().replace(/\s*(?:fl\.?\s*)?oz\.?$/i,'').trim();metadata[key]=(i===3||i===4)?numeric(v,'C'+(i+1)):missing(v)?null:String(v).trim();});
  ['containerSizeOz','bottlesPerCase'].forEach(function(key){if(metadata[key]!==null&&metadata[key]<=0)issue(errors,key==='containerSizeOz'?'C4':'C5','Must be greater than zero when provided.');});
  if(metadata.bottlesPerCase!==null&&!Number.isInteger(metadata.bottlesPerCase))issue(errors,'C5','Bottles per case must be a whole number.');
  var aliases={MACHINE:'CUSTOM',BLOWER:'BLOWER',BLOWMOLDER:'BLOWMOLDER',BLOWMOULDER:'BLOWMOLDER',CONVEYOR:'CONVEYOR',PACEMAKER:'PACEMAKER',PUCKER:'PUCKER',FILLER:'FILLER',DEPUCKER:'DEPUCKER',SLEEVER:'SLEEVER',CASEPACKER:'CASE_PACKER',PALLETIZER:'PALLETIZER',PALLETISER:'PALLETIZER',CUSTOM:'CUSTOM',OTHER:'CUSTOM'};
  rows.forEach(function(row,offset){
    var rowNumber=offset+10;
    if(row.every(missing))return;
    var rawType=missing(row[0])?'':String(row[0]).trim(),type=aliases[rawType.toUpperCase().replace(/[\s_-]+/g,'')];
    if(!type)issue(errors,'A'+rowNumber,'Unknown equipment type. Use Blower, Blowmolder, Conveyor, Pucker, Filler, De-pucker, Sleever, Case packer, Palletizer or Other.');
    var name=missing(row[1])?'':String(row[1]).trim();
    if(rawType.toUpperCase()==='MACHINE'){
      type=inferSheetMachineType_(name);
      issue(warnings,'A'+rowNumber,type==='CUSTOM'?'Machine name could not be classified uniquely. Review the machine type in Preview or Line setup.':'Machine type inferred from B'+rowNumber+': '+type+'. Review before applying.');
    }
    var legacyPacemaker=type==='PACEMAKER';if(legacyPacemaker)type=inferSheetMachineType_(name);
    if(!name)issue(errors,'B'+rowNumber,'Equipment name is required.');
    var flag=missing(row[2])?'N':String(row[2]).trim().toUpperCase();if(!['Y','N'].includes(flag))issue(errors,'C'+rowNumber,'Use Y, N or NA.');
    var values={type:rawType,name:name,critical:missing(row[2])?null:flag};
    columns.slice(3).forEach(function(def,index){var col=index+3;values[def[1]]=numeric(row[col],def[0]+rowNumber,['conveyorSpeedFactorVsDischargeVelocityPercent','codingConveyorSpeedFactorVsPreviousConveyorPercent','conveyorSpeedFactorVsPreviousConveyorPercent','overspeedVsInfeedScrewPercent'].includes(def[1])?(formats[offset]||[])[col]:null);});
    var conveyor=type==='CONVEYOR';
    if(values.maximumSpeedBpm===0||values.maximumSpeedBpm===null&&!conveyor)issue(errors,'F'+rowNumber,'Machine maximum speed must be greater than zero.');
    var mtbf=values.mtbfMinutes,mttr=values.mttrMinutes;
    if(mtbf===0||mttr===0||((mtbf===null)!==(mttr===null)))issue(errors,'D'+rowNumber+':E'+rowNumber,'Supply both MTBF and MTTR as positive minutes, or mark both NA.');
    if(mtbf===null&&mttr===null)issue(warnings,'D'+rowNumber+':E'+rowNumber,'No reliability data: random failures are disabled for this equipment.');
    if(conveyor&&flag==='Y')issue(errors,'C'+rowNumber,'A conveyor cannot be the critical machine. Use Y for one machine only.');
    var unit={id:'sheet-row-'+rowNumber,type:type||'CUSTOM',name:name,nominalRatePerSecond:values.maximumSpeedBpm===null?null:values.maximumSpeedBpm/60,initialMode:'AUTO',characteristics:{criticalMachine:flag==='Y',isPacemaker:flag==='Y'&&!conveyor,rateBasis:'bottles per minute',sourceSheetRow:rowNumber,sourceSheetLayout:layout},noiseProfile:{},processData:{
      role:conveyor?'CONVEYOR':flag==='Y'?'CRITICAL_MACHINE':'MACHINE',machineType:type||'CUSTOM',
      equipment:{mtbfMinutes:mtbf,mttrMinutes:mttr,maximumSpeedBpm:values.maximumSpeedBpm},
      geometry:{lactMm:values.lactMm,lpPrimeMm:values.lpPrimeMm,actualDischargeMm:values.actualDischargeMm,actualCodingMm:values.actualCodingMm},
      upstream:{packageLengthMm:values.packageLengthMm,dischargePitchMm:values.dischargePitchMm,startupTimeSeconds:values.startupTimeSeconds,bottlesDischargedAtStop:values.bottlesDischargedAtStop},
      downstream:{infeedPitchMm:values.infeedPitchMm,rampUpTimeSeconds:values.rampUpTimeSeconds},
      speedAndSensors:{conveyorSpeedFactorVsDischargeVelocityPercent:values.conveyorSpeedFactorVsDischargeVelocityPercent,codingConveyorSpeedFactorVsPreviousConveyorPercent:values.codingConveyorSpeedFactorVsPreviousConveyorPercent,conveyorSpeedFactorVsPreviousConveyorPercent:values.conveyorSpeedFactorVsPreviousConveyorPercent,blockedTimeDelaySeconds:values.blockedTimeDelaySeconds,clearTimeDelaySeconds:values.clearTimeDelaySeconds,insuranceFactorUnits:values.insuranceFactorUnits,overspeedVsInfeedScrewPercent:values.overspeedVsInfeedScrewPercent}
    }};
    if(mtbf>0&&mttr>0)unit.noiseProfile.reliability={mtbfMinutes:mtbf,mttrMinutes:mttr};
    if(conveyor){
      unit.processData.accumulation={blockedTimeDelaySeconds:values.blockedTimeDelaySeconds,clearTimeDelaySeconds:values.clearTimeDelaySeconds,insuranceFactorUnits:values.insuranceFactorUnits,bottlesDischargedAtStop:values.bottlesDischargedAtStop,downstreamRampUpSeconds:values.rampUpTimeSeconds};
      if(layout==='plant-sheet-v2'){
        unit.processData.accumulation.declaredAccumulationSeconds=values.declaredAccumulationSeconds;
        if(values.conveyorSpeedMPerMinute===0)issue(errors,'G'+rowNumber,'Conveyor speed must be greater than zero or NA.');
        if(values.conveyorSpeedMPerMinute>0){unit.processData.accumulation.speedMode='MANUAL';unit.processData.accumulation.conveyorSpeedMmPerSecond=values.conveyorSpeedMPerMinute*1000/60;}
      }
      if(values.lactMm===null||values.lpPrimeMm===null||values.packageLengthMm===null||values.dischargePitchMm===null||!(values.conveyorSpeedMPerMinute>0)&&values.conveyorSpeedFactorVsDischargeVelocityPercent===null)issue(warnings,col('lactMm')+rowNumber+':'+col('conveyorSpeedFactorVsDischargeVelocityPercent')+rowNumber,'Incomplete conveyor inputs. Complete geometry and discharge speed factor in Line setup before running.');
      if(values.lactMm!==null&&values.lpPrimeMm!==null&&values.lpPrimeMm>=values.lactMm)issue(errors,col('lpPrimeMm')+rowNumber,'Prime zone must be shorter than total conveyor length.');
      if(values.dischargePitchMm!==null&&values.packageLengthMm!==null&&values.dischargePitchMm<values.packageLengthMm)issue(warnings,col('dischargePitchMm')+rowNumber,'Discharge pitch is smaller than package length ('+col('packageLengthMm')+rowNumber+'). Imported unchanged as draft data. Verify package orientation, dimensions and pitch before simulation; physical model validation still applies.');
    }
    equipment.push(unit);sourceRows.push({row:rowNumber,values:values});
  });
  equipment.forEach(function(unit,index){if(unit.type==='CONVEYOR'&&unit.nominalRatePerSecond===null){var upstream=equipment[index-1];if(upstream&&upstream.type!=='CONVEYOR'&&upstream.nominalRatePerSecond>0){unit.nominalRatePerSecond=upstream.nominalRatePerSecond;issue(warnings,'F'+unit.characteristics.sourceSheetRow,'Conveyor has no bpm value: using upstream machine bpm as its nominal reference. Physical belt speed uses G when provided in the updated layout; otherwise it is derived from geometry and the speed factor.');}else issue(errors,'F'+unit.characteristics.sourceSheetRow,'Missing conveyor bpm and no valid upstream machine reference.');}});
  if(!equipment.length)issue(errors,'A10:'+columns[columns.length-1][0],'No equipment rows found.');
  if(equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).length>1)equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).forEach(function(unit){issue(errors,'C'+unit.characteristics.sourceSheetRow,'Use Y for only one critical machine; mark the other machines N.');});
  var notes=[
    'Maximum speed F initializes nominal running speed. All flows use bottle-equivalent units; pack pattern is metadata, not a bottles-to-cases conversion.',
    'MTBF uses seeded exponential intervals; MTTR is a fixed repair duration. The current failure clock counts AUTO/MANUAL time, including starving/blocking, and excludes manual stops and micro-stops. No extra micro-stop noise is added by import.',
    'Q is interpreted as a speed increase: 5 means discharge velocity multiplied by 1.05. A numeric percent-formatted cell (5%) is also accepted.',
    'I/J and R/S/W are retained with their source cells, but do not control the current conveyor calculation. Infeed overspeed guidance currently assumes 5%.',
    'The Sheet does not provide installed Back-up position, discharge/reject runout or upstream stop-response time. The current engine derives Back-up position and defaults the missing runout/stop-response values to zero; review these in Line setup.',
    'P is retained including Prime sensor delay and used as the ramp duration. The model also waits for physical Prime; it cannot separate the delay and ramp components from one total.'
  ];
  if(layout==='plant-sheet-v2')notes=notes.map(function(note){return note.replace(/\b([G-W])(?=\/|\b)/g,function(letter){return String.fromCharCode(letter.charCodeAt(0)+2);});}).concat(['G is the physical conveyor speed in m/min and selects manual belt speed when provided. H is the declared accumulation time in seconds, retained as a reference; geometry still determines simulated capacity.']);
  return {layout:layout,columns:columns,metadata:metadata,equipment:equipment,sourceRows:sourceRows,errors:errors,warnings:warnings,notes:notes,canImport:errors.length===0};
}

