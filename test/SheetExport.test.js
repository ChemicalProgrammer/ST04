import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime() {
  const calls=[],writes=[],merges=[],book={getId:()=> 'new-sheet-id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/new-sheet-id/edit'};
  const file={moveTo:folder=>calls.push(['move',folder]),setTrashed:value=>calls.push(['trash',value])};
  const makeRange=(trackMerges,...coordinates)=>new Proxy({}, {get:(_,method)=>(...args)=>{
    if(method==='protect'){
      calls.push([method,coordinates]);return {setDescription(){return this;},addEditor(){},getEditors(){return [];},canDomainEdit(){return false;}};
    }
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
  const c=vm.createContext({console,Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@test'})},SpreadsheetApp:{create:(...args)=>{calls.push(['create',...args]);return book;},flush:()=>calls.push(['flush']),newDataValidation:()=>({requireValueInList(values,dropdown){calls.push(['requireValueInList',Array.from(values),dropdown]);return this;},setAllowInvalid(){return this;},build(){return 'types-validation';}}),BorderStyle:{SOLID_MEDIUM:'solid_medium'},BandingTheme:{LIGHT_GREY:'grey'}},DriveApp:{getFileById:id=>{calls.push(['file',id]);return file;}}});
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

test('authenticated export creates one new themed Sheet in Exports with batched B1:B4 / A8:AE layout and literal names',()=>{
  const {c,calls,writes}=runtime(),request=fixture(c);request.equipment[0].name='=HYPERLINK("https://example.test")';request.metadata.site='=1+1';
  const response=c.exportEquipmentSheet(request);assert.equal(response.ok,true,JSON.stringify(response));
  assert.equal(response.data.equipmentCount,3);assert.equal(response.data.url,'https://docs.google.com/spreadsheets/d/new-sheet-id/edit');
  assert.equal(calls[0][0],'owned');assert.deepEqual(calls.find(call=>call[0]==='move'),['move','export-folder']);
  assert.equal(writes.length,3);const {coordinates,values}=writes[0];assert.deepEqual(coordinates,[1,1,107,31]);
  assert.deepEqual(calls.filter(call=>call[0]==='insertSheet'),[['insertSheet','Products & Formats',1],['insertSheet','Real Data',2]]);
  const actuals=writes[2].values;assert.equal(actuals[0][9],'st-real-inputs-v5');assert.match(actuals[15][0],/Equipment.*MATCH/);assert.equal(actuals[15][9],values[7][29]);assert.equal(actuals[16][9],values[9][29]);assert.match(actuals[15][5],/E16\/\(D16\+E16\)/);
  const catalog=writes[1].values;
  assert.equal(catalog[2][5],'Length\n[mm]');
  assert.equal(values[6][10],'Conveyor Speed\n[m/min]');
  assert.equal(values[6][11],'Accumulation\n[s]');
  for(const heading of [...values[6],...catalog[2],...actuals[14]])assert(!heading.includes('\n('));
  assert(calls.some(call=>call[0]==='requireValueInList'&&call[1].includes('FILLER')&&call[2]));
  assert(calls.some(call=>call[0]==='setDataValidation'&&JSON.stringify(call[1])==='[8,1,100,1]'));
  assert.equal(actuals[18][9],values[10][29]);assert.match(actuals[18][0],/COUNTIFS/);
  assert.equal(values[0][1],"'=1+1");assert.equal(values[0][2],'');assert.equal(values[0][29],'st-equipment-metadata-b-v7');assert.equal(values[7][1],"'=HYPERLINK(\"https://example.test\")");
  assert.equal(values[6][28],'Overspeed vs infeed screw\n[%]');assert.equal(values[8][22],100);
  assert.deepEqual([2,12,16,20,22].map(i=>values[5][i]),['Equipment','Geometry','Upstream','Downstream','Speed & Sensors']);
  for(const group of [[6,3,1,10],[6,13,1,4],[6,17,1,4],[6,21,1,2],[6,23,1,7]])assert(calls.some(call=>call[0]==='merge'&&JSON.stringify(call[1])===JSON.stringify(group)));
  assert(!calls.some(call=>call[0]==='setNote'));assert.equal(actuals[0][0],'Line Time');assert.equal(actuals[1][0],'Total time\n[min]');assert.equal(actuals[1][2],'');assert.equal(actuals[13][3],'MTBF/MTTR Check');assert.equal(actuals[14][1],'Reported downtime\n[min]');assert(actuals[12].every(value=>value===''));
  assert(calls.some(call=>call[0]==='setBackground'&&call[2]===c.sheetExportTint_('#123456')));
  assert(calls.some(call=>call[0]==='setBackground'&&JSON.stringify(call[1])==='[2,1,9,1]'));
  assert(!calls.some(call=>call[0]==='applyRowBanding'||call[0]==='setBackground'&&call[2]==='#fff2cc'));
  assert.deepEqual(calls.filter(call=>call[0]==='protect').map(call=>call[1]),[[4,2],[6,2],[10,2],[12,5],[16,1,100,1],[16,4,100,6]]);
  assert(calls.filter(call=>call[0]==='setFontColor').every(call=>call[2]==='#000000'));
  assert(calls.some(call=>call[0]==='setFrozenColumns'&&call[1]===2));
  assert(!calls.some(call=>call[0]==='mergeAcross'||call[0]==='merge'&&JSON.stringify(call[1])==='[6,1,1,8]'));
  assert.equal(calls.filter(call=>call[0]==='create').length,1);assert(!calls.some(call=>call[0]==='trash'));
});

test('denied ownership and non-importable inputs cannot create a spreadsheet',()=>{
  const h=runtime(),request=fixture(h.c);h.c.getOwnedCaseFile_=()=>{throw Error('Denied');};
  assert.equal(h.c.exportEquipmentSheet(request).ok,false);assert(!h.calls.some(call=>call[0]==='create'));
  const h2=runtime(),invalid=fixture(h2.c);invalid.equipment[0].noiseProfile.reliability.mtbfMinutes=0;
  const response=h2.c.exportEquipmentSheet(invalid);assert.equal(response.error.code,'INVALID_SHEET_EXPORT');assert(response.error.details.some(detail=>detail.includes('H8:I8')));
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
 const data=c.equipmentSheetData_(request.equipment,request.metadata);assert.equal(data.layout,'plant-sheet-v2');assert.equal(data.rows[1].length,26);assert.equal(data.rows[1][6],29.93);assert.equal(data.rows[1][7],28);assert.equal(data.rows[1][8],8000);
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


test('three-tab export previews equipment and filled observations via the same spreadsheet URL',()=>{
 const h=runtime(),request=fixture(h.c);request.equipment[0].processData.equipment={...request.equipment[0].processData.equipment,internalCapacityBottles:31,residenceTimeSeconds:8.25};assert(h.c.exportEquipmentSheet(request).ok);
 const values=h.writes[0].values,actuals=h.writes[2].values;
 assert.equal(values[0][17],'');assert.equal(values[4][17],'');
 assert.equal(values[7][29],request.equipment[0].id);assert.equal(values[6][29],'Equipment ID');
 assert.equal(values[2][1],46303);values[2][1]='2026-10-08';
 // Inputs and computed values returned by the dedicated tab, including blank and zero.
 actuals[4][4]=100;actuals[1][1]=1440;actuals[2][1]=0;
 actuals[3][1]=1440;actuals[5][1]=1344;actuals[8][4]=.633;actuals[5][4]=1200;
 actuals[15][1]=12;actuals[15][2]=.121;
 values[7].splice(3,4,10,2,40,17);
 values[10].splice(0,10,'CUSTOM','Nueva máquina','N','','','','',200,5,300);
 actuals[18][1]=0;actuals[18][2]=0;
 const mock=(grid,name,id)=>({getLastRow:()=>grid.length,getMaxRows:()=>100,getMaxColumns:()=>grid[0].length,getSheetId:()=>id,getName:()=>name,getRange:(r,col,count=1,width=1)=>({getValues:()=>grid.slice(r-1,r-1+count).map(row=>row.slice(col-1,col-1+width)),getNumberFormats:()=>Array.from({length:count},()=>Array(width).fill('0.00%'))})});
 const equipment=mock(values,'Equipment',1),real=mock(actuals,'Real Data',3),catalog=mock(h.writes[1].values,'Products & Formats',2);
 h.c.getCase_=()=>({});h.c.SpreadsheetApp.openById=()=>({getSheets:()=>[equipment,catalog,real],getSheetByName:()=>equipment,getSpreadsheetTimeZone:()=> 'America/Mexico_City'});
 for(const spreadsheet of ['new-sheet-id','https://docs.google.com/spreadsheets/d/new-sheet-id/edit#gid=2','https://docs.google.com/spreadsheets/d/new-sheet-id/edit#gid=3']){
  const result=h.c.previewSheetImport_({caseId:'mine',spreadsheet},{email:'owner@test'}),r=result.realData.record,e=r.equipment[0];
  assert.equal(result.realData.errors.length,0,JSON.stringify(result.realData.errors));
  assert.equal(result.equipment.length,4);assert.equal(result.source.sheetName,'Equipment');assert.equal(result.source.metadataColumn,'B');assert.equal(result.metadata.bottlesPerCase,24);
  assert.equal(result.source.equipmentRange,'A8:AE107');assert.equal(result.equipment[0].processData.equipment.internalCapacityBottles,31);assert.equal(result.equipment[0].processData.equipment.residenceTimeSeconds,undefined);assert.equal(result.equipment[0].noiseProfile.reliability.mttrMinutes,5);assert.equal(result.materialCatalog.errors.length,0);
  assert.equal(r.production,100);assert.equal(r.reportedProductionCases,100);assert.equal(r.reportedProductionUnits,1200);assert.equal(r.aem.productionAvailableSeconds,80640);assert.equal(r.reportedEfficiencyPercent,63.3);
  assert.equal(e.sourceEquipmentId,request.equipment[0].id);assert.equal(e.downtimeSeconds,720);assert.equal(e.failureCount,null);assert.equal(e.stopClass,'UNKNOWN');
  assert.equal(e.reportedDowntimePercent,12.1);assert.equal(e.observationRow,16);
  assert.equal(r.equipment[1].sourceRow,11);assert.equal(r.equipment[1].observationRow,19);assert.equal(r.equipment[1].downtimeSeconds,0);assert.equal(r.equipment[1].reportedDowntimePercent,0);
  assert(result.realData.fields.some(f=>f.cell==='Real Data!B2'));
 }
 values[0][29]='st-equipment-metadata-b-v6';values[0][31]='';values[7][31]='obsolete';
 const legacy=h.c.previewSheetImport_({caseId:'mine',spreadsheet:'new-sheet-id'},{email:'owner@test'});
 assert.equal(legacy.equipment[0].processData.equipment.internalCapacityBottles,31);
 assert.equal(legacy.equipment[0].processData.equipment.residenceTimeSeconds,undefined);
 assert(h.calls.some(call=>call[0]==='hideColumns'&&call[1]===30));
});

test('catalog uses product names and preserves internal IDs, format selection and overrides in an existing case',()=>{
 const {c,calls,writes}=runtime(),request=fixture(c),equipmentId=request.equipment[0].id;
 request.metadata.formatCatalog={version:3,products:[{id:'shared',name:'Drink',volumeMl:355,volumeUnit:'fl oz (US)',bottle:{lengthMm:60},equipment:{[equipmentId]:{ratePerMinute:300}}}],
   formats:[{id:'six',name:'Six pack',productId:'shared',bottlesPerCase:6,case:{lengthMm:180}},{id:'twelve',name:'Twelve pack',productId:'shared',bottlesPerCase:12,case:{lengthMm:280}}]};
 const response=c.exportEquipmentSheet(request);
 assert.equal(response.ok,true,JSON.stringify(response));
 const equipment=writes[0].values,catalog=writes[1].values;
 assert(equipment[4].every(value=>value===''));
 assert(equipment.slice(0,3).every(row=>row[3]===''&&row[4]===''));
 assert.equal(catalog[2][2],'Linked product');
 assert(calls.some(call=>call[0]==='requireValueInList'&&call[1].join(',')==='Product,Format'));
 assert.equal(calls.filter(call=>call[0]==='setBorder').length,18);
 assert(calls.some(call=>call[0]==='setHorizontalAlignment'&&String(call[1])==='7,1,1,31'&&call[2]==='center'));
 assert.deepEqual(catalog.slice(3).map(row=>row.slice(0,3)),[
   ['Product','Drink',''],['Format','Six pack',''],['Format','Twelve pack','']
 ]);
 assert.equal(catalog[3][4],'fl oz (US)');assert.equal(catalog[3][8],'N/A');assert.equal(catalog[2].length,9);
 const source=c.readSheetCatalog_({getLastRow:()=>catalog.length,getRange:()=>({getValues:()=>catalog.slice(3)})});
 assert.deepEqual(Array.from(source.errors),[]);
 assert.equal(source.catalog.products[0].volumeMl,355);
 assert.equal(source.initialFormatId,undefined);

 c.window={SimulatorEngine:c.STScenarioEngine_};
 vm.runInContext(fs.readFileSync('apps-script/SheetImportMerge.html','utf8').replace(/<\/?script>/g,''),c);
 const preview={sourceRows:[{row:11,equipmentId}]},plan={records:[{row:11,target:'local-filler'}]};
 const snapshot={equipment:[],metadata:{formatCatalog:{version:3,products:[{id:'other',name:'Other'},request.metadata.formatCatalog.products[0]],formats:[]}},initialFormatId:null};
 function base(){return {equipment:[{id:'local-filler'}],sourceImport:{lastApplied:{equipment:[]}},errors:[]};}
 const result=c.window.STSheetCatalogImport(base(),source,snapshot,plan,preview);
 assert.deepEqual(Array.from(result.errors),[]);
 assert.deepEqual(Array.from(result.formatCatalog.products,p=>p.id),['other','shared']);
 assert.equal(result.formatCatalog.products[1].equipment[equipmentId].ratePerMinute,300);
 assert.equal(result.formatCatalog.formats[0].productId,'shared');
 assert.equal(result.initialFormatId,null);
 assert.equal(c.window.STSheetCatalogImport(base(),source,{...snapshot,metadata:{formatCatalog:result.formatCatalog},initialFormatId:null},plan,preview).hasChanges,undefined);
 catalog[3][4]='kg';
 const invalid=c.readSheetCatalog_({getLastRow:()=>catalog.length,getRange:()=>({getValues:()=>catalog.slice(3)})});
 assert.match(invalid.errors[0],/row 4.*volume unit/);
});

test('a new case with no equipment still exports all headings, validations and blank slots',()=>{
 const {c,calls,writes}=runtime(),request={...fixture(c),equipment:[],metadata:{by:'Mon Dec 15 2025 02:00:00 GMT-0600 (Central Standard Time)'}};
 const response=c.exportEquipmentSheet(request);
 assert.equal(response.ok,true,JSON.stringify(response));assert.equal(response.data.equipmentCount,0);
 const grid=writes[0].values;
 assert.equal(grid[2][1],46006);assert.equal(grid[3][0],'By');assert.equal(grid[3][1],'');
 assert.equal(grid[6].length,31);assert(grid[6].every(Boolean));
 assert(grid[7].slice(0,29).every(value=>value===''));assert.match(grid[7][29],/^slot-/);
 assert(calls.some(call=>call[0]==='setNumberFormat'&&String(call[1])==='4,2'&&call[2]==='@'));
 assert(calls.some(call=>call[0]==='createFilter'&&String(call[1])==='7,1,101,31'));
 request.metadata.by='María García';
 assert(c.exportEquipmentSheet(request).ok);
 assert.equal(writes[3].values[3][1],'María García');
});

test('catalog and workspace errors identify the export stage before any spreadsheet is created',()=>{
 const invalid=runtime(),request=fixture(invalid.c);
 request.metadata.formatCatalog={version:3,products:[],formats:[{id:'format',name:'Incomplete format'}]};
 const catalogFailure=invalid.c.exportEquipmentSheet(request);
 assert.equal(catalogFailure.error.code,'SHEET_EXPORT_FAILED');
 assert(catalogFailure.error.details.includes('Stage: PREPARE_CATALOG'));
 assert(catalogFailure.error.details.some(detail=>detail.includes('Select a product')));
 assert(!invalid.calls.some(call=>call[0]==='create'));

 const unavailable=runtime();
 unavailable.c.getWorkspaceFolders_=()=>{throw Error('Exports folder is unavailable');};
 const workspaceFailure=unavailable.c.exportEquipmentSheet(fixture(unavailable.c));
 assert.equal(workspaceFailure.error.code,'SHEET_EXPORT_FAILED');
 assert(workspaceFailure.error.details.includes('Stage: OPEN_EXPORTS_FOLDER'));
 assert(workspaceFailure.error.details.includes('Service: Exports folder is unavailable'));
 assert(!unavailable.calls.some(call=>call[0]==='create'));
});

test('split stop pairs take precedence, preserve the original inputs and feed the engine one weighted profile',()=>{
 const {c,writes}=runtime(),request=fixture(c);
 const input=c.equipmentSheetData_(request.equipment,request.metadata);
 const options={start:8,stopRows:[[10,2,40,17],[],[]]};
 const preview=c.parseEquipmentSheet_(input.metadata,input.rows,[],input.layout,options);
 assert(preview.canImport);
 assert(preview.warnings.some(warning=>warning.cell==='D8:E8'&&warning.message.includes('precedence')));
 assert.equal(preview.equipment[0].noiseProfile.reliability.mtbfMinutes,8);
 assert.equal(preview.equipment[0].noiseProfile.reliability.mttrMinutes,5);
 assert.deepEqual(JSON.parse(JSON.stringify(preview.equipment[0].processData.equipment.stopInputs)),{
  minor:{mtbfMinutes:10,mttrMinutes:2},major:{mtbfMinutes:40,mttrMinutes:17}
 });
 c.window={};
 vm.runInContext(fs.readFileSync('apps-script/SheetImportMerge.html','utf8').replace(/<\/?script>/g,''),c);
 const merge=c.window.STSheetImportMerge;
 preview.source={stopBreakdown:true};preview.stopBreakdown=true;
 const plan=merge.create(preview,request.equipment,{});
 const merged=merge.build(preview,plan,request.equipment,{});
 assert.equal(merged.errors.length,0);
 assert.equal(merged.equipment[0].noiseProfile.reliability.mtbfMinutes,8);
 assert.equal(merged.equipment[0].processData.equipment.stopInputs.major.mttrMinutes,17);
 const response=c.exportEquipmentSheet({...request,equipment:merged.equipment});
 assert.equal(response.ok,true,JSON.stringify(response));
 assert.deepEqual(writes[0].values[7].slice(3,7),[10,2,40,17]);
 assert.deepEqual(writes[0].values[7].slice(7,9),['','']);
 assert.match(writes[2].values[15][3],/Equipment!\$D\$8/);
 const incomplete=c.parseEquipmentSheet_(input.metadata,input.rows,[],input.layout,{...options,stopRows:[[10,2,40,'']]});
 assert(!incomplete.canImport);
 assert(incomplete.errors.some(error=>error.cell==='AC8:AD8'));
 assert.equal(merge.create({...incomplete,source:{stopBreakdown:true}},request.equipment,{}).records[0].target,'skip');
 const noMajor=c.parseEquipmentSheet_(input.metadata,input.rows,[],input.layout,{...options,stopRows:[[10,2,0,0]]});
 assert(noMajor.canImport);
 assert.equal(noMajor.equipment[0].noiseProfile.reliability.mtbfMinutes,10);
});
