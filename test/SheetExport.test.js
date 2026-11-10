import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime() {
  const calls=[],writes=[],merges=[],book={getId:()=> 'new-sheet-id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/new-sheet-id/edit'};
  const file={moveTo:folder=>calls.push(['move',folder]),setTrashed:value=>calls.push(['trash',value])};
  const makeRange=(trackMerges,...coordinates)=>new Proxy({}, {get:(_,method)=>(...args)=>{
    if(method==='setValues')writes.push({coordinates,values:JSON.parse(JSON.stringify(args[0]))});
    if(trackMerges&&method==='merge')merges.push(coordinates);
    if(trackMerges&&method==='mergeAcross')for(let row=0;row<coordinates[2];row++)merges.push([coordinates[0]+row,coordinates[1],1,coordinates[3]]);
    calls.push([method,coordinates,...args]);return makeRange(trackMerges,...coordinates);
  }});
  const range=(...coordinates)=>makeRange(true,...coordinates);
  function freeze(axis,count){const start=axis==='rows'?0:1,span=start+2;if(merges.some(m=>m[start]<=count&&m[start]+m[span]-1>count))throw Error("Sorry, you can't freeze columns which contain only part of a merged cell.");calls.push([axis==='rows'?'setFrozenRows':'setFrozenColumns',count]);}
  const sheet=new Proxy({getName:()=> 'Equipment',getRange:range,setFrozenRows:count=>freeze('rows',count),setFrozenColumns:count=>freeze('columns',count)},{get:(target,key)=>target[key]||((...args)=>calls.push([key,...args]))});
  book.getSheets=()=>[sheet];
  book.insertSheet=(name,index)=>{calls.push(['insertSheet',name,index]);return new Proxy({getMaxRows:()=>1000,getRange:(...coordinates)=>makeRange(false,...coordinates)},{get:(target,key)=>target[key]||((...args)=>calls.push([key,...args]))});};
  book.setActiveSheet=value=>{assert.equal(value,sheet);calls.push(['setActiveSheet']);};
  const c=vm.createContext({console,SpreadsheetApp:{create:(...args)=>{calls.push(['create',...args]);return book;},flush:()=>calls.push(['flush']),newDataValidation:()=>({requireValueInList(values,dropdown){calls.push(['requireValueInList',Array.from(values),dropdown]);return this;},setAllowInvalid(){return this;},build(){return 'types-validation';}}),BandingTheme:{LIGHT_GREY:'grey'}},DriveApp:{getFileById:id=>{calls.push(['file',id]);return file;}}});
  for(const name of ['TextResources.gs','ApiResponse.gs','CaseService.gs','ScenarioEngine.gs','SheetImportService.gs','SheetExportService.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),c);
  c.requireCurrentUser_=()=>({email:'owner@test'});
  c.getOwnedCaseFile_=(id,user,metadataOnly)=>{assert.equal(id,'mine');assert.equal(user.email,'owner@test');assert.equal(metadataOnly,true);calls.push(['owned']);return {};};
  c.getWorkspaceFolders_=()=>({exports:'export-folder'});
  return {c,calls,writes,sheet};
}
function fixture(c) {
  const machine=['FILLER','Main filler','Y',200,5,420,...Array(17).fill('NA')];
  const conveyor=['CONVEYOR','Conveyor','N','NA','NA',450,8000,400,90,100,66,90,4,2,95,3,100,102,103,.5,.25,5,7];
  const end=['CASE_PACKER','Packer','N',300,4,500,...Array(17).fill('NA')];
  const source=c.parseEquipmentSheet_(['Site','Line','Format',5.5,24,'2026-10-08','Operator'],[machine,conveyor,end],[]);
  return {caseId:'mine',caseName:'My case',simulationName:'Simulation B',equipment:JSON.parse(JSON.stringify(source.equipment)),metadata:JSON.parse(JSON.stringify(source.metadata)),theme:{primary:'#123456',secondary:'#778899'}};
}

test('Sheets export uses every import column and current overrides, preserves zero and disabled reliability',()=>{
  const {c}=runtime(),request=fixture(c),unit=request.equipment[1];
  request.equipment[0].nominalRatePerSecond=3;
  unit.processData.accumulation={conveyorSpeedFactorPercent:75,blockedTimeDelaySeconds:0,clearTimeDelaySeconds:0,insuranceFactorUnits:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:2};
  delete request.equipment[2].noiseProfile.reliability;
  const data=c.equipmentSheetData_(request.equipment,request.metadata),roundtrip=c.parseEquipmentSheet_(data.metadata,data.rows,[],data.layout);
  assert.equal(roundtrip.canImport,true);assert.equal(data.rows[0][5],420,'F is installed maximum, not nominal');
  const values=roundtrip.sourceRows[1].values;
  assert.equal(values.conveyorSpeedFactorVsDischargeVelocityPercent,75);
  for(const key of ['blockedTimeDelaySeconds','clearTimeDelaySeconds','insuranceFactorUnits','bottlesDischargedAtStop'])assert.equal(values[key],0,key);
  assert.equal(values.rampUpTimeSeconds,2);
  assert.equal(values.actualCodingMm,100);assert.equal(values.codingConveyorSpeedFactorVsPreviousConveyorPercent,102);assert.equal(values.conveyorSpeedFactorVsPreviousConveyorPercent,103);assert.equal(values.overspeedVsInfeedScrewPercent,7);
  assert.equal(roundtrip.metadata.containerSize,5.5);assert.equal(roundtrip.metadata.containerSizeOz,null);assert.equal(roundtrip.equipment[0].characteristics.isPacemaker,true);
  assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.equipment[2].noiseProfile)),{});
  // All 23 mapped cells survive re-import, with NA normalized to null.
  roundtrip.sourceRows.forEach((row,i)=>c.sheetImportColumns_(data.layout).forEach((column,j)=>assert.equal(row.values[column[1]],data.rows[i][j]==='NA'?null:data.rows[i][j])));
});

