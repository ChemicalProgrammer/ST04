// Writes a new native Sheet; never changes the source used for import.
function exportEquipmentSheet_(request, user) {
  if (!request || typeof request !== 'object') throw createSimulatorError_('INVALID_SHEET_REQUEST','Equipment export inputs are required.');
  if(request.caseSnapshot)browserCaseSnapshot_(request,user);else getOwnedCaseFile_(request.caseId, user, true);
  if (!Array.isArray(request.equipment) || !request.equipment.length || request.equipment.length > 1000) {
    throw createSimulatorError_('INVALID_SHEET_REQUEST','Export between 1 and 1,000 equipment rows.');
  }
  var equipment=normalizeEquipmentList_(request.equipment),metadata=normalizeCaseMetadata_(request.metadata);
  var data=equipmentSheetData_(equipment,metadata);
  // Validate the same contract as Preview before creating a spreadsheet.
  var review=parseEquipmentSheet_(data.metadata,data.rows,[],data.layout);
  if (!review.canImport) throw createSimulatorError_('INVALID_SHEET_EXPORT','Some values cannot be represented in the import format.',review.errors.map(function(issue){return issue.cell+': '+issue.message;}));
  var folder=getWorkspaceFolders_().exports;
  var name=String(request.caseName||'Case').trim().slice(0,120)+' · '+String(request.simulationName||'Simulation').trim().slice(0,80)+' · Equipment';
  var primary=sheetExportColor_(request.theme?.primary,'#5485a4'),secondary=sheetExportColor_(request.theme?.secondary,'#71818a');
  var book,file,stage='CREATE_SPREADSHEET';
  try {
    book=SpreadsheetApp.create(name,Math.max(100,data.rows.length+9),31);
    stage='MOVE_TO_EXPORTS';
    file=DriveApp.getFileById(book.getId());
    file.moveTo(folder);
    stage='WRITE_VALUES';
    var sheet=book.getSheets()[0];sheet.setName('Equipment');
    var values=Array.from({length:data.rows.length+9},function(){return Array(31).fill('');});
    var labels=['Site','Packaging line','Format','Container size','Bottles per case','Date of analysis','By'];
    labels.forEach(function(label,index){values[index][0]=label;values[index][2]=sheetExportLiteral_(data.metadata[index]);});
    sheetRealDataFields_().forEach(function(f){
      var col=f.cell.charCodeAt(0)-65,row=Number(f.cell.slice(1))-1;
      values[row][col-1]=f.label;values[row][col+1]=f.unit;
      if(f.key==='outputBasis')values[row][col]='UNCONFIRMED';
    });
    var definitions=[['Real data layout','st-real-sheet-v1'],['Production unit','CASES'],['AEM comparison basis','UNCONFIRMED'],['UPDT definition','UNCONFIRMED'],['UPDT % denominator','UNCONFIRMED'],['Line-time basis','UNCONFIRMED'],['Observation input','Fill tinted cells; blank = unknown']];
    definitions.forEach(function(row,i){values[i][16]=row[0];values[i][17]=row[1];});
    var guide=[['Observation name','','Enter a title in V1'],['Source / reference','','Sheet source is retained on import'],['Observation notes','','Optional notes in V3'],['AEM basis','','CALENDAR_OUTPUT_FLOW only after confirming definitions and calendar'],['UPDT definition','','AEM_UNPLANNED or TOTAL_EQUIVALENT_LOSS; otherwise UNCONFIRMED'],['UPDT % denominator','','TOTAL, PLANT or PRODUCTION; otherwise UNCONFIRMED'],['Line-time basis','','OUTPUT_FLOW only if runtime means positive flow at final output']];
    guide.forEach(function(row,i){row.forEach(function(v,j){values[i][20+j]=v;});});
    values[7][2]='Import layout: C1:C7 and A10:Y. Optional Real Data: F1:F7 / J1:J7 / N1:N7, selectors R2:R6, V1:V3 and Z:AD per equipment; AE is the stable equipment ID. Tinted cells are inputs, blank means unknown. Use s/min/h for line times; equipment times are min. R2 sets production units (also update G3:G6). GOOD/GROSS/UNCONFIRMED in F7. AU/UPDT percentages are source values, not automatic OEE equivalents. G = Conveyor Speed (m/min); H = reference Accumulation (s). G initializes manual belt speed. F = installed maximum BPM (configured BPM if undefined); import initializes running speed from F. Percentages use percentage points (100 = 100%). JSON retains simulator-only settings.';
    values[8]=sheetImportColumns_(data.layout).map(function(column){return column[2];}).concat(sheetObservationColumns_());
    data.rows.forEach(function(row,index){values[index+9]=row.map(sheetExportLiteral_).concat(['','','','','',sheetExportLiteral_(equipment[index].id)]);});
    // One values write, including metadata and headers, instead of cell-by-cell RPCs.
    sheet.getRange(1,1,values.length,31).setValues(values).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
    stage='FORMAT_SHEET';
    sheet.getRange(1,1,7,2).mergeAcross().setFontWeight('bold').setFontColor(secondary);
    sheet.getRange(1,3,7,1).setBackground('#f3f6f8');
    [5,9,13,17,21].forEach(function(col){sheet.getRange(1,col,7,1).setFontWeight('bold').setFontColor(secondary).setWrap(true);});
    [6,10,14].forEach(function(col){sheet.getRange(1,col,7,1).setBackground('#fff2cc').setNumberFormat('0.########');sheet.getRange(1,col+1,7,1).setFontColor(secondary).setWrap(true);});
    sheet.getRange(1,6,2,1).setNumberFormat('@');sheet.getRange(7,6).setNumberFormat('@');
    sheet.getRange(2,18,5,1).setBackground('#fff2cc').setWrap(true);
    sheet.getRange(1,22,3,1).setBackground('#fff2cc');sheet.getRange(1,23,7,1).setWrap(true).setFontColor(secondary);
    sheet.getRange(1,18).setNote('Optional observation layout marker. Keep this value to import Real Data. Configuration columns remain plant-sheet-v2.');
    sheet.getRange(1,14,2,1).setNote('Enter percentage points: 57.4 means 57.4%. Percent-formatted cells such as 57.4% are also accepted.');
    sheet.getRange(3,6,4,1).setNote('Use the unit in R2, and the same unit in G3:G6. Total is never silently replaced by the shift sum.');
    sheet.getRange(3,18).setNote('UNCONFIRMED preserves values. CALENDAR_OUTPUT_FLOW confirms AEM denominators, positive-flow runtime at final output, common standard rate and output basis.');
    sheet.getRange(10,26,data.rows.length,5).setBackground('#fff2cc');
    sheet.getRange(10,31,data.rows.length,1).setNote('Keep this ID when importing observations to the same equipment. Preview allows explicit remapping.');
    // The note stays entirely to the right of frozen A:B.
    sheet.getRange(8,3,1,29).merge().setWrap(true).setFontColor('#52616c').setFontSize(9);
    sheet.getRange(9,1,1,31).setBackground(primary).setFontColor(sheetExportInk_(primary)).setFontWeight('bold').setWrap(true);
    var body=sheet.getRange(10,1,data.rows.length,25);
    body.setBackground('#ffffff');
    body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY,false,false);
    sheet.getRange(10,4,data.rows.length,22).setNumberFormat('0.########').setHorizontalAlignment('right');
    sheet.getRange(10,2,data.rows.length,1).setFontWeight('bold').setFontColor(secondary);
    if(typeof SpreadsheetApp.newDataValidation==='function'){
      [['R2',['BOTTLES','CASES','UNITS']],['F7',['UNCONFIRMED','GOOD','GROSS']],['R3',['UNCONFIRMED','CALENDAR_OUTPUT_FLOW']],['R4',['UNCONFIRMED','AEM_UNPLANNED','TOTAL_EQUIVALENT_LOSS']],['R5',['UNCONFIRMED','TOTAL','PLANT','PRODUCTION']],['R6',['UNCONFIRMED','OUTPUT_FLOW']]].forEach(function(item){sheet.getRange(item[0]).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(item[1],true).setAllowInvalid(false).build());});
      sheet.getRange(10,28,data.rows.length,1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['UNKNOWN','FAILURES','MINOR','ALL'],true).setAllowInvalid(false).build());
    }
    sheet.getRange(10,26,data.rows.length,2).setNumberFormat('0.########').setHorizontalAlignment('right');
    sheet.getRange(10,29,data.rows.length,1).setNumberFormat('0.########').setHorizontalAlignment('right');
    stage='FREEZE_HEADERS';sheet.setFrozenRows(9);sheet.setFrozenColumns(2);
    stage='SIZE_COLUMNS';
    sheet.setColumnWidths(1,31,130);sheet.setColumnWidth(2,220);sheet.setColumnWidth(3,170);
    sheet.setRowHeights(1,7,42);sheet.setRowHeight(8,100);sheet.setRowHeight(9,64);sheet.setRowHeights(10,data.rows.length,28);
    stage='CREATE_FILTER';body.setWrap(true);sheet.getRange(9,1,data.rows.length+1,31).createFilter();
    sheet.getRange(10,26,data.rows.length,5).setBackground('#fff2cc');
    stage='FLUSH';
    SpreadsheetApp.flush();
    return {spreadsheetId:book.getId(),url:book.getUrl(),sheetName:sheet.getName(),equipmentCount:data.rows.length};
  } catch (error) {
    var details=['Exporter: equipment-sheet-20261023-1','Stage: '+stage,'Service: '+safeSheetErrorDetail_(error)];
    // Only the new export belongs to this operation; clean up an incomplete export.
    if(book)try{(file||DriveApp.getFileById(book.getId())).setTrashed(true);}catch(cleanupError){details.push('The incomplete export could not be removed.');}
    if(error?.simulatorError)throw error;
    console.error(JSON.stringify({event:'SHEET_EXPORT_FAILED',stage:stage,message:safeSheetErrorDetail_(error)}));
    throw createSimulatorError_('SHEET_EXPORT_FAILED','Spreadsheet export could not be completed. See the technical details below.',details);
  }
}

