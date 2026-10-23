function sheetImportContractVersion_(){return 'sheet-import-20261023-2';}
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

function sheetContainerSize_(value,unitHint){
  if(value==null||String(value).trim()===''||/^(?:NA|N\/A)$/i.test(String(value).trim()))return {containerSize:null,containerSizeOz:null};
  var text=String(value).trim(),match=text.match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([^\r\n]*)$/i);
  if(!match||!Number.isFinite(Number(match[1]))||!(Number(match[1])>0)||text.length>100||match[2]&&!/^[\p{L}µμ°%(]/u.test(match[2]))return {containerSize:text,containerSizeOz:null,error:'Enter a positive container size with an optional unit, for example 500 mL, 1 L or 12 oz.'};
  var unit=match[2].trim()||String(unitHint||'').trim(),size=match[2]?text:unit?match[1]+' '+unit:typeof value==='number'?value:text;
  return {containerSize:size,containerSizeOz:/^(?:fl\.?\s*)?oz\.?$/i.test(unit)?Number(match[1]):null};
}
function sheetContainerUnit_(labels){
  var text=labels.join(' ').trim(),match=text.match(/\(([^()]+)\)\s*$/);
  return /container|envase|size/i.test(text)&&match?match[1].trim():'';
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
  if(typeof metadata[3]==='number'&&typeof metadataRange.getDisplayValues==='function'){
    var display=String(metadataRange.getDisplayValues()[3]?.[0]||''),unit=display.match(/^[\d\s.,+]+\s*([^\d\s][^\r\n]*)$/);
    if(unit&&/^[\p{L}µμ°%(]/u.test(unit[1]))metadata[3]=metadata[3]+' '+unit[1].trim();
  }
  if (Object.prototype.toString.call(metadata[5]) === '[object Date]') metadata[5] = Utilities.formatDate(metadata[5],book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  var containerUnit=sheetContainerUnit_(sheet.getRange(4,1,1,2).getValues()[0]);
  var count = Math.max(0,lastRow-9), rows = [], formats = [];
  if (count) {var range=sheet.getRange(10,1,count,width);rows=range.getValues();formats=range.getNumberFormats();}
  // The plant template may include shift-time summaries below the equipment table.
  var footer=rows.findIndex(function(row){return !String(row[0]||'').trim()&&!String(row[1]||'').trim()&&row.some(function(value){return /^total\s+time$/i.test(String(value||'').trim());});});
  if(footer>=0){rows=rows.slice(0,footer);formats=formats.slice(0,footer);count=rows.length;}
  var result = parseEquipmentSheet_(metadata, rows, formats,layout,{containerUnit:containerUnit});
  result.source = {schemaVersion:layout,spreadsheetId:reference.id,sheetId:sheet.getSheetId(),sheetName:sheet.getName(),readAt:new Date().toISOString(),equipmentRange:'A10:'+lastColumn+(count?count+9:10)};
  if (sheet.getMaxColumns() >= 31 && sheet.getRange(1,18).getValues()[0][0] === 'st-real-sheet-v1') {
    result.realData = parseSheetRealData_(sheet.getRange(1,5,7,19).getValues(),sheet.getRange(1,5,7,19).getNumberFormats(),count?sheet.getRange(10,26,count,6).getValues():[],result);
  }
  if(sheet.getMaxColumns()>=26&&sheet.getRange(1,5).getValues()[0][0]==='AU (%)'&&sheet.getRange(9,26).getValues()[0][0]==='Observed downtime (min)'){
    result.realData=parseSimpleSheetRealData_(sheet.getRange(1,5,7,10).getValues(),sheet.getRange(1,5,7,10).getNumberFormats(),count?sheet.getRange(10,26,count,sheet.getMaxColumns()>=27?2:1).getValues():[],result);
  }
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

function parseEquipmentSheet_(metadataCells, rows, formats,layout,options) {
  layout=layout||'plant-sheet-v1';
  var errors=[],warnings=[],equipment=[],sourceRows=[],columns=sheetImportColumns_(layout);
  function col(key){return columns.find(function(c){return c[1]===key;})[0];}
  function issue(list,cell,message,severity,code){var item={cell:cell,message:message};if(severity)item.severity=severity;if(code)item.code=code;list.push(item);}
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
  var metadata={},metaFields=['site','packagingLine','formatName','containerSize','bottlesPerCase','dateOfAnalysis','by'];
  metaFields.forEach(function(key,i){var v=metadataCells[i];metadata[key]=i===4?numeric(v,'C5'):missing(v)?null:typeof v==='number'?v:String(v).trim();});
  var size=sheetContainerSize_(metadataCells[3],options?.containerUnit);metadata.containerSize=size.containerSize;metadata.containerSizeOz=size.containerSizeOz;if(size.error)issue(errors,'C4',size.error);
  if(metadata.bottlesPerCase!==null&&metadata.bottlesPerCase<=0)issue(errors,'C5','Must be greater than zero when provided.');
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
    if(mtbf===null&&mttr===null)issue(warnings,'D'+rowNumber+':E'+rowNumber,'No reliability data: random failures are disabled for this equipment.',conveyor?'info':'warning','NO_RELIABILITY_DATA');
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
      // Zero is a valid Prime reserve or speed increase; test absence explicitly.
      [['lactMm','Total length',true],['lpPrimeMm','Prime zone',false],['packageLengthMm','Package length',true],['dischargePitchMm','Discharge pitch',true],['conveyorSpeedFactorVsDischargeVelocityPercent','Speed factor vs discharge',false]].forEach(function(input){
        var value=values[input[0]];
        if(value===null||input[2]&&value===0)issue(warnings,col(input[0])+rowNumber,input[1]+(value===null?' was read as N/A or blank.':' must be greater than zero; the value read was 0.')+' Enter a numeric value in this cell and select it for import. Zero is valid for Prime zone and speed factor.','warning','CONVEYOR_INPUT_REQUIRED');
      });
      if(values.lactMm!==null&&values.lpPrimeMm!==null&&values.lpPrimeMm>=values.lactMm)issue(errors,col('lpPrimeMm')+rowNumber,'Prime zone must be shorter than total conveyor length.');
      if(values.dischargePitchMm!==null&&values.packageLengthMm!==null&&values.dischargePitchMm<values.packageLengthMm)issue(warnings,col('dischargePitchMm')+rowNumber,'Discharge pitch is smaller than package length ('+col('packageLengthMm')+rowNumber+'). Imported unchanged as draft data. Verify package orientation, dimensions and pitch before simulation; physical model validation still applies.');
    }
    equipment.push(unit);sourceRows.push({row:rowNumber,values:values});
  });
  equipment.forEach(function(unit,index){if(unit.type==='CONVEYOR'&&unit.nominalRatePerSecond===null){var upstream=equipment[index-1];if(upstream&&upstream.type!=='CONVEYOR'&&upstream.nominalRatePerSecond>0){unit.nominalRatePerSecond=upstream.nominalRatePerSecond;issue(warnings,'F'+unit.characteristics.sourceSheetRow,'Conveyor has no bpm value: using upstream machine bpm as its nominal reference. Physical belt speed uses G when provided in the updated layout; otherwise it is derived from geometry and the speed factor.','info','INHERITED_CONVEYOR_RATE');}else issue(errors,'F'+unit.characteristics.sourceSheetRow,'Missing conveyor bpm and no valid upstream machine reference.');}});
  if(!equipment.length)issue(errors,'A10:'+columns[columns.length-1][0],'No equipment rows found.');
  if(equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).length>1)equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).forEach(function(unit){issue(errors,'C'+unit.characteristics.sourceSheetRow,'Use Y for only one critical machine; mark the other machines N.');});
  var notes=[
    'Maximum speed F initializes nominal running speed. The optional packing proposal uses a reviewed Case Packer to assign bottle/case units, create a product and format, and translate bottle-equivalent machine speeds to cases/min. Without that proposal, existing unit settings are retained.',
    'MTBF uses seeded exponential intervals; MTTR is a fixed repair duration. The current failure clock counts AUTO/MANUAL time, including starving/blocking, and excludes manual stops and micro-stops. No extra micro-stop noise is added by import.',
    'Q is interpreted as a speed increase: 5 means discharge velocity multiplied by 1.05. A numeric percent-formatted cell (5%) is also accepted.',
    'I/J and R/S/W are retained with their source cells, but do not control the current conveyor calculation. Infeed overspeed guidance currently assumes 5%.',
    'The Sheet does not provide installed Back-up position, discharge/reject runout or upstream stop-response time. The current engine derives Back-up position and defaults the missing runout/stop-response values to zero; review these in Line setup.',
    'P is retained including Prime sensor delay and used as the ramp duration. The model also waits for physical Prime; it cannot separate the delay and ramp components from one total.'
  ];
  if(layout==='plant-sheet-v2')notes=notes.map(function(note){return note.replace(/\b([G-W])(?=\/|\b)/g,function(letter){return String.fromCharCode(letter.charCodeAt(0)+2);});}).concat(['G is the physical conveyor speed in m/min and selects manual belt speed when provided. H is the declared accumulation time in seconds, retained as a reference; geometry still determines simulated capacity.']);
  return {contractVersion:sheetImportContractVersion_(),layout:layout,columns:columns,metadata:metadata,equipment:equipment,sourceRows:sourceRows,errors:errors,warnings:warnings,notes:notes,canImport:errors.length===0};
}