test('authenticated export creates one new themed Sheet in Exports with batched C1:C7 / A10:Y layout and literal names',()=>{
  const {c,calls,writes}=runtime(),request=fixture(c);request.equipment[0].name='=HYPERLINK("https://example.test")';request.metadata.site='=1+1';
  const response=c.exportEquipmentSheet(request);assert.equal(response.ok,true,JSON.stringify(response));
  assert.equal(response.data.equipmentCount,3);assert.equal(response.data.url,'https://docs.google.com/spreadsheets/d/new-sheet-id/edit');
  assert.equal(calls[0][0],'owned');assert.deepEqual(calls.find(call=>call[0]==='move'),['move','export-folder']);
  assert.equal(writes.length,2);const {coordinates,values}=writes[0];assert.deepEqual(coordinates,[1,1,109,26]);
  assert.deepEqual(calls.find(call=>call[0]==='insertSheet'),['insertSheet','Real Data',1]);
  const actuals=writes[1].values;assert.equal(actuals[0][9],'st-real-inputs-v4');assert.match(actuals[19][0],/Equipment.*MATCH/);assert.equal(actuals[19][9],values[9][25]);assert.equal(actuals[20][9],values[11][25]);assert.match(actuals[19][5],/E20\/\(D20\+E20\)/);
  assert(calls.some(call=>call[0]==='requireValueInList'&&call[1].includes('FILLER')&&call[2]));
  assert(calls.some(call=>call[0]==='setDataValidation'&&JSON.stringify(call[1])==='[10,1,100,1]'));
  assert.equal(actuals[22][9],values[12][25]);assert.match(actuals[22][0],/COUNTIFS/);
  assert.equal(values[0][1],"'=1+1");assert.equal(values[0][2],'');assert.equal(values[0][25],'st-equipment-metadata-b-v1');assert.equal(values[9][1],"'=HYPERLINK(\"https://example.test\")");
  assert.equal(values[8][24],'Overspeed vs infeed screw (%)');assert.equal(values[10][18],100);
  assert.deepEqual([0,8,12,16,18].map(i=>values[7][i]),['Equipment','Geometry','Upstream','Downstream','Speed & Sensors']);
  for(const group of [[8,9,1,4],[8,13,1,4],[8,17,1,2],[8,19,1,7]])assert(calls.some(call=>call[0]==='merge'&&JSON.stringify(call[1])===JSON.stringify(group)));
  assert(!calls.some(call=>call[0]==='setNote'));assert.equal(actuals[0][0],'');assert.equal(actuals[3][0],'Line Time');assert.equal(actuals[17][3],'MTBF/MTTR Check');assert(!actuals[18].some(label=>/notas/i.test(label)));
  assert(calls.some(call=>call[0]==='setBackground'&&call[2]===c.sheetExportTint_('#123456')));
  assert(calls.some(call=>call[0]==='setBackground'&&JSON.stringify(call[1])==='[7,1,9,1]'));
  assert(calls.filter(call=>call[0]==='setFontColor').every(call=>call[2]==='#000000'));
  assert(calls.some(call=>call[0]==='setFrozenColumns'&&call[1]===2));
  assert(!calls.some(call=>call[0]==='mergeAcross'||call[0]==='merge'&&JSON.stringify(call[1])==='[8,1,1,8]'));
  assert.equal(calls.filter(call=>call[0]==='create').length,1);assert(!calls.some(call=>call[0]==='trash'));
});

