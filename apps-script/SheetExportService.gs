// Writes a new native Sheet; never changes the source used for import.
function exportEquipmentSheet_(request, user) {
  if (!request || typeof request !== 'object') throw createSimulatorError_('INVALID_SHEET_REQUEST','Equipment export inputs are required.');
  getOwnedCaseFile_(request.caseId, user, true); // Authorize before creating any Drive file.
  if (!Array.isArray(request.equipment) || !request.equipment.length || request.equipment.length > 1000) {
    throw createSimulatorError_('INVALID_SHEET_REQUEST','Export between 1 and 1,000 equipment rows.');
  }
  var equipment=normalizeEquipmentList_(request.equipment),metadata=normalizeCaseMetadata_(request.metadata);
  var data=equipmentSheetData_(equipment,metadata);
  // Validate the same contract as Preview before creating a spreadsheet.
  var review=parseEquipmentSheet_(data.metadata,data.rows,[]);
  if (!review.canImport) throw createSimulatorError_('INVALID_SHEET_EXPORT','Some values cannot be represented in the import format.',review.errors.map(function(issue){return issue.cell+': '+issue.message;}));
  var folder=getWorkspaceFolders_().exports;
  var name=String(request.caseName||'Case').trim().slice(0,120)+' · '+String(request.simulationName||'Simulation').trim().slice(0,80)+' · Equipment';
  var primary=sheetExportColor_(request.theme?.primary,'#5485a4'),secondary=sheetExportColor_(request.theme?.secondary,'#71818a');
  var book,file;
  try {
    book=SpreadsheetApp.create(name,Math.max(100,data.rows.length+9),23);
    file=DriveApp.getFileById(book.getId());
    file.moveTo(folder);
    var sheet=book.getSheets()[0];sheet.setName('Equipment');
    var values=Array.from({length:data.rows.length+9},function(){return Array(23).fill('');});
    var labels=['Site','Packaging line','Format','Container size (oz)','Bottles per case','Date of analysis','By'];
    labels.forEach(function(label,index){values[index][0]=label;values[index][2]=sheetExportLiteral_(data.metadata[index]);});
    values[0][4]='Flow Pilot · '+String(request.simulationName||'Simulation').slice(0,80);
    values[7][0]='Import layout: C1:C7 and A10:W. F = installed maximum BPM (configured BPM if undefined); import initializes running speed from F. Percentages use percentage points (100 = 100%). JSON retains simulator-only settings.';
    values[8]=sheetImportColumns_().map(function(column){return column[2];});
    data.rows.forEach(function(row,index){values[index+9]=row.map(sheetExportLiteral_);});
    // One values write, including metadata and headers, instead of cell-by-cell RPCs.
    sheet.getRange(1,1,values.length,23).setValues(values).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
    sheet.getRange(1,1,7,2).mergeAcross().setFontWeight('bold').setFontColor(secondary);
    sheet.getRange(1,3,7,1).setBackground('#f3f6f8');
    sheet.getRange(1,5,2,19).merge().setFontSize(16).setFontWeight('bold').setFontColor(primary).setWrap(true);
    sheet.getRange(8,1,1,23).merge().setWrap(true).setFontColor('#52616c').setFontSize(9);
    sheet.getRange(9,1,1,23).setBackground(primary).setFontColor(sheetExportInk_(primary)).setFontWeight('bold').setWrap(true);
    var body=sheet.getRange(10,1,data.rows.length,23);
    body.setBackground('#ffffff');
    body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY,false,false);
    sheet.getRange(10,4,data.rows.length,20).setNumberFormat('0.########').setHorizontalAlignment('right');
    sheet.getRange(10,2,data.rows.length,1).setFontWeight('bold').setFontColor(secondary);
    sheet.setFrozenRows(9);sheet.setFrozenColumns(2);
    sheet.setColumnWidths(1,23,130);sheet.setColumnWidth(2,220);sheet.setColumnWidth(3,170);
    sheet.setRowHeight(8,45);sheet.setRowHeight(9,64);sheet.setRowHeights(10,data.rows.length,28);
    body.setWrap(true);sheet.getRange(9,1,data.rows.length+1,23).createFilter();
    SpreadsheetApp.flush();
    return {spreadsheetId:book.getId(),url:book.getUrl(),sheetName:sheet.getName(),equipmentCount:data.rows.length};
  } catch (error) {
    // Only the new export belongs to this operation; clean up an incomplete export.
    if(book)try{(file||DriveApp.getFileById(book.getId())).setTrashed(true);}catch(cleanupError){console.warn('Incomplete equipment export could not be removed.');}
    throw createSimulatorError_('SHEET_EXPORT_FAILED','Google Sheets export could not be completed. Check Drive and Sheets authorization, then try again.');
  }
}

