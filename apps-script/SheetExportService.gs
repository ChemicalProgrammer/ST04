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
  var width=26,slots=Math.min(1000,Math.max(100,equipment.length+50)),book,file,stage='CREATE_SPREADSHEET';
  try {
    book=SpreadsheetApp.create(name,slots+9,width);
    stage='MOVE_TO_EXPORTS';
    file=DriveApp.getFileById(book.getId());
    file.moveTo(folder);
    stage='WRITE_VALUES';
    var sheet=book.getSheets()[0];sheet.setName('Equipment');
    var actuals=book.insertSheet('Real Data',1);
    var values=Array.from({length:slots+9},function(){return Array(width).fill('');});
    var labels=['Site','Packaging line','Format','Container size','Bottles per case','Date of analysis','By'];
    labels.forEach(function(label,index){values[index][0]=label;values[index][1]=sheetExportLiteral_(data.metadata[index]);});
    values[0][25]='st-equipment-metadata-b-v1';
    var groups=[['Equipment',1,8],['Geometry',9,4],['Upstream',13,4],['Downstream',17,2],['Speed & Sensors',19,7]];
    groups.forEach(function(group){values[7][group[1]-1]=group[0];});
    values[8]=sheetImportColumns_(data.layout).map(function(column){return column[2];}).concat(['Equipment ID']);
    data.rows.forEach(function(row,index){values[index+9]=row.map(sheetExportLiteral_).concat([sheetExportLiteral_(equipment[index].id)]);});
    for(var i=equipment.length;i<slots;i++)values[i+9][25]='slot-'+book.getId()+'-'+(i+1);
    sheet.getRange(1,1,values.length,width).setValues(values).setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setVerticalAlignment('middle');
    stage='WRITE_REAL_DATA';
    writeSheetActuals_(actuals,values.slice(9),primary,secondary);
    book.setActiveSheet(sheet);
    stage='FORMAT_SHEET';
    sheet.getRange(1,1,7,1).setFontWeight('bold').setBackground(sheetExportTint_(secondary));
    sheet.getRange(1,2,7,1).setBackground('#f3f6f8');
    groups.forEach(function(group){
      var band=sheet.getRange(8,group[1],1,group[2]);
      // Equipment spans the frozen-column boundary, so use one continuous unmerged band.
      if(group[1]>2)band.merge().setHorizontalAlignment('center');
      band.setBackground(sheetExportTint_(secondary)).setFontWeight('bold');
    });
    sheet.hideColumns(26);
    var types=SpreadsheetApp.newDataValidation().requireValueInList(supportedEquipmentTypes_(),true).setAllowInvalid(false).build();
    sheet.getRange(10,1,slots,1).setDataValidation(types);
    sheet.getRange(9,1,1,width).setBackground(sheetExportTint_(primary)).setFontWeight('bold').setWrap(true);
    var body=sheet.getRange(10,1,data.rows.length,25);
    body.setBackground('#ffffff');
    body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY,false,false);
    sheet.getRange(10,4,data.rows.length,22).setNumberFormat('0.########').setHorizontalAlignment('right');
    sheet.getRange(10,2,data.rows.length,1).setFontWeight('bold');
    stage='FREEZE_HEADERS';sheet.setFrozenRows(9);sheet.setFrozenColumns(2);
    stage='SIZE_COLUMNS';
    sheet.setColumnWidths(1,width,130);sheet.setColumnWidth(2,220);sheet.setColumnWidth(3,170);
    sheet.setRowHeights(1,7,42);sheet.setRowHeight(8,28);sheet.setRowHeight(9,64);sheet.setRowHeights(10,data.rows.length,28);
    stage='CREATE_FILTER';body.setWrap(true);sheet.getRange(9,1,slots+1,width).createFilter();
    stage='FLUSH';
    SpreadsheetApp.flush();
    return {spreadsheetId:book.getId(),url:book.getUrl(),sheetName:sheet.getName(),equipmentCount:data.rows.length};
  } catch (error) {
    var details=['Exporter: equipment-and-actuals-v4','Stage: '+stage,'Service: '+safeSheetErrorDetail_(error)];
    // Only the new export belongs to this operation; clean up an incomplete export.
    if(book)try{(file||DriveApp.getFileById(book.getId())).setTrashed(true);}catch(cleanupError){details.push('The incomplete export could not be removed.');}
    if(error?.simulatorError)throw error;
    console.error(JSON.stringify({event:'SHEET_EXPORT_FAILED',stage:stage,message:safeSheetErrorDetail_(error)}));
    throw createSimulatorError_('SHEET_EXPORT_FAILED','Spreadsheet export could not be completed. See the technical details below.',details);
  }
}

