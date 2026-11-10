function sheetImportContractVersion_(){return 'sheet-import-20261110-4';}
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
  if(speed&&accumulation&&/m\s*\/\s*min\b/.test(g)&&/(?:\(\s*s\s*\)|\[\s*s\s*\]|\bseconds?\b|\bsec\b)/.test(h))return 'plant-sheet-v2';
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
  if(sheet?.getName()==='Products & Formats')sheet=book.getSheetByName('Equipment');
  if(sheet&&(['Real Data','Datos reales'].includes(sheet.getName()))&&(photoActualsTab_(sheet)||sheet.getMaxColumns()>=23&&['st-real-inputs-v2','st-real-inputs-v3'].includes(sheet.getRange(1,23).getValues()[0][0])))sheet=book.getSheetByName('Equipment');
  if (!sheet) throw createSimulatorError_('SHEET_TAB_NOT_FOUND','The worksheet was not found. Enter its exact tab name.');
  var lastRow=sheet.getLastRow();
  var marker=sheet.getMaxColumns()>=26?sheet.getRange(1,26).getValues()[0][0]:'';
  var stopBreakdown=marker==='st-equipment-metadata-b-v4',compact=stopBreakdown||marker==='st-equipment-metadata-b-v3',start=compact?8:marker==='st-equipment-metadata-b-v2'?11:10,limit=start+999;
  if(lastRow>limit)throw createSimulatorError_('SHEET_TOO_LARGE','This importer supports up to 1,000 equipment rows (rows '+start+'–'+limit+'). Remove extra content below the equipment table or use a dedicated worksheet.');
  if(sheet.getMaxColumns()<23||sheet.getMaxRows()<start)throw createSimulatorError_('INVALID_SHEET_LAYOUT','Expected an Equipment header and data starting at A'+start+'.');
  var layout=detectSheetImportLayout_(sheet.getRange(start-2,7,2,2).getValues()),width=sheetImportColumns_(layout).length,lastColumn=String.fromCharCode(64+width);
  if(sheet.getMaxColumns()<width)throw createSimulatorError_('INVALID_SHEET_LAYOUT','Expected equipment in A'+start+':'+lastColumn+'.');
  var metadataColumn=compact||['st-equipment-metadata-b-v1','st-equipment-metadata-b-v2'].includes(marker)?'B':'C';
  var metadata,containerUnit,metadataCells=compact?compactEquipmentMetadataCells_():null;
  if(compact){
    var grid=sheet.getRange(1,1,4,5).getValues();
    metadata=metadataCells.map(function(cell){return grid[Number(cell.slice(1))-1][cell.charCodeAt(0)-65];});
    containerUnit='';
  }else{
    var metadataRange = sheet.getRange(1,metadataColumn==='B'?2:3,7,1);
    metadata = metadataRange.getValues().map(function(row){return row[0];});
    if(typeof metadata[3]==='number'&&typeof metadataRange.getDisplayValues==='function'){
      var display=String(metadataRange.getDisplayValues()[3]?.[0]||''),unit=display.match(/^[\d\s.,+]+\s*([^\d\s][^\r\n]*)$/);
      if(unit&&/^[\p{L}µμ°%(]/u.test(unit[1]))metadata[3]=metadata[3]+' '+unit[1].trim();
    }
    containerUnit=sheetContainerUnit_(sheet.getRange(4,1,1,metadataColumn==='B'?1:2).getValues()[0]);
  }
  [5,6].forEach(function(index){
    if(Object.prototype.toString.call(metadata[index])==='[object Date]')metadata[index]=Utilities.formatDate(metadata[index],book.getSpreadsheetTimeZone(),'yyyy-MM-dd');
  });
  var count = Math.max(0,lastRow-start+1), rows = [], formats = [];
  if (count) {var range=sheet.getRange(start,1,count,width);rows=range.getValues();formats=range.getNumberFormats();}
  // The plant template may include shift-time summaries below the equipment table.
  var footer=rows.findIndex(function(row){return !String(row[0]||'').trim()&&!String(row[1]||'').trim()&&row.some(function(value){return /^total\s+time$/i.test(String(value||'').trim());});});
  if(footer>=0){rows=rows.slice(0,footer);formats=formats.slice(0,footer);count=rows.length;}
  var stopRows=stopBreakdown&&count?sheet.getRange(start,27,count,4).getValues():null;
  var result = parseEquipmentSheet_(metadata, rows, formats,layout,{containerUnit:containerUnit,metadataColumn:metadataColumn,metadataCells:metadataCells,stopRows:stopRows,start:start,allowEmpty:compact||marker==='st-equipment-metadata-b-v2'});
  result.source = {schemaVersion:layout,spreadsheetId:reference.id,sheetId:sheet.getSheetId(),sheetName:sheet.getName(),metadataColumn:metadataColumn,readAt:new Date().toISOString(),equipmentRange:'A'+start+':'+lastColumn+(count?count+start-1:start)};
  if(compact)result.source.metadataCells=metadataCells;
  if(stopBreakdown)result.source.stopBreakdown=result.stopBreakdown=true;
  var catalogTab=sheet.getName()==='Equipment'?sheets.find(function(tab){return tab.getName()==='Products & Formats';}):null;
  var catalogMarker=catalogTab?.getRange(1,1).getValues()[0][0];
  if(['st-material-sheet-v1','st-material-sheet-v2'].includes(catalogMarker)){
    result.materialCatalog=readSheetCatalog_(catalogTab,catalogMarker);
    var ids=count&&sheet.getMaxColumns()>=26?sheet.getRange(start,26,count,1).getValues():[];
    result.sourceRows.forEach(function(row){row.equipmentId=String(ids[row.row-start]?.[0]||'');});
  }
  var actuals=sheet.getName()==='Equipment'?sheets.find(function(tab){return ['Real Data','Datos reales'].includes(tab.getName());}):null;
  var photoActuals=photoActualsTab_(actuals);
  if(photoActuals||actuals&&actuals.getMaxColumns()>=23&&actuals.getRange(1,23).getValues()[0][0]==='st-real-inputs-v3'){
    result.realData=readDedicatedSheetActuals_(actuals,sheet,count,result,photoActuals,start);
    return result;
  }
  if (sheet.getMaxColumns() >= 31 && sheet.getRange(1,18).getValues()[0][0] === 'st-real-sheet-v1') {
    var extended=sheet.getMaxColumns()>=31+sheetEquipmentActuals_().length&&sheet.getRange(7,18).getValues()[0][0]==='st-real-equipment-v2';
    result.realData = parseSheetRealData_(sheet.getRange(1,5,7,19).getValues(),sheet.getRange(1,5,7,19).getNumberFormats(),count?sheet.getRange(10,26,count,6+(extended?sheetEquipmentActuals_().length:0)).getValues():[],result,extended);
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
  var metaColumn=options?.metadataColumn||'C',metadata={},metaFields=['site','packagingLine','formatName','containerSize','bottlesPerCase','dateOfAnalysis','by'];
  var metaCell=function(index){return options?.metadataCells?.[index]||metaColumn+(index+1);};
  metaFields.forEach(function(key,i){var v=metadataCells[i];metadata[key]=i===4?numeric(v,metaCell(4)):missing(v)?null:typeof v==='number'?v:String(v).trim();});
  var misplacedDate=sheetAnalysisDate_(metadataCells[6]);
  metadata.dateOfAnalysis=sheetAnalysisDate_(metadataCells[5])||(!metadata.dateOfAnalysis?misplacedDate:metadata.dateOfAnalysis);
  metadata.by=sheetResponsibleName_(metadataCells[6]);
  if(!missing(metadataCells[6])&&!metadata.by&&!misplacedDate)issue(errors,metaCell(6),'Enter the name of the person who recorded the data.');
  var size=sheetContainerSize_(metadataCells[3],options?.containerUnit);metadata.containerSize=size.containerSize;metadata.containerSizeOz=size.containerSizeOz;if(size.error)issue(errors,metaCell(3),size.error);
  if(metadata.bottlesPerCase!==null&&metadata.bottlesPerCase<=0)issue(errors,metaCell(4),'Must be greater than zero when provided.');
  if(metadata.bottlesPerCase!==null&&!Number.isInteger(metadata.bottlesPerCase))issue(errors,metaCell(4),'Bottles per case must be a whole number.');
  var aliases={MACHINE:'CUSTOM',BLOWER:'BLOWER',BLOWMOLDER:'BLOWMOLDER',BLOWMOULDER:'BLOWMOLDER',CONVEYOR:'CONVEYOR',PACEMAKER:'PACEMAKER',PUCKER:'PUCKER',FILLER:'FILLER',DEPUCKER:'DEPUCKER',SLEEVER:'SLEEVER',CASEPACKER:'CASE_PACKER',PALLETIZER:'PALLETIZER',PALLETISER:'PALLETIZER',CUSTOM:'CUSTOM',OTHER:'CUSTOM'};
  rows.forEach(function(row,offset){
    var rowNumber=offset+(options?.start||10);
    var stopRow=options?.stopRows?.[offset]||[];
    if(row.every(missing)&&stopRow.every(missing))return;
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
    var stopInputs;
    if(stopRow.some(function(value){return !missing(value);})){
      var pairs=['minor','major'].map(function(kind,index){
        var first=index*2,bf=numeric(stopRow[first],['AA','AC'][index]+rowNumber),tr=numeric(stopRow[first+1],['AB','AD'][index]+rowNumber);
        if(!(bf>0&&tr>0)&&!(bf===0&&tr===0))issue(errors,['AA','AC'][index]+rowNumber+':'+['AB','AD'][index]+rowNumber,'Enter both values as positive minutes, or 0 and 0 if this category had no stops.');
        return {mtbfMinutes:bf,mttrMinutes:tr};
      });
      var rates=pairs.map(function(pair){return pair.mtbfMinutes>0?1/pair.mtbfMinutes:0;});
      var total=rates[0]+rates[1];
      mtbf=total>0?1/total:null;
      mttr=total>0?(rates[0]*pairs[0].mttrMinutes+rates[1]*pairs[1].mttrMinutes)/total:null;
      stopInputs={minor:pairs[0],major:pairs[1]};
      values.stopInputs=stopInputs;
      if(values.mtbfMinutes!==null||values.mttrMinutes!==null)issue(warnings,'D'+rowNumber+':E'+rowNumber,'Minor and major inputs take precedence over the general pair.');
    }else if(mtbf===0||mttr===0||((mtbf===null)!==(mttr===null)))issue(errors,'D'+rowNumber+':E'+rowNumber,'Supply both MTBF and MTTR as positive minutes, or leave both blank.');
    if(mtbf===null&&mttr===null)issue(warnings,'D'+rowNumber+':E'+rowNumber,conveyor?'Conveyor model assumption: no own random failures. MTBF/MTTR are not required; material and control stops remain active.':'No reliability data: random failures are disabled for this equipment.',conveyor?'info':'warning',conveyor?'CONVEYOR_FAILURES_EXCLUDED':'NO_RELIABILITY_DATA');
    if(conveyor&&flag==='Y')issue(errors,'C'+rowNumber,'A conveyor cannot be the critical machine. Use Y for one machine only.');
    var unit={id:'sheet-row-'+rowNumber,type:type||'CUSTOM',name:name,nominalRatePerSecond:values.maximumSpeedBpm===null?null:values.maximumSpeedBpm/60,initialMode:'AUTO',characteristics:{criticalMachine:flag==='Y',isPacemaker:flag==='Y'&&!conveyor,rateBasis:'bottles per minute',sourceSheetRow:rowNumber,sourceSheetLayout:layout},noiseProfile:{},processData:{
      role:conveyor?'CONVEYOR':flag==='Y'?'CRITICAL_MACHINE':'MACHINE',machineType:type||'CUSTOM',
      equipment:{mtbfMinutes:mtbf,mttrMinutes:mttr,maximumSpeedBpm:values.maximumSpeedBpm},
      geometry:{lactMm:values.lactMm,lpPrimeMm:values.lpPrimeMm,actualDischargeMm:values.actualDischargeMm,actualCodingMm:values.actualCodingMm},
      upstream:{packageLengthMm:values.packageLengthMm,dischargePitchMm:values.dischargePitchMm,startupTimeSeconds:values.startupTimeSeconds,bottlesDischargedAtStop:values.bottlesDischargedAtStop},
      downstream:{infeedPitchMm:values.infeedPitchMm,rampUpTimeSeconds:values.rampUpTimeSeconds},
      speedAndSensors:{conveyorSpeedFactorVsDischargeVelocityPercent:values.conveyorSpeedFactorVsDischargeVelocityPercent,codingConveyorSpeedFactorVsPreviousConveyorPercent:values.codingConveyorSpeedFactorVsPreviousConveyorPercent,conveyorSpeedFactorVsPreviousConveyorPercent:values.conveyorSpeedFactorVsPreviousConveyorPercent,blockedTimeDelaySeconds:values.blockedTimeDelaySeconds,clearTimeDelaySeconds:values.clearTimeDelaySeconds,insuranceFactorUnits:values.insuranceFactorUnits,overspeedVsInfeedScrewPercent:values.overspeedVsInfeedScrewPercent}
    }};
    if(stopInputs)unit.processData.equipment.stopInputs=stopInputs;
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
  if(!equipment.length&&!options?.allowEmpty)issue(errors,'A'+(options?.start||10)+':'+columns[columns.length-1][0],'No equipment rows found.');
  if(equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).length>1)equipment.filter(function(unit){return unit.characteristics.isPacemaker;}).forEach(function(unit){issue(errors,'C'+unit.characteristics.sourceSheetRow,'Use Y for only one critical machine; mark the other machines N.');});
  var notes=[
    'Maximum speed F initializes nominal running speed. The optional packing proposal uses a reviewed Case Packer to assign bottle/case units, create a product and format, and translate bottle-equivalent machine speeds to cases/min. Without that proposal, existing unit settings are retained.',
    'MTBF uses seeded exponential intervals; MTTR is a fixed repair duration. The ST failure clock counts only positive processed-flow ticks; zero-flow starvation/blocking, Prime waiting, repairs and stops do not consume MTBF. No extra micro-stop noise is added by import.',
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
function sheetEquipmentActuals_(){
  return [
    ['E','totalDowntimeSeconds','Paro total'],['F','starvedSeconds','Starving'],
    ['G','blockedSeconds','Blocking'],['H','backupStopSeconds','Back-up'],
    ['I','waitingForPrimeSeconds','Espera de Prime'],['J','plannedStopSeconds','Paro planificado'],
    ['K','microStopSeconds','Microparos'],['L','pausedSeconds','Pausa'],
    ['M','otherStopSeconds','Otros sin producción'],['N','reportedDowntimeSeconds','Paro sin clasificar']
  ];
}
function photoActualsTab_(sheet){
  if(!sheet||sheet.getMaxColumns()<10)return null;
  var marker=sheet.getRange(1,10).getValues()[0][0];
  return ['st-real-inputs-v4','st-real-inputs-v5'].includes(marker)?marker:null;
}
// Adapt the dedicated tab to the observation contract used by legacy sheets.
function readDedicatedSheetActuals_(actuals,equipment,count,preview,photoActuals,start){
  start=start||10;
  var compact=photoActuals==='st-real-inputs-v5',topStart=compact?2:5,firstObservation=compact?16:20;
  var tabName=actuals.getName(),daily=actuals.getRange(topStart,2,compact?10:12,compact?4:5),values=daily.getValues(),numberFormats=daily.getNumberFormats();
  var top=Array.from({length:7},function(){return Array(19).fill('');}),formats=top.map(function(row){return row.slice();});
  var links={F1:'B5',F2:'B6',F3:'F5',F4:'F6',F5:'F7',F6:'F8',J1:'B7',J2:'B8',J3:'B9',J4:'B10',J5:'B11',J6:'B12',J7:'B13',N1:'F9',N2:'F10',N4:'B16',N5:'B14',N6:'F11',V1:'F14',V2:'F15',V4:'F16'};
  if(photoActuals)links={F3:'F5',F4:'F6',F5:'F7',F6:'F8',J1:'B7',J2:'B8',J3:'B9',J4:'B10',J5:'B11',J6:'B12',J7:'B13',N1:'F11',N2:'F12',N5:'B14',V4:'F9'};
  if(compact)links={F3:'E2',F4:'E3',F5:'E4',F6:'E5',J1:'B2',J2:'B3',J3:'B4',J4:'B5',J5:'B6',J6:'B7',J7:'B8',N1:'E9',N2:'E10',N5:'B9',V4:'E6'};
  Object.keys(links).forEach(function(cell){
    var source=links[cell],r=Number(source.slice(1))-topStart,c=source.charCodeAt(0)-66;
    var row=Number(cell.slice(1))-1,col=cell.charCodeAt(0)-69;
    top[row][col]=values[r][c];formats[row][col]=numberFormats[r][c];
  });
  top[1][13]='CASES';
  var ids=count?equipment.getRange(start,26,count,1).getValues().map(function(row){return String(row[0]??'');}):[];
  var byId=new Map(ids.flatMap(function(id,index){return id?[[id,index]]:[];}));
  var rows=ids.map(function(){return [];});
  var machineRows=new Set(preview.equipment.filter(function(e){return e.type!=='CONVEYOR';}).map(function(e){return e.characteristics.sourceSheetRow;}));
  var inputCount=Math.max(0,actuals.getLastRow()-firstObservation+1),errors=[],mapped=new Map();
  if(inputCount>1000)throw createSimulatorError_('SHEET_TOO_LARGE',tabName+' supports up to 1,000 equipment observations.');
  var hasValue=function(value){return value!=null&&String(value).trim()!==''&&!/^(NA|N\/A)$/i.test(String(value).trim());};
  var input=inputCount?actuals.getRange(firstObservation,1,inputCount,photoActuals?10:23):null;
  var inputFormats=photoActuals&&input?input.getNumberFormats():[];
  if(input)input.getValues().forEach(function(row,index){
    if(!row.slice(1,photoActuals?3:14).some(hasValue))return;
    var id=String(row[photoActuals?9:22]??''),target=byId.get(id),line=index+firstObservation;
    if(target===undefined||!machineRows.has(target+start)||mapped.has(target)||ids.indexOf(id)!==ids.lastIndexOf(id)){
      errors.push({cell:tabName+'!A'+line,message:'Equipment ID must match exactly one observation and one Equipment row.'});return;
    }
    mapped.set(target,line);
    if(photoActuals){
      var percentage=row[2];
      if(typeof percentage==='number'&&/%/.test(inputFormats[index]?.[2]||''))percentage*=100;
      rows[target]=[row[1],'','UNKNOWN','','',id,...Array(10).fill(''),percentage];
      return;
    }
    rows[target]=[row[2],row[3],hasValue(row[2])||hasValue(row[3])?'FAILURES':'UNKNOWN',row[1],'',id,...row.slice(4,14)];
  });
  var result=parseSheetRealData_(top,formats,rows,preview,true,start);
  result.errors=result.errors.map(function(error){
    if(links[error.cell])return {...error,cell:tabName+'!'+links[error.cell]};
    var m=/^([A-Z]+)(\d+)$/.exec(error.cell),line=m&&mapped.get(Number(m[2])-start);
    if(!line)return error;
    var columns=photoActuals?{Z:'B',AP:'C'}:{Z:'C',AA:'D',AC:'B'};
    sheetEquipmentActuals_().forEach(function(spec,index){columns['A'+String.fromCharCode(70+index)]=spec[0];});
    return columns[m[1]]?{...error,cell:tabName+'!'+columns[m[1]]+line}:error;
  }).concat(errors);
  result.fields=result.fields.filter(function(field){return links[field.cell];}).map(function(field){return {...field,cell:tabName+'!'+links[field.cell]};});
  result.sheetName=tabName;
  result.record.equipment.forEach(function(entry){entry.observationRow=mapped.get(entry.sourceRow-start);});
  if(photoActuals)result.equipmentFields=[{key:'reportedDowntimePercent',label:'Reported downtime',unit:'%'}];
  result.hasData=result.hasData||errors.length>0;
  return result;
}
function parseSheetRealData_(top,formats,rows,preview,extended,start){
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
  if(extended){
    raw.reportedProductionCases=raw.productionUnit==='CASES'?raw.production:null;
    raw.reportedProductionUnits=number(value('V4'),'V4',false);
    if(raw.reportedProductionUnits!=null)hasData=true;
    fields.push({cell:'V4',label:'Reported bottle production',value:raw.reportedProductionUnits,unit:'bottles'});
  }
  [['R2',raw.productionUnit,['BOTTLES','CASES','UNITS']],['R3',raw.aem.basis,['UNCONFIRMED','CALENDAR_OUTPUT_FLOW']],['R4',raw.updtDefinition,['UNCONFIRMED','AEM_UNPLANNED','TOTAL_EQUIVALENT_LOSS']],['R5',raw.updtPercentDenominator,['UNCONFIRMED','TOTAL','PLANT','PRODUCTION']],['R6',raw.lineTimeBasis,['UNCONFIRMED','OUTPUT_FLOW']],['F7',raw.outputBasis,['UNCONFIRMED','GOOD','GROSS']]].forEach(function(f){if(!f[2].includes(f[1]))issue(f[0],'Use '+f[2].join(' / ')+'.');fields.push({cell:f[0],label:({'R2':'Production unit','R3':'AEM comparison basis','R4':'UPDT definition','R5':'UPDT % denominator','R6':'Line-time basis','F7':'Output basis'})[f[0]],value:f[1],unit:''});});
  ['F3','F4','F5','F6'].forEach(function(cell){var unit=text(value(cell.replace('F','G')))||'cases';if(unit.toUpperCase()!==raw.productionUnit&&!(unit.toUpperCase()==='COUNT'&&raw.productionUnit==='UNITS'))issue(cell.replace('F','G'),'Unit must match R2 ('+raw.productionUnit+').');});
  raw.shiftProduction=shifts;raw.bottlesPerCase=preview.metadata.bottlesPerCase??null;
  raw.date=raw.periodStart?raw.periodStart.slice(0,10):preview.metadata.dateOfAnalysis||'';
  raw.name=text(value('V1'))||'Imported production period';raw.source=text(value('V2'));raw.notes=text(value('V3'));raw.status='MEASURED';
  rows.forEach(function(row,i){
    if(row.slice(0,5).every(missing)&&(!extended||row.slice(6).every(missing)))return;hasData=true;
    var line=i+(start||10),e={sourceRow:line,sourceEquipmentId:text(row[5]),name:preview.equipment.find(function(u){return u.characteristics.sourceSheetRow===line;})?.name||'',downtimeSeconds:number(row[0],'Z'+line,false),failureCount:number(row[1],'AA'+line,false),stopClass:text(row[2])||'UNKNOWN',exposureSeconds:number(row[3],'AC'+line,false),notes:text(row[4])};
    if(e.downtimeSeconds!=null)e.downtimeSeconds*=60;if(e.exposureSeconds!=null)e.exposureSeconds*=60;
    if(e.failureCount!=null&&!Number.isInteger(e.failureCount))issue('AA'+line,'Stop count must be an integer.');
    if(e.exposureSeconds===0)issue('AC'+line,'Exposure must be positive.');
    if(!['UNKNOWN','FAILURES','MINOR','ALL'].includes(e.stopClass))issue('AB'+line,'Use UNKNOWN / FAILURES / MINOR / ALL.');
    if(e.exposureSeconds!=null&&e.downtimeSeconds!=null&&e.downtimeSeconds>e.exposureSeconds)issue('Z'+line,'Downtime exceeds the equipment exposure.');
    if(extended)sheetEquipmentActuals_().forEach(function(spec,index){
      var minutes=number(row[index+6],'A'+String.fromCharCode(70+index)+line,false);
      if(minutes!=null)e[spec[1]]=minutes*60;
    });
    if(extended&&row.length>16){
      var reported=number(row[16],'AP'+line,true);
      if(reported!=null)e.reportedDowntimePercent=reported;
    }
    raw.equipment.push(e);
  });
  ['V1','V2','V3'].forEach(function(cell){fields.push({cell:cell,label:cell==='V1'?'Observation name':cell==='V2'?'Source / reference':'Notes',value:text(value(cell)),unit:''});});
  return {schema:'st-real-sheet-v1',record:raw,fields:fields,equipmentFields:extended?sheetEquipmentActuals_().map(function(spec){return {key:spec[1],label:spec[2]};}):[],errors:errors,hasData:hasData};
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

function readLegacySheetCatalog_(sheet){
  var catalog={version:3,products:[],formats:[]},errors=[],initialFormatId;
  var units=STScenarioEngine_.productVolumeUnits,count=sheet.getLastRow()-3;
  if(count>200)return {catalog:catalog,errors:['Products & Formats supports up to 200 rows.']};
  if(count<=0)return {catalog:catalog,errors:errors};
  sheet.getRange(4,1,count,14).getValues().forEach(function(row,index){
    var line=index+4;
    if(row.every(function(value){return value==='';}))return;
    function text(col){return String(row[col]??'').trim();}
    function number(col,minimum){
      if(row[col]==='')return undefined;
      var value=row[col];
      if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||(minimum===0&&col>=7&&value===0))throw Error(String.fromCharCode(65+col)+' must be a valid number.');
      return value;
    }
    function json(col,fallback){
      return text(col)?JSON.parse(text(col),function(key,value){
        if(['__proto__','constructor','prototype'].includes(key))throw Error('Invalid JSON property.');
        return value;
      }):fallback;
    }
    try{
      var type=text(0),product=type==='Product',id=text(1);
      if(!product&&type!=='Format')throw Error('Select Product or Format.');
      if(!id||!text(2))throw Error('Enter an ID and a name.');
      var profiles=json(13,{});
      if(!profiles||Array.isArray(profiles)||typeof profiles!=='object')throw Error('Equipment profiles must be a JSON object keyed by Equipment ID.');
      var record={id:id,name:text(2),equipment:profiles};
      var shape={lengthMm:number(7,0),widthMm:number(8,0),heightMm:number(9,0)};
      if(product){
        if([3,4,10,11,12].some(function(col){return text(col);}))throw Error('Packing fields apply to Format rows.');
        var unit=text(6)||'mL',volume=number(5,0);
        if(!Object.hasOwn(units,unit))throw Error('Select a valid volume unit.');
        if(volume!==undefined)record.volumeMl=volume*units[unit];
        if(unit!=='mL')record.volumeUnit=unit;
        record.bottle=shape;catalog.products.push(record);
      }else{
        if(text(5)||text(6))throw Error('Volume applies to Product rows.');
        var legacy=json(12,[]);
        if(!Array.isArray(legacy)||legacy.length>2||legacy.some(function(v){return v!=null&&typeof v!=='string';}))throw Error('Legacy box must contain an ID and name.');
        if(legacy[0]!=null)record.legacyBoxId=legacy[0];
        if(legacy[1]!=null)record.legacyBoxName=legacy[1];
        record.productId=text(3);record.case=shape;record.bottlesPerCase=number(10,1);
        if(text(11))record.packPattern=text(11);
        if(text(4)==='Y'){
          if(initialFormatId!==undefined)throw Error('Mark only one initial format.');
          initialFormatId=id;
        }else if(text(4)&&text(4)!=='N')throw Error('Use Y or N for Initial Format.');
        catalog.formats.push(record);
      }
    }catch(error){errors.push('Products & Formats · row '+line+': '+error.message);}
  });
  if(!errors.length)try{STScenarioEngine_.validateFormatCatalog(catalog);}catch(error){errors.push('Products & Formats · '+error.message);}
  return {catalog:catalog,initialFormatId:initialFormatId,errors:errors};
}

function sheetResponsibleName_(value){
  if(typeof value!=='string')return null;
  var name=value.trim();
  return name&&/[\p{L}]/u.test(name)&&!sheetAnalysisDate_(name)&&!/^(NA|N\/A)$/i.test(name)?name:null;
}

function readSheetCatalog_(sheet,marker){
  if(marker==='st-material-sheet-v1')return readLegacySheetCatalog_(sheet);
  var catalog={version:3,products:[],formats:[]},errors=[],formats=[],productIds=new Map(),formatNames=new Set();
  var units=STScenarioEngine_.productVolumeUnits,count=sheet.getLastRow()-3;
  if(count>200)return {catalog:catalog,errors:['Products & Formats supports up to 200 rows.'],matchByName:true};
  if(count>0)sheet.getRange(4,1,count,9).getValues().forEach(function(row,index){
    var line=index+4;
    function text(col){return String(row[col]??'').trim();}
    function missing(col){return !text(col)||/^N\/?A$/i.test(text(col));}
    function number(col,minimum,allowZero){
      if(missing(col))return undefined;
      var value=row[col];
      if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||(!allowZero&&value===0))throw Error(String.fromCharCode(65+col)+' must be a valid number.');
      return value;
    }
    if(row.every(function(value){return value==='';}))return;
    try{
      var type=text(0),name=text(1),key=name.toLowerCase(),product=type==='Product';
      if(!product&&type!=='Format')throw Error('Select Product or Format.');
      if(!name)throw Error('Enter a name.');
      var names=product?productIds:formatNames;
      if(names.has(key))throw Error(type+' names must be unique.');
      var shape={lengthMm:number(5,0,false),widthMm:number(6,0,false),heightMm:number(7,0,false)};
      var record={id:'sheet-'+type.toLowerCase()+'-'+line,name:name};
      if(product){
        if(!missing(2)||!missing(8))throw Error('Product and Bottles per Case apply to Format rows.');
        var unit=missing(4)?'mL':text(4),volume=number(3,0,true);
        if(!Object.hasOwn(units,unit))throw Error('Select a valid volume unit.');
        if(volume!==undefined)record.volumeMl=volume*units[unit];
        if(unit!=='mL')record.volumeUnit=unit;
        record.bottle=shape;catalog.products.push(record);productIds.set(key,record.id);
      }else{
        if(!missing(3)||!missing(4))throw Error('Volume applies to Product rows.');
        record.case=shape;record.bottlesPerCase=number(8,1,false);
        if(!Number.isInteger(record.bottlesPerCase)||record.bottlesPerCase>10000)throw Error('Enter a whole number of bottles per case from 1 to 10,000.');
        catalog.formats.push(record);formatNames.add(key);formats.push({record:record,product:missing(2)?'':text(2).toLowerCase(),line:line});
      }
    }catch(error){errors.push('Products & Formats · row '+line+': '+error.message);}
  });
  formats.forEach(function(format){
    var productId=format.product?productIds.get(format.product):catalog.products.length===1?catalog.products[0].id:null;
    if(productId)format.record.productId=productId;
    else errors.push('Products & Formats · row '+format.line+': enter the name of a Product in this sheet.');
  });
  if(!errors.length)try{STScenarioEngine_.validateFormatCatalog(catalog);}catch(error){errors.push('Products & Formats · '+error.message);}
  return {catalog:catalog,errors:errors,matchByName:true};
}

function compactEquipmentMetadataCells_(){return ['B1','B2','E1','E2','E3','B3','B4'];}

function sheetAnalysisDate_(value){
  if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value.getTime()))return value.toISOString().slice(0,10);
  if(typeof value!=='string')return null;
  var text=value.trim(),iso=/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(text);
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var legacy=/^(?:[A-Za-z]{3} )?([A-Za-z]{3}) (\d{1,2}) (\d{4})(?: \d{2}:\d{2}:\d{2} GMT[+-]\d{4}.*)?$/.exec(text);
  var month=legacy?months.indexOf(legacy[1])+1:0;
  var date=iso?iso[1]:month?legacy[3]+'-'+String(month).padStart(2,'0')+'-'+legacy[2].padStart(2,'0'):null;
  return date&&new Date(date+'T00:00:00Z').toJSON()?.slice(0,10)===date?date:null;
}