function equipmentSheetData_(equipment, metadata) {
  function value(object,key){var v=object?.[key];return v===undefined||v===null||v===''?'NA':v;}
  function current(object,key,fallback,fallbackKey){return Object.prototype.hasOwnProperty.call(object,key)?value(object,key):value(fallback,fallbackKey||key);}
  var fields=['site','packagingLine','formatName','containerSizeOz','bottlesPerCase','dateOfAnalysis','by'];
  return {metadata:fields.map(function(key){return value(metadata,key);}),rows:equipment.map(function(unit){
    var d=unit.processData||{},e=d.equipment||{},g=d.geometry||{},u=d.upstream||{},down=d.downstream||{},s=d.speedAndSensors||{},a=d.accumulation||{};
    var reliability=unit.noiseProfile?.reliability||{},conveyor=unit.type==='CONVEYOR',c=unit.characteristics||{};
    var critical=!conveyor&&(typeof c.isPacemaker==='boolean'?c.isPacemaker:typeof c.criticalMachine==='boolean'?c.criticalMachine:['PACEMAKER','CRITICAL_MACHINE'].indexOf(d.role)>=0||unit.type==='PACEMAKER');
    var type=unit.type==='PACEMAKER'?(supportedEquipmentTypes_().includes(d.machineType)&&d.machineType!=='PACEMAKER'?d.machineType:'CUSTOM'):unit.type;
    return [type,unit.name,critical?'Y':'N',value(reliability,'mtbfMinutes'),value(reliability,'mttrMinutes'),
      e.maximumSpeedBpm==null?unit.nominalRatePerSecond*60:e.maximumSpeedBpm,
      value(g,'lactMm'),value(g,'lpPrimeMm'),value(g,'actualDischargeMm'),value(g,'actualCodingMm'),
      value(u,'packageLengthMm'),value(u,'dischargePitchMm'),value(u,'startupTimeSeconds'),conveyor?current(a,'bottlesDischargedAtStop',u):value(u,'bottlesDischargedAtStop'),
      value(down,'infeedPitchMm'),conveyor?current(a,'downstreamRampUpSeconds',down,'rampUpTimeSeconds'):value(down,'rampUpTimeSeconds'),
      conveyor?current(a,'conveyorSpeedFactorPercent',s,'conveyorSpeedFactorVsDischargeVelocityPercent'):value(s,'conveyorSpeedFactorVsDischargeVelocityPercent'),
      value(s,'codingConveyorSpeedFactorVsPreviousConveyorPercent'),value(s,'conveyorSpeedFactorVsPreviousConveyorPercent'),
      conveyor?current(a,'blockedTimeDelaySeconds',s):value(s,'blockedTimeDelaySeconds'),conveyor?current(a,'clearTimeDelaySeconds',s):value(s,'clearTimeDelaySeconds'),
      conveyor?current(a,'insuranceFactorUnits',s):value(s,'insuranceFactorUnits'),value(s,'overspeedVsInfeedScrewPercent')];
  })};
}

function sheetExportLiteral_(value) {
  // setValues interprets a leading equals sign as a formula, even in a user name.
  if(typeof value==='string') {
    if(value.length>50000)throw createSimulatorError_('INVALID_SHEET_EXPORT','A worksheet value is too long.');
    return value.charAt(0)==='='?"'"+value:value;
  }
  return value;
}
function sheetExportColor_(value,fallback){return /^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;}
function sheetExportInk_(hex){var channels=[1,3,5].map(function(offset){return parseInt(hex.slice(offset,offset+2),16)/255;}).map(function(c){return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722>.179?'#18212a':'#ffffff';}
