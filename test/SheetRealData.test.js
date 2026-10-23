import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {TextEncoder} from 'node:util';
import {JSDOM} from 'jsdom';
const plain=x=>JSON.parse(JSON.stringify(x));
function runtime(){const c={window:{},TextEncoder,console};vm.createContext(c);for(const p of ['TextResources.gs','SheetImportService.gs','RealData.html','SheetImportMerge.html'])vm.runInContext(fs.readFileSync('apps-script/'+p,'utf8').replace(/<\/?script>/g,''),c);return c;}
function setup(c){
 const top=Array.from({length:7},()=>Array(19).fill('')),formats=top.map(r=>r.map(()=>''));
 const set=(cell,value,unit)=>{const m=/([A-Z])(\d)/.exec(cell),r=+m[2]-1,col=m[1].charCodeAt(0)-69;top[r][col]=value;if(unit)top[r][col+1]=unit;};
 for(const [cell,value,unit] of [['F1','2026-10-23'],['F2','2026-10-24'],['F3',6720,'cases'],['F4',4538,'cases'],['F5',2940,'cases'],['F6',14198,'cases'],['F7','GOOD'],['J1',1440,'min'],['J2',0,'min'],['J3',1440,'min'],['J4',0,'min'],['J5',1440,'min'],['J6',512,'min'],['J7',928,'min'],['N1',.574,'%'],['N2',35.78,'%'],['N4',775,'min'],['N5',153,'min'],['N6',220,'bottles/min'],['R2','CASES'],['R4','AEM_UNPLANNED'],['R5','PRODUCTION']])set(cell,value,unit);
 formats[0][9]='0.00%';
 const unit={id:'filler',type:'FILLER',name:'Local filler',nominalRatePerSecond:4,characteristics:{},processData:{equipment:{maximumSpeedBpm:240}},noiseProfile:{reliability:{mtbfMinutes:10,mttrMinutes:1}}};
 const incoming={...plain(unit),id:'sheet-row-10',name:'Sheet filler',characteristics:{sourceSheetRow:10}};
 const preview={metadata:{bottlesPerCase:12,dateOfAnalysis:'2026-10-23'},source:{spreadsheetId:'book',sheetId:1,sheetName:'Equipment'},equipment:[incoming],sourceRows:[],warnings:[],errors:[],notes:[]};
 const parse=(rows=[[12,4,'FAILURES',1440,'Reported stops','filler']])=>c.parseSheetRealData_(top,formats,rows,preview);
 return {top,formats,set,preview,parse,unit};
}
test('Sheet observations convert percent-formatted AU, preserve zero/unknown, times and production without guessing denominators',()=>{
 const c=runtime(),f=setup(c),data=f.parse(),r=data.record;
 assert.deepEqual(plain(data.errors),[]);assert.equal(r.reportedEfficiencyPercent,57.4);assert.equal(r.reportedUpdtPercent,35.78);assert.equal(r.updtSeconds,null);assert.equal(r.durationSeconds,86400);assert.equal(r.aem.businessExternalDowntimeSeconds,0);assert.equal(r.production,14198);assert.deepEqual(plain(r.shiftProduction),[6720,4538,2940]);assert.equal(r.equipment[0].downtimeSeconds,720);assert.equal(r.equipment[0].exposureSeconds,86400);
 f.set('J1',24,'h');f.set('J6',30720,'s');assert.equal(f.parse().record.durationSeconds,86400);assert.equal(f.parse().record.downtimeSeconds,30720);
 f.set('J1','24 hours','h');assert(f.parse().errors.some(e=>e.cell==='J1'));f.set('J1',24,'days');assert(f.parse().errors.some(e=>e.cell==='K1'));
 f.set('N1','57.4%','%');assert.equal(f.parse().record.reportedEfficiencyPercent,57.4);
 f.set('G6','bottles');assert(f.parse().errors.some(e=>e.cell==='G6'));
 assert(f.parse([[50,2.5,'MAJOR',10,'','filler']]).errors.some(e=>e.cell==='AA10'));
});
test('Real Data only maps stable IDs, preserves configuration, appends or updates explicitly, and rejects duplicate/unresolved mappings',()=>{
 const c=runtime(),f=setup(c),merge=c.window.STSheetImportMerge,api=c.window.STSheetRealData;
 f.preview.realData=f.parse();const snapshot={equipment:[f.unit],metadata:{},sourceImport:{}};
 const plan=merge.create(f.preview,snapshot.equipment,{});plan.records.forEach(r=>Object.keys(r.selected).forEach(k=>r.selected[k]=false));Object.keys(plan.metadata).forEach(k=>plan.metadata[k]=false);
 const draft=api.create(f.preview,plan,snapshot.equipment);assert.equal(draft.targets[10],'filler');draft.enabled=true;
 const build=()=>api.apply(merge.build(f.preview,plan,snapshot.equipment,{}),f.preview,draft,snapshot);
 const before=JSON.stringify(snapshot),out=build();assert.deepEqual(plain(out.errors),[]);assert.equal(out.hasChanges,true);assert.equal(out.equipmentChanged,false);assert.deepEqual(plain(out.equipment),snapshot.equipment);assert.equal(JSON.stringify(snapshot),before);
 const r=out.realData.records[0];assert.equal(r.equipment[0].equipmentId,'filler');assert.equal(r.reportedEfficiencyPercent,57.4);assert.match(r.sourceSnapshot,/N1/);
 snapshot.metadata.realData=plain(out.realData);draft.recordId=r.id;f.preview.realData.record.production=15000;const updated=build();assert.equal(updated.realData.records.length,1);assert.equal(updated.realData.records[0].production,15000);
 draft.targets[10]='';assert(build().errors.some(e=>e.includes('select an observation')));draft.targets[10]='skip';assert.equal(build().realData.records[0].equipment.length,0);
 draft.targets[10]='filler';f.preview.realData.record.equipment.push({...plain(f.preview.realData.record.equipment[0]),sourceRow:11});draft.targets[11]='filler';assert(build().errors.some(e=>e.includes('unique')));
});
test('optional observation parse errors do not prevent importing equipment when observation is unchecked',()=>{
 const c=runtime(),f=setup(c),api=c.window.STSheetRealData;f.set('N1',150,'%');f.preview.realData=f.parse();assert(f.preview.realData.errors.length);
 const base={errors:[],hasChanges:true};assert.equal(api.apply(base,f.preview,{enabled:false},{}),base);assert.equal(base.errors.length,0);
 api.apply(base,f.preview,{enabled:true},{});assert(base.errors.some(e=>e.includes('N1')));
});
test('AEM comparisons expose source discrepancies and distinguish unplanned from equivalent losses',()=>{
 const c=runtime(),f=setup(c),api=c.window.STRealData,data=f.parse().record;
 data.equipment=[];data.aem.basis='CALENDAR_OUTPUT_FLOW';data.lineTimeBasis='OUTPUT_FLOW';
 const sim={equipment:[{id:'out',name:'Output'}],dynamicConfig:{}},result={durationSeconds:86400,unitOfFlow:'bottles',summary:{outputCount:170376,lineOeePercent:53.78},equipmentMetrics:{out:{runningSeconds:928*60}}};
 const record=api.normalize(data),out=api.compare(record,sim,result,'average');
 assert(out.warnings.some(w=>w.includes('Asset Utilization: reported value differs')));assert.equal(out.rows.find(r=>r.metric==='AEM Asset Utilization').delta,null);assert.equal(out.rows.find(r=>r.metric==='AEM Asset Utilization').recalculated,775/1440*100);assert.equal(out.rows.find(r=>r.metric==='UPDT').simulated,null);
 // Coherent data: 100 minutes unplanned, 90 minutes speed loss.
 const r=api.normalize({name:'Synthetic',durationSeconds:1440*60,production:810*100,productionUnit:'BOTTLES',referenceSpeedBpm:100,outputBasis:'GOOD',runTimeSeconds:900*60,effectiveRuntimeSeconds:810*60,updtSeconds:100*60,updtDefinition:'AEM_UNPLANNED',updtPercentDenominator:'PRODUCTION',aem:{basis:'CALENDAR_OUTPUT_FLOW',businessExternalDowntimeSeconds:240*60,plantAvailableSeconds:1200*60,plantDecisionDowntimeSeconds:200*60,productionAvailableSeconds:1000*60}});
 sim.dynamicConfig.plantCalendar={enabled:true,totalMinutes:1440,externalMinutes:240};result.durationSeconds=1200*60;result.summary.outputCount=81000;result.equipmentMetrics.out.runningSeconds=900*60;result.plantCalendar={horizonSeconds:1200*60,completePeriod:true,plannedStopSeconds:200*60};
 const d=api.compare(r,sim,result,'average'),au=d.rows.find(r=>r.metric==='AEM Asset Utilization'),updt=d.rows.find(r=>r.metric==='Defined UPDT');assert.equal(au.real,67.5);assert.equal(au.simulated,67.5);assert.equal(au.delta,0);assert.equal(updt.simulated,100);assert.equal(updt.delta,0);
 r.updtDefinition='TOTAL_EQUIVALENT_LOSS';r.updtSeconds=630*60;assert.equal(api.compare(r,sim,result).rows.find(r=>r.metric==='Defined UPDT').simulated,630);
});
test('all saved rounds contribute equipment downtime means; unknown/all stop classes never sum overlapping states',()=>{
 const c=runtime(),api=c.window.STRealData,sim={equipment:[{id:'e',name:'Machine'}]},r={name:'Test',durationSeconds:60,equipment:[{equipmentId:'e',downtimeSeconds:6,stopClass:'MINOR',exposureSeconds:60}]};
 const result={durationSeconds:60,summary:{},batch:{rows:[{summary:{outputCount:1},equipmentMetrics:{e:{microStopSeconds:4}}},{summary:{outputCount:2},equipmentMetrics:{e:{microStopSeconds:8}}}]}};
 let d=api.compare(r,sim,result);assert.equal(d.equipmentRows[0].delta,0);r.equipment[0].stopClass='ALL';d=api.compare(r,sim,result);assert.equal(d.equipmentRows[0].simulated,null);assert.equal(d.equipmentRows[0].delta,null);
});