test('denied ownership and non-importable inputs cannot create a spreadsheet',()=>{
  const h=runtime(),request=fixture(h.c);h.c.getOwnedCaseFile_=()=>{throw Error('Denied');};
  assert.equal(h.c.exportEquipmentSheet(request).ok,false);assert(!h.calls.some(call=>call[0]==='create'));
  const h2=runtime(),invalid=fixture(h2.c);invalid.equipment[0].noiseProfile.reliability.mtbfMinutes=0;
  const response=h2.c.exportEquipmentSheet(invalid);assert.equal(response.error.code,'INVALID_SHEET_EXPORT');assert(response.error.details.some(detail=>detail.includes('D10:E10')));
  assert(!h2.calls.some(call=>call[0]==='create'));
  assert.equal(h2.c.exportEquipmentSheet({...invalid,equipment:Array(1001).fill(invalid.equipment[0])}).error.code,'INVALID_SHEET_REQUEST');
});

test('failed write cleans up only the newly created export; absent max uses configured BPM',()=>{
  const {c,calls}=runtime(),request=fixture(c);delete request.equipment[0].processData.equipment.maximumSpeedBpm;
  request.equipment[0].nominalRatePerSecond=2;assert.equal(c.equipmentSheetData_(request.equipment,request.metadata).rows[0][5],120);
  c.SpreadsheetApp.flush=()=>{throw Error('Failed');};
  const response=c.exportEquipmentSheet(request);assert.equal(response.error.code,'SHEET_EXPORT_FAILED');assert(response.error.details.includes('Stage: FLUSH'));assert(response.error.details.includes('Service: Failed'));
  assert.deepEqual(calls.filter(call=>call[0]==='file'),[['file','new-sheet-id']]);assert.deepEqual(calls.find(call=>call[0]==='trash'),['trash',true]);
  assert.equal(c.sheetExportColor_('javascript:alert(1)','#123456'),'#123456');
});

test('regression: merged note cannot cross a frozen-column boundary; Google service failures retain their stage',()=>{
 const {c,sheet}=runtime();sheet.getRange(8,1,1,23).merge();assert.throws(()=>sheet.setFrozenColumns(2),/part of a merged cell/);
 const h=runtime();h.c.SpreadsheetApp.create=()=>{throw Error('Permission denied for SpreadsheetApp.create');};const response=h.c.exportEquipmentSheet(fixture(h.c));
 assert.equal(response.error.code,'SHEET_EXPORT_FAILED');assert(response.error.details.includes('Stage: CREATE_SPREADSHEET'));assert(response.error.details.some(detail=>detail.includes('Permission denied')));
 assert(!h.calls.some(call=>call[0]==='trash'));
});

test('updated Sheets export places physical conveyor speed in G and reference accumulation in H and survives reimport',()=>{
 const {c}=runtime(),request=fixture(c),unit=request.equipment[1];unit.processData.accumulation.speedMode='MANUAL';unit.processData.accumulation.conveyorSpeedMmPerSecond=29.93*1000/60;unit.processData.accumulation.declaredAccumulationSeconds=28;
 const data=c.equipmentSheetData_(request.equipment,request.metadata);assert.equal(data.layout,'plant-sheet-v2');assert.equal(data.rows[1].length,25);assert.equal(data.rows[1][6],29.93);assert.equal(data.rows[1][7],28);assert.equal(data.rows[1][8],8000);
 const out=c.parseEquipmentSheet_(data.metadata,data.rows,[],data.layout);assert(out.canImport,JSON.stringify(out.errors));assert.equal(out.equipment[1].processData.accumulation.speedMode,'MANUAL');assert.equal(out.equipment[1].processData.accumulation.declaredAccumulationSeconds,28);
 assert(Math.abs(out.equipment[1].processData.accumulation.conveyorSpeedMmPerSecond-unit.processData.accumulation.conveyorSpeedMmPerSecond)<1e-10);
 assert.equal(c.detectSheetImportLayout_([c.sheetImportColumns_(data.layout).slice(6,8).map(v=>v[2])]),'plant-sheet-v2');
});

test('AUTO conveyor export resolves its actual belt speed instead of exporting an inactive manual value',()=>{
 const {c}=runtime(),request=fixture(c),unit=request.equipment[1];unit.processData.accumulation.speedMode='AUTO';unit.processData.accumulation.conveyorSpeedMmPerSecond=999999;
 const data=c.equipmentSheetData_(request.equipment,request.metadata),audit=c.STScenarioEngine_.audit({equipment:request.equipment}).find(a=>a.equipmentId===unit.id);
 assert(data.rows[1][6]>0);assert(Math.abs(data.rows[1][6]-audit.engineering.runtimeGeometry.conveyorSpeedMmPerSecond*.06)<1e-8);assert.notEqual(data.rows[1][6],999999*.06);
});

