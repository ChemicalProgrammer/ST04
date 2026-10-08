import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime() {
  const calls=[],writes=[],merges=[],book={getId:()=> 'new-sheet-id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/new-sheet-id/edit'};
  const file={moveTo:folder=>calls.push(['move',folder]),setTrashed:value=>calls.push(['trash',value])};
  const range=(...coordinates)=>new Proxy({}, {get:(_,method)=>(...args)=>{
    if(method==='setValues')writes.push({coordinates,values:JSON.parse(JSON.stringify(args[0]))});
    if(method==='merge')merges.push(coordinates);
    if(method==='mergeAcross')for(let row=0;row<coordinates[2];row++)merges.push([coordinates[0]+row,coordinates[1],1,coordinates[3]]);
    calls.push([method,coordinates,...args]);return range(...coordinates);
  }});
  function freeze(axis,count){const start=axis==='rows'?0:1,span=start+2;if(merges.some(m=>m[start]<=count&&m[start]+m[span]-1>count))throw Error("Sorry, you can't freeze columns which contain only part of a merged cell.");calls.push([axis==='rows'?'setFrozenRows':'setFrozenColumns',count]);}
  const sheet=new Proxy({getName:()=> 'Equipment',getRange:range,setFrozenRows:count=>freeze('rows',count),setFrozenColumns:count=>freeze('columns',count)},{get:(target,key)=>target[key]||((...args)=>calls.push([key,...args]))});
  book.getSheets=()=>[sheet];
  const c=vm.createContext({console,SpreadsheetApp:{create:(...args)=>{calls.push(['create',...args]);return book;},flush:()=>calls.push(['flush']),BandingTheme:{LIGHT_GREY:'grey'}},DriveApp:{getFileById:id=>{calls.push(['file',id]);return file;}}});
  for(const name of ['TextResources.gs','ApiResponse.gs','CaseService.gs','SheetImportService.gs','SheetExportService.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),c);
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
  const data=c.equipmentSheetData_(request.equipment,request.metadata),roundtrip=c.parseEquipmentSheet_(data.metadata,data.rows,[]);
  assert.equal(roundtrip.canImport,true);assert.equal(data.rows[0][5],420,'F is installed maximum, not nominal');
  const values=roundtrip.sourceRows[1].values;
  assert.equal(values.conveyorSpeedFactorVsDischargeVelocityPercent,75);
  for(const key of ['blockedTimeDelaySeconds','clearTimeDelaySeconds','insuranceFactorUnits','bottlesDischargedAtStop'])assert.equal(values[key],0,key);
  assert.equal(values.rampUpTimeSeconds,2);
  assert.equal(values.actualCodingMm,100);assert.equal(values.codingConveyorSpeedFactorVsPreviousConveyorPercent,102);assert.equal(values.conveyorSpeedFactorVsPreviousConveyorPercent,103);assert.equal(values.overspeedVsInfeedScrewPercent,7);
  assert.equal(roundtrip.metadata.containerSizeOz,5.5);assert.equal(roundtrip.equipment[0].characteristics.isPacemaker,true);
  assert.deepEqual(JSON.parse(JSON.stringify(roundtrip.equipment[2].noiseProfile)),{});
  // All 23 mapped cells survive re-import, with NA normalized to null.
  roundtrip.sourceRows.forEach((row,i)=>c.sheetImportColumns_().forEach((column,j)=>assert.equal(row.values[column[1]],data.rows[i][j]==='NA'?null:data.rows[i][j])));
});

test('authenticated export creates one new themed Sheet in Exports with batched C1:C7 / A10:W layout and literal names',()=>{
  const {c,calls,writes}=runtime(),request=fixture(c);request.equipment[0].name='=HYPERLINK("https://example.test")';request.metadata.site='=1+1';
  const response=c.exportEquipmentSheet(request);assert.equal(response.ok,true,JSON.stringify(response));
  assert.equal(response.data.equipmentCount,3);assert.equal(response.data.url,'https://docs.google.com/spreadsheets/d/new-sheet-id/edit');
  assert.equal(calls[0][0],'owned');assert.deepEqual(calls.find(call=>call[0]==='move'),['move','export-folder']);
  assert.equal(writes.length,1);const {coordinates,values}=writes[0];assert.deepEqual(coordinates,[1,1,12,23]);
  assert.equal(values[0][2],"'=1+1");assert.equal(values[9][1],"'=HYPERLINK(\"https://example.test\")");
  assert.equal(values[8][22],'Overspeed vs infeed screw (%)');assert.equal(values[10][16],100);
  assert.equal(values[7][0],'');assert(values[7][2].startsWith('Import layout:'));assert(calls.some(call=>call[0]==='setFrozenColumns'&&call[1]===2));
  assert(calls.some(call=>call[0]==='setBackground'&&call[2]==='#123456'));
  assert(calls.some(call=>call[0]==='setFontColor'&&call[2]==='#778899'));
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
  const response=c.exportEquipmentSheet(request);assert.equal(response.error.code,'SHEET_EXPORT_FAILED');assert(response.error.details.includes('Stage: FLUSH'));assert(response.error.details.includes('Google: Failed'));
  assert.deepEqual(calls.filter(call=>call[0]==='file'),[['file','new-sheet-id']]);assert.deepEqual(calls.find(call=>call[0]==='trash'),['trash',true]);
  assert.equal(c.sheetExportColor_('javascript:alert(1)','#123456'),'#123456');
});

test('regression: merged note cannot cross a frozen-column boundary; Google service failures retain their stage',()=>{
 const {c,sheet}=runtime();sheet.getRange(8,1,1,23).merge();assert.throws(()=>sheet.setFrozenColumns(2),/part of a merged cell/);
 const h=runtime();h.c.SpreadsheetApp.create=()=>{throw Error('Permission denied for SpreadsheetApp.create');};const response=h.c.exportEquipmentSheet(fixture(h.c));
 assert.equal(response.error.code,'SHEET_EXPORT_FAILED');assert(response.error.details.includes('Stage: CREATE_SPREADSHEET'));assert(response.error.details.some(detail=>detail.includes('Permission denied')));
 assert(!h.calls.some(call=>call[0]==='trash'));
});