function equipmentSheetData_(equipment, metadata) {
  function value(object,key){var v=object?.[key];return v===undefined||v===null||v===''?'NA':v;}
  function current(object,key,fallback,fallbackKey){return Object.prototype.hasOwnProperty.call(object,key)?value(object,key):value(fallback,fallbackKey||key);}
  var fields=['site','packagingLine','formatName','containerSize','bottlesPerCase','dateOfAnalysis','by'];
  var speeds=new Map();
  if(typeof STScenarioEngine_!=='undefined')try{STScenarioEngine_.audit({equipment:equipment}).forEach(function(row){var speed=row.engineering?.runtimeGeometry?.conveyorSpeedMmPerSecond;if(speed>0)speeds.set(row.equipmentId,speed);});}catch(ignore){}
  return {layout:'plant-sheet-v2',metadata:fields.map(function(key){return key==='containerSize'&&!Object.prototype.hasOwnProperty.call(metadata,key)&&metadata.containerSizeOz!=null?metadata.containerSizeOz+' oz':value(metadata,key);}),rows:equipment.map(function(unit){
    var d=unit.processData||{},e=d.equipment||{},g=d.geometry||{},u=d.upstream||{},down=d.downstream||{},s=d.speedAndSensors||{},a=d.accumulation||{};
    var reliability=unit.noiseProfile?.reliability||{},conveyor=unit.type==='CONVEYOR',c=unit.characteristics||{};
    var critical=!conveyor&&(typeof c.isPacemaker==='boolean'?c.isPacemaker:typeof c.criticalMachine==='boolean'?c.criticalMachine:['PACEMAKER','CRITICAL_MACHINE'].indexOf(d.role)>=0||unit.type==='PACEMAKER');
    var type=unit.type==='PACEMAKER'?(supportedEquipmentTypes_().includes(d.machineType)&&d.machineType!=='PACEMAKER'?d.machineType:'CUSTOM'):unit.type;
    var row=[type,unit.name,critical?'Y':'N',value(reliability,'mtbfMinutes'),value(reliability,'mttrMinutes'),
      e.maximumSpeedBpm==null?unit.nominalRatePerSecond*60:e.maximumSpeedBpm,
      value(g,'lactMm'),value(g,'lpPrimeMm'),value(g,'actualDischargeMm'),value(g,'actualCodingMm'),
      value(u,'packageLengthMm'),value(u,'dischargePitchMm'),value(u,'startupTimeSeconds'),conveyor?current(a,'bottlesDischargedAtStop',u):value(u,'bottlesDischargedAtStop'),
      value(down,'infeedPitchMm'),conveyor?current(a,'downstreamRampUpSeconds',down,'rampUpTimeSeconds'):value(down,'rampUpTimeSeconds'),
      conveyor?current(a,'conveyorSpeedFactorPercent',s,'conveyorSpeedFactorVsDischargeVelocityPercent'):value(s,'conveyorSpeedFactorVsDischargeVelocityPercent'),
      value(s,'codingConveyorSpeedFactorVsPreviousConveyorPercent'),value(s,'conveyorSpeedFactorVsPreviousConveyorPercent'),
      conveyor?current(a,'blockedTimeDelaySeconds',s):value(s,'blockedTimeDelaySeconds'),conveyor?current(a,'clearTimeDelaySeconds',s):value(s,'clearTimeDelaySeconds'),
      conveyor?current(a,'insuranceFactorUnits',s):value(s,'insuranceFactorUnits'),value(s,'overspeedVsInfeedScrewPercent')];
    var belt=a.speedMode==='MANUAL'&&a.targetPopulationPercent===undefined&&a.targetOverspeedPercent===undefined?a.conveyorSpeedMmPerSecond:speeds.get(unit.id);
    row.splice(6,0,conveyor&&belt>0?Number((belt*.06).toPrecision(12)):'NA',conveyor?value(a,'declaredAccumulationSeconds'):'NA');
    return row;
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