// Observation fields are independent of equipment configuration. Blank is unknown.
function sheetRealDataFields_(){
  return [
    ['F1','periodStart','Period start','text','ISO date/time'],['F2','periodEnd','Period end','text','ISO date/time'],
    ['F3','shift1','Shift 1 production','number','cases'],['F4','shift2','Shift 2 production','number','cases'],['F5','shift3','Shift 3 production','number','cases'],
    ['F6','production','Total production','number','cases'],['F7','outputBasis','Output basis','text','GOOD / GROSS / UNCONFIRMED'],
    ['J1','durationSeconds','Total Time','time','min'],['J2','businessExternalDowntimeSeconds','Business External Time','time','min'],
    ['J3','plantAvailableSeconds','Plant Available Time','time','min'],['J4','plantDecisionDowntimeSeconds','Plant Decision Time','time','min'],
    ['J5','productionAvailableSeconds','Production Available Time','time','min'],['J6','downtimeSeconds','Downtime','time','min'],['J7','runTimeSeconds','Run Time','time','min'],
    ['N1','reportedEfficiencyPercent','AU','percent','%'],['N2','reportedUpdtPercent','UPDT','percent','%'],['N3','updtSeconds','UPDT time','time','min'],
    ['N4','effectiveRuntimeSeconds','Effective Runtime','time','min'],['N5','rateLossSeconds','Rate Loss','time','min'],
    ['N6','referenceSpeedBpm','Standard rate','number','bottles/min'],['N7','qualityPercent','Quality','percent','%']
  ].map(function(f){return {cell:f[0],key:f[1],label:f[2],type:f[3],unit:f[4]};});
}
function sheetObservationColumns_(){return ['Observed downtime (min)','Observed stop count','Stop class (UNKNOWN/FAILURES/MINOR/ALL)','Observed exposure (min)','Observation notes','Equipment ID'];}
function parseSheetRealData_(top,formats,rows,preview){
  var errors=[],fields=[],raw={aem:{},equipment:[]},shifts=[null,null,null];
  function at(cell){var m=/^([A-Z]+)(\d+)$/.exec(cell),col=0;m[1].split('').forEach(function(c){col=col*26+c.charCodeAt(0)-64;});return {r:Number(m[2])-1,c:col-5};}
  function value(cell){var p=at(cell);return top[p.r]?.[p.c];}
  function missing(v){return v==null||typeof v==='string'&&(!v.trim()||/^(NA|N\/A)$/i.test(v.trim()));}
  function text(v){return missing(v)?'':Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():String(v).trim();}
  function issue(cell,message){errors.push({cell:cell,message:message});}
  function number(v,cell,percent){
    if(missing(v))return null;
    var p=at(cell),fmt=formats[p.r]?.[p.c]||'',explicit=typeof v==='string'&&/%$/.test(v.trim());
    if(typeof v!=='number'&&(typeof v!=='string'||!/^\+?(?:\d+(?:\.\d*)?|\.\d+)\s*%?$/.test(v.trim()))){issue(cell,'Expected a non-negative number or blank.');return null;}
    if(!percent&&explicit){issue(cell,'Use a numeric value without a percent sign.');return null;}
    var n=Number(typeof v==='string'?v.trim().replace(/%$/,''):v);
    if(percent&&!explicit&&typeof v==='number'&&/%/.test(fmt.replace(/"[^"]*"|\\./g,'')))n*=100;
    if(!Number.isFinite(n)||n<0||percent&&n>100){issue(cell,percent?'Expected 0–100%.':'Expected a non-negative number.');return null;}
    return n;
  }
  var hasData=false;
  sheetRealDataFields_().forEach(function(f){
    var input=value(f.cell),uCell=f.cell.replace(/^([A-Z])/,function(c){return String.fromCharCode(c.charCodeAt(0)+1);}),unit=text(value(uCell))||f.unit,v=f.type==='text'?text(input):number(input,f.cell,f.type==='percent');
    if(!missing(input)&&f.key!=='outputBasis')hasData=true;
    if(f.type==='time'&&v!=null){var factor={s:1,sec:1,seconds:1,min:60,minutes:60,h:3600,hours:3600}[unit.toLowerCase()];if(!factor)issue(uCell,'Use s, min or h.');else v*=factor;}
    if(f.type==='percent'&&unit!=='%')issue(uCell,'Use %.');
    if(f.key==='referenceSpeedBpm'&&v!=null&&(v<=0||unit.toLowerCase()!=='bottles/min'))issue(f.cell,'Use a positive standard rate in bottles/min.');
    if(f.key==='durationSeconds'&&v===0)issue(f.cell,'Total Time must be positive.');
    if(/^shift/.test(f.key)){shifts[Number(f.key.slice(-1))-1]=v;}
    else if(['businessExternalDowntimeSeconds','plantAvailableSeconds','plantDecisionDowntimeSeconds','productionAvailableSeconds'].includes(f.key))raw.aem[f.key]=v;
    else raw[f.key]=v;
    fields.push(Object.assign({},f,{unit:unit,value:missing(input)?null:f.type==='percent'?v:text(input),sourceValue:missing(input)?null:text(input)}));
  });
  raw.productionUnit=text(value('R2'))||'CASES';raw.aem.basis=text(value('R3'))||'UNCONFIRMED';raw.updtDefinition=text(value('R4'))||'UNCONFIRMED';raw.updtPercentDenominator=text(value('R5'))||'UNCONFIRMED';raw.lineTimeBasis=text(value('R6'))||'UNCONFIRMED';
  raw.outputBasis=raw.outputBasis||'UNCONFIRMED';
  [['R2',raw.productionUnit,['BOTTLES','CASES','UNITS']],['R3',raw.aem.basis,['UNCONFIRMED','CALENDAR_OUTPUT_FLOW']],['R4',raw.updtDefinition,['UNCONFIRMED','AEM_UNPLANNED','TOTAL_EQUIVALENT_LOSS']],['R5',raw.updtPercentDenominator,['UNCONFIRMED','TOTAL','PLANT','PRODUCTION']],['R6',raw.lineTimeBasis,['UNCONFIRMED','OUTPUT_FLOW']],['F7',raw.outputBasis,['UNCONFIRMED','GOOD','GROSS']]].forEach(function(f){if(!f[2].includes(f[1]))issue(f[0],'Use '+f[2].join(' / ')+'.');fields.push({cell:f[0],label:({'R2':'Production unit','R3':'AEM comparison basis','R4':'UPDT definition','R5':'UPDT % denominator','R6':'Line-time basis','F7':'Output basis'})[f[0]],value:f[1],unit:''});});
  ['F3','F4','F5','F6'].forEach(function(cell){var unit=text(value(cell.replace('F','G')))||'cases';if(unit.toUpperCase()!==raw.productionUnit&&!(unit.toUpperCase()==='COUNT'&&raw.productionUnit==='UNITS'))issue(cell.replace('F','G'),'Unit must match R2 ('+raw.productionUnit+').');});
  raw.shiftProduction=shifts;raw.bottlesPerCase=preview.metadata.bottlesPerCase??null;
  raw.date=raw.periodStart?raw.periodStart.slice(0,10):preview.metadata.dateOfAnalysis||'';
  raw.name=text(value('V1'))||'Imported production period';raw.source=text(value('V2'));raw.notes=text(value('V3'));raw.status='MEASURED';
  rows.forEach(function(row,i){
    if(row.slice(0,5).every(missing))return;hasData=true;
    var line=i+10,e={sourceRow:line,sourceEquipmentId:text(row[5]),name:preview.equipment.find(function(u){return u.characteristics.sourceSheetRow===line;})?.name||'',downtimeSeconds:number(row[0],'Z'+line,false),failureCount:number(row[1],'AA'+line,false),stopClass:text(row[2])||'UNKNOWN',exposureSeconds:number(row[3],'AC'+line,false),notes:text(row[4])};
    if(e.downtimeSeconds!=null)e.downtimeSeconds*=60;if(e.exposureSeconds!=null)e.exposureSeconds*=60;
    if(e.failureCount!=null&&!Number.isInteger(e.failureCount))issue('AA'+line,'Stop count must be an integer.');
    if(e.exposureSeconds===0)issue('AC'+line,'Exposure must be positive.');
    if(!['UNKNOWN','FAILURES','MINOR','ALL'].includes(e.stopClass))issue('AB'+line,'Use UNKNOWN / FAILURES / MINOR / ALL.');
    if(e.exposureSeconds!=null&&e.downtimeSeconds!=null&&e.downtimeSeconds>e.exposureSeconds)issue('Z'+line,'Downtime exceeds the equipment exposure.');
    raw.equipment.push(e);
  });
  ['V1','V2','V3'].forEach(function(cell){fields.push({cell:cell,label:cell==='V1'?'Observation name':cell==='V2'?'Source / reference':'Notes',value:text(value(cell)),unit:''});});
  return {schema:'st-real-sheet-v1',record:raw,fields:fields,errors:errors,hasData:hasData};
}

// Only the reported production summary and one equipment downtime column.
function simpleSheetRealDataFields_(){
  return [
    ['F1','reportedEfficiencyPercent','AU (%)','percent'],['F2','reportedUpdtPercent','UPDT (%)','percent'],
    ['F3','shift1','Shift 1 (Cases)','number'],['F4','shift2','Shift 2 (Cases)','number'],['F5','shift3','Shift 3 (Cases)','number'],
    ['F6','reportedProductionCases','Total Production Day (Cases)','number'],['F7','reportedProductionUnits','Total Production Day (Units)','number'],
    ['J1','durationSeconds','Total Time (min)','time'],['J2','businessExternalDowntimeSeconds','Business External Time (min)','time'],
    ['J3','plantAvailableSeconds','Plant Available Time (min)','time'],['J4','plantDecisionDowntimeSeconds','Plant Decision Time (min)','time'],
    ['J5','productionAvailableSeconds','Production Available Time (min)','time'],['J6','downtimeSeconds','Downtime (min)','time'],['J7','runTimeSeconds','Run Time (min)','time'],
    ['N1','rateLossSeconds','Rate Loss (min)','time']
  ].map(function(f){return {cell:f[0],key:f[1],label:f[2],type:f[3],unit:f[3]==='percent'?'%':f[3]==='time'?'min':f[1]==='reportedProductionUnits'?'units':'cases'};});
}
function parseSimpleSheetRealData_(top,formats,rows,preview){
  var raw={name:'Production day',date:preview.metadata.dateOfAnalysis||'',status:'MEASURED',aem:{basis:'UNCONFIRMED'},equipment:[],shiftProduction:[null,null,null],productionUnit:'BOTTLES',lineTimeBasis:'UNCONFIRMED',outputBasis:'UNCONFIRMED',updtDefinition:'UNCONFIRMED',updtPercentDenominator:'UNCONFIRMED',bottlesPerCase:preview.metadata.bottlesPerCase??null},fields=[],errors=[],hasData=false;
  function missing(v){return v==null||typeof v==='string'&&(!v.trim()||/^(NA|N\/A)$/i.test(v.trim()));}
  function numeric(v,cell,percent,format){
    if(missing(v))return null;hasData=true;
    var explicit=typeof v==='string'&&/%$/.test(v.trim());
    if(typeof v!=='number'&&(typeof v!=='string'||!/^\+?(?:\d+(?:\.\d*)?|\.\d+)\s*%?$/.test(v.trim()))||explicit&&!percent){errors.push({cell:cell,message:'Enter a non-negative number or leave blank.'});return null;}
    var n=Number(typeof v==='string'?v.trim().replace(/%$/,''):v);
    if(percent&&!explicit&&typeof v==='number'&&/%/.test(String(format||'').replace(/"[^"]*"|\\./g,'')))n*=100;
    if(!Number.isFinite(n)||n<0||percent&&n>100){errors.push({cell:cell,message:percent?'Enter 0–100%.':'Enter a non-negative number.'});return null;}return n;
  }
  simpleSheetRealDataFields_().forEach(function(f){
    var r=Number(f.cell.slice(1))-1,c=f.cell.charCodeAt(0)-69,input=top[r]?.[c],n=numeric(input,f.cell,f.type==='percent',formats[r]?.[c]);
    fields.push(Object.assign({},f,{value:n,sourceValue:missing(input)?null:String(input)}));
    if(f.type==='time'&&n!=null)n*=60;
    if(/^shift/.test(f.key))raw.shiftProduction[Number(f.key.slice(-1))-1]=n;
    else if(['businessExternalDowntimeSeconds','plantAvailableSeconds','plantDecisionDowntimeSeconds','productionAvailableSeconds'].includes(f.key))raw.aem[f.key]=n;
    else raw[f.key]=n;
  });
  if(raw.durationSeconds===0)errors.push({cell:'J1',message:'Total Time must be positive.'});
  raw.production=raw.reportedProductionUnits;
  if(raw.production==null){raw.production=raw.reportedProductionCases;raw.productionUnit='CASES';}
  // This identity uses only the supplied time components; source AU is kept separately.
  raw.effectiveRuntimeSeconds=raw.runTimeSeconds!=null&&raw.rateLossSeconds!=null&&raw.runTimeSeconds>=raw.rateLossSeconds?raw.runTimeSeconds-raw.rateLossSeconds:null;
  rows.forEach(function(row,i){var n=numeric(row[0],'Z'+(i+10),false);if(n==null)return;raw.equipment.push({sourceRow:i+10,sourceEquipmentId:missing(row[1])?'':String(row[1]),name:preview.equipment.find(function(u){return u.characteristics.sourceSheetRow===i+10;})?.name||'',downtimeSeconds:n*60,failureCount:null,stopClass:'UNKNOWN',exposureSeconds:raw.durationSeconds,notes:''});});
  return {schema:'st-real-sheet-simple-v1',record:raw,fields:fields,errors:errors,hasData:hasData};
}