test('container size exports and reimports its declared unit and preserves legacy ounces',()=>{
 const {c}=runtime(),request=fixture(c);
 for(const size of ['500 mL','1 L','250 g',500]){
  request.metadata.containerSize=size;request.metadata.containerSizeOz=12;
  const data=c.equipmentSheetData_(request.equipment,request.metadata);assert.equal(data.metadata[3],size);
  const out=c.parseEquipmentSheet_(data.metadata,data.rows,[],data.layout);assert(out.canImport);assert.equal(out.metadata.containerSize,size);assert.equal(out.metadata.containerSizeOz,null);
 }
 delete request.metadata.containerSize;request.metadata.containerSizeOz=12;const legacy=c.equipmentSheetData_(request.equipment,request.metadata);assert.equal(legacy.metadata[3],'12 oz');
 const out=c.parseEquipmentSheet_(legacy.metadata,legacy.rows,[],legacy.layout);assert.equal(out.metadata.containerSizeOz,12);assert.equal(out.metadata.containerSize,'12 oz');
});


test('two-tab export previews equipment and filled observations via the same spreadsheet URL',()=>{
 const h=runtime(),request=fixture(h.c);assert(h.c.exportEquipmentSheet(request).ok);
 const values=h.writes[0].values,actuals=h.writes[1].values;
 assert.equal(values[0][17],'');assert.equal(values[6][17],'');
 assert.equal(values[9][25],request.equipment[0].id);assert.equal(values[8][25],'Equipment ID');
 assert(values.every(row=>row.every(value=>typeof value!=='string'||!value.startsWith('='))));
 // Inputs and computed values returned by the dedicated tab, including blank and zero.
 actuals[7][5]=100;actuals[6][1]=1440;actuals[7][1]=0;
 actuals[8][1]=1440;actuals[10][1]=1344;actuals[10][5]=.633;actuals[8][5]=1200;
 actuals[19][1]=12;actuals[19][2]=.121;
 values[12].splice(0,6,'CUSTOM','Nueva máquina','N',200,5,300);
 actuals[22][1]=0;actuals[22][2]=0;
 const mock=(grid,name,id)=>({getLastRow:()=>grid.length,getMaxRows:()=>100,getMaxColumns:()=>grid[0].length,getSheetId:()=>id,getName:()=>name,getRange:(r,col,count=1,width=1)=>({getValues:()=>grid.slice(r-1,r-1+count).map(row=>row.slice(col-1,col-1+width)),getNumberFormats:()=>Array.from({length:count},()=>Array(width).fill('0.00%'))})});
 const equipment=mock(values,'Equipment',1),real=mock(actuals,'Real Data',2);
 h.c.getCase_=()=>({});h.c.SpreadsheetApp.openById=()=>({getSheets:()=>[equipment,real],getSheetByName:()=>equipment,getSpreadsheetTimeZone:()=> 'America/Mexico_City'});
 for(const spreadsheet of ['new-sheet-id','https://docs.google.com/spreadsheets/d/new-sheet-id/edit#gid=2']){
  const result=h.c.previewSheetImport_({caseId:'mine',spreadsheet},{email:'owner@test'}),r=result.realData.record,e=r.equipment[0];
  assert.equal(result.realData.errors.length,0,JSON.stringify(result.realData.errors));
  assert.equal(result.equipment.length,4);assert.equal(result.source.sheetName,'Equipment');assert.equal(result.source.metadataColumn,'B');assert.equal(result.metadata.bottlesPerCase,24);
  assert.equal(r.production,100);assert.equal(r.reportedProductionCases,100);assert.equal(r.reportedProductionUnits,1200);assert.equal(r.aem.productionAvailableSeconds,80640);assert.equal(r.reportedEfficiencyPercent,63.3);
  assert.equal(e.sourceEquipmentId,request.equipment[0].id);assert.equal(e.downtimeSeconds,720);assert.equal(e.failureCount,null);assert.equal(e.stopClass,'UNKNOWN');
  assert.equal(e.reportedDowntimePercent,12.1);assert.equal(e.observationRow,20);
  assert.equal(r.equipment[1].sourceRow,13);assert.equal(r.equipment[1].observationRow,23);assert.equal(r.equipment[1].downtimeSeconds,0);assert.equal(r.equipment[1].reportedDowntimePercent,0);
  assert(result.realData.fields.some(f=>f.cell==='Real Data!B7'));
 }
 assert(h.calls.some(call=>call[0]==='hideColumns'&&call[1]===26));
});
