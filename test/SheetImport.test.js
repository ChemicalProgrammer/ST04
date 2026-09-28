import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
function runtime(extra={}){
 const c={Date,Utilities:{formatDate:()=> '2026-09-16'},...extra};vm.createContext(c);
 for(const file of ['ApiResponse.gs','CaseService.gs','SheetImportService.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),c);
 return c;
}
function fixture(){
 const na=()=>Array(23).fill('NA');let a=na(),b=na(),c=na();
 Object.assign(a,{0:'Blowmolder',1:'Machine A',2:'Y',3:2,4:.25,5:120,12:1,13:2});
 Object.assign(b,{0:'Conveyor',1:'Conveyor B',2:'N',6:6000,7:500,8:100,9:200,10:50,11:60,12:1,13:2,14:60,15:2,16:10,17:7,18:8,19:.5,20:.5,21:2,22:5});
 Object.assign(c,{0:'Filler',1:'Machine C',2:'N',3:3,4:.2,5:130,14:60,15:2});
 return {metadata:['Synthetic site','Line 1','Synthetic format',12,24,'2026-09-16','Test author'],rows:[a,b,c],formats:Array.from({length:3},()=>Array(23).fill('0.00'))};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('fixed Sheet mapping preserves every A–W value and C1:C7 metadata, with no invented reliability',()=>{
 const r=runtime(),f=fixture(),out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
 assert.equal(out.canImport,true,JSON.stringify(out.errors));assert.equal(out.equipment.length,3);
 assert.equal(out.metadata.bottlesPerCase,24);assert.equal(out.metadata.containerSizeOz,12);
 const [a,b]=out.equipment;
 assert.equal(a.nominalRatePerSecond,2);assert.equal(a.processData.role,'CRITICAL_MACHINE');assert.deepEqual(plain(a.noiseProfile),{reliability:{mtbfMinutes:2,mttrMinutes:.25}});
 assert.equal(a.processData.geometry.lactMm,null);assert.deepEqual(plain(b.noiseProfile),{});assert.equal(b.nominalRatePerSecond,2);
 assert.equal(b.processData.geometry.actualDischargeMm,100);assert.equal(b.processData.geometry.actualCodingMm,200);
 assert.equal(b.processData.accumulation.blockedTimeDelaySeconds,.5);assert.equal(b.processData.accumulation.insuranceFactorUnits,2);
 assert.equal(b.processData.speedAndSensors.overspeedVsInfeedScrewPercent,5);assert.equal(b.processData.speedAndSensors.conveyorSpeedFactorVsPreviousConveyorPercent,8);
 assert.equal(Object.keys(out.sourceRows[1].values).length,23);assert(out.notes.some(s=>s.includes('I/J and R/S/W')));
});
test('percentage cells and plain percentage points normalize without changing seconds or geometry',()=>{
 const r=runtime(),f=fixture();f.rows[1][16]=.1;f.formats[1][16]='0.00%';f.rows[1][17]='7%';
 const out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
 assert.equal(out.sourceRows[1].values.conveyorSpeedFactorVsDischargeVelocityPercent,10);assert.equal(out.sourceRows[1].values.codingConveyorSpeedFactorVsPreviousConveyorPercent,7);assert.equal(out.sourceRows[1].values.blockedTimeDelaySeconds,.5);
});
test('invalid reliability, numeric formulas, types and geometry report exact cells; blank rows preserve order',()=>{
 const r=runtime(),f=fixture();f.rows[0][3]=0;f.rows[0][4]='NA';f.rows[2][0]='Unknown';f.rows[2][5]='#DIV/0!';f.rows[1][7]=7000;
 let out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);assert.equal(out.canImport,false);
 for(const cell of ['D10:E10','A12','F12','H11'])assert(out.errors.some(e=>e.cell===cell),cell);
 const good=fixture();good.rows.splice(1,0,Array(23).fill(''));out=r.parseEquipmentSheet_(good.metadata,good.rows,[]);assert.equal(out.equipment.length,3);assert.equal(out.sourceRows[1].row,12);
});
test('imported MTBF/MTTR drive reproducible engine failures and fixed repair durations',()=>{
 const r=runtime(),f=fixture();const out=plain(r.parseEquipmentSheet_(f.metadata,f.rows,f.formats));
 const input={case:{id:'imported',equipment:out.equipment},run:{durationSeconds:600,tickSeconds:1,sampleEverySeconds:5,seed:42}};
 const a=simulateLine(input),b=simulateLine(input);assert.equal(a.ok,true,JSON.stringify(a.error));assert.deepEqual(a,b);
 const failures=a.result.events.filter(e=>e.type==='FAILURE_STARTED');assert(failures.length>0);assert(failures.every(e=>e.equipmentId!=='sheet-row-11'));assert(failures.every(e=>e.durationSeconds===(e.equipmentId==='sheet-row-10'?15:12)));
});
test('import provenance survives case normalization independently for each simulation',()=>{
 const r=runtime(),f=fixture(),out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
 const simulations=r.normalizeSimulations_([{id:'a',equipment:out.equipment,sourceImport:{metadata:out.metadata,rows:out.sourceRows}},{id:'b',equipment:out.equipment}],[],{});
 assert.equal(simulations[0].sourceImport.metadata.site,'Synthetic site');assert.deepEqual(plain(simulations[1].sourceImport),{});
});
test('Sheet reader authenticates, checks case ownership, respects URL gid and serializes dates',()=>{
 const f=fixture(),ranges=[],reads=[];
 function tab(id){return {getSheetId:()=>id,getName:()=> 'Tab '+id,getLastRow:()=>12,getMaxColumns:()=>23,getMaxRows:()=>100,getRange:(row,col,num,width)=>{ranges.push([row,col,num,width]);return {getValues:()=>row===1?f.metadata.map((v,i)=>[i===5?new Date('2026-09-16'):v]):f.rows,getNumberFormats:()=>f.formats};}};}
 const tabs=[tab(0),tab(22)];const r=runtime({DriveApp:{getFileById:()=>({getMimeType:()=> 'application/vnd.google-apps.spreadsheet'})},SpreadsheetApp:{openById:id=>{reads.push(id);return {getSheets:()=>tabs,getSheetByName:()=>null,getSpreadsheetTimeZone:()=> 'Etc/UTC'};}}});
 let checked=false;r.requireCurrentUser_=()=>({email:'owner@test'});r.getCase_=(id,user)=>{assert.equal(id,'mine');assert.equal(user.email,'owner@test');checked=true;};
 const response=r.previewSheetImport({caseId:'mine',spreadsheet:'https://docs.google.com/spreadsheets/d/synthetic-sheet-id/edit#gid=22'});
 assert(checked);assert.equal(response.ok,true);assert.equal(response.data.source.sheetId,22);assert.equal(response.data.metadata.dateOfAnalysis,'2026-09-16');assert.deepEqual(ranges,[[1,3,7,1],[10,1,3,23]]);
 r.getCase_=()=>{throw Error('Denied');};assert.equal(r.previewSheetImport({caseId:'mine',spreadsheet:'synthetic-sheet-id'}).ok,false);assert.equal(reads.length,1);
 assert.throws(()=>r.parseSheetReference_('https://evil.test/synthetic-sheet-id'));
});
test('Sheet reader distinguishes Excel files and missing Sheets authorization',()=>{
 const excel=runtime({DriveApp:{getFileById:()=>({getMimeType:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}});
 assert.throws(()=>excel.openImportSpreadsheet_('synthetic-sheet-id'),e=>e.simulatorError.code==='SHEET_NOT_NATIVE');
 const denied=runtime({DriveApp:{getFileById:()=>({getMimeType:()=> 'application/vnd.google-apps.spreadsheet'})},SpreadsheetApp:{openById:()=>{throw Error('You do not have permission to call openById');}}});
 assert.throws(()=>denied.openImportSpreadsheet_('synthetic-sheet-id'),e=>e.simulatorError.code==='SHEET_AUTHORIZATION_REQUIRED'&&e.simulatorError.message.includes('permission'));
});
test('readable Sheets do not depend on Drive metadata access',()=>{
 const book={};const r=runtime({DriveApp:{getFileById:()=>{throw Error('Drive unavailable');}},SpreadsheetApp:{openById:()=>book}});
 assert.equal(r.openImportSpreadsheet_('synthetic-sheet-id'),book);
});
test('RPC preserves Google errors and identifies the responding importer',()=>{
 const r=runtime({SpreadsheetApp:{openById:()=>{throw Error('Sheets service unavailable');}},DriveApp:{getFileById:()=>{throw Error('Drive access denied');}}});
 r.requireCurrentUser_=()=>({email:'owner@test'});r.getCase_=()=>({});
 const response=r.previewSheetImport({caseId:'mine',spreadsheet:'synthetic-sheet-id'});
 assert.equal(response.ok,false);assert.equal(response.importVersion,'sheet-import-20260917-2');
 assert.match(response.error.message,/sheet-import-20260917-2.*SHEET_OPEN_FAILED.*Sheets service unavailable/);
 assert.match(response.error.details[0],/Drive access denied/);
 r.previewSheetImport_=()=>{throw Error('Failed while reading cells');};
 assert.match(r.previewSheetImport({}).error.message,/SHEET_READ_FAILED.*Failed while reading cells/);
});

test('container size accepts explicit ounces without accepting unrelated units',()=>{
 const r=runtime(),f=fixture();
 for(const value of [5.5,'5.5 oz',' 5.5 OZ ','5.5 fl oz']){
  f.metadata[3]=value;const out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
  assert.equal(out.metadata.containerSizeOz,5.5);assert(!out.errors.some(e=>e.cell==='C4'));
 }
 f.metadata[3]='5.5 ml';assert(r.parseEquipmentSheet_(f.metadata,f.rows,f.formats).errors.some(e=>e.cell==='C4'));
});

test('small discharge pitch is retained and selectable as draft with physical warning',()=>{
 const r=runtime(),f=fixture();f.metadata[3]='5.5 oz';
 f.rows[0][0]='Machine';f.rows[2][0]='Machine';f.rows[1][10]=110;f.rows[1][11]=88.9;
 const out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
 assert.equal(out.equipment.length,3);assert.equal(out.canImport,true);
 assert.equal(out.equipment[1].processData.upstream.dischargePitchMm,88.9);
 assert(out.warnings.some(e=>e.cell==='L11'&&e.message.includes('K11')));
 r.window={};vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),r);
 vm.runInContext(fs.readFileSync('apps-script/SheetImportMerge.html','utf8').replace(/<\/?script>/g,''),r);
 out.source={spreadsheetId:'fixture',sheetId:0};
 const merge=r.window.STSheetImportMerge,plan=merge.create(out,[],{});
 assert(plan.records.every(record=>record.target==='new'));assert(plan.records[1].selected.pitch);
 const result=merge.build(out,plan,[],{});assert.equal(result.errors.length,0);assert.equal(result.added,3);
 assert.equal(result.equipment[1].processData.upstream.dischargePitchMm,88.9);
 assert.equal(result.equipment[1].characteristics.sourceSheetRow,11);
 assert.equal(result.sourceImport.metadata.containerSizeOz,5.5);
 const run=simulateLine({case:{equipment:plain(result.equipment)},run:{durationSeconds:60,tickSeconds:1,seed:1}});
 assert.equal(run.ok,false,'Draft import must not bypass physical simulation validation');
 assert(run.error.details.some(detail=>detail.path.includes('equipment[1]')&&detail.path.endsWith('.gapMm')),JSON.stringify(run.error.details));
 const gap=run.error.details.find(detail=>detail.path.includes('equipment[1]')&&detail.path.endsWith('.gapMm'));
 const explanation=merge.physicalIssue(gap,result.equipment);
 assert.match(explanation,/Conveyor B/);assert.match(explanation,/K11/);assert.match(explanation,/L11/);assert.match(explanation,/Q11/);
});

test('Machine category recognizes worksheet names while preserving custom names and explicit types',()=>{
 const r=runtime(),f=fixture();
 const names={'Blowmolder':'BLOWMOLDER','Blow mouldER 1':'BLOWMOLDER','Pucker':'PUCKER','Filler/Capper':'FILLER','De-Pucker':'DEPUCKER','Sleever':'SLEEVER','Case Packer':'CASE_PACKER','Palletizer':'PALLETIZER','Custom Station':'CUSTOM','Pucker and Filler':'CUSTOM'};
 for(const [name,type] of Object.entries(names)){
  f.rows[0][0]='Machine';f.rows[0][1]=name;
  const out=r.parseEquipmentSheet_(f.metadata,f.rows,f.formats);
  assert.equal(out.equipment[0].type,type,name);assert.equal(out.equipment[0].name,name);
  assert.equal(out.equipment[0].processData.machineType,type);assert(out.warnings.some(w=>w.cell==='A10'));
 }
 f.rows[0][0]='Sleever';f.rows[0][1]='Filler/Capper';
 assert.equal(r.parseEquipmentSheet_(f.metadata,f.rows,f.formats).equipment[0].type,'SLEEVER');
});