function writeSheetActuals_(sheet,equipmentRows,primary,secondary) {
  var count=equipmentRows.length,height=count+19,width=10;
  if(sheet.getMaxRows()<height)sheet.insertRowsAfter(sheet.getMaxRows(),height-sheet.getMaxRows());
  var rows=Array.from({length:height},function(){return Array(width).fill('');});
  rows[0][9]='st-real-inputs-v4';
  rows[3][0]='Line Time';rows[3][4]='Production';
  rows[9][4]='Indicators';
  ['Total time [min]','Business external downtime [min]','Plant available time [min]','Plant decision downtime [min]','Production available time [min]','Unplanned line downtime [min]','Reported run time [min]','Line rate loss [min]','Time balance [min]'].forEach(function(label,i){rows[i+6][0]=label;});
  ['Shift 1 [cases]','Shift 2 [cases]','Shift 3 [cases]','Production [cases]','Production [bottles]'].forEach(function(label,i){rows[i+4][4]=label;});
  rows[10][4]='AU [%]';rows[11][4]='UPDT [%]';rows[12][4]='Tolerance [%]';rows[12][5]=.25;rows[13][4]='Equipment check';
  rows[13][5]='=IF(COUNTIF(I20:I'+height+',"REVIEW VARIANCE")+COUNTIF(I20:I'+height+',"REVIEW MINUTES")>0,"REVIEW",IF(COUNTIF(I20:I'+height+',"WITHIN TOLERANCE")=0,"PENDING",IF(COUNTIF(I20:I'+height+',"PENDING")>0,"PARTIAL CHECK","WITHIN TOLERANCE")))';
  rows[8][1]='=IF(COUNT(B7:B8)=2,B7-B8,"")';
  rows[10][1]='=IF(COUNT(B9:B10)=2,B9-B10,"")';
  rows[14][1]='=IF(COUNT(B11:B13)=3,B11-B12-B13,"")';
  rows[17][0]='Equipment Downtime';rows[17][3]='MTBF/MTTR Check';
  rows[18]=['Equipment','Reported downtime [min]','Reported downtime [%]','MTBF [min]','MTTR [min]','Expected downtime [min]','Expected − reported [min]','Variance [%]','Check','Equipment ID'];
  // Bind editable actuals to stable slots so sorting Equipment cannot reassign captured values.
  equipmentRows.filter(function(row){return row[0]&&row[0]!=='CONVEYOR';})
    .concat(equipmentRows.filter(function(row){return row[0]==='CONVEYOR'||!row[0];}))
    .forEach(function(e,i){
      var line=i+20,row=rows[i+19],last=9+count,key='MATCH(J'+line+',Equipment!$Z$10:$Z$'+last+',0)';
      var lookup=function(column){return 'INDEX(Equipment!$'+column+'$10:$'+column+'$'+last+','+key+')';};
      row[9]=e[25];
      var present='COUNTIFS(Equipment!$Z$10:$Z$'+last+',J'+line+',Equipment!$A$10:$A$'+last+',"<>",Equipment!$B$10:$B$'+last+',"<>")=1';
      row[0]='=IFERROR(IF(AND('+present+','+lookup('A')+'<>"CONVEYOR"),'+lookup('B')+',"") ,"")';
      ['D','E'].forEach(function(column,j){
        var value=lookup(column);
        row[3+j]='=IFERROR(IF(AND(LEN(A'+line+')>0,ISNUMBER('+value+'),'+value+'>0),'+value+',"") ,"")';
      });
      row[5]='=IF(AND(COUNT(D'+line+':E'+line+')=2,ISNUMBER($B$11),$B$11>0),$B$11*E'+line+'/(D'+line+'+E'+line+'),"")';
      row[6]='=IF(COUNT(B'+line+',F'+line+')=2,F'+line+'-B'+line+',"")';
      row[7]='=IF(AND(ISNUMBER(G'+line+'),B'+line+'>0),G'+line+'/B'+line+',"")';
      row[8]='=IF(LEN(A'+line+')=0,"",IF(OR(COUNT(B'+line+',F'+line+')<2,NOT(ISNUMBER($F$13)),$F$13<0),"PENDING",IF(OR(B'+line+'<0,B'+line+'>$B$11),"REVIEW MINUTES",IF(AND(ISNUMBER(H'+line+'),ABS(H'+line+')<=$F$13),"WITHIN TOLERANCE","REVIEW VARIANCE"))))';
    });
  sheet.getRange(1,1,height,width).setValues(rows).setFontFamily('Arial').setFontSize(10).setFontColor('#000000').setVerticalAlignment('middle');
  [[4,1,2],[4,5,2],[10,5,2],[18,1,3],[18,4,6]].forEach(function(group){
    sheet.getRange(group[0],group[1],1,group[2]).merge().setFontWeight('bold').setBackground(sheetExportTint_(secondary));
  });
  [sheet.getRange(7,1,9,1),sheet.getRange(5,5,5,1),sheet.getRange(11,5,4,1)].forEach(function(range){
    range.setBackground(sheetExportTint_(secondary,.14)).setFontWeight('bold');
  });
  sheet.getRange(19,1,1,9).setFontWeight('bold').setBackground(sheetExportTint_(primary)).setWrap(true);
  [sheet.getRange(7,2,2,1),sheet.getRange(10,2),sheet.getRange(12,2,3,1),sheet.getRange(5,6,5,1),sheet.getRange(11,6,3,1),sheet.getRange(20,2,count,2)].forEach(function(range){range.setBackground('#fff2cc');});
  sheet.getRange(11,6,3,1).setNumberFormat('0.00%');
  sheet.getRange(20,3,count,1).setNumberFormat('0.00%');
  sheet.getRange(20,4,count,4).setNumberFormat('0.00');sheet.getRange(20,8,count,1).setNumberFormat('0.0%');
  sheet.getRange(20,4,count,6).setBackground('#eef3f6');
  sheet.setColumnWidths(1,width,135);sheet.setColumnWidth(1,270);sheet.setColumnWidth(5,220);sheet.setColumnWidth(9,175);
  sheet.setRowHeight(19,48);sheet.setFrozenRows(19);sheet.hideColumns(10);
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
function sheetExportTint_(hex,weight){
  weight=weight??.24;
  return '#'+[1,3,5].map(function(offset){
    var channel=parseInt(hex.slice(offset,offset+2),16);
    return Math.round(255+(channel-255)*weight).toString(16).padStart(2,'0');
  }).join('');
}
