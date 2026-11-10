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
  var width=31+sheetEquipmentActuals_().length,book,file,stage='CREATE_SPREADSHEET';
  try {
    book=SpreadsheetApp.create(name,Math.max(100,data.rows.length+9),width);
    stage='MOVE_TO_EXPORTS';
    file=DriveApp.getFileById(book.getId());
    file.moveTo(folder);
    stage='WRITE_VALUES';
    var sheet=book.getSheets()[0];sheet.setName('Equipment');
    var actuals=book.insertSheet('Datos reales',1);
    var values=Array.from({length:data.rows.length+9},function(){return Array(width).fill('');});
    var labels=['Site','Packaging line','Format','Container size','Bottles per case','Date of analysis','By'];
    labels.forEach(function(label,index){values[index][0]=label;values[index][2]=sheetExportLiteral_(data.metadata[index]);});
    var daily={F1:'B5',F2:'B6',F3:'F5',F4:'F6',F5:'F7',F6:'F8',J1:'B7',J2:'B8',J3:'B9',J4:'B10',J5:'B11',J6:'B12',J7:'B13',N1:'F9',N2:'F10',N4:'B16',N5:'B14',N6:'F11'};
    sheetRealDataFields_().forEach(function(f){
      var col=f.cell.charCodeAt(0)-65,row=Number(f.cell.slice(1))-1;
      values[row][col-1]=f.label;values[row][col+1]=f.unit;
      if(daily[f.cell])values[row][col]=sheetActualLink_(daily[f.cell]);
    });
    values[6][5]='UNCONFIRMED';
    values[0][17]='st-real-sheet-v1';values[1][17]='CASES';values[6][17]='st-real-equipment-v2';
    values[0][21]=sheetActualLink_('F14');values[1][21]=sheetActualLink_('F15');values[3][21]=sheetActualLink_('F16');
    values[7][2]='Import layout: C1:C7 and A10:Y. Enter observations in Datos reales for the same production period. In Import Sheet, enable Real Data observation to import them alongside Equipment.';
    values[8]=sheetImportColumns_(data.layout).map(function(column){return column[2];}).concat(sheetObservationColumns_(),sheetEquipmentActuals_().map(function(spec){return spec[2]+' (min)';}));
    data.rows.forEach(function(row,index){
      values[index+9].splice(0,25,...row.map(sheetExportLiteral_));
      var machine=equipment[index],line=index+10;
      values[index+9][30]=sheetExportLiteral_(machine.id);
      if(machine.type==='CONVEYOR'||machine.processData?.role==='CONVEYOR')return;
      var fields=['C','D',null,'B','O'];
      fields.forEach(function(col,j){if(col)values[index+9][25+j]=sheetActualLookup_(col,line,equipment.length);});
      values[index+9][27]='=IF(OR(ISNUMBER(Z'+line+'),ISNUMBER(AA'+line+')),"FAILURES","")';
      sheetEquipmentActuals_().forEach(function(spec,j){values[index+9][31+j]=sheetActualLookup_(spec[0],line,equipment.length);});
    });
    sheet.getRange(1,1,values.length,width).setValues(values).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
    sheet.getRange(1,14,2,1).setNumberFormat('0.00%');
    stage='WRITE_REAL_DATA';
    writeSheetActuals_(actuals,equipment,primary,secondary);
    book.setActiveSheet(sheet);
    stage='FORMAT_SHEET';
    sheet.getRange(1,1,7,2).mergeAcross().setFontWeight('bold').setFontColor(secondary);
    sheet.getRange(1,3,7,1).setBackground('#f3f6f8');
    [5,9].forEach(function(col){sheet.getRange(1,col,7,1).setFontWeight('bold').setFontColor(secondary).setWrap(true);sheet.getRange(1,col+1,7,1).setBackground('#eef3f6').setNumberFormat('0.########');});
    sheet.getRange(1,13).setFontWeight('bold').setFontColor(secondary).setWrap(true);
    sheet.getRange(1,14).setBackground('#eef3f6').setNumberFormat('0.########');
    sheet.hideColumns(26,width-25);
    // The note stays entirely to the right of frozen A:B.
    sheet.getRange(8,3,1,24).merge().setWrap(true).setFontColor('#52616c').setFontSize(9);
    sheet.getRange(9,1,1,27).setBackground(primary).setFontColor(sheetExportInk_(primary)).setFontWeight('bold').setWrap(true);
    var body=sheet.getRange(10,1,data.rows.length,25);
    body.setBackground('#ffffff');
    body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY,false,false);
    sheet.getRange(10,4,data.rows.length,22).setNumberFormat('0.########').setHorizontalAlignment('right');
    sheet.getRange(10,2,data.rows.length,1).setFontWeight('bold').setFontColor(secondary);
    stage='FREEZE_HEADERS';sheet.setFrozenRows(9);sheet.setFrozenColumns(2);
    stage='SIZE_COLUMNS';
    sheet.setColumnWidths(1,width,130);sheet.setColumnWidth(2,220);sheet.setColumnWidth(3,170);
    sheet.setRowHeights(1,7,42);sheet.setRowHeight(8,100);sheet.setRowHeight(9,64);sheet.setRowHeights(10,data.rows.length,28);
    stage='CREATE_FILTER';body.setWrap(true);sheet.getRange(9,1,data.rows.length+1,width).createFilter();
    stage='FLUSH';
    SpreadsheetApp.flush();
    return {spreadsheetId:book.getId(),url:book.getUrl(),sheetName:sheet.getName(),equipmentCount:data.rows.length};
  } catch (error) {
    var details=['Exporter: equipment-and-actuals-v2','Stage: '+stage,'Service: '+safeSheetErrorDetail_(error)];
    // Only the new export belongs to this operation; clean up an incomplete export.
    if(book)try{(file||DriveApp.getFileById(book.getId())).setTrashed(true);}catch(cleanupError){details.push('The incomplete export could not be removed.');}
    if(error?.simulatorError)throw error;
    console.error(JSON.stringify({event:'SHEET_EXPORT_FAILED',stage:stage,message:safeSheetErrorDetail_(error)}));
    throw createSimulatorError_('SHEET_EXPORT_FAILED','Spreadsheet export could not be completed. See the technical details below.',details);
  }
}