test('browser preview imports only Real Data, rejects bad optional cells, and can update an existing observation',()=>{
 const c=runtime(),f=setup(c);f.preview.realData=f.parse();
 const dom=new JSDOM(`<button id="open-sheet-import"></button><dialog id="sheet-import-dialog"><form id="sheet-import-form"><input id="sheet-import-url"><input id="sheet-import-tab"><button id="sheet-import-read"></button></form><div id="sheet-import-preview"></div><p id="sheet-import-error"></p><p id="sheet-import-summary"></p><input type="checkbox" id="sheet-import-ack"><button id="sheet-import-apply"></button><button id="sheet-import-close"></button><button id="sheet-import-cancel"></button></dialog>`,{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{
  w.TextEncoder=TextEncoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(fs.readFileSync('apps-script/TextResources.gs','utf8'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
  for(const p of ['Icons.html','RealData.html','SheetImportMerge.html','SheetImport.html'])w.eval(fs.readFileSync('apps-script/'+p,'utf8').replace(/<\/?script>/g,''));
  w.SimulatorEngine={normalizeFormatCatalog:()=>({products:[],formats:[]}),validateSimulationInput:()=>({ok:true})};w.STSheetCorrections={render(){}};w.STDialog={beginActivity(){return ()=>{};}};w.STErrors={capture(){}};
  w.google={script:{run:{withFailureHandler(){return this;},withSuccessHandler(fn){this.success=fn;return this;},previewSheetImport(){this.success({ok:true,data:plain(f.preview),importVersion:'sheet-import-20261023-1'});}}}};
  const state={activeCase:{id:'case'},activeSimulationId:'s',requestEpoch:1},snapshot={equipment:[plain(f.unit)],sourceImport:{},metadata:{realData:{schema:'st-real-data-v1',records:[{id:'old',name:'Previous observation'}]}}};let applied;
  w.STSheetImport(state,{capture:()=>snapshot,apply:r=>{applied=r;return true;}}).init();d.getElementById('open-sheet-import').click();d.getElementById('sheet-import-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert(d.getElementById('sheet-real-data'));assert.match(d.getElementById('sheet-real-data').textContent,/57.4/);
  d.getElementById('sheet-real-only').click();assert.match(d.getElementById('sheet-import-summary').textContent,/1 Real Data observation/);assert(!d.getElementById('sheet-packing-enabled').checked);
  const destination=d.getElementById('sheet-real-destination');destination.value='old';destination.onchange();d.getElementById('sheet-import-ack').click();assert(!d.getElementById('sheet-import-apply').disabled,d.getElementById('sheet-import-error').textContent);d.getElementById('sheet-import-apply').click();
  assert(applied);assert.equal(applied.equipmentChanged,false);assert.equal(applied.realData.records.length,1);assert.equal(applied.realData.records[0].id,'old');assert.equal(applied.realData.records[0].production,14198);assert.equal(applied.realData.records[0].equipment[0].equipmentId,'filler');
  assert.equal(snapshot.metadata.realData.records[0].name,'Previous observation');assert.equal(snapshot.equipment[0].noiseProfile.reliability.mtbfMinutes,10);
 }finally{w.close();}
});

test('actual case Apply handler retains saved simulation results and events for an observation-only import',()=>{
 const c=runtime(),f=setup(c),api=c.window.STSheetRealData,merge=c.window.STSheetImportMerge;f.preview.realData=f.parse();
 const snapshot={equipment:[f.unit],metadata:{},sourceImport:{}},plan=merge.create(f.preview,snapshot.equipment,{});plan.records.forEach(r=>Object.keys(r.selected).forEach(k=>r.selected[k]=false));Object.keys(plan.metadata).forEach(k=>plan.metadata[k]=false);
 const draft=api.create(f.preview,plan,snapshot.equipment);draft.enabled=true;
 const result=api.apply(merge.build(f.preview,plan,snapshot.equipment,{}),f.preview,draft,snapshot);
 const saved={summary:{outputCount:1234}},events=[{time:100,command:'STOP'}],sim={id:'s',name:'Baseline',equipment:[plain(f.unit)],results:saved,dynamicConfig:{events}},caseRecord={id:'case',metadata:{},equipment:[f.unit]},state={activeCase:caseRecord,saving:false};
 const client={state,result,activePersistentSimulation:()=>sim,cloneJson:plain,syncPersistentSimulation:()=>true,STRealData:{selectRecord(){}},renderEditor(){},shell:{sync(){}},autosave:{change(){}},setStatus(){},__ST_TEXT__:x=>x};vm.createContext(client);
 const source=fs.readFileSync('apps-script/ClientCases.html','utf8'),start=source.indexOf('    function applySheetImport(result)'),end=source.indexOf('    function addEquipment()',start);vm.runInContext(source.slice(start,end)+';applySheetImport(result);',client);
 assert.equal(sim.results,saved);assert.equal(sim.dynamicConfig.events,events);assert.equal(caseRecord.metadata.realData.records[0].production,14198);assert.equal(state.isDirty,true);
});