function sheetActualLink_(cell) {
  var ref="'Datos reales'!"+cell;
  return '=IF(LEN('+ref+')>0,'+ref+',"")';
}
function sheetActualLookup_(column,row,count) {
  var ref="INDEX('Datos reales'!$"+column+"$20:$"+column+"$"+(19+count)+",MATCH($AE"+row+",'Datos reales'!$W$20:$W$"+(19+count)+",0))";
  var range="'Datos reales'!$"+column+"$20:$"+column+"$"+(19+count);
  var ids="'Datos reales'!$W$20:$W$"+(19+count);
  return '=IFERROR(IF(COUNTIFS('+ids+',$AE'+row+','+range+',"<>" )=1,'+ref+',""),"")';
}
function writeSheetActuals_(sheet,equipment,primary,secondary) {
  var machines=equipment.filter(function(e){return e.type!=='CONVEYOR'&&e.processData?.role!=='CONVEYOR';});
  var count=Math.max(1,machines.length),height=count+19;
  if(sheet.getMaxRows()<height)sheet.insertRowsAfter(sheet.getMaxRows(),height-sheet.getMaxRows());
  var rows=Array.from({length:height},function(){return Array(23).fill('');});
  rows[0][0]='Datos reales · Balance y coherencia de paros';rows[0][22]='st-real-inputs-v2';
  rows[1][0]='Captura un solo periodo. Amarillo = editable. Blanco = dato desconocido; cero = ausencia confirmada. Escribe los porcentajes con %, por ejemplo 63.3%.';
  rows[2][0]='Importa Equipment y activa Real Data observation. Los cálculos de coherencia se muestran aquí.';
  ['Inicio del periodo (ISO)','Fin del periodo (ISO)','Tiempo total [min]','Tiempo externo [min]','Tiempo disponible de planta [min]','Paro planificado de planta [min]','Tiempo disponible para producción [min]','Paro no planificado de línea [min]','Run Time reportado [min]','Rate Loss de línea [min]','Balance de tiempo [min]','Effective Runtime reportado [min]'].forEach(function(label,i){rows[i+4][0]=label;});
  ['Turno 1 [cajas]','Turno 2 [cajas]','Turno 3 [cajas]','Producción [cajas]','AU [%]','UPDT [%]','Velocidad estándar [botellas/min]','Tolerancia de desvío [%]','Resultado de equipos','Nombre del registro','Fuente','Producción [botellas]'].forEach(function(label,i){rows[i+4][4]=label;});
  rows[8][1]='=IF(COUNT(B7:B8)=2,B7-B8,"")';
  rows[10][1]='=IF(COUNT(B9:B10)=2,B9-B10,"")';
  rows[14][1]='=IF(COUNT(B11:B13)=3,B11-B12-B13,"")';
  rows[11][5]=.25;
  rows[12][5]='=IF(COUNTIF(V20:V'+height+',"REVISAR*")>0,"REVISAR",IF(COUNTIF(V20:V'+height+',"DENTRO DE MARGEN")=0,"PENDIENTE",IF(COUNTIF(V20:V'+height+',"PENDIENTE")>0,"VALIDACIÓN PARCIAL","DENTRO DE MARGEN")))';
  rows[16][0]='Paro esperado = base × MTTR ÷ (MTBF + MTTR). La base usa el periodo del equipo si se captura, o el tiempo disponible para producción.';
  rows[17][0]='Captura en Fallas solo minutos de falla propia. Usa Paro sin clasificar para los minutos cuyo origen todavía no se conoce.';
  rows[18]=['Equipo','Periodo del equipo [min]','Fallas MTBF/MTTR [min]','Número de fallas',...sheetEquipmentActuals_().map(function(spec){return spec[2]+' [min]';}),'Notas','MTBF [min]','MTTR [min]','Base aplicada [min]','Paro esperado [min]','Esperado − real [min]','Desvío [%]','Coherencia','Equipment ID'];
  machines.forEach(function(e,i){
    var line=i+20,row=rows[i+19],key='MATCH(W'+line+',Equipment!$AE$10:$AE$'+(9+equipment.length)+',0)';
    row[0]=sheetExportLiteral_(e.name);row[22]=sheetExportLiteral_(e.id);
    ['D','E'].forEach(function(col,j){
      var ref='INDEX(Equipment!$'+col+'$10:$'+col+'$'+(9+equipment.length)+','+key+')';
      row[15+j]='=IFERROR(IF(AND(ISNUMBER('+ref+'),'+ref+'>0),'+ref+',"") ,"")';
    });
    row[17]='=IF(ISNUMBER(B'+line+'),B'+line+',IF(ISNUMBER($B$11),$B$11,""))';
    row[18]='=IF(AND(COUNT(P'+line+':R'+line+')=3,R'+line+'>0),R'+line+'*Q'+line+'/(P'+line+'+Q'+line+'),"")';
    row[19]='=IF(COUNT(C'+line+',S'+line+')=2,S'+line+'-C'+line+',"")';
    row[20]='=IF(AND(ISNUMBER(T'+line+'),C'+line+'>0),T'+line+'/C'+line+',"")';
    row[21]='=IF(OR(COUNT(C'+line+',S'+line+')<2,NOT(ISNUMBER($F$12)),$F$12<0),"PENDIENTE",IF(OR(C'+line+'<0,C'+line+'>R'+line+'),"REVISAR MINUTOS",IF(AND(ISNUMBER(U'+line+'),ABS(U'+line+')<=$F$12),"DENTRO DE MARGEN","REVISAR DESVÍO")))';
  });
  sheet.getRange(1,1,height,23).setValues(rows).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  [1,2,3,17,18].forEach(function(row){sheet.getRange(row,1,1,9).merge().setWrap(true);});
  sheet.getRange(1,1,1,9).setFontWeight('bold').setFontSize(16).setFontColor(secondary);
  sheet.getRange(19,1,1,22).setFontWeight('bold').setBackground(primary).setFontColor(sheetExportInk_(primary)).setWrap(true);
  [sheet.getRange(5,2,4,1),sheet.getRange(10,2),sheet.getRange(12,2,3,1),sheet.getRange(5,6,8,1),sheet.getRange(14,6,3,1),sheet.getRange(16,2),sheet.getRange(20,2,count,14)].forEach(function(range){range.setBackground('#fff2cc');});
  sheet.getRange(5,2,2,1).setNumberFormat('@');
  sheet.getRange(9,6,2,1).setNumberFormat('0.00%');sheet.getRange(12,6).setNumberFormat('0.0%');
  sheet.getRange(20,16,count,5).setNumberFormat('0.00');sheet.getRange(20,21,count,1).setNumberFormat('0.0%');
  sheet.getRange(20,16,count,7).setBackground('#eef3f6');
  sheet.setColumnWidths(1,23,135);sheet.setColumnWidth(1,270);sheet.setColumnWidth(5,185);sheet.setColumnWidth(15,210);sheet.setColumnWidth(22,175);
  sheet.setRowHeights(1,3,29);sheet.setRowHeight(19,48);sheet.setFrozenRows(19);sheet.hideColumns(23);
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


