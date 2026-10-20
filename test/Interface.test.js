import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import postcss from 'postcss';
import { renderAppsScript } from '../scripts/render-apps-script.mjs';
import selectorParser from 'postcss-selector-parser';
import {gunzipSync} from 'node:zlib';
import {packingSheetFixture} from './fixtures/sheet-packing-case.js';
const read = file => fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8');
const settle = () => new Promise(resolve=>setTimeout(resolve,35));
async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate())return;await settle();}assert(predicate(),'Asynchronous UI did not settle');}
function stubScenarioGain(h){
 // This call-order mock is deliberately non-deterministic and has no reusable provenance.
 h.w.SimulatorEngine.inputSignature=undefined;
 let calls=0;
 h.w.SimulatorEngine.simulateBatch=async()=>{
  const gain=calls++%2;
  return {ok:true,result:{summary:{lineOeePercent:50+gain,outputCount:100+gain},durationSeconds:60}};
 };
}

async function setup({remember=false,fail=false,many=false,invalidSheet=false,empty=false,realScenarioServer=false,fingerprintMismatch=false,autosaveSeconds=1,uiMode='ADVANCE',flowUnit,savedAccent,savedUiMode,indexedCatalog=false}={}) {
 const context={}; vm.createContext(context);vm.runInContext(read('DemoCaseFactory.gs'),context);vm.runInContext(read('GeminiService.gs'),context);
 const initial=JSON.parse(JSON.stringify(context.createDemoCaseRequest_()));
 // Generic UI fixture uses the browser defaults supplied by this test.
 delete initial.metadata.consoleOptions;
 if(flowUnit)initial.unitOfFlow=flowUnit;
 Object.assign(initial,{id:'demo',ownerEmail:'preview@example.test',revision:1,updatedAt:'2026-09-15T10:00:00Z'});
 const sourceEquipment=JSON.parse(JSON.stringify(initial.equipment));
 if(empty)initial.equipment=[];
 initial.simulations=[{id:'simulation-a',name:'Simulation A',equipment:JSON.parse(JSON.stringify(initial.equipment)),dynamicConfig:{},results:null,playbackRate:1,createdAt:initial.updatedAt,updatedAt:initial.updatedAt}];
 let cases=[initial], stored={workspaceRootFolderId:'preview',preferredPlaybackRate:10}, calls=[], geminiConfigured=true;
 if(many) cases=Array.from({length:60},(_,i)=>({...initial,id:'case-'+i,name:'Line '+String(i).padStart(2,'0')}));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const api={
  getBootstrap:()=>({uiMode,user:{email:'preview@example.test'},settings:stored,gemini:{configured:geminiConfigured,model:'gemini-2.5-flash',prompts:context.geminiPromptDefinitions_(),promptOverrides:stored.gemini?.prompts||{}},cases:indexedCatalog==='cold'?[]:cases.map(c=>({id:c.id,name:c.name,equipmentCount:c.equipment.length,isSimulationReady:c.equipment.length>1,updatedAt:c.updatedAt})),caseCatalog:indexedCatalog?{refreshRequired:true}:undefined}),
  refreshCaseCatalog:()=>({cases:cases.map(c=>({id:c.id,name:c.name,revision:c.revision,equipmentCount:c.equipment.length,isSimulationReady:c.equipment.length>1,updatedAt:c.updatedAt})),hasMore:false,cursor:null}),
  askGemini:()=>({text:'Analysis of the saved case.'}),
  previewSheetImport:()=>({canImport:!invalidSheet,source:{schemaVersion:'plant-sheet-v1',sheetName:'Synthetic sheet',readAt:'2026-09-16',spreadsheetId:'synthetic-id'},metadata:{site:'Synthetic site',formatName:'Imported format'},equipment:copy(sourceEquipment.slice(0,3)).map((unit,index)=>({...unit,characteristics:{...unit.characteristics,criticalMachine:index===0,isPacemaker:index===0},processData:{...unit.processData,role:unit.type==='CONVEYOR'?'CONVEYOR':index===0?'CRITICAL_MACHINE':'MACHINE'}})).map((e,i)=>({...e,noiseProfile:{...e.noiseProfile,reliability:{...e.noiseProfile.reliability,mtbfMinutes:e.noiseProfile.reliability.mtbfMinutes+60}},processData:{...e.processData,equipment:{...e.processData.equipment,mtbfMinutes:e.processData.equipment.mtbfMinutes+60}},characteristics:{...e.characteristics,sourceSheetRow:i+10}})),sourceRows:[],errors:invalidSheet?[{cell:'D10:E10',message:'Supply both MTBF and MTTR.'}]:[],warnings:[],notes:['Review model assumptions.']}),
  getCase:id=>copy(cases.find(c=>c.id===id)),
  saveCase:c=>{c=copy(c);c.revision=c.expectedRevision+1;cases=cases.map(x=>x.id===c.id?c:x);return c;},
  getScenarioSourceSignature:request=>{const record=cases.find(c=>c.id===request.caseId),simulation=record?.simulations.find(s=>s.id===request.simulationId);if(!simulation||record.revision!==request.expectedRevision)throw Error('Stale scenario source');return {revision:record.revision,simulationId:simulation.id,signature:dom.window.STScenarios.signature(simulation)};},
  saveUserSettings:s=>{if(s.gemini?.apiKey)geminiConfigured=true;return stored=s;},
  deleteGeminiApiKey:()=>{geminiConfigured=false;return {configured:false,model:'gemini-2.5-flash',prompts:context.geminiPromptDefinitions_(),promptOverrides:stored.gemini?.prompts||{}};},
  cloneCase:id=>{const source=cases.find(c=>c.id===id),record=copy(source);record.id='copy-'+id;record.name='Copy of '+source.name;record.revision=1;record.updatedAt=new Date().toISOString();cases.push(record);return {id:record.id,name:record.name,equipmentCount:record.equipment.length,isSimulationReady:record.equipment.length>1,updatedAt:record.updatedAt};},
  deleteCase:id=>{cases=cases.filter(c=>c.id!==id);return {id};},
  createCase:c=>{c={...c,id:'new',equipment:[],revision:1,updatedAt:new Date().toISOString()};cases.push(c);return c;}
 };
 if(realScenarioServer){
  // Execute the real RPC, persistence normalization, planner and clone service.
  // Only Google storage, identity and the transport are replaced by fixtures.
  for(const file of ['ApiResponse.gs','CaseService.gs','ScenarioEngine.gs','ScenarioService.gs','GeminiService.gs','Main.gs'])vm.runInContext(read(file),context);
  context.requireCurrentUser_=()=>({email:'preview@example.test'});
  context.Utilities={getUuid:()=> 'scenario-uuid'};
  context.LockService={getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  context.persistCaseRecord_=(record,owned)=>{owned.file.setContent(JSON.stringify(record));return owned.file;};
  context.getOwnedCaseFile_=(id,user)=>{assert.equal(user.email,'preview@example.test');const record=cases.find(c=>c.id===id);assert(record);return {caseData:copy(record),file:{setContent:value=>{cases=cases.map(c=>c.id===id?JSON.parse(value):c);}}};};
  for(const name of ['getCase','saveCase','getScenarioSourceSignature','createScenario','prepareScenarioDraft'])api[name]=(...args)=>{
   args=copy(args);if(['createScenario','prepareScenarioDraft'].includes(name)&&fingerprintMismatch)args[0].sourceSignature='different-client-fingerprint';
   const response=context[name](...args);if(!response.ok)throw Error(response.error.code+': '+response.error.message);return copy(response.data);
  };
 }
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 let media;
 const dom=new JSDOM(renderAppsScript().html,{url:'https://st.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem('st.ui.v1.autosaveSeconds',String(autosaveSeconds));
  if(remember)w.localStorage.setItem('st.ui.v1.remember','yes');
  if(savedAccent)w.localStorage.setItem('st.ui.v1.accent',savedAccent);
  if(savedUiMode)w.localStorage.setItem('st.ui.v1.interfaceMode',savedUiMode);
  media={matches:false,addEventListener(_,fn){this.listener=fn;}};w.matchMedia=()=>media;
  w.confirm=()=>true;w.scrollBy=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
  function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,key)=>o[key]||((...args)=>{calls.push(key);w.setTimeout(()=>{try{if(fail)throw Error('offline');if(!api[key])throw Error('Unmocked '+key);success({ok:true,data:api[key](...args),...(key==='previewSheetImport'?{importVersion:'sheet-import-20261019-1'}:{})});}catch(e){failure(e);}},0);})});}
  w.google={script:{run:runner()}};
 }});
 await new Promise(r=>dom.window.addEventListener('load',r));await settle();
 const w=dom.window,d=w.document;
 return {w,d,dom,errors,calls,media,storedCases:()=>copy(cases),api,click:async selector=>{if(selector.startsWith('.message-dialog'))await waitFor(()=>d.querySelector(selector));d.querySelector(selector).click();await settle();},visible:id=>!d.getElementById(id).classList.contains('hidden')};
}
test('UI: session transitions finish the outgoing animation before switching screens',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  const animations=[];
  h.w.HTMLElement.prototype.animate=function(frames,options){
   let resolve,reject;const finished=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
   const animation={target:this,frames,options,finished,pause(){},play(){resolve();},finish(){resolve();},cancel(){reject(Error('cancelled'));}};
   animations.push(animation);return animation;
  };
  await h.click('#sign-in-button');await waitFor(()=>animations.some(a=>a.options.duration===180));
  const exit=animations.find(a=>a.options.duration===180);assert(h.visible('auth-panel'));assert(!h.visible('application'));exit.finish();
  await waitFor(()=>h.visible('application'));assert(animations.some(a=>a.target.id==='application'&&a.options.duration===480));
  await h.click('#cases-sign-out');await waitFor(()=>animations.some(a=>a.options.duration===140));
  assert(h.visible('application'));assert(!h.visible('auth-panel'));animations.find(a=>a.options.duration===140).finish();
  await waitFor(()=>h.visible('auth-panel'));assert(animations.some(a=>a.options.duration===260));
  assert.equal(h.d.activeElement.id,'sign-in-button');assert.deepEqual(h.errors,[]);
  const count=animations.length;h.media.matches=true;await h.click('#sign-in-button');await waitFor(()=>h.visible('application'));assert.equal(animations.length,count);
 }finally{h.dom.window.close();}
});

test('UI: Equipment exports current inputs to Sheets in both modes, opens a safe link and recovers from failure',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({uiMode,autosaveSeconds:180});try{
   await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view="equipment"]');
   let sent;h.api.exportEquipmentSheet=request=>{sent=JSON.parse(JSON.stringify(request));return {url:'https://docs.google.com/spreadsheets/d/new-export/edit'};};
   const card=h.d.querySelector('.equipment-card');card.querySelector('.equipment-name').value='Edited before save';
   const button=h.d.getElementById('export-equipment-sheet'),menu=button.closest('details');menu.open=true;
   button.click();assert(button.disabled);assert(!menu.open);await waitFor(()=>h.d.querySelector('.message-dialog a'));
   assert.equal(sent.caseId,'demo');assert.equal(sent.simulationName,'Simulation A');assert.equal(sent.equipment[0].name,'Edited before save');
   assert(!('simulations' in sent));assert(!('results' in sent));assert.equal(h.calls.filter(call=>call==='saveCase').length,0);
   const link=h.d.querySelector('.message-dialog a');assert.equal(link.href,'https://docs.google.com/spreadsheets/d/new-export/edit');assert.equal(link.target,'_blank');assert(link.rel.includes('noopener'));assert(!button.disabled);
   await h.click('.message-dialog .dialog-actions button');
   h.api.exportEquipmentSheet=()=>{throw Error('offline');};await h.click('#export-equipment-sheet');assert(!button.disabled);assert(h.d.getElementById('status').classList.contains('error'));
   h.api.exportEquipmentSheet=()=>({url:'javascript:alert(1)'});await h.click('#export-equipment-sheet');await waitFor(()=>h.d.querySelector('.message-dialog'));assert.equal(h.d.querySelector('.message-dialog a'),null);
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: new cases open Equipment and existing cases remember their exact header tab without Drive writes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({uiMode});try{
   await h.click('#sign-in-button');await h.click('#show-new-case');
   h.d.getElementById('new-case-name').value='New line';
   h.d.getElementById('new-case-form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
   await waitFor(()=>h.visible('editor-panel')&&h.d.documentElement.dataset.headerView==='equipment');
   assert.equal(h.d.documentElement.dataset.headerView,'equipment');
   await h.click('#home-cases');await h.click('.open-case');
   for(const tab of uiMode==='BASIC'?['conveyors','vgraph','simulation','whatif','equipment']:['vgraph','simulation','whatif','equipment']){
    await h.click('[data-basic-view="'+tab+'"]');
    assert.equal(h.d.documentElement.dataset.headerView,tab);
    await h.click('#home-cases');await h.click('.open-case');
    assert.equal(h.d.documentElement.dataset.headerView,tab);
   }
   assert.equal(h.calls.filter(name=>name==='saveCase').length,0);
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: unavailable comparison and corrupt remembered tabs fall back safely on reopen',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  await h.click('#sign-in-button');
  // Use the same configured workspace scope as the client.
  const folder=h.api.getBootstrap().settings.workspaceRootFolderId;
  const scoped='caseView.'+JSON.stringify(['preview@example.test',folder,'demo']);
  h.w.STPreferences.write(scoped,JSON.stringify({view:'comparison',basicView:'comparison'}));
  await h.click('.open-case');assert.equal(h.d.documentElement.dataset.headerView,'equipment');
  await h.click('#home-cases');h.w.STPreferences.write(scoped,'{invalid');
  await h.click('.open-case');assert.equal(h.d.documentElement.dataset.headerView,'simulation');
  await h.click('#home-cases');
  const record=h.api.getCase('demo');
  const sibling=JSON.parse(JSON.stringify(record.simulations[0]));sibling.id='second';sibling.name='Second';
  record.simulations.push(sibling);record.expectedRevision=record.revision;h.api.saveCase(record);
  await h.click('.open-case');await h.click('[data-basic-view="comparison"]');
  await h.click('#home-cases');await h.click('.open-case');
  assert.equal(h.d.documentElement.dataset.headerView,'comparison');assert(h.visible('comparison-panel'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: cases-only entry, accessible navigation, theme settings and remembered access',async()=>{
 const h=await setup();try{
  assert.equal(h.d.documentElement.dataset.theme,h.w.STPreferences.automaticThemeAt(new h.w.Date()));assert(h.visible('auth-panel'));assert(!h.visible('application'));
  h.d.getElementById('remember-session').checked=true;await h.click('#sign-in-button');
  assert(h.visible('cases-panel'));assert(!h.visible('case-sidebar'));assert.equal(h.d.querySelectorAll('[data-theme-picker]').length,1);assert(!h.d.querySelector('#auth-panel select'));for(const id of ['run-panel','editor-panel','results-panel','whatif-panel'])assert(!h.visible(id));
  assert.equal(h.d.querySelectorAll('.case-row').length,1);assert.equal(h.w.localStorage.getItem('st.ui.v1.remember'),'yes');
  await h.click('#cases-settings');assert(h.d.getElementById('settings-dialog').open);
  const theme=h.d.getElementById('settings-theme');theme.value='dark';theme.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.documentElement.dataset.theme,'dark');
  theme.value='auto';theme.dispatchEvent(new h.w.Event('change'));const nativeHour=h.w.Date.prototype.getHours;h.w.Date.prototype.getHours=()=>20;h.w.dispatchEvent(new h.w.Event('focus'));assert.equal(h.d.documentElement.dataset.theme,'dark');
  h.w.Date.prototype.getHours=()=>12;h.w.dispatchEvent(new h.w.Event('focus'));assert.equal(h.d.documentElement.dataset.theme,'light');h.w.Date.prototype.getHours=nativeHour;
  const field=h.d.getElementById('workspace-folder-id');field.value='new-folder';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.match(h.d.getElementById('settings-unsaved').textContent,/pending/);
  h.d.getElementById('settings-dialog').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));await waitFor(()=>!h.d.getElementById('settings-dialog').open);assert(!h.d.getElementById('settings-dialog').open);assert.equal(field.value,'new-folder');
  await h.click('#cases-settings');field.value='saved-folder';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);assert(!h.d.getElementById('settings-dialog').open);assert.equal(field.value,'saved-folder');
  await h.click('#collapse-sidebar');assert(h.d.getElementById('application').classList.contains('sidebar-collapsed'));
  await h.click('#cases-sign-out');assert(h.visible('auth-panel'));assert.equal(h.w.localStorage.getItem('st.ui.v1.remember'),null);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
 const remembered=await setup({remember:true});assert(remembered.visible('application'));remembered.dom.window.close();
});
test('UI: remove Gemini key requires confirmation and immediately updates its saved state',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('#cases-settings');
  const button=h.d.getElementById('gemini-delete-key');assert(!button.disabled);
  const key=h.d.getElementById('gemini-api-key');
  assert.equal(key.value,'');assert.match(key.placeholder,/^\*+$/);
  assert.equal(button.parentElement,key.parentElement);assert.equal(button.getAttribute('aria-label'),'Remove API key');
  await h.click('#gemini-delete-key');assert(h.d.querySelector('.message-dialog[open]'));
  await h.click('.message-dialog .dialog-actions .ghost');assert(!button.disabled);assert(!h.calls.includes('deleteGeminiApiKey'));
  await h.click('#gemini-delete-key');await h.click('.message-dialog .danger');
  await waitFor(()=>button.disabled && /No API key configured/.test(h.d.getElementById('gemini-key-status').textContent));
  assert.equal(h.calls.filter(name=>name==='deleteGeminiApiKey').length,1);
  assert.equal(key.value,'');assert.equal(key.placeholder,'Enter your API key');
  assert.equal(h.d.querySelectorAll('.case-row').length,1);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: run, edit, clone, compare, and delete retain the existing engine workflow',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');assert(h.visible('run-panel'));assert(!h.visible('editor-panel'));
  await h.click('.sidebar [data-view="editor"]');assert(h.visible('editor-panel'));assert.equal(h.d.querySelectorAll('.equipment-card').length,13);
  await h.click('.equipment-card');assert(h.d.querySelector('.equipment-card').classList.contains('equipment-selected'));
  await h.click('.sidebar [data-view="simulation"]');h.d.getElementById('run-duration').value='60';await h.click('#run-simulation');await settle();await h.click('#pause-simulation');
  assert.equal(h.d.querySelectorAll('.live-equipment-card').length,13,h.d.getElementById('status').textContent+' '+JSON.stringify(h.errors));await h.click('.loss-toggle');assert(h.d.querySelector('.live-equipment-card').classList.contains('show-losses'));
  await h.click('.sidebar [data-view="results"]');assert(h.visible('results-panel'));assert.equal(h.d.querySelectorAll('#results-table tbody tr').length,13);
  assert.match(h.d.getElementById('results-reference').textContent,/equipment-minutes/);assert(!h.d.getElementById('export-ai').disabled);
  await h.click('.sidebar [data-view="editor"]');await h.click('#clone-case');await settle();
  await h.click('.sidebar [data-view="whatif"]');assert(h.visible('whatif-panel'));assert(!h.visible('comparison-panel'));await h.click('.workspace-tab-comparison');assert(h.visible('comparison-panel'));assert(!h.visible('whatif-panel'));assert(h.d.querySelector('#case-comparison-content .comparison-context'));
  await h.click('.sidebar [data-view="simulation"]');await h.click('#run-simulation');await settle();await h.click('#pause-simulation');
  await h.click('.workspace-tab-comparison');assert(h.d.querySelector('#case-comparison-content table'));assert.match(h.d.getElementById('case-comparison-content').textContent,/Absolute Δ/);
  await h.click('.sidebar [data-view="simulation"]');assert(h.d.getElementById('run-duration').disabled);h.d.getElementById('run-duration').value='90';h.d.getElementById('run-duration').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert(h.visible('simulation-results'),'run settings cannot invalidate a paused simulation');assert.equal(h.d.getElementById('run-duration').value,'60');
  await h.click('#home-cases');await h.click('.delete-gallery-case');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .danger');await waitFor(()=>h.d.querySelectorAll('.case-row').length===0);assert(h.visible('cases-panel'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: compact case pagination, search and filters',async()=>{
 const h=await setup({many:true});try{
  await h.click('#sign-in-button');assert.equal(h.d.querySelectorAll('.case-row').length,24);await h.click('#case-pagination button:last-child');assert.match(h.d.getElementById('case-pagination').textContent,/Page 2/);
  const search=h.d.getElementById('case-search');search.value='Line 59';search.dispatchEvent(new h.w.Event('input'));assert.equal(h.d.querySelectorAll('.case-row').length,1);
  const filter=h.d.getElementById('case-filter');filter.value='draft';filter.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.querySelectorAll('.case-row').length,0);assert.match(h.d.getElementById('cases-list').textContent,/No matching/);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: network failure restores entry and reports the error',async()=>{
 const h=await setup({fail:true});try{await h.click('#sign-in-button');assert(h.visible('auth-panel'));assert(!h.d.getElementById('sign-in-button').disabled);assert.match(h.d.getElementById('auth-status').textContent,/NETWORK_ERROR/);assert.deepEqual(h.errors,[]);}finally{h.dom.window.close();}
});
test('UI: automatic edits survive reload and simulation rename/delete uses reusable dialogs',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  assert(h.d.getElementById('save-case').classList.contains('hidden'));assert(!h.d.querySelector('#save-workspace-case,#settings-save,#reload-case,.delete-case'));
  const name=h.d.querySelector('.equipment-name');name.value='Automatically saved equipment';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].name==='Automatically saved equipment');assert.equal(h.d.activeElement===name,false);
  assert.equal(h.d.getElementById('autosave-status').textContent,'Saved');
  await h.click('#clone-case');await waitFor(()=>h.storedCases()[0].simulations?.length===2);
  await h.click('#rename-simulation');const dialog=h.d.querySelector('.message-dialog');assert(dialog.open);const input=dialog.querySelector('input');input.value='Proposed B';await h.click('.message-dialog .dialog-actions button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations[1].name==='Proposed B');
  await h.click('#delete-simulation');await h.click('.message-dialog .dialog-actions button:first-child');assert.equal(h.storedCases()[0].simulations.length,2);
  await h.click('#delete-simulation');await h.click('.message-dialog .danger');await waitFor(()=>h.storedCases()[0].simulations.length===1);
  await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.querySelector('.equipment-name').value,'Automatically saved equipment');
  assert.deepEqual(Array.from(h.d.querySelector('#run-playback-rate').options).map(o=>o.value),['1','5','10','50','100','200','500','1000']);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: local and Gemini chat buttons clone only validated changes into persistent scenarios',async()=>{
 const h=await setup();try{
  stubScenarioGain(h);
  h.api.createScenario=request=>{
    const source=h.storedCases()[0],simulation=source.simulations.find(s=>s.id===request.simulationId);
    assert.equal(request.sourceSignature,h.w.STScenarios.signature(simulation));
    const copy=h.w.STScenarios.apply(simulation,request.proposal.changes);copy.id='scenario-'+source.simulations.length;copy.name=request.proposal.title;copy.scenario={changes:request.proposal.changes,sourceSimulationId:simulation.id};
    source.simulations.push(copy);const saved=h.api.saveCase({...source,expectedRevision:source.revision});return {case:saved,simulationId:copy.id};
  };
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  assert.equal(h.d.querySelectorAll('.scenario-tier-grid>article').length,4);assert(!h.d.querySelector('.scenario-tier-grid').textContent.includes('Not enough evidence'));assert.match(h.d.querySelector('.scenario-tier-grid').textContent,/Static inputs only/);
  await h.click('.scenario-tier-grid .scenario-evaluate');await waitFor(()=>!h.d.querySelector('.scenario-tier-grid .scenario-create').disabled);await h.click('.scenario-tier-grid .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  assert(!h.storedCases()[0].simulations[0].results);assert.equal(h.storedCases()[0].simulations[1].results,null);
  h.api.askGemini=request=>{
    const source=h.storedCases()[0].simulations.find(s=>s.id===request.simulationId),proposal=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);
    assert(proposal);return {text:'Review these input changes.',proposals:[{...proposal,title:'Chat proposal'}]};
  };
  await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Suggest an improvement';await h.click('#send-gemini');await waitFor(()=>{const button=h.d.querySelector('#gemini-messages .gemini-scenario-create');return button&&!button.disabled;});
  await h.click('#gemini-messages .gemini-scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===3);
  assert.equal(h.storedCases()[0].simulations[2].name,'Chat proposal');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: Gemini cannot rebind an old proposal to a different persisted server record',async()=>{
 const h=await setup();try{
  stubScenarioGain(h);
  let expectedSignature;
  h.api.getScenarioSourceSignature=request=>{const record=h.storedCases()[0];assert.equal(request.expectedRevision,record.revision);expectedSignature='server-fingerprint-'+record.revision;return {revision:record.revision,simulationId:request.simulationId,signature:expectedSignature};};
  h.api.createScenario=request=>{assert.equal(request.sourceSignature,expectedSignature);const record=h.storedCases()[0],source=record.simulations.find(s=>s.id===request.simulationId);const clone=h.w.STScenarios.apply(source,request.proposal.changes);clone.id='verified-scenario';clone.name=request.proposal.title;record.simulations.push(clone);return {case:h.api.saveCase({...record,expectedRevision:record.revision}),simulationId:clone.id};};
  h.api.askGemini=request=>{const source=h.storedCases()[0].simulations.find(s=>s.id===request.simulationId),proposal=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);return {text:'Review this proposal.',proposals:[{...proposal,title:'Chat proposal'}]};};
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#toggle-gemini');
  h.d.getElementById('gemini-question').value='Suggest an improvement';await h.click('#send-gemini');
  await waitFor(()=>{const button=h.d.querySelector('#gemini-messages .gemini-scenario-create');return button&&!button.disabled;});
  await h.click('#gemini-messages .gemini-scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:last-child');
  await waitFor(()=>h.d.getElementById('status').textContent.includes('changed'));assert.equal(h.storedCases()[0].simulations.length,1);assert(!h.calls.includes('createScenario'));
  assert(h.calls.includes('getScenarioSourceSignature'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI + Apps Script: a local proposal with a different fingerprint is regenerated from saved inputs',async()=>{
 const h=await setup({realScenarioServer:true,fingerprintMismatch:true});try{
  stubScenarioGain(h);
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  await h.click('.scenario-tier-grid .scenario-evaluate');await waitFor(()=>!h.d.querySelector('.scenario-tier-grid .scenario-create').disabled);await h.click('.scenario-tier-grid .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const simulations=h.storedCases()[0].simulations;
  assert.equal(simulations[1].clonedFromSimulationId,simulations[0].id);
  assert.equal(simulations[1].dynamicConfig.seed,simulations[0].dynamicConfig.seed);
  assert.equal(simulations[1].scenario.origin,'LOCAL');assert.equal(simulations[1].results,null);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: invalid JSON remains visible and blocks closing until corrected; failed remembered entry returns to login',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const json=h.d.querySelector('.equipment-noise-profile'),previous=json.value;json.value='{invalid';json.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#home-cases');assert(!h.visible('cases-panel'));assert.equal(json.value,'{invalid');assert.match(h.d.getElementById('status').textContent,/JSON/);
  json.value=previous;json.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#home-cases');await waitFor(()=>h.visible('cases-panel'));assert(h.visible('cases-panel'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
 const failed=await setup({remember:true,fail:true});try{assert(failed.visible('auth-panel'));assert(!failed.d.documentElement.classList.contains('restoring-session'));}finally{failed.dom.window.close();}
});
test('styles have valid selectors and all required custom properties are defined',()=>{
 const html=renderAppsScript().html,parsed=new JSDOM(html),css=Array.from(parsed.window.document.querySelectorAll('style')).map(el=>el.textContent).join('\n');parsed.window.close();const ast=postcss.parse(css),defined=new Set(),used=new Set();
 ast.walkRules(rule=>{selectorParser().astSync(rule.selector);assert.doesNotMatch(rule.selector,/:\s+(?:hover|not|active|disabled)/);});
 ast.walkDecls(decl=>{if(decl.prop.startsWith('--'))defined.add(decl.prop);for(const m of decl.value.matchAll(/var\((--[\w-]+)\s*\)/g))used.add(m[1]);});
 assert.deepEqual([...used].filter(name=>!defined.has(name)),[]);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'IDs must remain unique');
});
test('semantic text and chart colors retain contrast in both palettes',()=>{
 const ast=postcss.parse(read('DesignTokens.html').replace(/<\/?style>/g,'')),base={},dark={};
 ast.walkRules(rule=>{if(rule.selector.includes('data-accent'))return;const target=rule.selector.includes('data-theme')?dark:base;rule.walkDecls(d=>{target[d.prop]=d.value;});});
 function resolve(map,key){let value=map[key];for(let i=0;i<8&&value?.startsWith('var(');i++)value=map[value.slice(4,-1)];return value;}
 function luminance(hex){let c=hex.replace('#','');if(c.length===3)c=c.split('').map(v=>v+v).join('');return [0,2,4].map((p)=>parseInt(c.slice(p,p+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
 function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
 for(const [name,palette] of [['light',base],['dark',{...base,...dark}]]) {
  for(const [fg,bg] of [['ink','surface'],['muted','surface'],['muted','surface-soft'],['on-accent','accent'],['selected-text','selected'],...['success','warning','danger','info','critical','running','stopped','starved','blocked','failure'].map(k=>[k,k+'-soft'])])assert(contrast(resolve(palette,'--'+fg),resolve(palette,'--'+bg))>=4.5,name+': '+fg);
  for(let i=0;i<13;i++)assert(contrast(resolve(palette,'--series-'+i),resolve(palette,'--surface'))>=3,name+': series '+i);
 }
});

test('UI: Gemini panel sends case questions, closes, and clears on sign out',async()=>{
 const h=await setup();try{
 await h.click('#sign-in-button');await h.click('.open-case');assert.equal(h.w.getComputedStyle(h.d.getElementById('case-sidebar')).display,'none');
 await h.click('#toggle-gemini');assert(h.visible('gemini-panel'));
 h.d.getElementById('gemini-question').value='Where is the bottleneck?';await h.click('#send-gemini');await waitFor(()=>h.d.getElementById('gemini-messages').textContent.includes('Analysis of the saved case'));assert(h.calls.includes('askGemini'));assert.match(h.d.getElementById('gemini-messages').textContent,/Analysis of the saved case/);
 await h.click('#close-gemini');assert(!h.visible('gemini-panel'));
 await h.click('#open-settings');await h.click('[data-accent="ocean-liner"].accent-choice');assert.equal(h.d.documentElement.dataset.accent,'ocean-liner');await h.click('#settings-close');
 await h.click('#sign-out');assert.equal(h.d.getElementById('gemini-messages').textContent,'');assert(!h.visible('gemini-panel'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: compact editor reorders equipment with keyboard and preserves values',async()=>{
 const h=await setup();try{
 await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
 const ids=()=>Array.from(h.d.querySelectorAll('.equipment-id')).map(x=>x.value);const before=ids();
 h.d.querySelector('.equipment-drag').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 assert.equal(ids()[1],before[0]);assert.equal(ids()[0],before[1]);assert.equal(h.d.querySelectorAll('.move-up,.move-down').length,0);
 assert.equal(h.d.querySelector('.remove-equipment').textContent,'');assert(!h.d.querySelector('.toggle-step'));
 await h.click('#open-settings');assert.equal(h.d.querySelectorAll('.accent-choice').length,57);assert(!h.d.getElementById('settings-save'));assert(!h.d.querySelector('.dialog-body #settings-cancel'));
 await h.click('#settings-cancel');assert(!h.d.getElementById('status').textContent.includes('Loading console'));
 await h.click('#toggle-gemini');const grip=h.d.getElementById('gemini-resize');const initial=Number(grip.getAttribute('aria-valuenow'));grip.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft'}));assert(Number(grip.getAttribute('aria-valuenow'))>initial);
 assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: selective Sheet reload updates the active simulation, preserves other runs and saves selection',async()=>{
 const h=await setup();try{
 async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate())return;await settle();}assert(predicate(),'Asynchronous UI did not settle');}
 await h.click('#sign-in-button');await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value='30';await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');await h.click('#clone-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');
 let before=h.storedCases()[0];assert.equal(before.simulations.length,2,JSON.stringify({calls:h.calls,errors:h.errors,status:h.d.getElementById('status').textContent}));const simId=before.simulations[1].id,firstId=before.equipment[0].id,oldMTBF=before.equipment[0].noiseProfile.reliability.mtbfMinutes;
 const field=h.d.querySelector('.equipment-name');field.value='Local equipment name';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));
 await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');
 await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
 assert.match(h.d.getElementById('sheet-import-preview').textContent,/Current/);assert.match(h.d.getElementById('sheet-import-preview').textContent,/Local equipment name/);
 const target=h.d.querySelector('.sheet-target');target.value=firstId;target.dispatchEvent(new h.w.Event('change'));
 Array.from(h.d.querySelectorAll('#sheet-import-preview button')).find(b=>b.textContent==='Deselect all fields').click();
 const mtbf=h.d.querySelector('[data-source-index="0"] [data-field="mtbf"]');mtbf.checked=true;mtbf.dispatchEvent(new h.w.Event('change'));
 h.d.getElementById('sheet-import-ack').checked=true;h.d.getElementById('sheet-import-ack').dispatchEvent(new h.w.Event('change'));assert(!h.d.getElementById('sheet-import-apply').disabled);await h.click('#sheet-import-apply');
 await waitFor(()=>h.storedCases()[0].equipment[0].noiseProfile.reliability.mtbfMinutes===oldMTBF+60);
 let record=h.storedCases()[0];assert.equal(record.simulations.length,2);assert.equal(record.simulations[1].id,simId);assert.equal(record.equipment.length,13);assert.equal(record.equipment[0].id,firstId);assert.equal(record.equipment[0].name,'Local equipment name');assert.equal(record.equipment[0].noiseProfile.reliability.mtbfMinutes,oldMTBF+60);assert.equal(record.simulations[1].results,null);assert(record.simulations[0].results.summary);
 assert.deepEqual(record.simulations[1].sourceImport.lastApplied.equipment[0].fields.map(f=>f.field),['mtbf']);
 await h.click('#home-cases');await h.click('.open-case');await h.click('#workspace-tabs button:nth-child(2)');record=h.storedCases()[0];assert.equal(record.simulations.length,2);assert.equal(record.simulations[1].equipment[0].name,'Local equipment name');assert.equal(record.simulations[1].equipment[0].noiseProfile.reliability.mtbfMinutes,oldMTBF+60);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: empty simulation imports all selected equipment without creating another simulation',async()=>{
 const h=await setup({empty:true});try{
 await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
 h.d.getElementById('sheet-import-ack').checked=true;h.d.getElementById('sheet-import-ack').dispatchEvent(new h.w.Event('change'));await h.click('#sheet-import-apply');
 await waitFor(()=>h.storedCases()[0].equipment.length===3);const record=h.storedCases()[0];assert.equal(record.simulations.length,1);assert.equal(record.equipment.length,3);assert.equal(record.simulations[0].sourceImport.metadata.site,'Synthetic site');await waitFor(()=>h.storedCases()[0].equipment.length===3);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: invalid source fields are unavailable and cancel leaves equipment intact',async()=>{
 const h=await setup({invalidSheet:true});try{
 await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
 assert.match(h.d.getElementById('sheet-import-preview').textContent,/D10:E10/);assert(h.d.querySelector('[data-source-index="0"] [data-field="mtbf"]').disabled);await h.click('#sheet-import-cancel');assert.equal(h.d.querySelectorAll('.equipment-card').length,13);assert.equal(h.d.getElementById('sheet-import-preview').textContent,'');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: opening and navigating a saved case performs no write; playback speed belongs to its simulation',async()=>{
 const h=await setup({realScenarioServer:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');
  await h.click('.sidebar [data-view="editor"]');await h.click('.sidebar [data-view="results"]');await h.click('.sidebar [data-view="whatif"]');
  await new Promise(resolve=>setTimeout(resolve,600));assert.equal(h.calls.filter(name=>name==='saveCase').length,0);
  assert(!h.d.getElementById('playback-rate'));
  const collapse=h.d.getElementById('collapse-sidebar'),path=collapse.querySelector('path').getAttribute('d');
  await h.click('#collapse-sidebar');assert.notEqual(collapse.querySelector('path').getAttribute('d'),path);
  await h.click('#collapse-sidebar');assert.equal(collapse.querySelector('path').getAttribute('d'),path);
  await h.click('.sidebar [data-view="simulation"]');const speed=h.d.getElementById('run-playback-rate');speed.value='50';speed.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].simulations[0].playbackRate===50);
  await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.getElementById('run-playback-rate').value,'50');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: Gemini shows real request stages and clears progress on changing case',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#toggle-gemini');
  h.d.getElementById('gemini-question').value='Review this line';await h.click('#send-gemini');
  await waitFor(()=>h.d.querySelectorAll('#gemini-progress [data-state="done"]').length===3);
  assert.equal(h.d.getElementById('gemini-progress').getAttribute('aria-busy'),'false');
  await h.click('#home-cases');assert(h.d.getElementById('gemini-progress').classList.contains('hidden'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: saved key mask is never submitted and replacement restores the mask',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('#cases-settings');
  const submitted=[];h.api.saveUserSettings=value=>{submitted.push(value);return value;};
  const model=h.d.getElementById('gemini-model'),key=h.d.getElementById('gemini-api-key');
  model.value='gemini-test';model.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#settings-cancel');
  assert.equal(submitted[0].gemini.apiKey,'');assert.match(key.placeholder,/^\*+$/);
  await h.click('#cases-settings');
  key.value='replacement-test-key';key.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#settings-cancel');
  assert.equal(submitted[1].gemini.apiKey,'replacement-test-key');
  assert.equal(key.value,'');assert.match(key.placeholder,/^\*+$/);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: failed Gemini requests stop progress without a pending response',async()=>{
 const h=await setup();try{
  h.api.askGemini=()=>{throw Error('Gemini is temporarily unavailable (HTTP 503).');};
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#toggle-gemini');
  h.d.getElementById('gemini-question').value='Review this line';await h.click('#send-gemini');
  await waitFor(()=>h.d.querySelector('#gemini-progress [data-state="error"]'));
  const progress=h.d.getElementById('gemini-progress');
  assert.equal(progress.getAttribute('aria-busy'),'false');
  assert.equal(progress.querySelectorAll('[data-state="pending"]').length,0);
  assert(!progress.textContent.includes('Response ready'));
  assert.match(h.d.getElementById('gemini-error').textContent,/connection to Apps Script failed/);
 }finally{h.dom.window.close();}
});

test('UI: Sheet preview keeps pitch warnings selectable and shows them beside the field',async()=>{
 const h=await setup({empty:true});try{
  const original=h.api.previewSheetImport;
  h.api.previewSheetImport=()=>{
   const data=original();data.metadata.containerSizeOz=5.5;
   const conveyor=data.equipment.find(e=>e.type==='CONVEYOR');
   conveyor.processData.upstream.packageLengthMm=110;conveyor.processData.upstream.dischargePitchMm=88.9;
   data.warnings=[{cell:'L11',message:'Discharge pitch is smaller than package length (K11). Verify before simulation.'}];
   return data;
  };
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
  const section=h.d.querySelector('[data-source-index="1"]'),pitch=section.querySelector('[data-field="pitch"]');
  assert.equal(section.querySelector('select').value,'new');assert(pitch.checked);assert(!pitch.disabled);
  assert.match(pitch.closest('tr').textContent,/88.9/);assert.match(pitch.closest('tr').textContent,/smaller than package length/);
  assert.match(h.d.getElementById('sheet-import-preview').textContent,/5.5/);
  const review=h.d.getElementById('sheet-import-model-review');
  assert(review.open,'A draft that cannot run must show the review');
  assert.match(review.textContent,/Blowmolder discharge conveyor/);assert.match(review.textContent,/K11/);assert.match(review.textContent,/L11/);assert.match(review.textContent,/Q11/);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: preview machine type override preserves names and reaches the imported simulation',async()=>{
 const h=await setup({empty:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
  const section=h.d.querySelector('[data-source-index="0"]'),select=section.querySelector('.sheet-machine-type');
  assert(select);const originalName=section.querySelector('[data-field="name"]').closest('tr').textContent;
  select.value='SLEEVER';select.dispatchEvent(new h.w.Event('change'));
  assert.equal(h.d.querySelector('[data-source-index="0"] .sheet-machine-type').value,'SLEEVER');
  assert.equal(h.d.querySelector('[data-source-index="0"] [data-field="name"]').closest('tr').textContent,originalName);
  await h.click('#sheet-import-ack');await h.click('#sheet-import-apply');
  assert.equal(h.d.querySelector('.equipment-type').value,'SLEEVER');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: invalid physical inputs expose equipment and validation details',async()=>{
 const h=await setup();try{
  const original=h.api.getCase;
  h.api.getCase=id=>{const record=original(id);for(const units of [record.equipment,record.simulations[0].equipment])units[1].nominalRatePerSecond=0;return record;};
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#run-simulation');
  await waitFor(()=>h.d.querySelector('#status li'));
  assert.match(h.d.getElementById('status').textContent,/nominalRatePerSecond/);
  assert.match(h.d.getElementById('status').textContent,/greater than zero/);
  assert.match(h.d.getElementById('status').textContent,/Blowmolder discharge conveyor/);
 }finally{h.dom.window.close();}
});

test('UI: negative-gap proposals require acceptance, support undo and cancel, and retain source provenance',async()=>{
 const h=await setup({empty:true});try{
  const original=h.api.previewSheetImport;
  h.api.previewSheetImport=()=>{
   const data=original(),unit=data.equipment[1];
   unit.processData.upstream.packageLengthMm=110;unit.processData.upstream.dischargePitchMm=88.9;
   unit.processData.accumulation.conveyorSpeedFactorPercent=0;
   unit.processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent=0;
   data.sourceRows=[{row:11,values:{conveyorSpeedFactorVsDischargeVelocityPercent:0}}];
   return data;
  };
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  async function preview(){await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');}
  await preview();
  const panel=()=>h.d.querySelector('[data-correction-row="11"]');
  assert(panel(),JSON.stringify(h.errors)+' '+h.d.getElementById('sheet-import-error').textContent);assert.match(panel().textContent,/-21.1/);assert.match(panel().textContent,/23.74/);
  assert.equal(h.calls.filter(x=>x==='saveCase').length,0);
  await h.click('#sheet-import-ack');await h.click('.correction-accept');
  assert(!h.d.getElementById('sheet-import-ack').checked);
  assert.match(panel().textContent,/Accepted for preview/);
  await h.click('.correction-undo');assert(h.d.querySelector('.correction-accept'));
  await h.click('.correction-accept');await h.click('#sheet-import-cancel');
  assert.equal(h.storedCases()[0].simulations[0].equipment.length,0);
  await preview();assert(h.d.querySelector('.correction-accept'));assert(!h.d.querySelector('.correction-undo'));
  await h.click('.correction-accept');await h.click('#sheet-import-ack');await h.click('#sheet-import-apply');
  await waitFor(()=>h.storedCases()[0].equipment.length===3);const record=h.storedCases()[0],unit=record.equipment[1];
  assert.equal(unit.processData.accumulation.conveyorSpeedFactorPercent,23.74);
  const source=record.simulations[0].sourceImport;
  assert.equal(source.rows[0].values.conveyorSpeedFactorVsDischargeVelocityPercent,0);
  assert.equal(source.lastApplied.equipment[1].fields.find(f=>f.field==='speedFactor').adjustment.value,23.74);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: shared equipment inspector preserves drafts, saves the selected equipment and keeps Gemini history',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const cards=Array.from(h.d.querySelectorAll('#equipment-list .equipment-card'));
  await h.click('.equipment-card');assert(h.visible('equipment-inspector'));assert(!h.visible('gemini-chat-view'));
  assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  const pane=h.d.getElementById('equipment-inspector');
  for(const field of pane.querySelectorAll('input,select,textarea'))assert(h.d.getElementById(field.getAttribute('aria-describedby'))?.textContent);
  const name=pane.querySelector('.equipment-name');name.value='Edited in inspector';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].name==='Edited in inspector');
  const json=pane.querySelector('.equipment-noise-profile'),original=json.value;json.value='{';json.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  cards[1].click();assert.equal(pane.querySelector('.equipment-type').value,'CONVEYOR');
  cards[0].click();assert.equal(pane.querySelector('.equipment-noise-profile').value,'{');
  json.value=original;json.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#toggle-gemini');assert(h.visible('gemini-chat-view'));assert(!h.visible('equipment-inspector'));
  h.d.getElementById('gemini-question').value='Check this line';await waitFor(()=>!h.d.getElementById('send-gemini').disabled);await h.click('#send-gemini');await waitFor(()=>h.d.getElementById('gemini-messages').textContent.includes('Analysis of the saved case.'));
  cards[0].click();assert.equal(pane.querySelector('.equipment-name').value,'Edited in inspector');
  await h.click('#toggle-gemini');assert.match(h.d.getElementById('gemini-messages').textContent,/Analysis of the saved case/);
  cards[0].click();await h.click('#equipment-inspector .json-example');
  assert(h.d.getElementById('json-help-dialog').open);assert.deepEqual(JSON.parse(h.d.getElementById('json-help-code').value),{criticalMachine:true});
  assert(h.d.getElementById('json-help-fields').textContent.includes('criticalMachine'));await h.click('#json-help-copy');assert.match(h.d.getElementById('json-copy-status').textContent,/Ctrl|Copied/);
  await h.click('#json-help-close');await h.click('.sidebar [data-view="simulation"]');assert(!h.visible('equipment-inspector'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: pointer sorting previews neighboring positions before release and Escape cancels without saving',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const list=()=>Array.from(h.d.querySelectorAll('#equipment-list .equipment-card')),before=list().map(c=>c.dataset.equipmentId);
  list().forEach((c,i)=>{c.getBoundingClientRect=()=>({top:100+i*80,height:60});});
  const handle=list()[0].querySelector('.equipment-drag');let captured=false;handle.setPointerCapture=()=>{captured=true;};handle.hasPointerCapture=()=>captured;handle.releasePointerCapture=()=>{captured=false;};
  const event=(y)=>({button:0,clientY:y,pointerId:1,preventDefault(){}});
  handle.onpointerdown(event(130));handle.onpointermove(event(290));
  assert.match(list()[1].style.transform,/-/);assert.match(list()[2].style.transform,/-/);assert.deepEqual(list().map(c=>c.dataset.equipmentId),before);assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  h.w.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape'}));assert(list().every(c=>c.style.transform===''));assert.deepEqual(list().map(c=>c.dataset.equipmentId),before);
  handle.onpointerdown(event(130));handle.onpointermove(event(290));handle.onpointerup(event(290));
  assert.equal(list()[2].dataset.equipmentId,before[0]);await waitFor(()=>h.storedCases()[0].equipment[2].id===before[0]);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: shift replications save compact results, reopen and expose statistics separately',async()=>{
 const h=await setup({realScenarioServer:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');
  const mode=h.d.getElementById('duration-mode');mode.value='SHIFTS';mode.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  for(const [id,value] of [['run-shift-hours','0.25'],['run-shift-count','2'],['run-rounds','2']]){const el=h.d.getElementById(id);el.value=value;el.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  await h.click('#run-simulation');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
  await h.click('#pause-simulation');await h.click('.sidebar [data-view="results"]');
  assert(h.visible('batch-results'));assert.match(h.d.getElementById('batch-results').textContent,/Standard deviation/);
  const saved=h.storedCases()[0].simulations[0];assert.equal(saved.results.durationSeconds,1800);assert.equal(saved.results.batch.rows[0].shifts.length,2);assert(!saved.results.replay.batch);
  assert(saved.results.replay.samples.length>=2&&saved.results.replay.samples.length<=361);
  assert.equal(saved.results.replay.samples[0].virtualSecond,0);assert.equal(saved.results.replay.samples.at(-1).virtualSecond,1800);
  if(saved.results.replay.samples.length<361)assert(saved.results.replay.detailCoverage.savedReplaySampled);
  assert.equal(saved.results.batch.replays.length,0);
  await h.click('.sidebar [data-view="simulation"]');assert(h.d.getElementById('playback-round-control').classList.contains('hidden'));
  assert(!h.d.querySelector('.live-control-stop').disabled);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="results"]');
  assert(h.visible('batch-results'));assert.equal(h.d.getElementById('run-rounds').value,'2');assert.equal(h.d.getElementById('run-shift-count').value,'2');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: a live control in round one recalculates every round with the same event',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');
  for(const [id,value] of [['run-duration','60'],['run-sample-interval','1'],['run-rounds','2']]){const el=h.d.getElementById(id);el.value=value;el.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  await h.click('#run-simulation');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
  await h.click('#pause-simulation');await h.click('#home-cases');await waitFor(()=>h.visible('cases-panel'));await h.click('.open-case');await waitFor(()=>!h.visible('cases-panel')&&h.visible('simulation-results'));
  await h.click('#reset-playback');assert.equal(h.d.getElementById('metric-time').textContent,'0 s');await h.click('.live-control-stop');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.commands?.length===1);
  const saved=h.storedCases()[0].simulations[0];assert.equal(saved.dynamicConfig.commands[0].atVirtualSecond,0);
  assert.equal(saved.results.batch,undefined,'event changes invalidate old replica statistics');
  assert.equal(saved.results.replicationStatus.state,'STALE');
  h.d.getElementById('run-playback-rate').value=100;await h.click('#play-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rows.every(r=>r.summary.outputCount===0));
  assert(!h.d.getElementById('rounds-warning').classList.contains('hidden'));assert.equal(h.storedCases()[0].simulations[0].results.batch.replays.length,0);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: later rounds calculate metrics without advancing playback away from round one',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');
  for(const [id,value] of [['run-duration','2'],['run-sample-interval','1'],['run-rounds','2']]){const el=h.d.getElementById(id);el.value=value;el.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  await h.click('#run-simulation');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
  await h.click('#reset-playback');
  assert.equal(h.d.getElementById('playback-round').value,'0');assert(h.d.getElementById('playback-round-control').classList.contains('hidden'));
  assert(!h.d.querySelector('.live-control-stop').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: exclusive equipment filters preserve hidden records, order and saved values',async()=>{
 const h=await setup({realScenarioServer:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const before=h.storedCases()[0],ids=before.equipment.map(e=>e.id);
  const visible=()=>Array.from(h.d.querySelectorAll('#equipment-list .equipment-card:not(.hidden)'));
  await h.click('[name="equipment-filter"][value="conveyors"]');assert.equal(visible().length,6);
  assert.equal(h.d.querySelectorAll('[name="equipment-filter"]:checked').length,1);assert(visible().every(c=>c.querySelector('.equipment-drag').disabled));
  await h.click('[name="equipment-filter"][value="equipment"]');assert.equal(visible().length,7);
  assert.equal(h.calls.filter(x=>x==='saveCase').length,0);
  visible()[0].click();const input=h.d.querySelector('#equipment-inspector .equipment-name');input.value='Edited through filter';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].name==='Edited through filter');
  const saved=h.storedCases()[0];assert.deepEqual(saved.equipment.map(e=>e.id),ids);assert.deepEqual(saved.equipment.map(e=>e.nominalRatePerSecond),before.equipment.map(e=>e.nominalRatePerSecond));
  await h.click('[name="equipment-filter"][value="all"]');assert.equal(visible().length,13);assert(visible().every(c=>!c.querySelector('.equipment-drag').disabled));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: BPM edits convert once and survive reload independently of the flow unit',async()=>{
 const h=await setup({realScenarioServer:true,flowUnit:'cases'});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  h.d.querySelector('.equipment-card').click();const rate=h.d.querySelector('#equipment-inspector .equipment-rate');
  assert(Math.abs(Number(rate.value)-h.storedCases()[0].equipment[0].nominalRatePerSecond*60)<1e-9);
  assert.equal(h.d.getElementById('unit-of-flow'),null);
  rate.value='345.5';rate.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].nominalRatePerSecond===345.5/60);
  assert.match(h.d.querySelector('.equipment-header strong').textContent,/345.5 BPM/);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');h.d.querySelector('.equipment-card').click();
  assert.equal(h.d.querySelector('#equipment-inspector .equipment-rate').value,'345.5');assert.equal(h.storedCases()[0].unitOfFlow,'cases');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: conveyor speed and spacing controls survive autosave and reopening and drive the engine',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  h.d.querySelectorAll('.equipment-card')[1].click();
  const field=name=>h.d.querySelector('#equipment-inspector .format-zone-'+name);
  assert(field('belt-speed').disabled);
  field('speed-mode').value='MANUAL';field('speed-mode').dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert(!field('belt-speed').disabled);assert(field('speed-factor').disabled);
  for(const [name,value] of [['belt-speed','500'],['moving-gap','20'],['accumulated-gap','0']]){field(name).value=value;field(name).dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  assert.match(h.d.querySelector('#equipment-inspector .format-zone-preview').textContent,/500/);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');h.d.querySelectorAll('.equipment-card')[1].click();
  assert.equal(field('speed-mode').value,'MANUAL');assert.equal(field('belt-speed').value,'500');assert.equal(field('moving-gap').value,'20');
  const saved=h.storedCases()[0].simulations[0].equipment;
  const belt=saved[1];assert.equal(belt.processData.accumulation.conveyorSpeedMmPerSecond,500);
  assert.equal(belt.processData.accumulation.movingGapMm,20);assert.equal(belt.processData.accumulation.accumulatedGapMm,0);
  const response=h.w.SimulatorEngine.simulateLine({case:{id:'saved',unitOfFlow:'bottles',equipment:saved},run:{durationSeconds:20,tickSeconds:0.25,sampleEverySeconds:1,seed:42}});
  assert.equal(response.ok,true,JSON.stringify(response.error));
  const geometry=response.result.samples[0].accumulationZones[0].geometry;
  assert.equal(geometry.conveyorSpeedMmPerSecond,500);assert.equal(geometry.productPitchMm,belt.processData.upstream.packageLengthMm+20);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: reliability fields persist engine values and disabled settings',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const field=key=>h.d.querySelector('.reliability-'+key);
  assert(Number(field('mtbfMinutes').value)>0);
  field('mtbfMinutes').value='321';field('mtbfMinutes').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  field('mttrMinutes').value='7';field('mttrMinutes').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#edit-setup-json');await waitFor(()=>h.d.getElementById('configuration-dialog').open);
  let config=JSON.parse(h.d.getElementById('configuration-draft').value),equipment=config.simulation.equipment[0];
  assert.equal(equipment.noiseProfile.reliability.mtbfMinutes,321);assert.equal(equipment.processData.equipment.mttrMinutes,7);
  await h.click('#configuration-cancel');field('enabled').checked=false;field('enabled').dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.click('#edit-setup-json');await waitFor(()=>h.d.getElementById('configuration-dialog').open);
  equipment=JSON.parse(h.d.getElementById('configuration-draft').value).simulation.equipment[0];assert.equal(equipment.noiseProfile.reliability,undefined);assert.equal(equipment.processData.equipment.mtbfMinutes,321);
  await h.click('#configuration-cancel');await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  assert.equal(field('enabled').checked,false);assert.equal(field('mtbfMinutes').value,'321');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: JSON drafts are isolated, imports validate physics and preserve simulation identity',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const original=h.storedCases()[0];const sibling={...original.simulations[0],id:'other',name:'Other'};
  original.simulations.push(sibling);h.api.saveCase(original);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  await h.click('#edit-setup-json');await waitFor(()=>h.d.getElementById('configuration-dialog').open);
  const draft=h.d.getElementById('configuration-draft'),config=JSON.parse(draft.value),before=JSON.stringify(h.storedCases());
  draft.value='{broken';await h.click('#configuration-apply');assert(h.d.getElementById('configuration-error').textContent);assert.equal(JSON.stringify(h.storedCases()),before);
  draft.value=JSON.stringify({...config,simulation:{...config.simulation,equipment:config.simulation.equipment.map(e=>({...e,id:'duplicate'}))}});
  await h.click('#configuration-apply');assert.match(h.d.getElementById('configuration-error').textContent,/unique/);
  await h.click('#configuration-cancel');assert.equal(JSON.stringify(h.storedCases()),before);
  await h.click('#open-json-import');await waitFor(()=>h.d.getElementById('configuration-dialog').open);assert.equal(draft.value,'');
  config.simulation.id='external-id';config.simulation.equipment[0].name='JSON equipment';config.simulation.dynamicConfig.durationSeconds=28800;
  const file=h.d.getElementById('configuration-file');Object.defineProperty(file,'files',{value:[{size:100,text:async()=>JSON.stringify(config)}],configurable:true});file.dispatchEvent(new h.w.Event('change'));await waitFor(()=>draft.value.includes('JSON equipment'));
  await h.click('#configuration-apply');assert.equal(h.d.getElementById('configuration-error').textContent,'');assert(!h.d.getElementById('configuration-dialog').open);
  await waitFor(()=>h.storedCases()[0].simulations[0].equipment[0].name==='JSON equipment');
  const saved=h.storedCases()[0];assert.equal(saved.id,'demo');assert.equal(saved.simulations[0].id,'simulation-a');assert.deepEqual(saved.simulations[1],sibling);assert.equal(saved.simulations[0].dynamicConfig.durationSeconds,28800);assert.equal(saved.simulations[0].results,null);
  assert.equal(h.d.querySelector('.equipment-name').value,'JSON equipment');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: JSON validation rejects unsupported settings, invalid reliability and unsafe keys',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#edit-setup-json');await waitFor(()=>h.d.getElementById('configuration-dialog').open);
  const config=JSON.parse(h.d.getElementById('configuration-draft').value),validate=h.w.STConfigurationEditor.validate;
  const reject=(change,pattern)=>{const c=JSON.parse(JSON.stringify(config));change(c);assert.throws(()=>validate(JSON.stringify(c),config),pattern);};
  reject(c=>c.schema='other',/schema/);reject(c=>c.simulation.dynamicConfig.tickSeconds=1,/tickSeconds/);
  reject(c=>c.simulation.equipment[0].noiseProfile.reliability.mttrMinutes=-1,/mttrMinutes/);
  reject(c=>c.simulation.equipment[1].processData.upstream.packageLengthMm=0,/productLengthMm/i);
  reject(c=>c.simulation.dynamicConfig.commands=[{equipmentId:'missing',action:'PAUSE',atVirtualSecond:1}],/equipmentId/);
  assert.throws(()=>validate('{"__proto__":{}}',config),/Unsafe/);
  const original=JSON.stringify(config);validate(original,config);assert.equal(JSON.stringify(config),original);
 }finally{h.dom.window.close();}
});

test('UI: JSON dialog uses shared spacing and import action; revision stays internal',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  assert.doesNotMatch(h.d.getElementById('editor-meta').textContent,/revision/i);
  assert.doesNotMatch(h.d.getElementById('run-case-meta').textContent,/revision/i);
  assert(h.storedCases()[0].revision>0);
  await h.click('#edit-setup-json');await waitFor(()=>h.d.getElementById('configuration-dialog').open);
  const dialog=h.d.getElementById('configuration-dialog');
  assert(dialog.querySelector('.dialog-heading #configuration-title'));
  assert(dialog.querySelector('.dialog-body #configuration-draft'));
  assert(dialog.querySelector('.dialog-actions #configuration-apply'));
  const button=h.d.getElementById('configuration-import'),entry=h.d.getElementById('open-json-import');
  assert.equal(button.textContent,entry.textContent);assert(button.classList.contains('secondary'));assert(entry.classList.contains('ghost'),'menu entries use the shared menu style');
  let opened=false;h.d.getElementById('configuration-file').click=()=>{opened=true;};
  await h.click('#configuration-import');assert(opened);assert(h.d.getElementById('configuration-file').hidden);
  await h.click('#configuration-close');assert(!dialog.open);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: gallery clones the chosen case in list and grid and recovers from failure',async()=>{
 const h=await setup({remember:true});try{
  const source=h.storedCases()[0],api=h.api.cloneCase;
  h.api.cloneCase=()=>{throw Error('offline');};await h.click('.clone-case');assert(!h.d.querySelector('.clone-case').disabled);assert.equal(h.storedCases().length,1);
  h.api.cloneCase=api;await h.click('#case-layout');assert(h.d.querySelector('#cases-list.grid .clone-case'));
  const button=h.d.querySelector('.clone-case');button.click();button.click();await waitFor(()=>h.d.querySelectorAll('.case-row').length===2);
  assert.equal(h.calls.filter(c=>c==='cloneCase').length,2);assert.deepEqual(h.storedCases().find(c=>c.id===source.id),source);
  const row=Array.from(h.d.querySelectorAll('.case-row')).find(r=>r.querySelector('.case-name').textContent.startsWith('Copy of '));assert(row);
  row.querySelector('.open-case').click();await settle();assert.equal(h.d.getElementById('case-name').value,'Copy of '+source.name);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: switching between conveyors retains inspector nodes, scroll and JSON textarea size',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const cards=Array.from(h.d.querySelectorAll('.equipment-card')),pane=h.d.getElementById('equipment-inspector');
  cards[1].click();const firstName=pane.querySelector('.equipment-name').value;
  const detail=pane.querySelector('.equipment-json-details');detail.open=true;
  const json=pane.querySelector('.equipment-process-data');json.style.height='370px';pane.scrollTop=245;
  cards[3].click();
  assert.equal(pane.querySelector('.equipment-process-data'),json);
  assert.equal(json.style.height,'370px');assert.equal(pane.scrollTop,245);assert(detail.open);
  assert.equal(pane.querySelector('.equipment-name').value,cards[3]._fields.querySelector('.equipment-name').value);
  assert.notEqual(pane.querySelector('.equipment-name').value,firstName);
  const value=pane.querySelector('.format-zone-speed-factor');value.value='11';value.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(cards[3]._fields.querySelector('.format-zone-speed-factor').value,'11');
  cards[1].click();assert.equal(pane.querySelector('.equipment-process-data'),json);assert.equal(pane.querySelector('.equipment-name').value,firstName);assert.equal(json.style.height,'370px');
  await waitFor(()=>h.storedCases()[0].equipment[3].processData.accumulation.conveyorSpeedFactorPercent===11);
  assert.notEqual(h.storedCases()[0].equipment[1].processData.accumulation.conveyorSpeedFactorPercent,11);
  cards[0].click();assert.notEqual(pane.querySelector('.equipment-process-data'),json);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: equipment units persist independently and the resizer remains anchored during pointer movement',async()=>{
 const h=await setup({remember:true,realScenarioServer:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const cards=Array.from(h.d.querySelectorAll('.equipment-card')),pane=h.d.getElementById('equipment-inspector');
  const machines=cards.filter(card=>card._fields.querySelector('.equipment-type').value!=='CONVEYOR');
  machines[0].click();const retained=pane.querySelector('.equipment-unit');
  assert.equal(retained.placeholder,'units');retained.value='bottles';retained.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  machines[1].click();assert.equal(pane.querySelector('.equipment-unit'),retained);
  assert.equal(retained.value,'');retained.value='cases';retained.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  machines[0].click();assert.equal(retained.value,'bottles');
  await waitFor(()=>h.storedCases()[0].equipment.find(e=>e.id===machines[1].dataset.equipmentId)?.unitOfFlow==='cases');
  const grip=h.d.getElementById('gemini-resize'),before=Number(grip.getAttribute('aria-valuenow'));
  grip.onpointerdown({button:0,pointerId:5,clientX:600,preventDefault(){}});
  grip.onpointermove({pointerId:5,clientX:560});
  assert.equal(Number(grip.getAttribute('aria-valuenow')),before+40);
  h.w.dispatchEvent(new h.w.Event('resize'));
  assert.equal(Number(grip.getAttribute('aria-valuenow')),before+40);
  grip.onpointerup({pointerId:5});
  grip.onpointermove({pointerId:5,clientX:30});
  assert.equal(Number(grip.getAttribute('aria-valuenow')),before+40);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: inline equipment and fixed conveyor fields persist across the main sections',async()=>{
 const h=await setup({remember:true,uiMode:null});try{
  const style=e=>h.w.getComputedStyle(e).display;
  await h.click('.open-case');assert.equal(h.d.documentElement.dataset.uiMode,'basic');
  assert.equal(style(h.d.getElementById('case-sidebar')),'none');
  assert.deepEqual(Array.from(h.d.querySelectorAll('#basic-navigation button:not(.hidden)')).map(b=>b.dataset.basicView),['equipment','conveyors','products','vgraph','simulation','realdata','whatif']);
  await h.click('[data-basic-view="equipment"]');
  const machines=Array.from(h.d.querySelectorAll('.equipment-card:not(.hidden)'));
  assert.equal(machines.length,7);assert.equal(style(machines[0]._fields),'block');
  assert.equal(h.d.getElementById('case-editor-form').parentElement.id,'settings-case-section');
  assert.notEqual(style(h.d.querySelector('.breadcrumb')),'none');
  assert.equal(style(machines[0]._fields.querySelector('.equipment-id').closest('label')),'none');
  assert(machines[0]._fields.querySelector('.equipment-id').readOnly);
  const field=machines[0]._fields.querySelector('.equipment-rate');field.value='333';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  machines[0].click();assert.equal(machines[0]._fields.parentElement,machines[0]);await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[0].nominalRatePerSecond===333/60);
  await h.click('[data-basic-view="conveyors"]');
  const conveyors=Array.from(h.d.querySelectorAll('.equipment-card:not(.hidden)'));
  assert.equal(conveyors.length,6);assert.equal(style(h.d.getElementById('basic-conveyor-panel')),'flex');
  assert.equal(style(conveyors[0].querySelector('.equipment-drag')),'none');
  assert.equal(style(h.d.querySelector('#equipment-inspector .equipment-id').closest('label')),'none');
  assert.equal(h.d.getElementById('equipment-inspector').parentElement.id,'basic-conveyor-panel');
  assert.equal(style(h.d.getElementById('gemini-panel')),'none');
  conveyors[1].click();
  assert.equal(h.d.querySelector('#basic-conveyor-panel h3').textContent,conveyors[1].querySelector('.equipment-header strong').textContent);
  const gap=conveyors[1]._fields.querySelector('.format-zone-coding-factor');gap.value='23';gap.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[3].processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent===23);
  await h.click('[data-basic-view="equipment"]');assert.equal(h.d.querySelector('.equipment-card')._fields.querySelector('.equipment-rate').value,'333');
  await h.click('[data-basic-view="vgraph"]');assert(h.d.querySelector('#vgraph-plot svg'));
  assert.equal(style(h.d.querySelector('#line-performance .table-scroll')),'none');
  assert.equal(style(h.d.getElementById('vgraph-caveat')),'none');
  await h.click('[data-basic-view="whatif"]');assert(h.visible('whatif-panel'));
  await h.click('[data-basic-view="simulation"]');assert(h.visible('run-panel'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Basic hides units and modes, raw JSON stays hidden and pacemaker remains a role',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view="equipment"]');
  const display=e=>h.w.getComputedStyle(e).display,card=h.d.querySelector('.equipment-card');
  assert.equal(h.d.getElementById('unit-of-flow'),null);
  assert.equal(display(card._fields.querySelector('.equipment-unit').closest('label')),'none');
  assert.equal(display(card._fields.querySelector('.equipment-mode').closest('label')),'none');
  assert.equal(card._fields.querySelector('.equipment-mode').value,'AUTO');
  assert.equal(display(card._fields.querySelector('.equipment-json-details')),'none');
  assert.equal(display(h.d.querySelector('#editor-panel .raw-viewer')),'none');
  assert.equal(h.d.querySelector('.equipment-type option[value="PACEMAKER"]'),null);
  const show=h.d.getElementById('settings-json-fields');show.checked=true;show.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert.equal(display(card._fields.querySelector('.equipment-json-details')),'none');
  assert.equal(h.w.localStorage.getItem('st.ui.v1.jsonFields.basic'),null);
  const role=card._fields.querySelector('.equipment-pacemaker');assert.match(role.closest('label').textContent,/Critical machine/);role.checked=true;role.dispatchEvent(new h.w.Event('change',{bubbles:true}));await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[0].processData.role==='PACEMAKER');
  const saved=h.storedCases()[0].equipment;assert.equal(saved[0].type,'BLOWMOLDER');assert.equal(saved.filter(e=>e.characteristics.isPacemaker).length,1);
  await h.click('[data-basic-view="conveyors"]');assert.equal(display(h.d.querySelector('#equipment-inspector .equipment-unit').closest('label')),'none');
  assert.equal(display(h.d.querySelector('#equipment-inspector .machine-design-field')),'none');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
 const advanced=await setup({remember:true});try{
  await advanced.click('.open-case');await advanced.click('.sidebar [data-view="editor"]');advanced.d.querySelector('.equipment-card').click();
  assert.equal(advanced.d.documentElement.dataset.showJson,'true');
  const show=advanced.d.getElementById('settings-json-fields');show.checked=false;show.dispatchEvent(new advanced.w.Event('change'));
  assert.equal(advanced.w.getComputedStyle(advanced.d.querySelector('#equipment-inspector .equipment-json-details')).display,'none');
  await advanced.click('#save-case');await waitFor(()=>advanced.storedCases()[0].metadata?.showJsonFields===false);assert.equal(advanced.w.localStorage.getItem('st.ui.v1.jsonFields.advance'),null);
  assert.deepEqual(advanced.errors,[]);
 }finally{advanced.dom.window.close();}
});

test('UI: legacy Pacemaker equipment opens as its machine type and keeps its selected role on save',async()=>{
 const h=await setup({remember:true});try{
  const get=h.api.getCase;h.api.getCase=id=>{const c=get(id);for(const list of [c.equipment,c.simulations[0].equipment]){list[0].type='PACEMAKER';list[0].processData.machineType='BLOWMOLDER';list[0].processData.role='PACEMAKER';list[4].processData.role='MACHINE';}return c;};
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');h.d.querySelector('.equipment-card').click();
  assert.equal(h.d.querySelector('#equipment-inspector .equipment-type').value,'BLOWMOLDER');assert(h.d.querySelector('#equipment-inspector .equipment-pacemaker').checked);
  const name=h.d.querySelector('#equipment-inspector .equipment-name');name.value='Legacy blowmolder';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].name==='Legacy blowmolder');
  assert.equal(h.storedCases()[0].equipment[0].type,'BLOWMOLDER');assert.equal(h.storedCases()[0].equipment[0].processData.role,'PACEMAKER');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: a clean imported stopped machine starts automatically without requiring an edit',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  const get=h.api.getCase;h.api.getCase=id=>{const c=get(id);for(const list of [c.equipment,c.simulations[0].equipment])list.forEach(e=>e.initialMode='STOP');return c;};
  await h.click('.open-case');assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value='30';await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].results);
  const record=h.storedCases()[0];assert(record.equipment.every(e=>e.initialMode==='AUTO'));assert(record.simulations[0].results.equipmentMetrics['blowmolder-1'].outputCount>0);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: changing storage with an open case saves its pending edits before switching folders',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  const name=h.d.getElementById('case-name');name.value='Saved before folder switch';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#open-settings');
  const folder=h.d.getElementById('workspace-folder-id');assert(!folder.disabled);
  folder.value='new-storage';folder.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#settings-close');
  await waitFor(()=>h.calls.includes('saveUserSettings')&&h.visible('cases-panel')&&!h.d.getElementById('settings-dialog').open);
  assert.equal(h.storedCases()[0].name,'Saved before folder switch');
  assert(h.calls.lastIndexOf('saveCase')<h.calls.lastIndexOf('saveUserSettings'));
  assert(!h.visible('editor-panel'));assert(!h.d.getElementById('settings-dialog').open);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: shared simulation controls and case name in Settings preserve case results in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode});try{
   assert(!h.visible('settings-case-section'));assert(h.d.getElementById('case-name').disabled);
   await h.click('.open-case');
   assert(h.visible('simulation-toolbar'));assert(h.visible('settings-case-section'));
   for(const id of ['simulation-selector','rename-simulation','clone-case','delete-simulation'])assert(h.d.getElementById('simulation-toolbar').contains(h.d.getElementById(id)));
   const remove=h.d.getElementById('delete-simulation');assert.equal(remove.textContent,'');assert.match(remove.getAttribute('aria-label'),/Delete/);assert(remove.classList.contains('secondary'));assert(remove.querySelector('svg'));
   const selector=h.d.getElementById('simulation-selector');assert.equal(selector.options.length,1);
   await h.click('#clone-case');await waitFor(()=>selector.options.length===2);
   const first=selector.options[0].value;selector.value=first;selector.dispatchEvent(new h.w.Event('change'));await settle();assert.equal(selector.value,first);
   await h.click('#open-settings');
   const name=h.d.getElementById('case-name');assert(h.d.getElementById('settings-dialog').contains(name));name.value='Renamed in Settings';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
   assert.equal(h.d.getElementById('breadcrumb-case').textContent,'Renamed in Settings');
   await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);
   if(uiMode==='BASIC')await h.click('#save-case');await waitFor(()=>h.storedCases()[0].name==='Renamed in Settings');
   await h.click('#home-cases');assert(!h.visible('settings-case-section'));assert(!h.visible('simulation-toolbar'));
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: source color names and hex values populate compact Settings and work in both themes',async()=>{
 const h=await setup({remember:true});try{
  await h.click('#cases-settings');
  const palettes=h.w.STThemeResources.palettes,swatches=h.d.querySelectorAll('.accent-choice');assert.equal(swatches.length,57);
  function luminance(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
  function contrast(a,b){return (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);}
  for(const entry of Object.values(palettes))for(const mode of ['light','dark']){assert.equal(entry[mode].accent,entry.hex);assert(contrast(entry[mode].onAccent,entry.hex)>=4.5);assert(contrast(entry[mode].text,entry[mode].soft)>=4.5);}
  const color=palettes['a-lorange'];assert.equal(color.hex,'#F6820D');
  await h.click('.accent-choice[data-accent="a-lorange"]');assert.equal(h.d.getElementById('accent-name'),null);assert.equal(h.d.querySelector('.accent-choice[data-accent="a-lorange"]').title,'à l’orange');
  for(const mode of ['light','dark']){
   h.w.STPreferences.setTheme(mode);assert.equal(h.d.documentElement.style.getPropertyValue('--accent'),'#F6820D');
   assert.equal(h.d.documentElement.style.getPropertyValue('--on-accent'),color[mode].onAccent);
  }
  assert.equal(h.d.querySelector('.accent-choice[data-accent="a-lorange"]').getAttribute('aria-pressed'),'true');
  const migrated=await setup({remember:true,savedAccent:'teal'});try{
   assert(palettes[migrated.d.documentElement.dataset.accent]);assert.notEqual(migrated.d.documentElement.dataset.accent,'teal');assert.equal(migrated.d.querySelectorAll('.accent-choice').length,57);
  }finally{migrated.dom.window.close();}
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI Basic: Gemini is available in every section and resizes without hiding conveyor fields',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');
  const toggle=h.d.getElementById('toggle-gemini');assert.equal(toggle.parentElement.id,'header-case-actions');assert.equal(toggle.parentElement.parentElement.id,'basic-section-row');assert.equal(h.d.getElementById('basic-navigation').parentElement,toggle.parentElement.parentElement);assert(!h.d.getElementById('basic-navigation').contains(toggle));
  await h.click('#toggle-gemini');
  for(const section of ['equipment','conveyors','simulation','vgraph','whatif']){
   await h.click('[data-basic-view="'+section+'"]');
   assert(h.visible('gemini-panel'));assert.equal(h.w.getComputedStyle(h.d.getElementById('gemini-panel')).display,'flex');
   assert(h.visible('gemini-chat-view'));assert.equal(toggle.getAttribute('aria-expanded'),'true');
   assert.equal(h.d.getElementById('gemini-title').textContent,'Gemini');
  }
  await h.click('[data-basic-view="conveyors"]');
  const inspector=h.d.getElementById('equipment-inspector');assert.equal(inspector.parentElement.id,'basic-conveyor-panel');assert(!inspector.classList.contains('hidden'));
  const gap=inspector.querySelector('.format-zone-coding-factor');gap.value='29';gap.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#save-case');await waitFor(()=>h.storedCases()[0].equipment[1].processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent===29);
  h.d.getElementById('gemini-question').value='Analyze the conveyors';await h.click('#send-gemini');await waitFor(()=>h.calls.includes('askGemini')&&/Analysis of the saved case/.test(h.d.getElementById('gemini-messages').textContent));
  assert.equal(h.storedCases()[0].equipment[1].processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent,29);
  const grip=h.d.getElementById('gemini-resize'),width=Number(grip.getAttribute('aria-valuenow'));
  grip.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft'}));assert(Number(grip.getAttribute('aria-valuenow'))>width);assert(h.w.localStorage.getItem('st.ui.v1.assistant-width'));
  await h.click('#close-gemini');assert(!h.visible('gemini-panel'));assert.equal(h.d.activeElement,toggle);assert(!inspector.classList.contains('hidden'));
  await h.click('#toggle-gemini');assert(h.visible('gemini-panel'));assert(!inspector.classList.contains('hidden'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Advance: header simulation picker and icon actions remain beside Gemini across sections',async()=>{
 const h=await setup({remember:true,uiMode:'ADVANCE'});try{
  await h.click('.open-case');
  const toolbar=h.d.getElementById('simulation-toolbar'),cluster=h.d.getElementById('header-case-actions');
  assert.equal(toolbar.parentElement,cluster);assert.equal(toolbar.nextElementSibling,h.d.getElementById('toggle-gemini'));
  assert(cluster.closest('header'));assert.equal(h.w.getComputedStyle(h.d.querySelector('.simulation-picker')).display,'flex');
  for(const id of ['rename-simulation','clone-case','delete-simulation']){const b=h.d.getElementById(id);assert.equal(b.textContent,'');assert(b.querySelector('svg'));assert(b.getAttribute('aria-label'));assert(b.title);}
  assert(h.visible('case-sidebar'));
  for(const view of ['editor','simulation','results','whatif']){
   await h.click('.sidebar [data-view="'+view+'"]');assert.equal(toolbar.parentElement,cluster);assert(cluster.closest('header'));
  }
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: worksheet controls, calculated buffers, Results availability and text-only Gemini',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view="equipment"]');
  const display=e=>h.w.getComputedStyle(e).display,card=h.d.querySelector('.basic-machine'),fields=card._fields;
  assert.equal(display(fields.querySelector('.equipment-type').closest('label')),'none');
  assert.equal(display(fields.querySelector('.equipment-name').closest('label')),'none');
  assert.equal(display(fields.querySelector('.reliability-enabled').closest('label')),'none');
  assert.equal(fields.querySelector('.reliability-enabled').checked,true);
  assert(!card.querySelector('.equipment-header strong').textContent.includes('Step'));
  assert(card.querySelector('.basic-buffer'));assert(!card.querySelector('.basic-buffer input'));
  const equipment=h.storedCases()[0].equipment,audit=h.w.STScenarios.audit({equipment})[0],downstream=equipment.find(e=>e.id===audit.downstreamId);
  const expected=audit.engineering.runtimeGeometry.capacityUnits/(downstream.nominalRatePerSecond*60);
  assert.equal(card.querySelector('.basic-buffer').textContent,expected.toLocaleString(undefined,{maximumFractionDigits:2}));
  const results=h.d.querySelector('[data-basic-view="results"]');assert(results.classList.contains('hidden'));
  await h.click('#basic-run-controls [data-control="run-shift-count"][data-value="2"]');
  assert.equal(h.d.getElementById('duration-mode').value,'SHIFTS');assert.equal(h.d.getElementById('run-shift-count').value,'2');assert.equal(h.d.getElementById('run-shift-hours').value,'8');
  await h.click('#basic-run-controls [data-control="run-playback-rate"][data-value="50"]');assert.equal(h.d.getElementById('run-playback-rate').value,'50');
  // Keep the integration run short; shift duration is tested in the batch engine.
  h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value='20';
  assert.equal(h.d.getElementById('basic-start-simulation'),null);await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await waitFor(()=>!results.classList.contains('hidden'));await h.click('#pause-simulation');
  await h.click('[data-basic-view="results"]');assert.equal(h.d.documentElement.dataset.basicView,'results');assert(h.visible('results-body'));assert.equal(display(h.d.getElementById('line-performance')),'none');assert(h.d.querySelector('#results-table table'));
  await h.click('[data-basic-view="vgraph"]');assert.equal(display(h.d.getElementById('line-performance')),'block');assert.equal(h.w.getComputedStyle(h.d.documentElement).getPropertyValue('--vgraph-height'),'440px');
  assert.equal(h.d.querySelector('.vgraph-key-normal').textContent,'Current');assert.equal(h.d.querySelector('.vgraph-key-recommended').textContent,'Recommended');
  h.api.askGemini=request=>({text:'Describe suggested improvements.',proposals:[h.w.STScenarios.plan(h.storedCases()[0].simulations[0]).projects.find(p=>p.canApply)]});
  await h.click('#save-case');await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Improve the line';await h.click('#send-gemini');await waitFor(()=>h.d.getElementById('gemini-messages').textContent.includes('Describe suggested'));
  assert.equal(h.d.querySelector('#gemini-messages .gemini-scenario-create'),null);
  await h.click('[data-basic-view="conveyors"]');assert(h.d.querySelector('.basic-conveyor-worksheet'));assert(h.d.getElementById('basic-conveyor-summary').textContent.includes('Tacc Antistarve'));
  await h.click('[data-conveyor-view="results"]');assert(h.d.getElementById('equipment-inspector').classList.contains('hidden'));
  await h.click('[data-conveyor-view="inputs"]');assert(!h.d.getElementById('equipment-inspector').classList.contains('hidden'));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: four conveyor worksheet groups persist inputs and expose static and observed outputs',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view="equipment"]');
  assert.equal(h.d.getElementById('basic-start-simulation'),null);
  const machine=h.d.querySelector('.basic-machine'),change=(control,value)=>{control.value=String(value);control.dispatchEvent(new h.w.Event('input',{bubbles:true}));};
  change(machine._fields.querySelector('.equipment-rate'),120);change(machine._fields.querySelector('.reliability-mtbfMinutes'),.2);change(machine._fields.querySelector('.reliability-mttrMinutes'),.1);await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[0].noiseProfile.reliability.mtbfMinutes===.2);
  assert.match(machine.querySelector('.basic-availability').textContent,/66.7/);
  await h.click('[data-basic-view="conveyors"]');
  let fields=h.d.getElementById('equipment-inspector').querySelector('.equipment-fields');
  assert.equal(fields.querySelectorAll('.basic-worksheet-group').length,4);assert.equal(fields.querySelectorAll('.basic-conveyor-worksheet input').length,27);
  const requiredInfeedMargin=h.storedCases()[0].equipment[1].processData.speedAndSensors?.overspeedVsInfeedScrewPercent;
  const values={'belt-speed':30,'package-length':80,'discharge-pitch':120,'startup':2.4,'residual':4,'infeed':125,'downstream-ramp':5,'lact':25000,'lp-prime':1500,'discharge-runout':300,'reject-runout':200,'speed-factor':10,'coding-factor':20,'acc-factor':30,'blocked-delay':1.2,'clear-delay':.4,'insurance':2};
  Object.entries(values).forEach(([key,value])=>change(fields.querySelector('.format-zone-'+key),value));
  const overspeedMode=fields.querySelector('.format-zone-overspeed-enabled');overspeedMode.checked=true;overspeedMode.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  change(fields.querySelector('.format-zone-overspeed'),7);overspeedMode.checked=false;overspeedMode.dispatchEvent(new h.w.Event('change',{bubbles:true}));await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[1].processData.accumulation.inputValues.overspeedPercent===7);
  const saved=h.storedCases()[0].equipment[1].processData;
  assert.equal(saved.accumulation.targetOverspeedPercent,undefined);assert.equal(saved.speedAndSensors.overspeedVsInfeedScrewPercent,requiredInfeedMargin);
  assert.equal(saved.geometry.actualDischargeMm,300);assert.equal(saved.geometry.actualCodingMm,200);assert.equal(saved.upstream.startupTimeSeconds,2.4);assert.equal(saved.downstream.infeedPitchMm,125);assert.equal(saved.downstream.rampUpTimeSeconds,5);
  assert.equal(saved.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent,20);assert.equal(saved.speedAndSensors.conveyorSpeedFactorVsPreviousConveyorPercent,30);
  assert.equal(saved.accumulation.speedMode,'MANUAL');assert.equal(saved.accumulation.conveyorSpeedMmPerSecond,500);assert.equal(saved.accumulation.movingGapMm,undefined);
  const audit=h.w.STScenarios.audit({equipment:h.storedCases()[0].equipment})[0],c=audit.engineering.calculated;
  assert.equal(fields.querySelector('[data-basic-output=lbu]').textContent,c.overflowLengthMm.toLocaleString(undefined,{maximumFractionDigits:2}));
  await h.click('[data-conveyor-view="results"]');let results=h.d.getElementById('basic-conveyor-summary');assert(!results.classList.contains('hidden'));
  for(const label of ['Tacc Antistarve (sec)','Tacc Antiblock (sec)','Lact vs Lmin','Conv Loss (%)','Lba actual (mm)','Lba min rampup (mm)','Lrec (mm)','Overflow req (mm)','Lmin required (mm)','Min infeed speed (m/min)','Block upstream','Starve downstream','Lost blocking/hr (s)','Lost starving/hr (s)'])assert(results.textContent.includes(label),label);
  assert.equal(results.querySelectorAll('progress').length,3);assert.equal(results.querySelectorAll('input').length,0);
  assert(results.textContent.includes('—'),'No invented dynamic losses before a run');
  await h.click('[data-conveyor-view="inputs"]');
  const second=h.d.querySelectorAll('.equipment-card:not(.hidden)')[1];second.click();await settle();
  fields=h.d.getElementById('equipment-inspector').querySelector('.equipment-fields');change(fields.querySelector('.format-zone-coding-factor'),11);await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[3].processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent===11);
  assert.equal(h.storedCases()[0].equipment[1].processData.speedAndSensors.codingConveyorSpeedFactorVsPreviousConveyorPercent,20);
  await h.click('[data-basic-view="simulation"]');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value='60';await h.click('#run-simulation');await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].results);await h.click('#pause-simulation');
  assert(h.storedCases()[0].simulations[0].results.equipmentMetrics['blowmolder-1'].failureCount>0);
  await h.click('[data-basic-view="conveyors"]');await h.click('[data-conveyor-view="results"]');results=h.d.getElementById('basic-conveyor-summary');assert(!Array.from(results.querySelectorAll('.basic-metric')).find(row=>row.querySelector('span').textContent==='Conv Loss (%)').querySelector('strong').textContent.includes('—'));
  await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view="conveyors"]');h.d.querySelector('.equipment-card:not(.hidden)').click();await settle();
  fields=h.d.getElementById('equipment-inspector').querySelector('.equipment-fields');assert.equal(fields.querySelector('.format-zone-coding-factor').value,'20');assert.equal(fields.querySelector('.format-zone-startup').value,'2.4');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: compact machine fields remain visible, palette has all colors and simulation space is reclaimed',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  await h.click('#sign-in-button');await h.click('.open-case');
  const card=h.d.querySelector('.basic-machine');
  for(const selector of ['.equipment-rate','.reliability-mtbfMinutes','.reliability-mttrMinutes']){
   const input=card._fields.querySelector(selector);
   for(let node=input.closest('label');node&&node!==card.parentNode;node=node.parentElement)assert.notEqual(h.w.getComputedStyle(node).display,'none',selector+' is hidden');
  }
  assert.equal(h.w.getComputedStyle(card._fields.querySelector('.equipment-name').closest('label')).display,'none');
  assert.match(card.querySelector('.basic-availability').textContent,/Avail.*%/);
  assert.equal(h.d.querySelectorAll('#accent-palette .accent-choice:not(.hidden)').length,57);
  assert(!h.d.querySelector('#accent-palette [data-accent="a-lorange"]').classList.contains('hidden'));
  assert.equal(h.d.querySelectorAll('#basic-run-controls [data-control] .icon').length,0);
  await h.click('[data-basic-view="simulation"]');
  assert.equal(h.w.getComputedStyle(h.d.getElementById('run-config')).display,'none');
  const controls=h.d.createElement('div');controls.className='live-equipment-controls';h.d.getElementById('run-panel').appendChild(controls);
  assert.equal(h.w.getComputedStyle(controls).display,'none');controls.remove();
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: hidden mode selector requires five deliberate M presses, saves pending edits and stays browser-local',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#open-settings');
  const dialog=h.d.getElementById('settings-dialog'),section=h.d.getElementById('settings-interface-section'),picker=h.d.getElementById('settings-interface-mode');
  const press=(target,key='m',extra={})=>target.dispatchEvent(new h.w.KeyboardEvent('keydown',{key,bubbles:true,...extra}));
  for(let i=0;i<5;i++)press(h.d.getElementById('case-name'));assert(section.classList.contains('hidden'));
  for(let i=0;i<5;i++)press(dialog,'m',{repeat:true});assert(section.classList.contains('hidden'));
  for(let i=0;i<4;i++)press(dialog);assert(section.classList.contains('hidden'));press(dialog);assert(!section.classList.contains('hidden'));
  const doe=h.d.getElementById('settings-scenario-doe');assert.equal(doe.checked,false);doe.checked=true;
  await h.click('#settings-cancel');assert.equal(h.w.STScenarioExplorer.doeEnabled(),true);assert.equal(h.w.localStorage.getItem('st.ui.v1.scenarioDoe'),null);await h.click('#open-settings');assert(section.classList.contains('hidden'));assert.equal(doe.checked,true);
  h.d.getElementById('case-name').value='Mode change preserves draft';h.d.getElementById('case-name').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  for(let i=0;i<5;i++)press(dialog);picker.value='ADVANCE';picker.dispatchEvent(new h.w.Event('change'));await waitFor(()=>h.d.documentElement.dataset.uiMode==='advance'&&!picker.disabled);assert(dialog.open);assert(h.visible('settings-save-section'));assert(h.visible('settings-chart-section'));assert(!h.d.getElementById('settings-json-fields').closest('label').hidden);h.d.getElementById('settings-json-fields').checked=true;h.d.getElementById('settings-json-fields').dispatchEvent(new h.w.Event('change'));await h.click('#settings-cancel');
  await waitFor(()=>!dialog.open);assert.equal(h.d.documentElement.dataset.uiMode,'advance',JSON.stringify({error:h.d.getElementById('settings-error').textContent,errors:h.errors,local:h.w.localStorage.getItem('st.ui.v1.interfaceMode')}));assert(section.classList.contains('hidden'));assert.equal(h.w.localStorage.getItem('st.ui.v1.interfaceMode'),'ADVANCE');
  await waitFor(()=>h.storedCases()[0].name==='Mode change preserves draft');
  assert.equal(h.d.querySelectorAll('#accent-palette .accent-choice:not(.hidden)').length,57);
  await h.click('#open-settings');assert(section.classList.contains('hidden'));for(let i=0;i<5;i++)press(dialog);picker.value='BASIC';picker.dispatchEvent(new h.w.Event('change'));await waitFor(()=>h.d.documentElement.dataset.uiMode==='basic'&&!picker.disabled);assert(dialog.open);assert(!h.visible('settings-save-section'));assert(!h.visible('settings-chart-section'));assert(h.d.getElementById('settings-json-fields').closest('label').hidden);assert.equal(h.d.documentElement.dataset.showJson,'false');assert.equal(h.d.querySelector('#gemini-prompt-language').classList.contains('hidden'),false);await h.click('#settings-cancel');
  assert.equal(h.d.documentElement.dataset.uiMode,'basic');assert(h.d.querySelector('.basic-machine')._fields.querySelector('.reliability-mtbfMinutes'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
 const persisted=await setup({remember:true,uiMode:'BASIC',savedUiMode:'ADVANCE'});try{assert.equal(persisted.d.documentElement.dataset.uiMode,'advance');assert.deepEqual(persisted.errors,[]);}finally{persisted.dom.window.close();}
 const other=await setup({remember:true,uiMode:'BASIC'});try{assert.equal(other.d.documentElement.dataset.uiMode,'basic');}finally{other.dom.window.close();}
});

test('UI: Basic conveyor speed round-trips m/min and preserves overrides while Gemini follows the local mode',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',savedUiMode:'ADVANCE'});try{
  const original=h.api.getCase;h.api.getCase=id=>{const record=original(id);for(const list of [record.equipment,record.simulations[0].equipment])Object.assign(list[1].processData.accumulation,{speedMode:'MANUAL',conveyorSpeedMmPerSecond:500,movingGapMm:7,backupSensorPositionMm:200});return record;};
  await h.click('.open-case');
  let asked;h.api.askGemini=request=>{asked=request;return {text:'Mode received.'};};
  await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Improve the conveyor';await h.click('#send-gemini');await waitFor(()=>asked);assert.equal(asked.uiMode,'ADVANCE');
  await h.click('#close-gemini');
  async function mode(value){await h.click('#open-settings');for(let i=0;i<5;i++)h.d.getElementById('settings-dialog').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'m',bubbles:true}));h.d.getElementById('settings-interface-mode').value=value;await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);}
  await mode('BASIC');await h.click('[data-basic-view=conveyors]');
  let fields=h.d.getElementById('equipment-inspector').querySelector('.equipment-fields'),speed=fields.querySelector('.format-zone-belt-speed');
  assert.equal(speed.disabled,false);assert.equal(Number(speed.value),30);assert.match(speed.closest('label').textContent,/m\/min/);
  speed.value='60';speed.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].equipment[1].processData.accumulation.conveyorSpeedMmPerSecond===1000);
  const stored=h.storedCases()[0].equipment[1].processData.accumulation;assert.equal(stored.movingGapMm,7);assert.equal(stored.backupSensorPositionMm,200);
  assert.equal(h.w.STScenarios.audit({equipment:h.storedCases()[0].equipment})[0].engineering.runtimeGeometry.conveyorSpeedMmPerSecond,1000);
  asked=null;await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Explain improvements';await h.click('#send-gemini');await waitFor(()=>asked);assert.equal(asked.uiMode,'BASIC');await h.click('#close-gemini');
  await mode('ADVANCE');
  const card=Array.from(h.d.querySelectorAll('.equipment-card')).find(c=>c.dataset.equipmentId===h.storedCases()[0].equipment[1].id);
  assert.equal(Number(card._fields.querySelector('.format-zone-belt-speed').value),1000);assert.equal(card._fields.querySelector('.format-zone-speed-mode').value,'MANUAL');
  await mode('BASIC');await h.click('[data-basic-view=conveyors]');assert.equal(Number(h.d.querySelector('#equipment-inspector .format-zone-belt-speed').value),60);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: scenario limits and checkboxes preserve physical inputs in bounded line-wide search',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0];sim.dynamicConfig={durationSeconds:10,tickSeconds:.25,sampleEverySeconds:1,seed:42,rounds:1,commands:[]};
  const e=sim.equipment[1];e.processData.geometry.lactMm=10000;e.processData.accumulation.speedMode='MANUAL';e.processData.accumulation.conveyorSpeedMmPerSecond=500;
  const changes=[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:20000,unit:'mm'},{equipmentId:e.id,path:'processData.accumulation.conveyorSpeedMmPerSecond',before:500,after:550,unit:'mm/s'}];
  let created;const project={title:'Limited geometry',tier:'HIGH',basis:'STATIC',changes,sourceSimulationId:sim.id,sourceSignature:h.w.STScenarios.signature(sim),explore:true};
  const card=h.w.STWhatIf.card(project,p=>{created=p;},sim.equipment,sim);h.d.body.append(card);
  const rows=card.querySelectorAll('.scenario-change'),limit=rows[0].querySelector('input[type=number]');limit.value='15';
  const run=h.w.SimulatorEngine.simulateBatch,calls=[];h.w.SimulatorEngine.simulateBatch=async(input,options)=>{calls.push(JSON.parse(JSON.stringify(input)));const response=await run(input,options);if(response.ok){const changed=input.case.equipment[1].processData.geometry.lactMm>10000||input.case.equipment[1].processData.accumulation.conveyorSpeedMmPerSecond!==500;response.result.batch.statistics.lineOeePercent.mean=changed?51:50;response.result.batch.statistics.throughputPerMinute.mean=changed?101:100;}return response;};
  card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  assert.match(card.querySelector('.scenario-preview-status').textContent,/Improvement reproduced/);card.querySelector('.scenario-create').click();assert.equal(created.changes[0].after,15000);assert.equal(created.reviewed,true);
  const exported=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim));assert.equal(exported.evaluations.length,1);const evaluation=exported.evaluations[0];assert.equal(evaluation.status,'IMPROVEMENT_REPRODUCED');assert.equal(evaluation.evaluatedChanges[0].after,15000);assert.equal(evaluation.selections[0].limit,15000);assert.equal(evaluation.run.seed,42);assert.equal(evaluation.independentCheck.seed,1000045);assert.equal(evaluation.independentCheck.passed,true);assert.equal(evaluation.delta.throughputPerMinute,1);assert.equal(evaluation.plantValidated,false);
  const report=h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim));assert.match(report,/IMPROVEMENT_REPRODUCED/);assert.match(report,/Independent seeds/);assert.match(report,/15000/);
  const changed=JSON.parse(JSON.stringify(sim));changed.dynamicConfig.seed++;assert.equal(h.w.STReports.whatIfData(changed,h.w.STScenarios.plan(changed)).evaluations.length,0);
  const checkbox=rows[1].querySelector('input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new h.w.Event('change'));card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);card.querySelector('.scenario-create').click();assert.equal(created.changes.length,1);
  checkbox.checked=true;calls.length=0;card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled&&card.querySelector('.scenario-evaluate').dataset.icon==='search');
  assert(calls.length<=3,'matching screening and validation results should be reused');assert(calls.every(c=>[42,1000045].includes(c.run.seed)&&c.run.durationSeconds===10));assert.equal(h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0].independentCheck.passed,true);assert(calls.every(c=>c.case.equipment[1].processData.geometry.lactMm<=15000));assert(h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0].trials>0);
  assert.equal(sim.equipment[1].processData.geometry.lactMm,10000);
  const count=calls.length;checkbox.checked=true;checkbox.dispatchEvent(new h.w.Event('change'));await new Promise(resolve=>setTimeout(resolve,450));assert.equal(calls.length,count);assert(card.querySelector('.scenario-create').disabled);assert.equal(h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0].status,'NOT_EVALUATED');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: regressions and gains that fail independent seeds cannot create recommended scenarios',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);
  let calls=0,created=false;
  h.w.SimulatorEngine.simulateBatch=async()=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50-(calls%2),outputCount:100-(calls++%2)}}});
  const card=h.w.STWhatIf.card(project,()=>{created=true;},sim.equipment,sim);h.d.body.append(card);
  card.querySelector('.scenario-evaluate').click();await waitFor(()=>card.querySelector('.scenario-preview-status').dataset.state==='rejected');
  assert(card.querySelector('.scenario-create').disabled);assert.match(card.textContent,/No demonstrated improvement/);assert.equal(calls,2);
  let evidence=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0];assert.equal(evidence.status,'NO_DEMONSTRATED_IMPROVEMENT');assert.equal(evidence.delta.throughputPerMinute,-1);assert.equal(evidence.independentCheck,undefined);
  // Changed seeds invalidate the shared cache. The screening seeds improve,
  sim.dynamicConfig={...sim.dynamicConfig,seed:1234};
  // the validation seeds regress. This must not become an approved recommendation.
  calls=0;h.w.SimulatorEngine.simulateBatch=async()=>{const i=calls++,gain=i===1?2:i===3?-2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const second=h.w.STWhatIf.card(project,p=>{created=p;},sim.equipment,sim);h.d.body.append(second);
  second.querySelector('.scenario-evaluate').click();await waitFor(()=>second.querySelector('.scenario-preview-status').dataset.state==='review');
  assert.match(second.textContent,/did not reproduce/);assert(!second.querySelector('.scenario-create').disabled);assert.equal(calls,4);assert.equal(created,false);second.querySelector('.scenario-create').click();assert.equal(created.evidence.independentValidation,'NOT_REPRODUCED_REQUIRES_VALIDATION');assert(created.reviewed);assert.match(created.title,/Validation required/);
  evidence=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0];assert.equal(evidence.status,'NOT_REPRODUCED');assert.equal(evidence.independentCheck.passed,false);assert.match(h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim)),/NOT_REPRODUCED/);
 }finally{h.dom.window.close();}
});


test('UI: enabled DOE uses replicated factorial combinations and exports effects without changing baseline',async()=>{
 const h=await setup({remember:true});try{
  h.w.STScenarioExplorer.setDOE(true);
  const sim=h.storedCases()[0].simulations[0];sim.dynamicConfig={durationSeconds:10,tickSeconds:.25,sampleEverySeconds:1,seed:42,rounds:1,commands:[]};
  const e=sim.equipment[1];e.processData.geometry.lactMm=10000;e.processData.accumulation.speedMode='MANUAL';e.processData.accumulation.conveyorSpeedMmPerSecond=500;
  const snapshot=JSON.stringify(sim),changes=[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:20000,unit:'mm'},{equipmentId:e.id,path:'processData.accumulation.conveyorSpeedMmPerSecond',before:500,after:550,unit:'mm/s'}];
  const project={title:'DOE test',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',changes,explore:true},card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);
  const calls=[];h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(JSON.parse(JSON.stringify(input)));const belt=input.case.equipment[1],gain=belt.processData.geometry.lactMm>10000&&belt.processData.accumulation.conveyorSpeedMmPerSecond>500?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  assert.equal(card.querySelector('.scenario-doe').hidden,false);card.querySelectorAll('.scenario-doe-select').forEach(input=>{input.checked=true;input.dispatchEvent(new h.w.Event('change'));});card.querySelector('.scenario-change input[type=number]').value='15';
  card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const record=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0];assert.equal(record.method,'COORDINATE_SEARCH_WITH_DOE');assert.equal(record.doe.combinations,4);assert.equal(record.doe.observations.length,4);assert.equal(record.doe.factors[0].high,15000);assert(record.doe.analysis.complete);assert(record.doe.analysis.effects.some(e=>e.type==='TWO_FACTOR_INTERACTION'&&e.throughput>0));
  assert(calls.every(c=>c.run.rounds===3));assert(calls.some(c=>c.run.seed===1000045));assert(calls.every(c=>c.case.equipment[1].processData.geometry.lactMm<=15000));assert.equal(JSON.stringify({...sim,whatIf:undefined}),snapshot);assert.match(h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim)),/FULL_FACTORIAL_TWO_LEVEL/);
  h.w.STPreferences.write('scenarioDoe','no');h.w.dispatchEvent(new h.w.Event('st-doe-change'));assert.equal(card.querySelector('.scenario-doe').hidden,false);assert(card.querySelector('.scenario-doe-factor .scenario-doe-select').disabled);assert(card.querySelector('.scenario-create').disabled);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: category searches are independent, Basic hides individual hypotheses, and running controls are protected',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],target=h.d.createElement('section');h.d.body.append(target);
  h.d.documentElement.dataset.uiMode='basic';h.w.STWhatIf.render(sim,target,()=>{});
  assert.equal(target.querySelector('.scenario-candidate-details'),null);
  assert.equal(target.querySelector('.scenario-explorer > .scenario-scope'),null);assert(!target.textContent.includes('Include lower-CAPEX'));
  assert.equal(target.querySelector('.scenario-tier-grid').children.length,4);
  assert.match(target.querySelector('.scenario-tier-grid').firstElementChild.textContent,/Current scenario/);
  h.d.documentElement.dataset.uiMode='advance';h.w.STWhatIf.render(sim,target,()=>{});
  assert.equal(target.querySelector('.scenario-candidate-details'),null);
  const card=target.querySelector('.scenario-tier-grid .analysis-recommendation:has(.scenario-evaluate)');
  let release,calls=0;h.w.SimulatorEngine.simulateBatch=async()=>{calls++;await new Promise(resolve=>release=resolve);return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}};};
  const search=card.querySelector('.scenario-search');search.click();
  await waitFor(()=>release);assert(search.disabled);assert(card.querySelector('input').disabled);
  assert.match(card.querySelector('.scenario-search-progress').textContent,/Baseline.*up to.*round.*Elapsed/);
  assert(!Array.from(target.querySelectorAll('button')).some(b=>b.textContent==='Add improvement'));
  assert(!target.textContent.includes('Explore the whole line'));
  assert(target.querySelector('.scenario-explorer > .scenario-interventions'));
  assert(card.isConnected);assert.equal(calls,1);
  h.w.STScenarioExplorer.setDOE(true);h.w.dispatchEvent(new h.w.Event('st-doe-change'));
  assert.match(card.querySelector('.scenario-preview-status').textContent,/Simulating baseline/);
  card.querySelector('.scenario-evaluate').click();card.querySelector('.scenario-evaluate').click();release();
  await waitFor(()=>!search.disabled);assert.match(card.querySelector('.scenario-search-progress').textContent,/Stopped/);
  assert.equal(calls,1);assert(card.querySelector('.scenario-create').disabled);assert.equal(card.querySelector('input').disabled,false);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: reproduced gains with audit warnings remain creatable review scenarios',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply),apply=h.w.STScenarios.apply;
  h.w.STScenarios.apply=(source,changes)=>{const result=apply(source,changes);result.scenarioWarnings=[{equipmentId:changes[0].equipmentId,rule:'BACKUP_POSITION',before:'PASS',after:'FAIL'}];return result;};
  let created;const originalEquipment=JSON.stringify(sim.equipment);h.w.SimulatorEngine.simulateBatch=async input=>{const gain=JSON.stringify(input.case.equipment)===originalEquipment?0:1,summary={lineOeePercent:50+gain,outputCount:(100+gain)*input.run.durationSeconds/60,totalOverflowUnits:0};return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary,batch:{rounds:input.run.rounds,rows:Array.from({length:input.run.rounds},(_,i)=>({seed:input.run.seed+i,summary})),statistics:{lineOeePercent:{mean:50+gain},throughputPerMinute:{mean:100+gain},totalOverflowUnits:{mean:0}}}}};};
  const card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-search').click();
  await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const save=card.querySelector('.scenario-create');assert.equal(card.querySelector('.scenario-audit-warnings input'),null);
  assert(!save.disabled);assert.equal(card.querySelector('.scenario-audit-warnings'),null);card.querySelector('.scenario-results').click();assert.equal(card.querySelector('.scenario-results-checks'),null);card.querySelector('.scenario-results-dialog').close();
  save.click();
  assert(created.reviewed);assert.equal(created.evidence.engineeringReview,'REQUIRES_REVIEW');
  const evidence=h.w.STScenarioExplorer.evaluations(sim)[0];assert.equal(evidence.status,'ENGINEERING_REVIEW_REQUIRED');assert(!evidence.engineeringReviewAcknowledged);assert(evidence.independentCheck.passed);
  card.querySelector('.scenario-configure').click();const limit=card.querySelector('.scenario-change input[type=number]');limit.value='';limit.dispatchEvent(new h.w.Event('input'));assert(save.disabled);assert.equal(card.querySelector('.scenario-audit-warnings'),null);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: modal DOE selection exposes more than four factors and runs the user-selected later variables',async()=>{
 const h=await setup({remember:true});try{
  // This test covers the complete DOE; search-limit behavior has its own tests.
  h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200};
  h.w.STScenarioExplorer.setDOE(true);const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];
  const paths=['conveyorSpeedFactorPercent','blockedTimeDelaySeconds','clearTimeDelaySeconds','backupSensorPositionMm','downstreamRampUpSeconds','conveyorSpeedMmPerSecond'];
  const changes=paths.map(key=>{e.processData.accumulation[key]=10;return {equipmentId:e.id,path:'processData.accumulation.'+key,before:10,after:12,unit:'test'};});
  const card=h.w.STWhatIf.card({title:'All factors',kind:'CUSTOM',tier:'HIGH',changes,explore:true,searchDerivedDOE:true},()=>{},sim.equipment,sim);h.d.body.append(card);
  const dialog=card.querySelector('dialog');assert.equal(dialog.open,false);card.querySelector('.scenario-configure').click();assert(dialog.open);
  assert.equal(dialog.querySelectorAll('.scenario-doe-factor').length,6);assert.match(dialog.querySelector('.scenario-factor-count').textContent,/0 \/ 4 selected · 6 eligible/);
  const uses=Array.from(dialog.querySelectorAll('.scenario-doe-factor .scenario-doe-select'));assert(uses.every(input=>!input.disabled&&!input.checked));for(const i of [0,1,2,3,4]){uses[i].checked=true;uses[i].dispatchEvent(new h.w.Event('change'));}assert.equal(uses[4].checked,false);assert.equal(uses[4].disabled,false);
  Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Clear factor selection').click();
  for(const i of [4,5]){uses[i].checked=true;uses[i].dispatchEvent(new h.w.Event('change'));}
  assert.match(dialog.querySelector('.scenario-factor-count').textContent,/2 \/ 4 selected/);
  Array.from(dialog.querySelectorAll('button')).find(b=>b.textContent==='Done').click();assert.equal(dialog.open,false);
  h.w.STScenarios.apply=(source,changes)=>{const result=JSON.parse(JSON.stringify(source));for(const c of changes)result.equipment.find(e=>e.id===c.equipmentId).processData.accumulation[c.path.split('.').pop()]=c.after;return result;};
  h.w.SimulatorEngine.simulateBatch=async()=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}});
  card.querySelector('.scenario-search').click();await waitFor(()=>card.querySelector('.scenario-preview-status').dataset.state==='rejected');
  const evidence=h.w.STScenarioExplorer.evaluations(sim)[0];assert.equal(evidence.doe.combinations,4);assert.deepEqual(Array.from(evidence.doe.factors,f=>f.path),changes.slice(4).map(c=>c.path));assert.equal(evidence.doe.observations.length,4);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: case autosave restores card evidence, metrics and controls without changing simulation inputs',async()=>{
 const h=await setup({remember:true,realScenarioServer:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');stubScenarioGain(h);
  const baseline=JSON.stringify(h.storedCases()[0].simulations[0].dynamicConfig);
  let card=h.d.querySelector('.scenario-tier-grid .analysis-recommendation');card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  await waitFor(()=>h.storedCases()[0].simulations[0].whatIf?.evaluations?.some(e=>['IMPROVEMENT_REPRODUCED','ENGINEERING_REVIEW_REQUIRED'].includes(e.status)));
  assert.equal(JSON.stringify(h.storedCases()[0].simulations[0].dynamicConfig),baseline);
  const metric=card.querySelector('.scenario-metrics').textContent;assert.match(metric,/BaseProposedChange/);assert.equal(card.querySelectorAll('.scenario-metric-table').length,1);
  assert.equal(card.querySelector('.scenario-verification'),null);
  assert(h.storedCases()[0].simulations[0].whatIf.evaluations.some(e=>e.independentCheck?.passed));
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  card=h.d.querySelector('.scenario-tier-grid .analysis-recommendation');assert.equal(card.querySelector('.scenario-metrics').textContent,metric);assert.equal(card.querySelector('.scenario-create').disabled,false);
  card.querySelector('.scenario-configure').click();const checkbox=card.querySelector('.scenario-change input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new h.w.Event('change'));
  await waitFor(()=>h.storedCases()[0].simulations[0].whatIf.evaluations.some(e=>e.status==='NOT_EVALUATED'));
  Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Done').click();await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  card=h.d.querySelector('.scenario-tier-grid .analysis-recommendation');assert.equal(card.querySelector('.scenario-change input[type=checkbox]').checked,false);assert(card.querySelector('.scenario-create').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: stored DOE results survive serialization and stale inputs never restore approval',async()=>{
 const h=await setup({remember:true});try{
  h.w.STScenarioExplorer.setDOE(true);const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);
  h.w.SimulatorEngine.simulateBatch=async()=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}});
  let card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);card.querySelectorAll('.scenario-doe-select').forEach(input=>{input.checked=true;input.dispatchEvent(new h.w.Event('change'));});card.querySelector('.scenario-search').click();await waitFor(()=>card.querySelector('.scenario-preview-status').dataset.state==='rejected');
  const saved=JSON.parse(JSON.stringify(sim)),entry=saved.whatIf.evaluations[0];assert(entry.doe.observations.length);card.remove();
  card=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(card);assert(card.querySelector('.scenario-doe-results'));assert.match(card.textContent,/No demonstrated improvement/);assert.equal(h.w.STScenarioExplorer.evaluations(saved)[0].doe.observations.length,entry.doe.observations.length);
  saved.dynamicConfig.seed=991;card.remove();card=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(card);assert(card.querySelector('.scenario-doe-results'));assert(card.querySelector('.scenario-metrics').textContent);assert.match(card.querySelector('.scenario-preview-status').textContent,/previous inputs/);assert(card.querySelector('.scenario-create').disabled);assert.equal(h.w.STScenarioExplorer.evaluations(saved).length,0);assert(saved.whatIf.evaluations.length);
 }finally{h.dom.window.close();}
});


test('UI: Gemini recovers from malformed callbacks and ignores answers arriving after timeout',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');
  h.api.askGemini=()=>null;h.d.getElementById('gemini-question').value='Retain this question';await h.click('#send-gemini');await waitFor(()=>h.d.getElementById('gemini-error').textContent.includes('GEMINI_BAD_RESPONSE'));
  assert.equal(h.d.getElementById('gemini-question').value,'Retain this question');assert.match(h.d.getElementById('gemini-error').textContent,/GEMINI_BAD_RESPONSE/);assert.equal(h.d.getElementById('send-gemini').disabled,false);
  let expire,late;const original=h.w.setTimeout;h.w.setTimeout=(fn,ms,...args)=>ms===180000?(expire=fn,900001):original(fn,ms,...args);
  h.w.google.script.run={withFailureHandler(){return this;},withSuccessHandler(fn){late=fn;return this;},askGemini(){}};
  await h.click('#send-gemini');assert(expire);expire();assert.match(h.d.getElementById('gemini-error').textContent,/GEMINI_TIMEOUT/);assert.equal(h.d.getElementById('send-gemini').disabled,false);assert.equal(h.d.getElementById('gemini-question').value,'Retain this question');
  late({ok:true,data:{text:'Late answer'}});assert(!h.d.getElementById('gemini-messages').textContent.includes('Late answer'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: seed policy generates and saves a new base only for fresh runs',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-settings');
  assert(!h.d.getElementById('settings-seed-section').classList.contains('hidden'));
  assert.equal(h.d.getElementById('settings-seed-policy').value,'RANDOM');await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.caseOptions().seedPolicy,'RANDOM');
  let next=1234;h.w.crypto.getRandomValues=a=>{a[0]=next++;return a;};
  h.d.getElementById('run-duration').value=5;await h.click('#run-simulation');await h.click('#pause-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.seed===1234);
  assert(h.d.getElementById('run-simulation').disabled);await h.click('#run-simulation');assert.equal(next,1235,'a paused run cannot consume a new seed');
  h.d.getElementById('run-playback-rate').value=100;await h.click('#play-simulation');await waitFor(()=>!h.d.getElementById('run-simulation').disabled);
  await h.click('#run-simulation');await h.click('#pause-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.seed===1235);
  await h.click('#play-simulation');await waitFor(()=>!h.d.getElementById('run-simulation').disabled);
  await h.click('#open-settings');h.d.getElementById('settings-seed-policy').value='FIXED';await h.click('#settings-cancel');
  await h.click('#run-simulation');await h.click('#pause-simulation');
  assert.equal(Number(h.d.getElementById('run-seed').value),1235);assert.equal(next,1236);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: target Population and manual LBA persist in both modes and Basic cards show only names',async()=>{
 for(const uiMode of ['ADVANCE','BASIC']){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');if(uiMode==='BASIC')await h.click('[data-basic-view=conveyors]');else {await h.click('.sidebar [data-view="editor"]');h.d.querySelectorAll('.equipment-card')[1].click();}
   const field=key=>h.d.querySelector('#equipment-inspector .format-zone-'+key);
   const change=(key,value)=>{const n=field(key);if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new h.w.Event('input',{bubbles:true}));};
   change('population-enabled',true);change('population',50);change('lba-enabled',true);change('lba',1000);if(uiMode==='BASIC')await h.click('#save-case');
   await waitFor(()=>h.storedCases()[0].equipment[1].processData.accumulation.manualLbaMm===1000);
   const saved=h.storedCases()[0].equipment;
   assert.equal(saved[1].processData.accumulation.targetPopulationPercent,50);
   const audit=h.w.STScenarios.audit({equipment:saved}).find(a=>a.equipmentId===saved[1].id);
   assert.equal(audit.engineering.calculated.populationPercent,50);assert.equal(audit.engineering.calculated.usefulAccumulationLengthMm,1000);
   if(uiMode==='BASIC'){
    const card=h.d.querySelectorAll('.equipment-card')[1];assert.equal(card.querySelector('.equipment-header strong').textContent,saved[1].name);assert.equal(card.querySelector('.basic-card-data').textContent,'');
    await h.click('#open-settings');assert(h.d.getElementById('settings-seed-section').classList.contains('hidden'));await h.click('#settings-cancel');
   }
   change('population',60);assert.match(h.d.querySelector('#equipment-inspector .format-zone-preview').textContent,/exceeds 50%/);
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: Basic saves case edits and results only through the Save icon and protects unsaved exit',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');const original=h.storedCases()[0].name;
  const n=h.d.getElementById('case-name');n.value='Manual draft';n.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert(!h.d.getElementById('save-case').classList.contains('hidden'));assert(!h.d.getElementById('save-case').disabled);
  await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(h.storedCases()[0].name,original);assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  await h.click('#open-settings');assert(h.d.getElementById('settings-save-section').classList.contains('hidden'));await h.click('#settings-cancel');
  assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  await h.click('#home-cases');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:first-child');
  assert.equal(h.d.getElementById('case-name').value,'Manual draft');assert(!h.d.getElementById('case-sidebar').classList.contains('hidden'));
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].name==='Manual draft');
  h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await h.click('#pause-simulation');
  const saves=h.calls.filter(c=>c==='saveCase').length;await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(h.calls.filter(c=>c==='saveCase').length,saves);assert.equal(h.storedCases()[0].simulations[0].results,null);
  await h.click('#save-case');await waitFor(()=>!!h.storedCases()[0].simulations[0].results);
  n.value='Discard this draft';n.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#home-cases');await h.click('.message-dialog .dialog-actions button:nth-child(2)');await h.click('.open-case');
  assert.equal(h.d.getElementById('case-name').value,'Manual draft');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Advance Settings controls autosave interval and manual saving without implicit Settings saves',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-settings');assert(!h.d.getElementById('settings-save-section').classList.contains('hidden'));
  const enabled=h.d.getElementById('settings-autosave'),seconds=h.d.getElementById('settings-autosave-seconds');
  enabled.checked=false;enabled.dispatchEvent(new h.w.Event('change'));assert(seconds.disabled);seconds.value=2;await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.caseOptions().autosaveEnabled,false);
  const name=h.d.getElementById('case-name');name.value='Manual Advance';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,1200));assert.notEqual(h.storedCases()[0].name,'Manual Advance');
  await h.click('#open-settings');await h.click('#settings-cancel');assert.notEqual(h.storedCases()[0].name,'Manual Advance');
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].name==='Manual Advance');
  await h.click('#open-settings');enabled.checked=true;enabled.dispatchEvent(new h.w.Event('change'));seconds.value=2;await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.caseOptions().autosaveSeconds,2);assert(h.d.getElementById('save-case').classList.contains('hidden'));
  name.value='Automatic Advance';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,500));assert.equal(h.storedCases()[0].name,'Manual Advance');await waitFor(()=>h.storedCases()[0].name==='Automatic Advance');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: interrupted scenario restarts with clear status, icon actions and a working Stop control',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);let created;
  let release;h.w.SimulatorEngine.simulateBatch=async(input,options)=>{options.progress?.(.5);await new Promise(resolve=>release=resolve);return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}};};
  let card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-evaluate').click();await waitFor(()=>release);assert.equal(card.querySelector('.scenario-activity').hidden,false);assert.equal(card.getAttribute('aria-busy'),'true');assert.equal(card.querySelector('.scenario-progress-label').hidden,false);assert(Number(card.querySelector('.scenario-activity').getAttribute('aria-valuenow'))>0);assert.match(card.querySelector('.scenario-progress-label').textContent,/%/);card.querySelector('.scenario-evaluate').click();release();await waitFor(()=>card.querySelector('.scenario-evaluate').dataset.icon==='search');assert.equal(card.querySelector('.scenario-activity').hidden,true);assert(!card.hasAttribute('aria-busy'));card.remove();
  sim.whatIf.evaluations[0].status='RUNNING';card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);
  assert.match(card.querySelector('.scenario-preview-status').textContent,/Previous search interrupted/);
  const actions=card.querySelector('.scenario-actions');assert.equal(actions.querySelectorAll('button').length,4);
  for(const button of actions.querySelectorAll('button')){assert.equal(button.textContent,'');assert(button.getAttribute('aria-label'));assert(button.querySelector('svg'));}
  release=null;card.querySelector('.scenario-search').click();await waitFor(()=>release);
  assert.doesNotMatch(card.querySelector('.scenario-preview-status').textContent,/interrupted/);assert.equal(card.querySelector('.scenario-evaluate').dataset.icon,'stop');assert(!card.querySelector('.scenario-evaluate').disabled);assert(card.querySelector('.scenario-create').disabled);
  card.querySelector('.scenario-evaluate').click();release();await waitFor(()=>card.querySelector('.scenario-evaluate').dataset.icon==='search');assert.equal(created,undefined);assert(card.querySelector('.scenario-create').disabled);
  h.w.SimulatorEngine.simulateBatch=async input=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:JSON.stringify(input.case.equipment)===JSON.stringify(sim.equipment)?50:51,outputCount:JSON.stringify(input.case.equipment)===JSON.stringify(sim.equipment)?100:101}}});card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  assert.equal(card.querySelector('.scenario-evaluate').dataset.icon,'search');card.querySelector('.scenario-create').click();assert(created.changes.length>0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: finishing search validates the in-flight winner before creation in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE'])for(const outcome of ['pass','fail','cancel','empty']){
  const h=await setup({remember:true,uiMode});try{
   h.w.STScenarioExplorer.setDOE(true);
   const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];e.processData.geometry.lactMm=10000;
   sim.dynamicConfig={durationSeconds:10,seed:42,rounds:5};
   const project={title:'Early winner',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',explore:true,changes:[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}]};
   let created;const pending=[];const calls=[];
   h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(input);await new Promise(resolve=>pending.push(resolve));const changed=input.case.equipment[1].processData.geometry.lactMm!==10000,gain=changed?(input.run.seed!==42&&outcome==='fail'?-2:2):0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
   const card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);const factor=card.querySelector('.scenario-doe-select');factor.checked=true;factor.dispatchEvent(new h.w.Event('change'));
   const stop=card.querySelector('.scenario-evaluate'),save=card.querySelector('.scenario-create');
   async function finishBatch(){pending.shift()();await waitFor(()=>pending.length||stop.dataset.icon==='search');}
   card.querySelector('.scenario-search').click();await waitFor(()=>pending.length);
   assert.match(stop.title,/Finish search/);
   if(outcome!=='empty'){await finishBatch();assert.equal(calls.length,2);}
   stop.click();assert.match(stop.title,/Cancel/);assert(save.disabled);
   await finishBatch();
   if(outcome==='empty'){
    assert.equal(calls.length,1);assert(save.disabled);assert.equal(sim.whatIf.evaluations[0].status,'NO_DEMONSTRATED_IMPROVEMENT');
   }else{
    assert.equal(calls.length,4);assert.equal(calls[2].run.seed,1000045);assert.equal(calls[3].run.seed,1000045);assert.equal(pending.length,2);assert(save.disabled);assert.match(stop.title,/Cancel validation/);
    if(outcome==='cancel'){stop.click();pending.splice(0).forEach(release=>release());await waitFor(()=>stop.dataset.icon==='search');assert.equal(calls.length,4);assert(save.disabled);assert.equal(sim.whatIf.evaluations[0].status,'CANCELLED');}
    else{
     pending.shift()();await settle();assert(save.disabled);pending.shift()();await waitFor(()=>!save.disabled);
     const record=sim.whatIf.evaluations[0];assert(record.searchStoppedEarly);assert.equal(record.trialHistory.length,1);assert.equal(record.trialHistory[0].throughput,102);assert.equal(record.trialHistory[0].changes[0].after,15000);assert.match(record.doeSkippedReason,/finished early/);assert.equal(record.independentCheck.passed,outcome==='pass');assert.equal(save.disabled,false);if(outcome==='fail'){save.click();assert.equal(created.evidence.independentValidation,'NOT_REPRODUCED_REQUIRES_VALIDATION');}
     if(outcome==='pass'){save.click();assert.equal(created.changes[0].after,15000);assert.match(card.textContent,/search finished early|Category search finished early/);}
    }
   }
   assert.equal(stop.dataset.icon,'search');assert.equal(e.processData.geometry.lactMm,10000);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: finishing during DOE preserves partial observations without estimating effects',async()=>{
 const h=await setup({remember:true});try{
  h.w.STScenarioExplorer.setDOE(true);const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];e.processData.geometry.lactMm=10000;sim.dynamicConfig={durationSeconds:10,seed:42,rounds:3};
  const project={title:'Partial DOE',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',explore:true,changes:[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}]};
  let release;const calls=[];h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(input);const length=input.case.equipment[1].processData.geometry.lactMm;if(input.run.seed===42&&length===11000)await new Promise(resolve=>release=resolve);const gain=length>10000?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);const factor=card.querySelector('.scenario-doe-select');factor.checked=true;factor.dispatchEvent(new h.w.Event('change'));const levels=card.querySelectorAll('.scenario-doe-factor .scenario-doe-level');levels[0].value=11;levels[1].value=14;
  card.querySelector('.scenario-search').click();await waitFor(()=>release);assert.match(card.querySelector('.scenario-search-progress').textContent,/DOE/);
  card.querySelector('.scenario-evaluate').click();release();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const record=sim.whatIf.evaluations[0];assert(record.searchStoppedEarly);assert.equal(record.doe.observations.length,1);assert.equal(record.doe.analysis.complete,false);assert.equal(record.doe.analysis.effects.length,0);assert(record.independentCheck.passed);assert(!calls.some(c=>c.case.equipment[1].processData.geometry.lactMm===14000));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI + Apps Script: High CAPEX creation saves the validated winner from manual Basic mode',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');const before=h.storedCases()[0],signature=JSON.stringify(before.simulations[0].equipment);
  h.w.SimulatorEngine.simulateBatch=async input=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:JSON.stringify(input.case.equipment)===signature?50:51,outputCount:JSON.stringify(input.case.equipment)===signature?100:101}}});
  await h.click('[data-basic-view=whatif]');const card=h.d.querySelector('.scenario-tier-grid').lastElementChild;
  let selection=0;for(const row of card.querySelectorAll('.scenario-change')){const input=row.querySelector('input[type=checkbox]');input.checked=selection++===0;input.dispatchEvent(new h.w.Event('change'));}
  card.querySelector('.scenario-search').click();for(let i=0;i<400&&card.querySelector('.scenario-evaluate').dataset.icon!=='search';i++)await settle();assert.equal(card.querySelector('.scenario-evaluate').dataset.icon,'search');
  assert.equal(card.querySelector('.scenario-create').disabled,false,card.querySelector('.scenario-preview-status').textContent);
  assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  await h.click('.scenario-tier-grid .analysis-recommendation:last-child .scenario-create');if(card.querySelector('.scenario-audit-warnings'))assert.match(h.d.querySelector('.message-dialog').textContent,/Engineering review required/);
  await h.click('.message-dialog .dialog-heading button');assert(!h.calls.includes('createScenario'));assert(!card.querySelector('.scenario-create').disabled);
  await h.click('.scenario-tier-grid .analysis-recommendation:last-child .scenario-create');await h.click('.message-dialog .dialog-actions button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const saved=h.storedCases()[0],scenario=saved.simulations[1];
  assert.equal(scenario.scenario.origin,'REVIEWED');assert(scenario.scenario.changes.length>0);assert.equal(JSON.stringify(saved.simulations[0].equipment),signature);assert.equal(scenario.results,null);
  assert(saved.simulations[0].whatIf.evaluations.some(e=>e.searchScope==='HIGH'&&e.independentCheck?.passed));if(card.querySelector('.scenario-audit-warnings')){assert.equal(scenario.scenario.evidence.engineeringReview,'ACKNOWLEDGED_REQUIRES_REVIEW');assert(saved.simulations[0].whatIf.evaluations.some(e=>e.engineeringReviewAcknowledged));}assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Gemini reveals complete paragraphs progressively and shows scenario actions only after the text finishes',async()=>{
 for(const uiMode of ['ADVANCE','BASIC']){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');await h.click('#toggle-gemini');
   const sim=h.storedCases()[0].simulations[0],proposal=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply),answer='Primer párrafo.\n\nSegundo párrafo.\n\nTercer párrafo.';
   h.api.askGemini=()=>({text:answer,proposals:[proposal]});
   const timers=[],original=h.w.setTimeout;h.w.ST_GEMINI_CHAT_PRESENTATION.paragraphDelayMs=5000;h.w.ST_GEMINI_CHAT_PRESENTATION.maxDurationMs=15000;
   h.w.setTimeout=(fn,ms,...args)=>ms===5000?(timers.push(fn),900001):original(fn,ms,...args);
   h.d.getElementById('gemini-question').value='¿Qué mejoras sugieres?';await h.click('#send-gemini');await waitFor(()=>timers.length===1);
   const body=h.d.querySelector('.gemini-message[data-role=model] .gemini-message-body');assert.equal(body.textContent,'Primer párrafo.\n\n');assert(h.d.getElementById('send-gemini').disabled);assert.equal(h.d.querySelector('#gemini-messages .gemini-scenario-create'),null);
   timers.shift()();assert.equal(body.textContent,'Primer párrafo.\n\nSegundo párrafo.\n\n');assert.equal(timers.length,1);assert.equal(h.d.querySelector('#gemini-messages .gemini-scenario-create'),null);
   timers.shift()();assert.equal(body.textContent,answer);await waitFor(()=>!h.d.getElementById('send-gemini').disabled);assert.equal(h.d.getElementById('send-gemini').disabled,false);assert.equal(h.d.getElementById('gemini-messages').getAttribute('aria-busy'),'false');
   assert(h.d.querySelector('#gemini-messages .gemini-scenario-create'));assert.equal(h.d.querySelector('#gemini-messages .analysis-recommendation'),null);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});
test('UI: Gemini paragraph reveal respects reduced motion and stops when leaving the source case',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const answer='First paragraph.\n\nSecond paragraph.';h.api.askGemini=()=>({text:answer});
  h.media.matches=true;h.d.getElementById('gemini-question').value='Explain';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-message[data-role=model]'));
  assert.equal(h.d.querySelector('.gemini-message[data-role=model] .gemini-message-body').textContent,answer);await waitFor(()=>!h.d.getElementById('send-gemini').disabled);assert.equal(h.d.getElementById('send-gemini').disabled,false);
  h.media.matches=false;const original=h.w.setTimeout;let reveal;
  h.w.ST_GEMINI_CHAT_PRESENTATION.paragraphDelayMs=5000;h.w.ST_GEMINI_CHAT_PRESENTATION.maxDurationMs=15000;
  h.w.setTimeout=(fn,ms,...args)=>ms===5000?(reveal=fn,900001):original(fn,ms,...args);
  h.d.getElementById('gemini-question').value='Explain again';await h.click('#send-gemini');await waitFor(()=>reveal);
  await h.click('#home-cases');assert(h.visible('cases-panel'));assert.equal(h.d.getElementById('gemini-messages').textContent,'');reveal();assert.equal(h.d.getElementById('gemini-messages').textContent,'');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: pinned header contains activity at its lower edge and Basic conveyor controls share the title row',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  const header=h.d.querySelector('.topbar'),pin=h.d.getElementById('pin-header');assert.equal(header.dataset.pinned,'true');assert.equal(h.d.getElementById('request-progress').parentNode,header);
  await h.click('#pin-header');assert.equal(header.dataset.pinned,'false');assert.equal(h.w.localStorage.getItem('st.ui.v1.headerPinned'),'no');await h.click('#pin-header');assert.equal(header.dataset.pinned,'true');
  h.w.dispatchEvent(new h.w.CustomEvent('st-calculation-activity',{detail:{active:true}}));assert(h.visible('request-progress'));h.w.dispatchEvent(new h.w.CustomEvent('st-calculation-activity',{detail:{active:false}}));assert(!h.visible('request-progress'));
  await h.click('.open-case');await h.click('[data-basic-view=conveyors]');assert.equal(h.d.querySelector('.basic-conveyor-tabs').parentNode,h.d.querySelector('#basic-conveyor-panel h3').parentNode);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: parallel CAPEX alternatives preserve serial winners, evidence and full configured rounds',async()=>{
 const evidence=[];
 for(const concurrency of [1,2]){
  const h=await setup({remember:true});try{
   h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200,parallelCandidates:concurrency};
   const sim=h.storedCases()[0].simulations[0],belts=sim.equipment.filter(e=>e.type==='CONVEYOR').slice(0,2);belts.forEach(e=>e.processData.geometry.lactMm=10000);sim.dynamicConfig={durationSeconds:60,tickSeconds:.25,seed:42,rounds:5};
   const changes=belts.map(e=>({equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}));
   let active=0,maxRefining=0;
   h.w.SimulatorEngine.simulateBatch=async input=>{
    assert.equal(input.run.rounds,5);assert.equal(input.run.tickSeconds,.25);assert.equal(input.run.durationSeconds,60);
    active++;if(h.d.querySelector('.scenario-search-progress').textContent.includes('Refining'))maxRefining=Math.max(maxRefining,active);
    const lengths=belts.map(b=>input.case.equipment.find(e=>e.id===b.id).processData.geometry.lactMm);
    await new Promise(resolve=>setTimeout(resolve,lengths[1]===10000?25:2));active--;
    const gain=5-Math.abs(lengths[0]-12500)/1000-Math.abs(lengths[1]-15000)/1000;
    return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};
   };
   const card=h.w.STWhatIf.card({title:'Exact alternatives',kind:'CUSTOM',tier:'HIGH',changes,explore:true},()=>{},sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
   const record=sim.whatIf.evaluations[0];assert.deepEqual(belts.map(b=>record.evaluatedChanges.find(c=>c.equipmentId===b.id).after),[12500,15000]);assert(record.independentCheck.passed);assert.equal(maxRefining,concurrency);
   evidence.push(JSON.parse(JSON.stringify({changes:record.evaluatedChanges,candidate:record.candidate,delta:record.delta,trials:record.trials,history:record.trialHistory,variables:record.searchVariables,bestAtTrial:record.bestAtTrial,independentCheck:record.independentCheck})));
   assert(belts.every(e=>e.processData.geometry.lactMm===10000));assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
 assert.deepEqual(evidence[1],evidence[0]);
});

test('UI: repeated CAPEX configurations reuse exact metrics across more than 32 cache entries',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],belt=sim.equipment.find(e=>e.type==='CONVEYOR');belt.processData.geometry.lactMm=10000;sim.dynamicConfig={durationSeconds:60,seed:42,rounds:3};
  let calls=0;h.w.SimulatorEngine.simulateBatch=async input=>{calls++;const gain=input.case.equipment.find(e=>e.id===belt.id).processData.geometry.lactMm>10000?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card({title:'Cached alternatives',kind:'CUSTOM',tier:'HIGH',changes:[{equipmentId:belt.id,path:'processData.geometry.lactMm',before:10000,after:20000,unit:'mm'}],explore:true},()=>{},sim.equipment,sim);h.d.body.append(card);
  const input=card.querySelector('.scenario-change input[type=number]'),run=card.querySelector('.scenario-evaluate'),save=card.querySelector('.scenario-create');
  for(let i=0;i<40;i++){input.value=String(11+i/10);input.dispatchEvent(new h.w.Event('input'));run.click();await waitFor(()=>!save.disabled);}
  const before=calls;assert(before>64,'expected distinct configurations; calculated '+before+' batches');
  input.value='11';input.dispatchEvent(new h.w.Event('input'));run.click();await waitFor(()=>!save.disabled);assert.equal(calls,before,'same inputs, seeds and rounds reuse both evaluation and confirmation');
  sim.dynamicConfig.seed=43;card.remove();
  const revised=h.w.STWhatIf.card({title:'Cached alternatives',kind:'CUSTOM',tier:'HIGH',changes:[{equipmentId:belt.id,path:'processData.geometry.lactMm',before:10000,after:11000,unit:'mm'}],explore:true},()=>{},sim.equipment,sim);h.d.body.append(revised);revised.querySelector('.scenario-evaluate').click();await waitFor(()=>!revised.querySelector('.scenario-create').disabled);assert(calls>before,'a changed seed must be recalculated');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: scenario budgets and stagnation finish with full-round independent confirmation',async()=>{
 for(const reason of ['budget','stagnation']){
 const h=await setup({remember:true});try{
  h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:reason==='budget'?1:40,maxSearchMs:600000,maxWithoutImprovement:reason==='stagnation'?1:12};
  const sim=h.storedCases()[0].simulations[0],belts=sim.equipment.filter(e=>e.type==='CONVEYOR').slice(0,2);belts.forEach(e=>e.processData.geometry.lactMm=10000);sim.dynamicConfig={seed:42,durationSeconds:60,rounds:5};
  const project={title:'Budget search',kind:'CUSTOM',tier:'HIGH',basis:'STATIC',explore:true,changes:belts.map(e=>({equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}))};
  const calls=[];h.w.SimulatorEngine.simulateBatch=async(input,options)=>{calls.push({input,options});const gain=input.case.equipment.some(e=>belts.some(b=>b.id===e.id)&&e.processData.geometry.lactMm>10000)?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const record=sim.whatIf.evaluations[0];assert(record.searchStoppedEarly);assert.match(record.stopReason,reason==='budget'?/budget/:/No meaningful improvement/);assert(record.independentCheck.passed);assert(calls.every(c=>c.input.run.rounds===5&&c.options.summaryOnly));assert.equal(calls.filter(c=>c.input.run.seed!==42).length,2);assert(calls.length<=5);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI + Apps Script: saving a large replicated result compacts replay and preserves full metrics',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=60;h.d.getElementById('run-rounds').value=2;h.d.getElementById('run-sample-interval').value=1;
  let full;const run=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async(...args)=>{const response=await run(...args);full=JSON.parse(JSON.stringify(response.result));for(const replay of [response.result,...response.result.batch.replays])for(const sample of replay.samples)sample.extraDetail='x'.repeat(8000);return response;};
  await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await waitFor(()=>!h.d.getElementById('batch-dialog').open&&h.d.getElementById('simulation-json-preview').value.includes('st-replications'));await h.click('#pause-simulation');
  const preview=JSON.parse(h.d.getElementById('simulation-json-preview').value),originalSave=h.api.saveCase;assert.equal(preview.coverage.samplesIncluded,false);let payloadBytes;
  h.api.saveCase=request=>{payloadBytes=new h.w.Blob([JSON.stringify(request)]).size;return originalSave(request);};h.w.ST_CASE_SAVE_LIMITS.maxBytes=800000;
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results||h.d.getElementById('autosave-status').dataset.state==='error');assert(h.storedCases()[0].simulations[0].results,h.d.getElementById('status').textContent+' '+h.d.getElementById('autosave-status').title);
  const saved=h.storedCases()[0].simulations[0].results;assert(payloadBytes<=800000);assert.equal(saved.replay.samples.length,full.samples.length);assert(saved.replay.samples.every(sample=>sample.extraDetail===undefined));assert.equal(saved.replay.samples[0].virtualSecond,0);assert.equal(saved.replay.samples.at(-1).virtualSecond,60);assert.deepEqual(saved.batch.statistics,full.batch.statistics);assert.deepEqual(saved.equipmentMetrics,full.equipmentMetrics);assert.equal(saved.replay.detailCoverage.storageFormat,'chart-history-1');assert.equal(saved.replay.events.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: switchable conveyor fields retain inactive manual values through save and reload in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
 const h=await setup({remember:true,uiMode,realScenarioServer:true});try{
  h.w.STPreferences.write('autosaveEnabled','no');h.w.dispatchEvent(new h.w.Event('st-save-policy-change'));
  async function open(){await h.click('.open-case');if(uiMode==='BASIC')await h.click('[data-basic-view=conveyors]');else{await h.click('.sidebar [data-view=editor]');h.d.querySelectorAll('.equipment-card')[1].click();}}
  await open();const field=key=>h.d.querySelector('#equipment-inspector .format-zone-'+key);
  function change(key,value){const input=field(key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  for(const key of ['population','lba','overspeed'])assert.equal(field(key+'-enabled').nextElementSibling,field(key));
  if(uiMode==='BASIC'){
   const output=h.d.querySelector('#equipment-inspector .basic-worksheet-group output');
   const outputStyle=h.w.getComputedStyle(output);
   for(const key of ['population','lba','overspeed']){
    const calculatedStyle=h.w.getComputedStyle(field(key));
    for(const property of ['backgroundColor','color','fontSize','fontWeight','padding','height','borderRadius','textAlign'])assert.equal(calculatedStyle[property],outputStyle[property],key+' '+property);
   }
  }
  change('population-enabled',true);change('population',50);change('population-enabled',false);assert(field('population').readOnly);assert(field('population').classList.contains('calculated-value'));
  change('lba-enabled',true);change('lba',1000);change('lba-enabled',false);
  change('overspeed-enabled',true);change('overspeed',20);assert(!field('population-enabled').checked);assert(field('belt-speed').disabled);assert(!field('overspeed').readOnly);change('overspeed-enabled',false);
  const revision=h.storedCases()[0].revision;await h.click('#save-case');await waitFor(()=>h.storedCases()[0].revision>revision);
  const acc=h.storedCases()[0].simulations[0].equipment[1].processData.accumulation;assert.equal(acc.inputValues.populationPercent,50);assert.equal(acc.inputValues.lbaMm,1000);assert.equal(acc.inputValues.overspeedPercent,20);assert.equal(acc.targetOverspeedPercent,undefined);assert.equal(acc.targetPopulationPercent,undefined);assert.equal(acc.manualLbaMm,undefined);
  await h.click('#home-cases');await open();change('population-enabled',true);assert.equal(Number(field('population').value),50);change('lba-enabled',true);assert.equal(Number(field('lba').value),1000);change('overspeed-enabled',true);assert.equal(Number(field('overspeed').value),20);assert.equal(field('population-enabled').checked,false);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});


test('UI: cold case index loads incrementally without preloading case results and retries errors',async()=>{
 const h=await setup({remember:true,indexedCatalog:'cold'});try{
  assert.match(h.d.getElementById('cases-list').textContent,/Updating case list/);assert(!h.calls.includes('getCase'));
  let pages=0;h.api.refreshCaseCatalog=request=>{pages++;if(pages===1)return {cases:[{id:'demo',name:'Indexed demo',revision:1,equipmentCount:13,isSimulationReady:true,updatedAt:'2026-10-06'}],hasMore:true,cursor:'next'};throw Error('temporary failure');};
  await waitFor(()=>h.d.querySelector('.open-case'));assert(!h.calls.includes('getCase'));await waitFor(()=>h.d.getElementById('case-catalog-status').classList.contains('error'));
  assert.equal(h.d.querySelector('.case-name').textContent,'Indexed demo');assert.equal(h.d.getElementById('refresh-case-catalog').disabled,false);
  h.api.refreshCaseCatalog=()=>({cases:[{id:'demo',name:'Current demo',revision:2,equipmentCount:13,isSimulationReady:true,updatedAt:'2026-10-06'}],hasMore:false,cursor:null});await h.click('#refresh-case-catalog');await waitFor(()=>h.d.querySelector('.case-name').textContent==='Current demo');
  await h.click('.open-case');assert.equal(h.calls.filter(n=>n==='getCase').length,1);assert(h.visible('run-panel'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: a case clone made during catalog refresh survives a stale background response',async()=>{
 const h=await setup({remember:true,indexedCatalog:'warm'});try{
  await waitFor(()=>!h.d.getElementById('refresh-case-catalog').disabled);
  const runner=h.w.google.script.run;let complete;
  h.w.google.script.run={withFailureHandler(){return this;},withSuccessHandler(callback){complete=callback;return this;},refreshCaseCatalog(){}};
  await h.click('#refresh-case-catalog');await waitFor(()=>complete);h.w.google.script.run=runner;
  await h.click('.clone-case');await waitFor(()=>h.d.querySelectorAll('.case-row').length===2);
  complete({ok:true,data:{cases:[{id:'demo',name:'Original',revision:1,equipmentCount:13,isSimulationReady:true,updatedAt:'2026-09-15'}],hasMore:false,cursor:null}});
  assert.equal(h.d.querySelectorAll('.case-row').length,2);assert(h.d.getElementById('cases-list').textContent.includes('Copy of'));
  complete=null;h.w.google.script.run={withFailureHandler(){return this;},withSuccessHandler(callback){complete=callback;return this;},refreshCaseCatalog(){}};
  await h.click('#refresh-case-catalog');await waitFor(()=>complete);h.w.google.script.run=runner;await h.click('#cases-sign-out');
  complete({ok:true,data:{cases:[{id:'old',name:'Old session case'}],hasMore:false,cursor:null}});assert(h.visible('auth-panel'));assert.equal(h.d.getElementById('cases-list').children.length,0);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: gallery deletion requires confirmation and saves show dirty theme color without visible status text',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  const trash=h.d.querySelector('.delete-gallery-case');assert(trash);assert(trash.querySelector('svg'));assert.equal(trash.textContent,'');assert(trash.getAttribute('aria-label'));
  await h.click('.delete-gallery-case');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:first-child');assert.equal(h.storedCases().length,1);assert(!h.calls.includes('deleteCase'));
  await h.click('.open-case');const save=h.d.getElementById('save-case');assert(!save.classList.contains('has-changes'));assert(save.disabled);
  const name=h.d.getElementById('case-name');name.value='Changed';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert(save.classList.contains('has-changes'));
  assert(h.d.getElementById('autosave-status').classList.contains('sr-only'));
  await h.click('#save-case');await waitFor(()=>!save.classList.contains('has-changes'));assert(save.disabled);
  await h.click('#home-cases');await h.click('.delete-gallery-case');await h.click('.message-dialog .danger');await waitFor(()=>h.storedCases().length===0);assert(h.visible('cases-panel'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: live cards use four columns and let the graph fill the removed controls area',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;h.d.getElementById('run-rounds').value=1;await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await waitFor(()=>h.d.querySelector('.live-equipment-card'));await h.click('#pause-simulation');
  const card=h.d.querySelector('.live-equipment-card'),row=card.querySelector('.live-equipment-card__row'),graph=card.querySelector('.live-speed-cell'),canvas=graph.querySelector('canvas');
  assert.equal(h.w.getComputedStyle(row).gridTemplateColumns,'minmax(0,1.15fr) minmax(0,.92fr) minmax(0,.65fr) minmax(0,2fr)');
  assert.equal(h.w.getComputedStyle(graph).gridColumn,'4');assert.equal(h.w.getComputedStyle(graph).gridRow,'auto');assert.equal(h.w.getComputedStyle(graph).alignSelf,'stretch');assert.equal(h.w.getComputedStyle(canvas).flexGrow,'0');assert.equal(h.w.getComputedStyle(canvas).height,'var(--basic-spark-height)');assert.equal(h.w.getComputedStyle(canvas).maxHeight,'var(--basic-spark-height)');assert.equal(h.w.getComputedStyle(card.querySelector('.live-equipment-controls')).display,'none');
  const css=postcss.parse(read('BasicModeStyles.html').replace(/<\/?style>/g,''));let responsive=0;
  css.walkAtRules(rule=>{if((rule.name==='media'&&rule.params==='(max-width:1260px)')||(rule.name==='container'&&rule.params==='(max-width:900px)')){rule.walkRules(item=>{if(item.selector.includes('.live-speed-cell')){assert(item.nodes.some(d=>d.prop==='grid-column'&&d.value==='1 / -1'));assert(item.nodes.some(d=>d.prop==='grid-row'&&d.value==='auto'));responsive++;}});}});assert.equal(responsive,2);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Reset cancels initial and background calculation, unlocks settings and ignores late results',async()=>{
 for(const uiMode of ['BASIC','ADVANCE'])for(const firstReady of [false,true]){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';
   h.d.getElementById('run-duration').value=5;h.d.getElementById('run-rounds').value=3;
   const original=h.w.SimulatorEngine.simulateBatch,requests=[];
   h.w.SimulatorEngine.simulateBatch=async(input,options)=>{
    const request={input,options};requests.push(request);
    const response=await original(input,{cancelled:()=>false});request.response=response;
    if(firstReady)options.onFirstRound(response.result);
    await new Promise(resolve=>request.release=resolve);return response;
   };
   await h.click('#run-simulation');await waitFor(()=>requests[0]?.release);
   assert(h.d.getElementById('run-rounds').disabled);
   await h.click('#reset-playback');
   assert(requests[0].options.cancelled());
   assert(h.d.getElementById('batch-dialog').classList.contains('hidden'));
   for(const id of ['run-rounds','run-sample-interval','duration-mode','run-duration','run-simulation'])assert.equal(h.d.getElementById(id).disabled,false,id);
   h.d.getElementById('run-rounds').value=2;
   await h.click('#run-simulation');await waitFor(()=>requests[1]?.release);
   assert.equal(requests[1].input.run.rounds,2);
   requests[0].release();await settle();
   assert(h.d.getElementById('run-rounds').disabled,'old continuation must not unlock the new run');
   requests[1].release();await waitFor(()=>h.d.getElementById('batch-dialog').classList.contains('hidden'));
   if(uiMode==='BASIC')await h.click('#save-case');
   await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
   await h.click('#reset-playback');assert.equal(h.d.getElementById('metric-time').textContent,'0 s');
   assert.equal(h.d.getElementById('run-rounds').disabled,false);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: first round starts before background completion and final events replace stale replica statistics',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');h.d.getElementById('run-duration').value=5;h.d.getElementById('run-sample-interval').value=1;h.d.getElementById('run-rounds').value=3;
  const original=h.w.SimulatorEngine.simulateBatch,requests=[];let release;
  h.w.SimulatorEngine.simulateBatch=async(input,options)=>{
    requests.push(JSON.parse(JSON.stringify(input)));
    if(!options.firstResult){const first=await h.w.SimulatorEngine.simulateLineAsync(input,{detail:true});options.onFirstRound(first.result);const response=await original(input,{...options,onFirstRound:undefined,cancelled:()=>false});await new Promise(resolve=>release=resolve);return response;}
    return original(input,options);
  };
  await h.click('#run-simulation');await waitFor(()=>release&&h.d.querySelector('.live-equipment-card'));await h.click('#pause-simulation');
  assert.equal(h.d.getElementById('batch-dialog').tagName,'SECTION');assert(!h.d.getElementById('batch-dialog').classList.contains('hidden'));await waitFor(()=>h.storedCases()[0].simulations[0].results?.replicationStatus.state==='PENDING');assert.equal(h.storedCases()[0].simulations[0].results.replicationStatus.state,'PENDING');assert.equal(h.storedCases()[0].simulations[0].results.batch,undefined);
  await h.click('#reset-playback');await h.click('.live-control-stop');await waitFor(()=>h.storedCases()[0].simulations[0].results?.replicationStatus.state==='STALE');assert.equal(requests.length,1,'events do not restart later rounds before playback finishes');
  h.d.getElementById('run-playback-rate').value=100;await h.click('#play-simulation');await waitFor(()=>requests.length===2&&h.storedCases()[0].simulations[0].results?.batch);
  assert(!h.d.getElementById('rounds-warning').classList.contains('hidden'));assert(requests[1].run.commands.some(command=>command.action==='STOP'));assert(h.storedCases()[0].simulations[0].results.batch.rows.every(row=>row.summary.outputCount===0));
  release();await settle();assert(h.storedCases()[0].simulations[0].results.batch.rows.every(row=>row.summary.outputCount===0),'a late initial batch cannot overwrite recomputed events');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: header icon spacing has no empty save-status slot and Basic graphs remain bounded across redraws',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');const gemini=h.d.getElementById('toggle-gemini');assert.equal(gemini.textContent,'');assert(gemini.classList.contains('icon-button'));assert.equal(gemini.getAttribute('aria-label'),'Gemini');assert(gemini.querySelector('svg'));
  assert(h.d.getElementById('autosave-indicator').classList.contains('sr-only'));assert.equal(h.d.getElementById('retry-autosave').parentElement,h.d.getElementById('save-case').parentElement);
  h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=10;await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await h.click('#pause-simulation');
  const canvas=h.d.querySelector('.equipment-speed-sparkline');let observed=[];const ctx={scale:()=>{},clearRect:()=>{},beginPath:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>{},setLineDash:()=>{},fillText:()=>{},fillRect:()=>{}};
  canvas.getContext=()=>ctx;canvas.getBoundingClientRect=()=>({width:500,height:Math.max(80,canvas.height*2)});
  const state={run:{result:{samples:[],summary:{},durationSeconds:10},sampleIndex:0}};const charts=h.w.STCharts(state,String);
  for(let i=0;i<10;i++){charts.drawEquipmentSpeedSparkline(canvas,0,{nominalRatePerSecond:1});observed.push(canvas.height);}
  assert(observed.every(height=>height===80*(h.w.devicePixelRatio||1)));assert.equal(h.w.getComputedStyle(canvas).flexGrow,'0');assert.equal(h.w.getComputedStyle(canvas).maxHeight,'var(--basic-spark-height)');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: round-one playback streams before calculation finishes and run settings stay locked in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;h.d.getElementById('run-sample-interval').value=1;h.d.getElementById('run-rounds').value=3;
   if(uiMode==='BASIC')await h.click('[data-basic-view=simulation]');
   const original=h.w.SimulatorEngine.simulateBatch,first=h.w.SimulatorEngine.simulateLine({case:h.storedCases()[0],run:{durationSeconds:5,tickSeconds:.25,sampleEverySeconds:1,seed:20260909,commands:[]}}).result;
   let release,sendFrames;
   h.w.SimulatorEngine.simulateBatch=async(input,options)=>{
    const snapshot=(samples,time)=>({...first,samples,provisional:true,calculatedThroughSeconds:time});
    options.onFirstProgress(snapshot([first.samples[0]],0));
    sendFrames=()=>options.onFirstProgress(snapshot(first.samples.slice(1,3),2));
    await new Promise(resolve=>release=resolve);if(options.cancelled())throw Error('BATCH_CANCELLED');
    options.onFirstRound(first);return original(input,{...options,onFirstProgress:undefined,onFirstRound:undefined});
   };
   await h.click('#run-simulation');await waitFor(()=>release&&h.d.querySelector('.live-equipment-card'));
   assert(h.visible('simulation-results'));assert(h.visible('batch-dialog'));assert.match(h.d.getElementById('batch-title').textContent,/Calculating rounds/);
   for(const id of ['duration-mode','run-duration','run-shift-hours','run-shift-count','run-rounds','run-sample-interval','run-seed','run-simulation'])assert(h.d.getElementById(id).disabled,id);
   assert(!h.d.getElementById('run-playback-rate').disabled);assert(!h.d.getElementById('pause-simulation').disabled);
   const shifts=h.d.querySelector('[data-control=run-shift-count][data-value="2"]');if(shifts){assert(shifts.disabled);shifts.click();assert.equal(h.d.getElementById('run-shift-count').value,'1');}
   h.d.getElementById('run-rounds').value=9;h.d.getElementById('run-rounds').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(h.d.getElementById('run-rounds').value,'3');
   h.d.getElementById('run-playback-rate').value=100;h.d.getElementById('run-playback-rate').dispatchEvent(new h.w.Event('change'));sendFrames();
   await waitFor(()=>h.d.getElementById('metric-time').textContent==='2 s');assert.equal(h.d.getElementById('playback-progress').textContent,'40.0%');assert.equal(h.d.getElementById('playback-status').textContent.startsWith('Completed'),false,'waiting for more frames is not completion');
   assert.equal(h.storedCases()[0].simulations[0].results,null,'partial output is never saved as a completed simulation');
   await h.click('#pause-simulation');assert(h.d.getElementById('run-rounds').disabled,'pausing playback keeps run settings locked');
   release();await waitFor(()=>h.d.getElementById('simulation-json-preview').value.includes('st-replications'));await h.click('#play-simulation');await waitFor(()=>h.d.getElementById('playback-status').textContent==='Completed');
   assert(!h.d.getElementById('run-rounds').disabled);assert(!h.d.getElementById('run-shift-count').disabled);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: an event during streamed calculation invalidates old frames and recalculates replicas at playback end',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');h.d.getElementById('run-duration').value=5;h.d.getElementById('run-sample-interval').value=1;h.d.getElementById('run-rounds').value=3;
  const original=h.w.SimulatorEngine.simulateBatch;let release,stalePartial,calls=0;
  h.w.SimulatorEngine.simulateBatch=async(input,options)=>{
   calls++;if(options.firstResult)return original(input,options);
   const first=h.w.SimulatorEngine.simulateLine(input).result;
   stalePartial=()=>options.onFirstProgress({...first,samples:first.samples,provisional:true,calculatedThroughSeconds:5});
   options.onFirstProgress({...first,samples:[first.samples[0]],provisional:true,calculatedThroughSeconds:0});
   await new Promise(resolve=>release=resolve);
   options.onFirstRound(first);return original(input,{...options,onFirstProgress:undefined,onFirstRound:undefined,cancelled:()=>false});
  };
  await h.click('#run-simulation');await waitFor(()=>release&&h.d.querySelector('.live-control-stop'));await h.click('#pause-simulation');await h.click('.live-control-stop');
  await waitFor(()=>h.storedCases()[0].simulations[0].results?.replicationStatus.state==='STALE');stalePartial();assert.equal(h.d.getElementById('metric-output').textContent,'0');assert.equal(calls,1);
  h.d.getElementById('run-playback-rate').value=100;await h.click('#play-simulation');await waitFor(()=>calls===2&&h.storedCases()[0].simulations[0].results?.batch);
  const batch=h.storedCases()[0].simulations[0].results.batch;assert(batch.rows.every(row=>row.summary.outputCount===0));assert(h.visible('rounds-warning'));
  release();await settle();assert(h.storedCases()[0].simulations[0].results.batch.rows.every(row=>row.summary.outputCount===0));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: gallery tools share the title row in cards while delete keeps its confirmation',async()=>{
 const h=await setup({remember:true});try{
  await h.click('#case-layout');assert(h.d.getElementById('cases-list').classList.contains('grid'));
  const card=h.d.querySelector('.case-row'),tools=card.querySelector('.case-tools'),meta=card.querySelector('.case-actions');
  assert.equal(h.w.getComputedStyle(card).display,'grid');assert.equal(h.w.getComputedStyle(tools).gridRow,'1');assert.equal(h.w.getComputedStyle(tools).gridColumn,'2');assert.equal(h.w.getComputedStyle(meta).gridColumn,'1 / -1');
  assert.equal(tools.querySelectorAll('button').length,2);assert(!meta.querySelector('button'));assert.equal(tools.querySelector('.delete-gallery-case').textContent,'');
  await h.click('.delete-gallery-case');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .dialog-actions button:first-child');assert.equal(h.storedCases().length,1);assert(!h.calls.includes('deleteCase'));
  await h.click('#case-layout');assert(!h.d.getElementById('cases-list').classList.contains('grid'));assert.equal(h.d.querySelector('.case-row').querySelector('.case-tools').children.length,2);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: V-graph reacts to draft fields without simulation and Basic sections follow the requested order',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');const saved=JSON.stringify(h.storedCases()[0].equipment);let simulated=0;
   for(const key of ['simulateLine','simulateLineAsync','simulateBatch'])h.w.SimulatorEngine[key]=()=>{simulated++;throw Error('Design edits must not run simulation');};
   if(uiMode==='BASIC'){
    assert.deepEqual(Array.from(h.d.querySelectorAll('#basic-navigation button:not([data-basic-view=comparison])')).map(b=>b.dataset.basicView),['equipment','conveyors','products','vgraph','simulation','results','realdata','whatif']);
    await h.click('[data-basic-view=equipment]');
   }else {await h.click('#open-settings');h.d.getElementById('settings-autosave').checked=false;h.d.getElementById('settings-autosave').dispatchEvent(new h.w.Event('change'));await h.click('#settings-cancel');await h.click('.sidebar [data-view=editor]');}
   const first=h.d.querySelector('.equipment-card'),id=first.dataset.equipmentId;
   const change=(control,value)=>{if(control.type==='checkbox')control.checked=value;else control.value=String(value);control.dispatchEvent(new h.w.Event(control.type==='checkbox'?'change':'input',{bubbles:true}));};
   change(first._fields.querySelector('.equipment-pacemaker'),true);change(first._fields.querySelector('.equipment-rate'),300);
   let points=h.d.getElementById('vgraph-plot')._vgraphPoints;assert.equal(points.find(p=>p.isPacemaker).id,id);assert.equal(points.find(p=>p.id===id).normalBpm,300);
   const target=Array.from(h.d.querySelectorAll('.equipment-card')).find(card=>card.dataset.equipmentId==='pucker-1');
   change(target._fields.querySelector('.equipment-maximum-speed'),500);change(target._fields.querySelector('.reliability-mtbfMinutes'),100);change(target._fields.querySelector('.reliability-mttrMinutes'),1);change(target._fields.querySelector('.equipment-recovery-time'),60);
   points=h.d.getElementById('vgraph-plot')._vgraphPoints;const before=points.find(p=>p.id==='pucker-1');assert.equal(before.maximumBpm,500);assert.equal(before.recoveryTimeSeconds,60);assert(before.recommendedBpm>before.normalBpm);
   change(target._fields.querySelector('.reliability-mttrMinutes'),.1);points=h.d.getElementById('vgraph-plot')._vgraphPoints;assert(points.find(p=>p.id==='pucker-1').recommendedBpm<before.recommendedBpm);
   const conveyor=h.d.querySelector('[data-equipment-id="conveyor-1"]');change(conveyor._fields.querySelector('.format-zone-lba-enabled'),true);change(conveyor._fields.querySelector('.format-zone-lba'),60);
   points=h.d.getElementById('vgraph-plot')._vgraphPoints;assert(points.find(p=>p.id==='pucker-1').recommendedBpm<=301,'conveyor draft geometry reaches the design calculation');
   assert.equal(JSON.stringify(h.storedCases()[0].equipment),saved,'preview does not save or mutate stored inputs');
   if(uiMode==='BASIC')await h.click('[data-basic-view=vgraph]');else await h.click('.sidebar [data-view=results]');
   assert(h.visible('results-body'));assert(h.d.querySelector('#vgraph-plot svg'));assert.equal(h.d.getElementById('vgraph-plot')._vgraphPoints.find(p=>p.isPacemaker).id,id);assert(h.d.getElementById('export-ai').disabled);assert.equal(simulated,0);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});


test('UI: completed simulation reload restores exact metrics, chart history and conveyor details in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode,realScenarioServer:true});try{
   h.w.STPreferences.write('autosaveEnabled','no');h.w.dispatchEvent(new h.w.Event('st-save-policy-change'));
   await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;h.d.getElementById('run-rounds').value=2;h.d.getElementById('run-sample-interval').value=1;
   h.d.getElementById('run-playback-rate').value=100;h.d.getElementById('run-playback-rate').dispatchEvent(new h.w.Event('change',{bubbles:true}));
   await h.click('#run-simulation');await waitFor(()=>h.d.getElementById('playback-status').textContent==='Completed');
   const loss=h.d.querySelector('.loss-toggle');loss.click();
   const details=h.d.querySelector('.live-equipment-zone details');if(details){details.open=true;details.dispatchEvent(new h.w.Event('toggle'));}
   const ids=['metric-time','metric-output','metric-rate','metric-instant-rate','metric-line-oee','metric-buffer','metric-overflow','metric-backup-stop'];
   const metrics=ids.map(id=>h.d.getElementById(id).textContent),cards=Array.from(h.d.querySelectorAll('.live-equipment-card')).map(card=>[card.querySelector('.live-rate').textContent,card.querySelector('.live-processed').textContent,card.querySelector('.live-oee').textContent]);
   await h.click('#save-case');await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');
   const saved=h.storedCases()[0].simulations[0].results;assert.equal(saved.view.virtualSecond,5);assert.equal(saved.replay.events.length,0);assert.equal(saved.batch.rows.length,2);
   const zone=saved.replay.samples.at(-1).accumulationZones[0];assert.equal(zone.geometry,undefined);assert(saved.replay.zoneDefinitions[zone.id].geometry);
   assert.equal(saved.replay.summary,undefined);assert.equal(saved.replay.equipmentMetrics,undefined);
   const unchanged=JSON.stringify(h.storedCases()[0].simulations[0]);h.d.getElementById('case-name').value='Renamed case';h.d.getElementById('case-name').dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#save-case');await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');const beforeSim=JSON.parse(unchanged),afterSim=h.storedCases()[0].simulations[0];for(const key of Object.keys(beforeSim))assert.equal(JSON.stringify(afterSim[key]),JSON.stringify(beforeSim[key]),'case-only edit changed '+key);
   const record=h.storedCases()[0],second=JSON.parse(JSON.stringify(record.simulations[0]));second.id='completed-b';second.name='Completed B';delete second.results.view;
   record.simulations.push(second);record.activeSimulationId=second.id;record.expectedRevision=record.revision;h.api.saveCase(record);
   await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.getElementById('simulation-selector').value,'completed-b');
   assert.deepEqual(ids.map(id=>h.d.getElementById(id).textContent),metrics,'older completed results without a saved view open at the final frame');
   h.d.getElementById('simulation-selector').value='simulation-a';h.d.getElementById('simulation-selector').dispatchEvent(new h.w.Event('change'));await settle();
   assert.deepEqual(ids.map(id=>h.d.getElementById(id).textContent),metrics);
   assert.deepEqual(Array.from(h.d.querySelectorAll('.live-equipment-card')).map(card=>[card.querySelector('.live-rate').textContent,card.querySelector('.live-processed').textContent,card.querySelector('.live-oee').textContent]),cards);
   const restored=JSON.parse(h.d.getElementById('simulation-json-preview').value);assert(restored.coverage.sampleCount>2);assert.equal(restored.coverage.samplesIncluded,false);assert.equal(restored.durationSeconds,5);
   assert(h.d.querySelector('.live-equipment-card.show-losses'));if(details)assert(h.d.querySelector('.live-equipment-zone details').open);
   assert.equal(h.d.getElementById('run-playback-rate').value,'100');assert.equal(h.d.getElementById('autosave-status').dataset.state,'saved');assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});


test('UI: Create demo opens the created case, retains its gallery entry and reports creation failures',async()=>{
 for(const prepared of [true,false]){
  const h=await setup({uiMode:'BASIC'});try{
   const f=vm.createContext({Utilities:{base64Decode:value=>Buffer.from(value,'base64'),newBlob:bytes=>bytes,ungzip:bytes=>({getDataAsString:()=>gunzipSync(bytes).toString('utf8')})}});
   for(const name of ['DemoCaseFactory.gs','ScenarioEngine.gs',...(prepared?['DemoResults.gs']:[])])vm.runInContext(read(name),f);
   const record=JSON.parse(JSON.stringify(f.createDemoCaseRequest_()));Object.assign(record,{revision:1,ownerEmail:'preview@example.test',updatedAt:new Date().toISOString()});
   const getCase=h.api.getCase;h.api.getCase=id=>id===record.id?JSON.parse(JSON.stringify(record)):getCase(id);
   h.api.createDemoCase=()=>({id:record.id,name:record.name,equipmentCount:13,isSimulationReady:true,demoResultsPrepared:prepared});
   await h.click('#sign-in-button');const bootstraps=h.calls.filter(name=>name==='getBootstrap').length;
   await h.click('#create-demo-case');await waitFor(()=>h.d.getElementById('breadcrumb-case').textContent===record.name);
   assert.equal(h.calls.filter(name=>name==='getBootstrap').length,bootstraps);assert.equal(h.d.querySelectorAll('.equipment-card').length,13);
   assert.equal(h.d.getElementById('create-demo-case').disabled,false);
   if(!prepared){assert.match(h.d.querySelector('.message-dialog').textContent,/Demo created/);await h.click('.message-dialog button');}
   await h.click('#home-cases');assert(Array.from(h.d.querySelectorAll('.case-name')).some(el=>el.textContent===record.name));
   h.api.createDemoCase=()=>{throw Error('Storage unavailable');};await h.click('#create-demo-case');
   assert.match(h.d.querySelector('.message-dialog').textContent,/Demo creation failed/);assert.equal(h.d.getElementById('create-demo-case').disabled,false);
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: prepared demo opens with matching scenario card results and OEE comparison without running the engine',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  const f=vm.createContext({Utilities:{base64Decode:value=>Buffer.from(value,'base64'),newBlob:bytes=>bytes,ungzip:bytes=>({getDataAsString:()=>gunzipSync(bytes).toString('utf8')})}});for(const name of ['DemoCaseFactory.gs','DemoResults.gs','ScenarioEngine.gs'])vm.runInContext(read(name),f);
  vm.runInContext(read('ApiResponse.gs'),f);vm.runInContext(read('CaseService.gs'),f);
  const record=JSON.parse(JSON.stringify(f.createDemoCaseRequest_()));record.simulations=JSON.parse(JSON.stringify(f.normalizeSimulations_(record.simulations,[],{})));record.simulations.forEach(s=>{s.results={};s.equipment=s.equipment.map(unit=>Object.fromEntries(Object.entries(unit).reverse()));});f.applyPreparedDemoResults_(record);assert.equal(record.simulations[0].whatIf.evaluations.length,3);record.id='demo';record.expectedRevision=1;h.api.saveCase(record);
  let runs=0;h.w.SimulatorEngine.simulateBatch=()=>{runs++;throw Error('Prepared demo must not simulate on open');};
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view="whatif"]');
  assert(!h.d.getElementById('header-case-icon').classList.contains('hidden'));assert(h.d.getElementById('header-case-icon').querySelector('svg'));
  const cards=Array.from(h.d.querySelectorAll('.scenario-tier-grid .analysis-recommendation')).filter(c=>!c.classList.contains('scenario-current'));
  assert.equal(cards.length,3);cards.forEach((card,index)=>{const value=record.simulations[index+1].results.batch.statistics.lineOeePercent.mean.toFixed(1);assert.match(card.querySelector('.scenario-preview-status').textContent,/Saved demo scenario/);assert(card.querySelector('.scenario-basic-metrics').textContent.includes(value+'%'));});
  await h.click('[data-basic-view="comparison"]');assert.equal(h.d.querySelectorAll('.comparison-equipment-oee tbody tr').length,8);assert.equal(runs,0);assert.deepEqual(h.errors,[]);
  const source=Object.assign({},record.simulations[0],{unitOfFlow:record.unitOfFlow});const cached=await h.w.STScenarioExplorer.evaluate(source,[],()=>false,0,source.dynamicConfig);assert.equal(cached.oee,source.results.batch.statistics.lineOeePercent.mean);assert.equal(runs,0);
  await h.click('#home-cases');assert(!h.d.getElementById('header-case-icon').classList.contains('hidden'));assert.equal(h.d.getElementById('breadcrumb-case').textContent,'Workspace');
 }finally{h.dom.window.close();}
});

test('UI: scenario configuration suggests up to four DOE factors without simulation and toggles the Use column',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  const sim=h.storedCases()[0].simulations[0];
  let evaluations=0;h.w.SimulatorEngine.simulateBatch=()=>{evaluations++;throw Error('Suggestion must not simulate');};
  const changes=h.w.STScenarios.catalog(sim),project={title:'Factor selection',kind:'CUSTOM',tier:'HIGH',catalog:true,changes};
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-configure').click();
  const dialog=card.querySelector('dialog'),suggest=card.querySelector('.scenario-doe-suggest'),toggle=card.querySelector('.scenario-doe-enabled');
  assert(suggest.hidden);assert.equal(dialog.querySelectorAll('textarea').length,0);assert.equal(dialog.querySelectorAll('input[placeholder]').length,0);
  toggle.checked=true;toggle.dispatchEvent(new h.w.Event('change'));assert(!suggest.hidden);
  suggest.click();const picked=Array.from(dialog.querySelectorAll('.scenario-doe-select')).filter(input=>input.checked);
  assert(picked.length>0&&picked.length<=4);assert.equal(evaluations,0);assert.match(card.querySelector('.scenario-factor-count').textContent,/No simulation/);
  picked.forEach(input=>{const levels=input.closest('tr').querySelectorAll('.scenario-doe-level');assert(Number(levels[0].value)<Number(levels[1].value));});
  const master=dialog.querySelector('.scenario-use-all'),uses=Array.from(dialog.querySelectorAll('tbody tr > td:first-child input'));
  master.checked=true;master.dispatchEvent(new h.w.Event('change'));assert(uses.filter(input=>!input.disabled).every(input=>input.checked));assert(uses.filter(input=>input.disabled).every(input=>!input.checked));assert(master.checked&&!master.indeterminate);
  master.checked=false;master.dispatchEvent(new h.w.Event('change'));assert(uses.every(input=>!input.checked));assert(Array.from(dialog.querySelectorAll('.scenario-doe-select')).every(input=>!input.checked));
  const first=uses.find(input=>!input.disabled);first.checked=true;first.dispatchEvent(new h.w.Event('change'));assert(master.indeterminate);
  assert(master.closest('thead'));assert.equal(dialog.querySelector('tfoot'),null);
  const doeMaster=dialog.querySelector('.scenario-doe-all');assert(doeMaster.closest('thead'));
  doeMaster.checked=true;doeMaster.dispatchEvent(new h.w.Event('change'));
  const factors=Array.from(dialog.querySelectorAll('.scenario-doe-select'));
  assert.equal(factors.filter(input=>input.checked).length,Math.min(4,factors.length));assert(doeMaster.checked&&!doeMaster.indeterminate);
  doeMaster.checked=false;doeMaster.dispatchEvent(new h.w.Event('change'));assert(factors.every(input=>!input.checked));
  factors[0].checked=true;factors[0].dispatchEvent(new h.w.Event('change'));assert(doeMaster.indeterminate);
  toggle.checked=false;toggle.dispatchEvent(new h.w.Event('change'));assert(doeMaster.disabled);

  assert.equal(evaluations,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: intervention targets have no explanation field or edit button',async()=>{
 const h=await setup();try{
  const sim=h.storedCases()[0].simulations[0],e=sim.equipment[0],before=e.noiseProfile.reliability.mtbfMinutes;
  const card=h.w.STWhatIf.card({title:'Intervention',kind:'CUSTOM',tier:'MEDIUM',changes:[{equipmentId:e.id,path:'noiseProfile.reliability.mtbfMinutes',before,after:before*2,external:true,interventionType:'RETROFIT',justification:'Local drive rehabilitation; target from measured trials.'}]},()=>{},sim.equipment,sim);h.d.body.append(card);
  card.querySelector('.scenario-configure').click();
  assert.equal(card.querySelectorAll('textarea,.scenario-intervention-basis').length,0);
  assert.doesNotThrow(()=>h.w.STScenarios.apply(sim,[{equipmentId:e.id,path:'noiseProfile.reliability.mtbfMinutes',before,after:before*2,external:true,interventionType:'RETROFIT',justification:'Local drive rehabilitation; target from measured trials.'}]));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: DOE factors remain visible when disabled and can be enabled without unlocking Settings',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  const card=Array.from(h.d.querySelectorAll('.scenario-tier-grid .analysis-recommendation')).find(card=>card.querySelector('.scenario-doe-factor'));assert(card);card.querySelector('.scenario-configure').click();
  const panel=card.querySelector('.scenario-doe'),toggle=card.querySelector('.scenario-doe-enabled');assert.equal(panel.hidden,false);assert.equal(toggle.checked,false);assert(card.querySelectorAll('.scenario-doe-factor').length>0);assert(card.querySelector('.scenario-doe-factor .scenario-doe-select').disabled);
  toggle.checked=true;toggle.dispatchEvent(new h.w.Event('change'));assert.equal(h.w.STScenarioExplorer.doeEnabled(),true);assert(!card.querySelector('.scenario-doe-factor .scenario-doe-select').disabled,'supported factors can be chosen before searching');
  card.querySelector('.scenario-config-dialog').close();await h.click('#open-settings');assert(h.d.getElementById('settings-interface-section').classList.contains('hidden'));assert(!h.d.getElementById('settings-scenario-doe').closest('section').classList.contains('hidden'));
  h.d.getElementById('settings-scenario-doe').checked=false;await h.click('#settings-cancel');assert.equal(h.w.STScenarioExplorer.doeEnabled(),false);assert.equal(panel.hidden,false);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: Gemini formats Markdown during paragraph reveal and preserves simple scenario actions',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const sim=h.storedCases()[0].simulations[0],proposal=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);
  h.api.askGemini=()=>({text:'## Mejoras\n\n**Acumulación**: revisar bloqueo.\n\n- Validar con simulación\n- Comparar OEE',proposals:[proposal]});h.d.getElementById('gemini-question').value='Sugiere mejoras';await h.click('#send-gemini');await waitFor(()=>!h.d.getElementById('send-gemini').disabled&&h.d.querySelector('#gemini-messages .gemini-scenario-create'));
  const body=h.d.querySelector('.gemini-message[data-role=model] .gemini-message-body');assert.equal(body.querySelector('h2').textContent,'Mejoras');assert.equal(body.querySelector('strong').textContent,'Acumulación');assert.equal(body.querySelectorAll('li').length,2);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Settings groups options, supports keyboard tabs and preserves excluded Gemini prompt drafts',async()=>{
 const h=await setup({remember:true});try{
  await h.click('#show-app-info');assert(h.d.getElementById('app-info-dialog').open);assert.match(h.d.getElementById('app-info-dialog').textContent,/1\.0\.0/);assert.match(h.d.getElementById('app-info-dialog').textContent,/Developers/);const developers=h.d.querySelectorAll('.app-info-developers a');assert.equal(developers.length,3);developers.forEach((link,index)=>{assert.equal(new URL(link.href).searchParams.get('to'),'developer'+(index+1)+'@example.com');assert.equal(link.target,'_blank');});await h.click('#app-info-close');assert(!h.d.getElementById('app-info-dialog').open);
  await h.click('#cases-settings');assert.equal(h.d.querySelectorAll('[data-settings-tab]').length,5);
  assert(!h.visible('settings-tab-case'));assert(!h.visible('settings-tab-simulation'));
  const caseTab=h.d.getElementById('settings-tab-appearance');caseTab.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.equal(h.d.activeElement.id,'settings-tab-appearance');assert(h.visible('settings-page-appearance'));assert(!h.visible('settings-page-gemini'));
  const size=h.d.getElementById('settings-font-scale');size.value='110';size.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.documentElement.style.fontSize,'17.6px');assert.equal(h.w.localStorage.getItem('st.ui.v1.fontScale.advance'),'110');
  await h.click('#settings-tab-gemini');assert.equal(h.d.querySelectorAll('.gemini-prompt-card:not(.hidden)').length,10);assert.equal(h.d.getElementById('gemini-model').form.id,'workspace-form');
  assert(h.d.getElementById('settings-page-gemini').contains(h.d.getElementById('gemini-api-key')));assert(h.d.getElementById('settings-page-storage').contains(h.d.getElementById('workspace-folder-id')));
  let saved;const save=h.api.saveUserSettings;h.api.saveUserSettings=s=>{saved=s;return save(s);};
  const card=h.d.getElementById('gemini-prompt-personality'),text=card.querySelector('textarea'),toggle=card.querySelector('input');text.value='Explica las decisiones con claridad.';text.dispatchEvent(new h.w.Event('input',{bubbles:true}));toggle.checked=false;toggle.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const medium=h.d.querySelector('#gemini-prompt-mediumCapex textarea');medium.value='Retrofitting local basado en evidencia.';medium.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(card.dataset.included,'false');assert(!text.disabled);assert.match(h.d.getElementById('gemini-prompt-budget').textContent,/40,000/);
  await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);
  assert.equal(saved.gemini.prompts.personality.enabled,false);assert.equal(saved.gemini.prompts.personality.text,text.value);assert.equal(saved.gemini.prompts.mediumCapex.enabled,true);assert(!('language' in saved.gemini.prompts));
  await h.click('#cases-settings');assert.equal(text.value,'Explica las decisiones con claridad.');assert(!toggle.checked);
  await h.click('#gemini-prompt-personality button');toggle.checked=true;toggle.dispatchEvent(new h.w.Event('change',{bubbles:true}));await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);assert(!('personality' in saved.gemini.prompts));assert.equal(h.errors.length,0);
 }finally{h.dom.window.close();}
});

test('UI: Advance case chart colors and DOE survive manual save and reopening',async()=>{
 const h=await setup({remember:true,uiMode:'ADVANCE'});try{
  h.w.STPreferences.write('autosaveEnabled','no');
  await h.click('.open-case');await h.click('#open-settings');await h.click('#settings-tab-case');
  const colors=h.d.querySelectorAll('#settings-chart-colors button');assert.equal(colors.length,13);assert.equal(h.w.STScenarioExplorer.doeEnabled(),false);
  colors[0].click();const hex=h.d.getElementById('series-color-hex');hex.value='#123456';hex.dispatchEvent(new h.w.Event('input'));assert.equal(h.d.getElementById('series-color-r').value,'18');h.d.getElementById('series-color-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.equal(h.d.documentElement.style.getPropertyValue('--series-0'),'#123456'.toUpperCase());
  h.d.getElementById('settings-scenario-doe').checked=true;await h.click('#settings-cancel');await waitFor(()=>!h.d.getElementById('settings-dialog').open);assert.equal(h.w.STScenarioExplorer.doeEnabled(),true);assert.equal(h.calls.filter(x=>x==='saveCase').length,0);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata?.includeDOE===true);
  assert.equal(h.storedCases()[0].metadata.chartColors[0],'#123456'.toUpperCase());assert.equal(h.storedCases()[0].simulations[0].results,null);
  await h.click('#home-cases');assert.equal(h.d.documentElement.style.getPropertyValue('--series-0'),'');await h.click('.open-case');assert.equal(h.d.documentElement.style.getPropertyValue('--series-0'),'#123456'.toUpperCase());assert(h.w.STScenarioExplorer.doeEnabled());
  await h.click('#open-settings');await h.click('#settings-chart-reset');assert.equal(h.d.documentElement.style.getPropertyValue('--series-0'),'');assert.equal(h.calls.filter(x=>x==='saveCase').length,1);
  assert.equal(h.errors.length,0);
 }finally{h.dom.window.close();}
});


test('UI: shared error icons preserve details, render safe dialogs and disappear after clearing',async()=>{
 const h=await setup({remember:true});try{
  await h.click('#cases-settings');
  for(const id of ['settings-error','gemini-error','sheet-import-error','configuration-error']){
   const source=h.d.getElementById(id);source.textContent='Unable to complete '+id;h.w.STErrors.capture(source,{message:'Request failed <script>bad()</script>',code:'TEST_FAILURE',details:[{field:'MTBF',message:'Must be positive'}],stack:'RangeError: Invalid string length\n at calculate (Client:123)'});
   await settle();assert.equal(h.w.getComputedStyle(source).display,'none');const notice=source.nextElementSibling;assert(!notice.classList.contains('hidden'));assert.equal(notice.querySelector('button').textContent,'');
   notice.querySelector('button').click();await waitFor(()=>h.d.querySelector('.error-details-dialog[open]'));
   const dialog=h.d.querySelector('.error-details-dialog');assert.match(dialog.textContent,/TEST_FAILURE/);assert.match(dialog.textContent,/MTBF/);assert.match(dialog.textContent,/Client:123/);assert(dialog.textContent.includes('<script>'));assert(!dialog.querySelector('script'));
   await h.click('.error-details-dialog button:not(.copy-error)');assert.equal(h.d.activeElement,notice.querySelector('button'));source.textContent='';await settle();assert(notice.classList.contains('hidden'));
  }
  const source=h.d.getElementById('settings-error');source.textContent='Only a message';await settle();source.nextElementSibling.querySelector('button').click();await waitFor(()=>h.d.querySelector('.error-details-dialog'));assert.match(h.d.querySelector('.error-detail-text').textContent,/No additional details/);await h.click('.error-details-dialog button:not(.copy-error)');
  source.textContent='';await settle();assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: runtime exceptions show an error icon and retain the available technical trace',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');const error=new h.w.RangeError('Invalid string length');h.w.dispatchEvent(new h.w.ErrorEvent('error',{error,message:error.message}));await settle();
  const source=h.d.getElementById('status');assert.equal(h.w.getComputedStyle(source).display,'none');const button=h.d.getElementById('header-error-button');assert(!h.d.getElementById('header-errors').classList.contains('hidden'));assert.equal(h.d.getElementById('header-errors').nextElementSibling.id,'save-case');button.click();await waitFor(()=>h.d.querySelector('.error-details-dialog'));assert.match(h.d.querySelector('.error-detail-text').textContent,/RangeError: Invalid string length/);
  await h.click('.error-details-dialog button:not(.copy-error)');source.className='status';source.textContent='Simulation ready';await settle();assert(source.nextElementSibling.classList.contains('hidden'));assert.notEqual(h.w.getComputedStyle(source).display,'none');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: scenario evaluation failures use the shared icon with the original error trace',async()=>{
 const h=await setup({remember:true});try{
  const simulation=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(simulation).projects.find(p=>p.canApply),card=h.w.STWhatIf.card(project,()=>{},simulation.equipment,simulation);h.d.body.append(card);
  h.w.SimulatorEngine.simulateBatch=async()=>{throw new h.w.RangeError('Invalid string length');};card.querySelector('.scenario-evaluate').click();await waitFor(()=>card.querySelector('.scenario-preview-status').textContent.includes('Cannot evaluate'));
  const source=card.querySelector('.scenario-preview-status');await settle();assert.equal(h.w.getComputedStyle(source).display,'none');const button=h.d.getElementById('header-error-button');assert(!h.d.getElementById('header-errors').classList.contains('hidden'));assert.equal(h.w.getComputedStyle(card.querySelector('.error-notice')).display,'none');button.click();await waitFor(()=>h.d.querySelector('.error-details-dialog'));assert.match(h.d.querySelector('.error-detail-text').textContent,/RangeError: Invalid string length/);assert(card.querySelector('.scenario-create').disabled);await h.click('.error-details-dialog button:not(.copy-error)');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: header aggregates errors and copies the complete diagnostic through the icon button',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');let copied;Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}},configurable:true});
  for(const id of ['gemini-error','configuration-error']){const source=h.d.getElementById(id);source.textContent='Failure '+id;h.w.STErrors.capture(source,{message:'Failure '+id,code:'TEST_CODE',details:['Explanation'],stack:'Error at calculate'});}await settle();assert.equal(h.d.getElementById('header-errors').dataset.count,'2');
  await h.click('#header-error-button');await h.click('.copy-error');assert(copied.includes('Failure gemini-error'));assert(copied.includes('Failure configuration-error'));assert(copied.includes('TEST_CODE'));assert(copied.includes('Error at calculate'));assert.equal(h.d.querySelector('.copy-error').textContent,'');assert.match(h.d.querySelector('.error-copy-status').textContent,/copied/);assert(h.d.querySelector('.error-details-dialog').open);
  await h.click('.error-details-dialog button:not(.copy-error)');assert.equal(h.d.activeElement.id,'header-error-button');
  Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async()=>{throw Error('Denied');}},configurable:true});let fallback;h.d.execCommand=command=>{assert.equal(command,'copy');fallback=h.d.querySelector('.clipboard-fallback').value;return true;};await h.click('#header-error-button');await h.click('.copy-error');assert.equal(fallback,copied);assert.equal(h.d.querySelector('.clipboard-fallback'),null);await h.click('.error-details-dialog button:not(.copy-error)');
  for(const id of ['gemini-error','configuration-error'])h.d.getElementById(id).textContent='';await settle();assert(h.d.getElementById('header-errors').classList.contains('hidden'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: round-one result preview never serializes the full replay and preserves simulation results',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;h.d.getElementById('run-rounds').value=2;h.d.getElementById('run-sample-interval').value=1;
  const original=h.w.SimulatorEngine.simulateBatch;let prevented=0;
  h.w.SimulatorEngine.simulateBatch=(input,options)=>original(input,{...options,onFirstRound:result=>{Object.defineProperty(result.samples,'toJSON',{value:()=>{prevented++;throw new h.w.RangeError('Invalid string length');},configurable:true});options.onFirstRound?.(result);}});
  await h.click('#run-simulation');await waitFor(()=>!h.visible('batch-dialog')&&h.d.getElementById('simulation-json-preview').value);await h.click('#pause-simulation');const preview=JSON.parse(h.d.getElementById('simulation-json-preview').value);
  assert.equal(prevented,0);assert.equal(preview.schema,'st-result-preview-v1');assert.equal(preview.coverage.samplesIncluded,false);assert(preview.coverage.sampleCount>0);assert(h.d.getElementById('simulation-json-preview').value.length<=64000);assert(preview.summary.lineOeePercent>=0);assert.equal(preview.batch.rounds,2);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);const saved=h.storedCases()[0].simulations[0].results;assert.equal(saved.summary.lineOeePercent,preview.summary.lineOeePercent);assert(saved.replay.samples.length>0);assert.equal(prevented,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Settings has stable dimensions, Basic has language prompts and case VGraph colors round-trip',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('#open-settings');const size=h.w.getComputedStyle(h.d.getElementById('settings-dialog')).height;
  for(const tab of ['case','appearance','simulation','gemini','storage']){await h.click('#settings-tab-'+tab);assert.equal(h.w.getComputedStyle(h.d.getElementById('settings-dialog')).height,size);}
  assert(size.includes('720px'));assert(!h.visible('settings-chart-section'));assert(!h.d.getElementById('delete-case'));assert(h.d.getElementById('settings-page-case').contains(h.d.getElementById('settings-json-fields')));
  assert.deepEqual(Array.from(h.d.querySelectorAll('.gemini-prompt-card:not(.hidden)')).map(c=>c.id),['gemini-prompt-personality','gemini-prompt-basicCapex','gemini-prompt-language']);
  await h.click('#settings-tab-simulation');assert(h.visible('settings-seed-section'));assert(!h.visible('settings-save-section'));h.d.getElementById('settings-seed-policy').value='RANDOM';
  await h.click('#settings-tab-case');await h.click('#settings-vgraph-colors button');const r=h.d.getElementById('series-color-r');r.value='17';h.d.getElementById('series-color-g').value='34';h.d.getElementById('series-color-b').value='51';r.dispatchEvent(new h.w.Event('input'));assert.equal(h.d.getElementById('series-color-hex').value,'#112233');await h.click('#series-color-cancel');assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'');
  await h.click('#settings-vgraph-colors button');h.d.getElementById('series-color-hex').value='#112233';h.d.getElementById('series-color-hex').dispatchEvent(new h.w.Event('input'));h.d.getElementById('series-color-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'#112233');
  h.d.getElementById('settings-json-fields').checked=true;h.d.getElementById('settings-json-fields').dispatchEvent(new h.w.Event('change'));await h.click('#settings-cancel');assert.equal(h.w.STPreferences.caseOptions().seedPolicy,'RANDOM');assert.equal(h.calls.filter(x=>x==='saveCase').length,0);await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata?.vgraphColors?.current==='#112233');assert.equal(h.storedCases()[0].metadata.showJsonFields,undefined);
  await h.click('#home-cases');assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'');await h.click('.open-case');assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'#112233');assert.equal(h.d.documentElement.dataset.showJson,'false');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI Advance: shared header reaches conveyors, static VGraph and utilities without Basic worksheet',async()=>{
 const h=await setup({remember:true});try{await h.click('.open-case');assert.equal(h.w.getComputedStyle(h.d.getElementById('case-sidebar')).display,'none');assert.equal(h.d.getElementById('header-case-actions').parentElement.id,'basic-section-row');await h.click('[data-basic-view=conveyors]');assert(h.visible('editor-panel'));assert(!h.d.querySelector('.basic-conveyor-worksheet'));await h.click('[data-basic-view=vgraph]');assert(h.visible('results-body'));assert(h.d.getElementById('vgraph-plot')._vgraphPoints?.length>0);await h.click('[data-basic-view=simulation]');assert(h.visible('run-panel'));await h.click('#basic-case-actions [aria-label="Settings"]');assert(h.d.getElementById('settings-dialog').open);assert.deepEqual(h.errors,[]);}finally{h.dom.window.close();}
});

test('UI: color map, RGB and HEX stay synchronized with full equipment names and independent resets',async()=>{
 const h=await setup({remember:true});try{
  h.w.STPreferences.write('autosaveEnabled','no');const get=h.api.getCase,longName='Blowmolder with a complete long equipment name that must wrap onto multiple lines';h.api.getCase=id=>{const c=get(id);c.equipment[0].name=longName;c.simulations[0].equipment[0].name=longName;return c;};
  await h.click('.open-case');await h.click('#open-settings');await h.click('#settings-tab-case');assert(!h.d.getElementById('delete-case'));assert(h.visible('settings-chart-section'));assert(h.visible('settings-vgraph-section'));assert.notEqual(h.d.getElementById('settings-chart-section'),h.d.getElementById('settings-vgraph-colors').closest('section'));const names=h.d.querySelectorAll('#settings-chart-colors .settings-color-name');assert.equal(names.length,13);assert.equal(names[0].textContent,'1. '+longName);assert.equal(h.w.getComputedStyle(names[0]).whiteSpace,'normal');
  await h.click('#settings-chart-colors button');const hex=h.d.getElementById('series-color-hex'),hue=h.d.getElementById('series-color-hue'),map=h.d.getElementById('series-color-map');hex.value='0000ff';hex.dispatchEvent(new h.w.Event('input'));assert.equal(hex.value,'#0000FF');assert.equal(Number(hue.value),240);hue.value='0';hue.dispatchEvent(new h.w.Event('input'));assert.equal(hex.value,'#FF0000');map.getBoundingClientRect=()=>({left:0,top:0,width:200,height:100});map.dispatchEvent(new h.w.MouseEvent('pointerdown',{clientX:50,clientY:50,buttons:1}));assert.equal(hex.value,'#806060');assert.equal(h.d.getElementById('series-color-r').value,'128');map.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowUp'}));assert.equal(hex.value,'#826262');
  let copied;Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});await h.click('#series-color-copy');assert.equal(copied,hex.value);assert.match(h.d.getElementById('series-color-copy-status').textContent,/copied/);h.w.navigator.clipboard.writeText=async()=>{throw Error('Blocked');};let fallback=false;h.d.execCommand=command=>{fallback=command==='copy';return fallback;};await h.click('#series-color-copy');assert(fallback);assert.match(h.d.getElementById('series-color-copy-status').textContent,/copied/);h.d.getElementById('series-color-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.equal(h.d.querySelector('#settings-chart-colors .settings-color-hex').textContent,'#826262');
  await h.click('#settings-vgraph-colors button');hex.value='#112233';hex.dispatchEvent(new h.w.Event('input'));h.d.getElementById('series-color-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await h.click('#settings-chart-reset');assert.equal(h.d.documentElement.style.getPropertyValue('--series-0'),'');assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'#112233');await h.click('#settings-vgraph-reset');assert.equal(h.d.documentElement.style.getPropertyValue('--vgraph-current'),'');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: shared typography scales once, retains mode-specific choices and starts views with subsection titles',async()=>{
 for(const mode of ['ADVANCE','BASIC']){const h=await setup({remember:true,uiMode:mode});try{
  const basic=mode==='BASIC';assert.equal(h.d.documentElement.style.fontSize,basic?'17.6px':'16px');await h.click('.open-case');
  for(const [view,title,panel] of [['equipment','Equipment','editor-panel'],['conveyors','Conveyors','editor-panel'],['vgraph','V-Graph','results-panel'],['simulation','Simulation','run-panel'],['whatif','What-If','whatif-panel']].filter(([view])=>basic||view!=='conveyors')){
   await h.click('[data-basic-view='+view+']');const heading=h.d.querySelector('#'+panel+' > .section-heading h2');if(['equipment','conveyors','vgraph','whatif'].includes(view)){assert.equal(h.w.getComputedStyle(heading.closest('.section-heading')).display,'none');}else{assert.equal(heading.textContent,'Simulation');if(basic)assert.equal(h.w.getComputedStyle(heading.closest('.section-heading')).display,'none');}if(['equipment','conveyors'].includes(view))assert.equal(h.d.getElementById('equipment-subsection-title').textContent,title);
  }
  await h.click('[data-basic-view=equipment]');if(basic){assert.equal(h.d.getElementById('basic-run-options-title').textContent,'Simulation settings');assert.equal(h.d.getElementById('run-rounds').closest('section').querySelectorAll('strong').length,0);assert.equal(h.d.getElementById('basic-efficiencies').parentElement.id,'basic-run-options');await h.click('[data-basic-view=conveyors]');assert.match(h.d.querySelector('#equipment-inspector [data-basic-group=upstream]').textContent,/^Upstream:/);assert.equal(h.d.querySelector('#equipment-inspector [data-basic-group=geometry]').textContent,'Geometry');}
  await h.click('#open-settings');assert.equal(h.d.getElementById('settings-font-scale').value,basic?'110':'100');const font=h.d.getElementById('settings-font-scale');font.value='125';font.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.documentElement.style.fontSize,'20px');await h.click('#settings-close');await h.click('[data-basic-view=simulation]');assert.equal(h.d.documentElement.style.fontSize,'20px');assert.equal(h.w.STPreferences.read('fontScale.'+(basic?'basic':'advance')),'125');
  const other=basic?'advance':'basic';h.d.documentElement.dataset.uiMode=other;h.w.STPreferences.applyFontScale();assert.equal(h.d.documentElement.style.fontSize,basic?'16px':'17.6px');h.d.documentElement.dataset.uiMode=basic?'basic':'advance';h.w.STPreferences.applyFontScale();assert.equal(h.d.documentElement.style.fontSize,'20px');
  for(const theme of ['light','dark']){h.w.STPreferences.setTheme(theme);const boxes=[h.d.getElementById('settings-json-fields'),h.d.getElementById('settings-scenario-doe'),h.d.querySelector('.switchable-value input[type=checkbox]')];assert(boxes.every(Boolean));const dimensions=boxes.map(box=>{const css=h.w.getComputedStyle(box);return [css.width,css.height,css.padding].map(value=>value.replace(/var\((--[^)]+)\)/g,(_,name)=>h.w.getComputedStyle(h.d.documentElement).getPropertyValue(name).trim()));});assert.deepEqual(dimensions[0],dimensions[1]);assert.deepEqual(dimensions[0],dimensions[2]);}
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});


test('UI: subsection imports and Basic scenario metrics preserve working actions',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('.import-menu summary');assert(h.d.querySelector('.import-menu').open);
  await h.click('#open-json-import');assert(h.d.getElementById('configuration-dialog').open);assert(!h.d.querySelector('.import-menu').open);await h.click('#configuration-cancel');
  await h.click('#import-setup-json');assert(h.d.getElementById('configuration-dialog').open);await h.click('#configuration-cancel');
  const downloads=[];h.w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:test';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){};
  await h.click('#export-equipment-json');assert.equal(downloads.length,1);assert.equal(downloads[0].type,'application/json');
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);stubScenarioGain(h);
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);assert(card.querySelector('.scenario-create').disabled);card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  assert.equal(card.querySelector('.scenario-basic-metric strong').textContent,'51.0%');assert.match(card.querySelector('.scenario-basic-change').textContent,/\+1.00 pp/);
  assert.equal(h.w.getComputedStyle(card.querySelector('.scenario-metric-table')).display,'none');h.d.documentElement.dataset.uiMode='advance';assert.notEqual(h.w.getComputedStyle(card.querySelector('.scenario-metric-table')).display,'none');assert.equal(h.w.getComputedStyle(card.querySelector('.scenario-basic-metrics')).display,'none');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI Basic: four CAPEX cards include read-only current batch metrics and separate import/export controls',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');const menu=h.d.querySelector('.import-menu');assert.equal(menu.querySelectorAll('button').length,2);assert(!menu.contains(h.d.getElementById('export-equipment-json')));assert.equal(h.d.getElementById('export-equipment-json').dataset.icon,'upload');
  const sim=h.storedCases()[0].simulations[0];sim.results={summary:{lineOeePercent:40,outputCount:100},durationSeconds:60,batch:{statistics:{lineOeePercent:{mean:42.5},throughputPerMinute:{mean:81.97}}}};
  const target=h.d.createElement('div');h.d.body.append(target);h.w.STWhatIf.render(sim,target,()=>{});const grid=target.querySelector('.scenario-tier-grid');assert.equal(grid.children.length,4);const current=grid.firstElementChild;assert.equal(current.querySelectorAll('button,input').length,0);assert.equal(current.querySelector('strong').textContent,'42.5%');assert.match(current.textContent,/81.97/);assert(!grid.textContent.includes('All CAPEX'));
  assert.match(h.w.getComputedStyle(grid).gridTemplateColumns,/repeat\(4/);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Comparison requires multiple simulations in both modes and file exports keep only AI JSON',async()=>{
 for(const mode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode:mode,flowUnit:'equivalent bottles'});try{
  assert.equal(h.d.getElementById('user-email').textContent,'preview@example.test');for(const id of ['cases-settings','cases-sign-out'])assert.equal(h.d.getElementById(id).textContent,'');
  await h.click('.open-case');const compare=h.d.querySelector('[data-basic-view=comparison]');assert(compare.classList.contains('hidden'));await h.click('#clone-case');await waitFor(()=>h.d.getElementById('simulation-selector').options.length===2);assert(!compare.classList.contains('hidden'));assert.equal(compare.previousElementSibling.dataset.basicView,'whatif');assert(!h.d.querySelector('#basic-case-actions [aria-label="Compare simulations"]'));
  await h.click('[data-basic-view=comparison]');assert(h.visible('comparison-panel'));
  assert.equal(h.w.STBasicMode.unitLabel('equivalent bottles'),mode==='BASIC'?'units':'equivalent bottles');assert.equal(h.d.getElementById('export-results'),null);assert.equal(h.d.getElementById('export-ai').textContent,'JSON');
  await h.click('[data-basic-view=simulation]');assert.equal(h.d.getElementById('run-title').classList.contains('sr-only'),true);if(mode==='BASIC')assert.equal(h.d.getElementById('run-simulation').parentElement.className,'basic-options-heading');for(const id of ['play-simulation','pause-simulation','reset-playback'])assert.equal(h.d.getElementById(id).textContent,'');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});


test('UI: mode switches rebuild isolated What-If cards and unified DOE rows preserve factor selection',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view=whatif]');const grid=()=>h.d.querySelector('#simulation-analysis-content .scenario-tier-grid');assert(grid().querySelector('.scenario-current'));
  const switchMode=async mode=>{await h.click('#open-settings');const dialog=h.d.getElementById('settings-dialog');for(let i=0;i<5;i++)dialog.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'m',bubbles:true}));h.d.getElementById('settings-interface-mode').value=mode;await h.click('#settings-cancel');};
  let card=grid().querySelector('.analysis-recommendation:has(.scenario-evaluate)');const choice=card.querySelector('.scenario-change input[type=checkbox]');choice.checked=false;choice.dispatchEvent(new h.w.Event('change'));assert(card.querySelector('.scenario-create').disabled);
  await switchMode('ADVANCE');assert(!grid().querySelector('.scenario-current'));assert.equal(grid().children.length,4);assert(!h.d.querySelector('.scenario-candidate-details'));card=grid().querySelector('.analysis-recommendation:has(.scenario-evaluate)');assert(card.querySelector('.scenario-change input[type=checkbox]').checked);
  await switchMode('BASIC');assert(grid().querySelector('.scenario-current'));assert.equal(grid().children.length,4);card=grid().querySelector('.analysis-recommendation:has(.scenario-evaluate)');assert.equal(card.querySelector('.scenario-change input[type=checkbox]').checked,false);
  card.querySelector('.scenario-configure').click();const dialog=card.querySelector('dialog');assert.equal(dialog.querySelectorAll('table').length,1);const factor=dialog.querySelector('.scenario-doe-select');assert(factor.disabled);dialog.querySelector('.scenario-doe-enabled').checked=true;dialog.querySelector('.scenario-doe-enabled').dispatchEvent(new h.w.Event('change'));assert(factor.disabled,'DOE stays unavailable until a category search evaluates the variable');assert.equal(dialog.querySelector('thead tr').children.length,10);assert.equal(dialog.querySelector('.scenario-doe-factor').children.length,10);assert(!/\([^)]*\)/.test(dialog.querySelector('.scenario-doe-factor').children[2].textContent));dialog.close();
  await h.click('#open-settings');assert.equal(h.d.getElementById('settings-json-fields').closest('section'),h.d.getElementById('settings-scenario-doe').closest('section'));assert.equal(h.d.getElementById('settings-doe-section').querySelector('h3'),null);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Basic and Advance select SimPy per simulation, clears stale results and preserves the default in a new simulation',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({uiMode});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#open-settings');
  const picker=h.d.getElementById('settings-simulation-engine');
  assert(!h.d.getElementById('settings-engine-section').classList.contains('hidden'));
  assert.equal(picker.value,'ST_CURRENT');assert(!picker.disabled);
  picker.value='DES_SIMPY_EXPERIMENTAL';picker.dispatchEvent(new h.w.Event('change'));
  await h.click('#settings-close');if(uiMode==='BASIC')await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.engineId==='DES_SIMPY_EXPERIMENTAL');
  assert.equal(h.storedCases()[0].simulations[0].results,null);
  assert(h.visible('simulation-engine-notice'));
  assert.match(h.d.getElementById('simulation-analysis-content').textContent,/not yet validated/);
  await h.click('#open-settings');assert.equal(picker.value,'DES_SIMPY_EXPERIMENTAL');
  picker.value='ST_CURRENT';picker.dispatchEvent(new h.w.Event('change'));await h.click('#settings-close');if(uiMode==='BASIC')await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.engineId==='ST_CURRENT');
  assert(!h.visible('simulation-engine-notice'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: Basic exposes all named colors without replacing a saved accent and shows the engine selector',async()=>{
 const h=await setup({uiMode:'BASIC',savedAccent:'amparo-blue'});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#open-settings');
  assert(!h.d.getElementById('settings-engine-section').classList.contains('hidden'));
  const colors=Array.from(h.d.querySelectorAll('.accent-choice:not(.hidden)')).map(b=>b.dataset.accent);
  assert.deepEqual(colors,Object.keys(h.w.STThemeResources.palettes));
  assert.equal(h.d.documentElement.dataset.accent,'amparo-blue');
  assert.equal(h.d.querySelector('.accent-choice[data-accent="boat-house"] .theme-color-name').textContent,'boat blues');
  await h.click('[data-accent="aegean-sea"]');assert.equal(h.d.documentElement.dataset.accent,'aegean-sea');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: chat histories persist per simulation in Basic and Advance, copy source text and regenerate a branch',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode,realScenarioServer:true});try{
   await h.click('.open-case');await h.click('#toggle-gemini');h.w.ST_GEMINI_CHAT_PRESENTATION.enabled=false;
   const requests=[];h.api.askGemini=request=>{requests.push(JSON.parse(JSON.stringify(request)));return {text:'**Answer:** '+request.question};};
   const question=h.d.getElementById('gemini-question');
   async function ask(text){question.value=text;await h.click('#send-gemini');await waitFor(()=>!h.d.getElementById('send-gemini').disabled&&h.storedCases()[0].simulations[0].geminiHistory?.some(m=>m.text==='**Answer:** '+text));}
   await ask('First question');await ask('Later question');
   assert.equal(h.storedCases()[0].simulations[0].geminiHistory.length,4);
   assert(h.d.getElementById('gemini-messages').contains(h.d.getElementById('gemini-progress')));
   let copied;Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
   await h.click('.gemini-message[data-role=model] button[aria-label="Copy message"]');assert.equal(copied,'**Answer:** First question');
   await h.click('.gemini-message[data-role=user] button[aria-label="Edit and regenerate"]');let editor=h.d.querySelector('.gemini-message-editor');editor.querySelector('textarea').value='Changed question';editor.dispatchEvent(new h.w.Event('submit',{cancelable:true}));
   await waitFor(()=>h.storedCases()[0].simulations[0].geminiHistory?.[1]?.text==='**Answer:** Changed question'&&!h.d.getElementById('send-gemini').disabled);
   assert.equal(requests.at(-1).question,'Changed question');assert.equal(requests.at(-1).history.length,0);assert.equal(h.storedCases()[0].simulations[0].geminiHistory.length,2);
   assert.equal(h.d.querySelector('.gemini-message[data-role=model] button[data-action=edit]'),null);assert(h.d.querySelector('.gemini-message[data-role=user] button[data-action=edit]'));
   await h.click('#clone-case');await waitFor(()=>h.d.getElementById('simulation-selector').options.length===2);
   assert.equal(h.d.querySelectorAll('.gemini-message').length,0);const selector=h.d.getElementById('simulation-selector'),other=selector.value;
   await h.click('#save-case');await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');question.value='Other simulation';await h.click('#send-gemini');await waitFor(()=>h.storedCases()[0].simulations[1].geminiHistory?.length===2&&!h.d.getElementById('send-gemini').disabled);
   selector.value='simulation-a';selector.dispatchEvent(new h.w.Event('change'));assert.match(h.d.getElementById('gemini-messages').textContent,/Changed question/);assert(!h.d.getElementById('gemini-messages').textContent.includes('Other simulation'));
   await h.click('#home-cases');await h.click('.open-case');selector.value='simulation-a';selector.dispatchEvent(new h.w.Event('change'));assert.match(h.d.getElementById('gemini-messages').textContent,/Changed question/);
   selector.value=other;selector.dispatchEvent(new h.w.Event('change'));assert.match(h.d.getElementById('gemini-messages').textContent,/Other simulation/);
   await h.click('#clear-gemini');await waitFor(()=>h.storedCases()[0].simulations[1].geminiHistory.length===0);assert.equal(h.storedCases()[0].simulations[0].geminiHistory.length,2);
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: grip releases on global pointerup, missing mouse button and blur without moving on hover',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const grip=h.d.getElementById('gemini-resize');
  function begin(){grip.onpointerdown({button:0,pointerId:22,clientX:600,preventDefault(){}});grip.onpointermove({pointerId:22,clientX:550,buttons:1});}
  function hover(){const width=grip.getAttribute('aria-valuenow');grip.onpointermove({pointerId:22,clientX:500,buttons:0});grip.onpointermove({pointerId:22,clientX:450,buttons:1});assert.equal(grip.getAttribute('aria-valuenow'),width);}
  begin();const up=new h.w.Event('pointerup');Object.defineProperty(up,'pointerId',{value:22});h.w.dispatchEvent(up);hover();
  begin();hover();begin();h.w.dispatchEvent(new h.w.Event('blur'));hover();assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: boat blue default, bounded icon buttons, faster playback and Advance case settings layout',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');assert.equal(h.d.documentElement.dataset.accent,'boat-house');
  for(const id of ['play-simulation','pause-simulation','reset-playback','clear-gemini'])assert(h.d.getElementById(id).classList.contains('secondary'));
  assert(h.d.querySelector('[data-basic-view=conveyors]').classList.contains('hidden'));
  const speed=h.d.getElementById('run-playback-rate');for(const value of [200,500,1000]){speed.value=String(value);speed.dispatchEvent(new h.w.Event('change'));}
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].playbackRate===1000);await h.click('#home-cases');await h.click('.open-case');assert.equal(speed.value,'1000');
  await h.click('#open-settings');assert(h.d.getElementById('settings-page-case').contains(h.d.getElementById('settings-save-section')));assert(h.visible('settings-save-section'));
  assert.equal(h.d.querySelectorAll('#settings-chart-colors > table').length,2);assert.equal(h.d.querySelectorAll('#settings-vgraph-colors > table').length,2);assert.equal(h.d.querySelectorAll('#settings-chart-colors button').length,13);
  await h.click('#settings-close');await h.click('[data-basic-view=equipment]');const filter=h.d.querySelector('[name=equipment-filter][value=conveyors]');filter.checked=true;filter.dispatchEvent(new h.w.Event('change',{bubbles:true}));await h.click('#toggle-gemini');assert(filter.checked,'chat sync must preserve the Advance equipment filter');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: failed regeneration preserves the original saved conversation and restores the edited question',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');h.w.ST_GEMINI_CHAT_PRESENTATION.enabled=false;
  h.d.getElementById('gemini-question').value='Original question';await h.click('#send-gemini');await waitFor(()=>h.storedCases()[0].simulations[0].geminiHistory?.length===2&&!h.d.getElementById('send-gemini').disabled);
  const saved=JSON.stringify(h.storedCases()[0].simulations[0].geminiHistory);h.api.askGemini=()=>{throw Error('Offline');};
  await h.click('.gemini-message[data-role=user] button[aria-label="Edit and regenerate"]');const editor=h.d.querySelector('.gemini-message-editor');editor.querySelector('textarea').value='Retain this edit';editor.dispatchEvent(new h.w.Event('submit',{cancelable:true}));
  await waitFor(()=>h.d.getElementById('gemini-error').textContent.includes('GEMINI_CONNECTION'));
  assert.equal(JSON.stringify(h.storedCases()[0].simulations[0].geminiHistory),saved);assert.match(h.d.getElementById('gemini-messages').textContent,/Original question/);assert.equal(h.d.getElementById('gemini-question').value,'Retain this edit');assert(!h.d.getElementById('send-gemini').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: DOE derives factors from feasible category searches and keeps explicit reliability targets',async()=>{
 const h=await setup({remember:true});try{
  h.w.STScenarioExplorer.setDOE(true);h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200};
  const sim=h.storedCases()[0].simulations[0],machine=sim.equipment.find(e=>e.type!=='CONVEYOR');machine.noiseProfile.reliability={mtbfMinutes:30,mttrMinutes:3};
  const snapshot=JSON.stringify(sim.equipment),host=h.d.createElement('section');h.d.body.append(host);h.w.STScenarioExplorer.tools(host,sim,h.w.STScenarios.plan(sim),()=>{});
  const intervention=host.querySelector('.scenario-interventions');intervention.querySelector('[aria-label="Intervention equipment"]').value=machine.id;intervention.querySelector('[aria-label="Intervention target (minutes)"]').value='60';intervention.querySelector('textarea').value='Dedicated maintenance; reliability target from vendor trial.';intervention.querySelector('.scenario-add-intervention').click();
  assert(sim.whatIf.externalOptions[0].tier==='MEDIUM');intervention.querySelector('[aria-label="Intervention CAPEX"]').value='HIGH';intervention.querySelector('[aria-label="Intervention target (minutes)"]').value='90';intervention.querySelector('.scenario-add-intervention').click();assert.equal(sim.whatIf.externalOptions.length,2);assert.equal(sim.whatIf.externalOptions.find(p=>p.tier==='MEDIUM').changes[0].after,60);assert.equal(sim.whatIf.externalOptions.find(p=>p.tier==='HIGH').changes[0].after,90);
  const cards=Array.from(host.querySelectorAll('.scenario-tier-grid > .analysis-recommendation'));assert.equal(cards.length,4);
  assert(!cards[0].querySelector('.scenario-intervention-basis'));assert(cards[1].querySelector('.scenario-intervention-basis'));assert.equal(cards[1].querySelectorAll('.scenario-change').length,1);assert(Array.from(cards[1].querySelectorAll('.scenario-doe-select')).every(input=>!input.disabled&&!input.checked));
  const card=cards[1],calls=[];h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(input);const gain=input.case.equipment.find(e=>e.id===machine.id).noiseProfile.reliability.mtbfMinutes>30?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const factor=card.querySelector('.scenario-doe-select');assert(!factor.disabled);assert(!factor.checked);const levels=card.querySelectorAll('.scenario-doe-level');assert.equal(levels[0].value,'30');assert.equal(levels[1].value,'60');factor.checked=true;factor.dispatchEvent(new h.w.Event('change'));
  card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const saved=sim.whatIf.evaluations.find(e=>e.searchScope==='MEDIUM');assert.equal(saved.doe.combinations,2);assert.equal(saved.searchVariables.length,1);assert(saved.evaluatedChanges[0].external);assert(saved.independentCheck.passed);assert.equal(JSON.stringify(sim.equipment),snapshot);
  host.remove();const reopened=h.d.createElement('section');h.d.body.append(reopened);h.w.STScenarioExplorer.tools(reopened,sim,h.w.STScenarios.plan(sim),()=>{});const restored=reopened.querySelector('.scenario-tier-grid > .analysis-recommendation:nth-child(2)');assert(restored.querySelector('.scenario-doe-select').checked);assert.equal(restored.querySelector('.scenario-intervention-basis').title,intervention.querySelector('textarea').value);
  const target=restored.querySelector('.scenario-target');target.value='70';target.dispatchEvent(new h.w.Event('input'));assert(!restored.querySelector('.scenario-doe-select').disabled);assert.equal(sim.whatIf.evaluations.find(e=>e.searchScope==='MEDIUM').searchVariables.length,0);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: feasible search alternatives populate DOE even when they lose; infeasible inputs stay unavailable',async()=>{
 const h=await setup({remember:true});try{
  h.w.STScenarioExplorer.setDOE(true);h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200};const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1],keys=['backupSensorPositionMm','clearTimeDelaySeconds','blockedTimeDelaySeconds'];keys.forEach(key=>e.processData.accumulation[key]=10);
  const changes=keys.map(key=>({equipmentId:e.id,path:'processData.accumulation.'+key,before:10,after:20,unit:'test'}));
  h.w.STScenarios.apply=(source,changes)=>{if(changes.some(c=>c.path.endsWith('blockedTimeDelaySeconds')))throw Error('SCENARIO_INVALID_PHYSICS');const result=JSON.parse(JSON.stringify(source));changes.forEach(c=>result.equipment.find(e=>e.id===c.equipmentId).processData.accumulation[c.path.split('.').pop()]=c.after);return result;};
  h.w.SimulatorEngine.simulateBatch=async input=>{const a=input.case.equipment[1].processData.accumulation,gain=a.clearTimeDelaySeconds>10?-1:a.backupSensorPositionMm>10?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card({title:'Feasible category',kind:'CUSTOM',tier:'ZERO',changes,explore:true,searchDerivedDOE:true},()=>{},sim.equipment,sim);h.d.body.append(card);assert(Array.from(card.querySelectorAll('.scenario-doe-select')).every(input=>!input.disabled));card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const saved=sim.whatIf.evaluations[0];assert.equal(saved.searchVariables.length,2);assert(saved.searchVariables.some(v=>v.path.endsWith('clearTimeDelaySeconds')));assert(!saved.evaluatedChanges.some(v=>v.path.endsWith('clearTimeDelaySeconds')));
  const factors=card.querySelectorAll('.scenario-doe-select');assert(Array.from(factors).every(input=>!input.disabled),'the user chooses factors; invalid combinations are rejected during simulation');factors[1].checked=true;factors[1].dispatchEvent(new h.w.Event('change'));const levels=factors[1].closest('tr').querySelectorAll('.scenario-doe-level');levels[1].value=21;card.querySelector('.scenario-search').click();await waitFor(()=>card.querySelector('.scenario-evaluate').dataset.icon==='search');assert.equal(sim.whatIf.evaluations[0].doe.factors[0].high,21);assert(sim.whatIf.evaluations[0].doe.observations.every(o=>o.feasible));
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: agent response settings stay in Advance and apply saved immediate display while waiting stays visible',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-settings');await h.click('#settings-tab-gemini');assert(h.visible('gemini-generation-section'));
  const writes=[];h.api.saveUserSettings=request=>{writes.push(JSON.parse(JSON.stringify(request)));return request;};
  const set=(id,value)=>{const field=h.d.getElementById(id);field.value=value;field.dispatchEvent(new h.w.Event('input',{bubbles:true}));};set('gemini-temperature','.2');set('gemini-response-mode','FAST');set('gemini-max-output','4096');set('gemini-display-mode','IMMEDIATE');await h.click('#settings-close');assert.deepEqual(writes.at(-1).gemini.generation,{temperature:.2,responseMode:'FAST',maxOutputTokens:4096,displayMode:'IMMEDIATE'});
  await h.click('#toggle-gemini');let success;const originalRpc=h.w.google.script.run;h.w.google.script.run={withFailureHandler(){return this;},withSuccessHandler(fn){success=fn;return this;},askGemini(){}};
  h.d.getElementById('gemini-question').value='Explain';await h.click('#send-gemini');assert(h.visible('gemini-activity'));assert.match(h.d.getElementById('gemini-activity').textContent,/Waiting for Gemini/);await new Promise(resolve=>setTimeout(resolve,1100));assert.match(h.d.getElementById('gemini-activity').textContent,/1 s/);assert.equal(h.d.getElementById('gemini-progress').getAttribute('aria-busy'),'true');
  h.w.google.script.run=originalRpc;success({ok:true,data:{text:'First paragraph.\n\nSecond paragraph.'}});assert.match(h.d.querySelector('.gemini-message[data-role=model]').textContent,/Second paragraph/);assert.equal(h.d.querySelector('.gemini-message[data-role=model]').dataset.revealing,'false');assert(!h.visible('gemini-activity'));assert.equal(h.d.querySelector('.gemini-message[data-role=model] [data-action=edit]'),null);
  await waitFor(()=>h.storedCases()[0].simulations[0].geminiHistory?.length===2&&!h.d.getElementById('send-gemini').disabled);h.d.documentElement.dataset.uiMode='basic';h.w.STSettings.open();assert(!h.visible('gemini-generation-section'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Gemini panel animations cancel safely on rapid toggles and respect reduced motion',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');const panel=h.d.getElementById('gemini-panel'),animations=[];panel.animate=(frames,options)=>{const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(animation);return animation;};
  await h.click('#toggle-gemini');assert(h.visible('gemini-panel'));assert.equal(panel.inert,false);assert.equal(animations[0].options.duration,180);await h.click('#close-gemini');assert.equal(panel.inert,true);assert.equal(panel.getAttribute('aria-hidden'),'true');assert(h.visible('gemini-panel'));const close=animations.at(-1);
  await h.click('#toggle-gemini');assert(close.cancelled);close.onfinish();assert(h.visible('gemini-panel'));assert.equal(panel.inert,false);await h.click('#close-gemini');animations.at(-1).onfinish();assert(!h.visible('gemini-panel'));
  h.media.matches=true;const count=animations.length;await h.click('#toggle-gemini');await h.click('#close-gemini');assert.equal(animations.length,count);assert(!h.visible('gemini-panel'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: console options are isolated per case and survive saving and reopening',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-settings');
  assert(h.d.getElementById('settings-page-simulation').contains(h.d.getElementById('settings-seed-section')));
  h.d.getElementById('settings-seed-policy').value='RANDOM';h.d.getElementById('settings-autosave-seconds').value=3;
  await h.click('#settings-cancel');await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].metadata.consoleOptions?.seedPolicy==='RANDOM');
  assert.equal(h.storedCases()[0].metadata.consoleOptions.autosaveSeconds,3);
  assert.equal(h.w.STPreferences.read('seedPolicy'),null);assert.equal(h.w.STPreferences.read('autosaveSeconds'),'1');
  await h.click('#home-cases');await h.click('.open-case');await h.click('#open-settings');
  assert.equal(h.d.getElementById('settings-seed-policy').value,'RANDOM');assert.equal(h.d.getElementById('settings-autosave-seconds').value,'3');
  await h.click('#settings-cancel');
  let record={metadata:{consoleOptions:{autosaveEnabled:false,autosaveSeconds:8,seedPolicy:'FIXED'}}},changes=0;
  h.w.STPreferences.connectCase(()=>record,()=>changes++);
  assert.equal(h.w.STPreferences.caseOptions().seedPolicy,'FIXED');assert.equal(h.w.STPreferences.caseOptions().autosaveSeconds,8);
  h.w.STPreferences.setCaseOptions({autosaveEnabled:false,autosaveSeconds:5,seedPolicy:'RANDOM'});
  assert.equal(changes,1);assert.equal(h.storedCases()[0].metadata.consoleOptions.autosaveSeconds,3);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: guided equipment options validate and save in Advance while Basic preserves imported values',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode});try{
   h.w.STPreferences.write('autosaveEnabled','no');const get=h.api.getCase;
   h.api.getCase=id=>{const c=get(id);for(const units of [c.equipment,c.simulations[0].equipment]){units[0].processData.customImported={value:123};units[0].noiseProfile.customMetadata={label:'preserve'};units[0].startupDelaySeconds=3;}return c;};
   await h.click('.open-case');if(uiMode==='BASIC')await h.click('[data-basic-view=equipment]');else await h.click('.sidebar [data-view=editor]');
   let card=h.d.querySelector('.equipment-card');if(uiMode==='ADVANCE')card.click();
   assert.equal(h.w.getComputedStyle(card._fields.querySelector('.equipment-json-details')).display,'none');assert.equal(h.w.getComputedStyle(h.d.getElementById('settings-json-fields').closest('label')).display,'none');
   const button=card._fields.querySelector('.equipment-options-button');assert.equal(h.w.getComputedStyle(button).display==='none',uiMode==='BASIC');button.click();
   if(uiMode==='BASIC'){assert.equal(h.d.querySelector('.equipment-options-dialog'),null);assert.equal(JSON.parse(card._fields.querySelector('.equipment-process-data').value).customImported.value,123);assert.deepEqual(h.errors,[]);continue;}
   const dialog=h.d.querySelector('.equipment-options-dialog'),field=path=>dialog.querySelector('[data-path="'+path+'"]');assert(dialog.open);assert.equal(field('upstream.startupTimeSeconds').value,'3');assert.match(field('microStop.probabilityPerMinute').placeholder,/Example/);
   field('microStop.probabilityPerMinute').value='2';field('microStop.minDurationSeconds').value='3';field('microStop.maxDurationSeconds').value='2';
   dialog.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert(dialog.open);assert.match(dialog.querySelector('[role=alert]').textContent,/Maximum/);
   field('microStop.maxDurationSeconds').value='4';field('upstream.startupTimeSeconds').value='5';dialog.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));assert(!dialog.open);
   button.click();field('upstream.startupTimeSeconds').value='99';dialog.querySelector('.equipment-options-cancel').click();
   const data=JSON.parse(card._fields.querySelector('.equipment-process-data').value),noise=JSON.parse(card._fields.querySelector('.equipment-noise-profile').value);assert.equal(data.upstream.startupTimeSeconds,5);assert.equal(data.customImported.value,123);assert.equal(noise.customMetadata.label,'preserve');assert.equal(noise.microStop.maxDurationSeconds,4);
   // Opaque imported metadata survives the dialog. Remove unsupported noise
   // before saving this fixture for potential DES use.
   delete noise.customMetadata;card._fields.querySelector('.equipment-noise-profile').value=JSON.stringify(noise);
   await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].equipment[0].processData.upstream.startupTimeSeconds===5);
   assert.equal(h.storedCases()[0].simulations[0].equipment[0].processData.customImported.value,123);
   if(uiMode==='BASIC')await h.click('[data-basic-view=conveyors]');else h.d.querySelectorAll('.equipment-card')[1].click();
   card=h.d.querySelectorAll('.equipment-card')[1];card._fields.querySelector('.equipment-options-button').click();assert(dialog.open);assert.equal(dialog.querySelectorAll('input').length,3);assert(!field('upstream.startupTimeSeconds'));dialog.querySelector('.equipment-options-cancel').click();
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});


test('UI: general and case Gemini questions use current drafts; VGraph fits its container',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  const requests=[],savedAtAsk=[];h.api.askGemini=request=>{savedAtAsk.push(h.calls.filter(x=>x==='saveCase').length);requests.push(JSON.parse(JSON.stringify(request)));return {text:'General **answer**: '+request.question};};h.w.ST_GEMINI_CHAT_PRESENTATION.enabled=false;
  await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='How do I use Flow Pilot?';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-message[data-role=model]'));assert.equal(requests[0].scope,'GENERAL');assert.equal(requests[0].caseId,undefined);assert.equal(h.calls.filter(x=>x==='saveCase').length,0);
  await h.click('.open-case');await h.click('[data-basic-view=equipment]');const card=h.d.querySelector('.equipment-card'),rate=card._fields.querySelector('.equipment-rate');rate.value='250';rate.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#toggle-gemini');const select=h.d.getElementById('gemini-scope');select.checked=false;select.dispatchEvent(new h.w.Event('change'));h.d.getElementById('gemini-question').value='What does MTBF mean?';await h.click('#send-gemini');await waitFor(()=>requests.length===2&&h.d.querySelector('.gemini-message[data-role=model]'));
  assert.equal(requests[1].scope,'GENERAL');assert.equal(requests[1].simulationId,undefined);assert.equal(requests[1].screen.selectedEquipmentName,null);assert.equal(requests[1].history.length,0);assert.equal(h.calls.filter(x=>x==='saveCase').length,0);assert(!h.storedCases()[0].simulations[0].geminiHistory?.length);
  select.checked=true;select.dispatchEvent(new h.w.Event('change'));h.d.getElementById('gemini-question').value='Analyze my current simulation';await h.click('#send-gemini');await waitFor(()=>requests.length===3&&!h.d.getElementById('send-gemini').disabled);assert.equal(requests[2].scope,'CASE');assert(requests[2].caseSnapshot);assert(Math.abs(requests[2].caseSnapshot.simulations[0].equipment[0].nominalRatePerSecond-250/60)<1e-9);assert.equal(savedAtAsk[2],0);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].geminiHistory?.some(m=>m.scope==='GENERAL'));
  await h.click('[data-basic-view=whatif]');const interventions=h.d.querySelector('.scenario-interventions');assert(interventions);
  await h.click('[data-basic-view=equipment]');const plot=h.d.getElementById('vgraph-plot');Object.defineProperty(plot,'clientWidth',{value:320,configurable:true});h.w.dispatchEvent(new h.w.Event('resize'));const chart=plot.querySelector('svg');assert(chart);assert.equal(parseFloat(chart.style.minWidth),0);assert.equal(chart.getAttribute('viewBox').split(' ')[2],'320');assert.equal(h.w.getComputedStyle(plot).overflow,'hidden');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Additional options is exposed only in Advance and follows mode changes',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view=equipment]');const machine=h.d.querySelector('.equipment-card'),button=machine._fields.querySelector('.equipment-options-button');assert.equal(h.w.getComputedStyle(button).display,'none');
  await h.click('[data-basic-view=conveyors]');const conveyor=h.d.querySelectorAll('.equipment-card')[1];assert.equal(h.w.getComputedStyle(conveyor._fields.querySelector('.equipment-options-button')).display,'none');
  h.d.documentElement.dataset.uiMode='advance';assert.notEqual(h.w.getComputedStyle(button).display,'none');assert.notEqual(h.w.getComputedStyle(conveyor._fields.querySelector('.equipment-options-button')).display,'none');
  h.d.documentElement.dataset.uiMode='basic';assert.equal(h.w.getComputedStyle(button).display,'none');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: factory reset preserves Drive cases and restores them after reconnecting the folder',async()=>{
 const h=await setup({remember:true});try{
  const before=h.storedCases();let resetCount=0;
  const bootstrap=h.api.getBootstrap;
  h.api.resetAppSettings=()=>{resetCount++;return {user:{email:'preview@example.test'},settings:{workspaceRootFolderId:''},gemini:{configured:false,model:'gemini-2.5-flash',prompts:[]},uiMode:'BASIC',cases:[]};};
  await h.click('.open-case');await h.click('#open-settings');await h.click('#settings-tab-storage');assert(h.d.getElementById('settings-factory-reset').disabled);
  await h.click('#settings-cancel');await h.click('#home-cases');await h.click('#cases-settings');assert(!h.visible('settings-tab-case'));assert(!h.visible('settings-tab-simulation'));assert(h.visible('settings-factory-section'));
  await h.click('#settings-tab-storage');await h.click('#settings-factory-reset');await h.click('.message-dialog .dialog-actions button.ghost');assert.equal(resetCount,0);
  await h.click('#settings-factory-reset');await h.click('.message-dialog button.danger');assert.equal(resetCount,1);await waitFor(()=>h.visible('auth-panel')||h.errors.length);assert(h.visible('auth-panel'),JSON.stringify(h.errors)+' '+h.d.getElementById('settings-error').textContent);assert.equal(h.d.getElementById('workspace-folder-id').value,'');assert.equal(h.w.localStorage.getItem('st.ui.v1.remember'),null);assert.deepEqual(h.storedCases(),before);assert(!h.calls.includes('deleteCase'));
  h.api.getBootstrap=()=>({...bootstrap(),settings:{workspaceRootFolderId:''},gemini:{configured:false,model:'gemini-2.5-flash',prompts:[]},uiMode:'BASIC',cases:[]});
  await h.click('#sign-in-button');await h.click('#cases-settings');assert(!h.visible('settings-factory-section'));
  h.api.getBootstrap=bootstrap;h.d.getElementById('workspace-folder-id').value='workspace';h.d.getElementById('workspace-folder-id').dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#settings-cancel');await waitFor(()=>h.d.querySelector('.case-row'));
  assert.equal(h.d.querySelectorAll('.case-row').length,before.length);assert.deepEqual(h.storedCases(),before);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Gallery Gemini uses temporary history, stays separate from cases and exposes a context checkbox',async()=>{
 const h=await setup({remember:true});try{
  const requests=[];h.api.askGemini=request=>{requests.push(request);return {text:'Use Settings to connect your Drive folder.'};};
  assert.equal(h.d.getElementById('toggle-gemini').parentElement.id,'cases-top-actions');assert(h.visible('toggle-gemini'));await h.click('#toggle-gemini');assert(h.visible('gemini-panel'));assert(!h.visible('gemini-scope-control'));
  const original=h.storedCases();h.d.getElementById('gemini-question').value='How do I import equipment?';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-message[data-role=model]'));
  assert.equal(requests[0].scope,'GENERAL');assert.equal(requests[0].caseId,undefined);assert.equal(requests[0].simulationId,undefined);assert.equal(h.calls.filter(x=>x==='saveCase').length,0);assert.deepEqual(h.storedCases(),original);assert.match(h.d.getElementById('gemini-history-note').textContent,/temporary/);
  h.d.getElementById('gemini-question').value='Where is Settings?';await h.click('#send-gemini');await waitFor(()=>requests.length===2&&!h.d.getElementById('send-gemini').disabled);assert.equal(requests[1].history.length,2);
  await h.click('.open-case');const scope=h.d.getElementById('gemini-scope');assert.equal(scope.type,'checkbox');assert(scope.checked);assert(h.visible('gemini-scope-control'));assert(!h.d.getElementById('gemini-messages').textContent.includes('How do I import'));assert.equal(h.d.getElementById('toggle-gemini').parentElement.id,'header-case-actions');
  scope.checked=false;scope.dispatchEvent(new h.w.Event('change'));h.d.getElementById('gemini-question').value='What does the app do?';await h.click('#send-gemini');await waitFor(()=>requests.length===3&&!h.d.getElementById('send-gemini').disabled);assert.equal(requests[2].scope,'GENERAL');assert.equal(requests[2].history.length,0);
  await h.click('#home-cases');await waitFor(()=>h.d.getElementById('toggle-gemini').parentElement.id==='cases-top-actions');assert.match(h.d.getElementById('gemini-messages').textContent,/How do I import/);assert(!h.d.getElementById('gemini-messages').textContent.includes('What does the app do?'));await h.click('#clear-gemini');assert.equal(h.d.querySelectorAll('.gemini-message').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});



test('UI Basic: comparison shows three batch mean outcomes and omits Advance sections', async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');
  const result=value=>({seed:17,durationSeconds:60,replay:{},unitOfFlow:'units',summary:{lineOeePercent:1,outputCount:10},batch:{rounds:3,statistics:{lineOeePercent:{mean:value},throughputPerMinute:{mean:value*2},outputCount:{mean:value*2}},rows:[{seed:17},{seed:18},{seed:19}]}});
  const a={id:'a',name:'Baseline',equipment:[],results:result(50)},b={id:'b',name:'Proposed',equipment:[],results:result(80)};
  for(const [id,selected] of [['case-compare-a','a'],['case-compare-b','b']]){const select=h.d.getElementById(id);select.innerHTML='<option value="a">A</option><option value="b">B</option>';select.value=selected;}
  h.w.STComparison({activeCase:{name:'Test',simulations:[a,b]}},Number.isFinite).render();
  const target=h.d.getElementById('case-comparison-content');assert.equal(target.querySelectorAll('tbody tr').length,3);assert.equal(target.querySelectorAll('details').length,0);
  assert.match(target.querySelector('tbody tr').textContent,/50%80%/);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Basic validated search remains creatable after manual save and reopening',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');h.w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates=1;
  const before=h.storedCases()[0].simulations[0],equipment=JSON.stringify(before.equipment),apply=h.w.STScenarios.apply;
  h.w.STScenarios.apply=(source,changes)=>{const result=apply(source,changes);result.scenarioWarnings=[{equipmentId:changes[0].equipmentId,rule:'BACKUP_POSITION',before:'PASS',after:'FAIL'}];return result;};
  h.w.SimulatorEngine.simulateBatch=async input=>{const gain=JSON.stringify(input.case.equipment)===equipment?0:1,summary={lineOeePercent:50+gain,outputCount:(100+gain)*input.run.durationSeconds/60,totalOverflowUnits:0};return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary,batch:{rounds:input.run.rounds,rows:Array.from({length:input.run.rounds},(_,i)=>({seed:input.run.seed+i,summary})),statistics:{lineOeePercent:{mean:50+gain},throughputPerMinute:{mean:100+gain},totalOverflowUnits:{mean:0}}}}};};
  await h.click('[data-basic-view=whatif]');
  let card=h.d.querySelector('.scenario-tier-grid').lastElementChild;card.querySelector('.scenario-search').click();
  await waitFor(()=>card.querySelector('.scenario-search').dataset.icon==='refresh');
  assert.equal(card.querySelector('.scenario-audit-warnings'),null);assert(!card.querySelector('.scenario-create').disabled,card.querySelector('.scenario-preview-status').textContent);
  await h.click('#save-case');await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');
  const evidence=h.storedCases()[0].simulations[0].whatIf.evaluations.find(e=>e.searchScope==='HIGH');assert.equal(evidence.status,'ENGINEERING_REVIEW_REQUIRED');assert(evidence.independentCheck.passed);assert(!evidence.engineeringReviewAcknowledged);
  await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=whatif]');
  card=h.d.querySelector('.scenario-tier-grid').lastElementChild;assert(!card.querySelector('.scenario-create').disabled,'Saved CAPEX card lost its validated winner');assert.equal(card.querySelector('.scenario-audit-warnings input'),null);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI + Apps Script: Basic unconfirmed gain is visible and creates only a validation draft after save and reload',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');h.w.ST_SCENARIO_SEARCH_LIMITS.maxCandidates=1;
  const equipment=JSON.stringify(h.storedCases()[0].simulations[0].equipment);
  h.w.SimulatorEngine.simulateBatch=async input=>{const changed=JSON.stringify(input.case.equipment)!==equipment,gain=changed?(input.run.seed>=1000000?-2:2):0,summary={lineOeePercent:50+gain,outputCount:(100+gain)*input.run.durationSeconds/60},rows=Array.from({length:input.run.rounds},(_,j)=>({seed:input.run.seed+j,summary}));return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary,batch:{rows,statistics:{lineOeePercent:{mean:50+gain},throughputPerMinute:{mean:100+gain}}}}};};
  await h.click('[data-basic-view=whatif]');let card=h.d.querySelector('.scenario-tier-grid').lastElementChild;const explore=card.querySelector('.scenario-explore-reliability');explore.checked=false;explore.onchange();card.querySelector('.scenario-search').click();
  await waitFor(()=>card.querySelector('.scenario-search').dataset.icon==='refresh');
  assert(!card.querySelector('.scenario-create').disabled,card.textContent);assert.match(card.querySelector('.scenario-create').title,/for validation/);assert.match(card.textContent,/did not reproduce/);assert.notEqual(h.w.getComputedStyle(card.querySelector('.scenario-preview-status')).display,'none');
  await h.click('#save-case');await waitFor(()=>h.d.getElementById('autosave-status').dataset.state==='saved');
  const evidence=h.storedCases()[0].simulations[0].whatIf.evaluations.find(e=>e.searchScope==='HIGH');assert.equal(evidence.status,'NOT_REPRODUCED');assert.equal(evidence.independentCheck.passed,false);
  await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=whatif]');card=h.d.querySelector('.scenario-tier-grid').lastElementChild;assert(!card.querySelector('.scenario-create').disabled);assert.match(card.textContent,/did not reproduce/);
  await h.click('.scenario-tier-grid .analysis-recommendation:last-child .scenario-create');assert.match(h.d.querySelector('.message-dialog').textContent,/unvalidated hypothesis/);await h.click('.message-dialog .dialog-heading button');assert(!h.calls.includes('createScenario'));
  await h.click('.scenario-tier-grid .analysis-recommendation:last-child .scenario-create');await h.click('.message-dialog .dialog-actions button:last-child');await waitFor(()=>h.calls.includes('prepareScenarioDraft')&&h.d.getElementById('save-case').classList.contains('has-changes'));assert.equal(h.storedCases()[0].simulations.length,1);await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const saved=h.storedCases()[0],draft=saved.simulations[1];assert.match(draft.name,/Validation required/);assert.equal(draft.results,null);assert.equal(draft.scenario.validation,'NOT_REPRODUCED_REQUIRES_VALIDATION');assert.equal(draft.scenario.evidence.independentValidation,'NOT_REPRODUCED_REQUIRES_VALIDATION');assert.equal(draft.scenario.evidence.screeningOeeGain,2);assert.equal(draft.scenario.evidence.confirmationOeeGain,-2);assert.equal(JSON.stringify(saved.simulations[0].equipment),equipment);assert.equal(saved.simulations[0].whatIf.evaluations.find(e=>e.searchScope==='HIGH').independentCheck.passed,false);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: gallery pin order, Basic equipment icons and independent appearance color resets',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  assert.equal(h.d.getElementById('pin-header').nextElementSibling.id,'cases-settings');
  h.w.STPreferences.setAccent('blues');h.w.STAppearance.setSecondary('blues');
  const primary=h.d.getElementById('choose-primary-color'),secondary=h.d.getElementById('choose-secondary-color');
  assert(primary.closest('.settings-appearance-colors'));assert.equal(primary.closest('.settings-appearance-colors'),secondary.closest('.settings-appearance-colors'));
  h.d.getElementById('reset-primary-color').click();
  assert.equal(h.d.documentElement.dataset.accent,h.w.STThemeResources.defaultAccent);assert.equal(h.d.documentElement.dataset.secondaryAccent,'blues');
  h.d.getElementById('reset-secondary-color').click();assert.equal(h.d.documentElement.dataset.secondaryAccent,h.w.STThemeResources.defaultSecondary);
  await h.click('.open-case');
  assert.equal(h.d.getElementById('pin-header').nextElementSibling.id,'request-progress');
  const cards=Array.from(h.d.querySelectorAll('#equipment-list .equipment-card'));assert(cards.length);
  assert(cards.some(card=>card.dataset.equipmentType==='CONVEYOR'));
  cards.forEach(card=>{const symbol=card.querySelector('.equipment-card-symbol');assert(symbol?.querySelector('svg'));assert.equal(symbol.dataset.type,card._fields.querySelector('.equipment-type').value);});
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: latest CAPEX card survives changed proposal order, mode and configuration without stale approval',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],changes=h.w.STScenarios.catalog(sim).slice(0,3);
  const project={catalog:true,explore:true,kind:'CUSTOM',tier:'HIGH',searchScope:'HIGH',changes:changes};
  const signature=h.w.STScenarios.signature(sim);
  sim.whatIf={evaluations:[{sourceSimulationId:sim.id,sourceSignature:signature,kind:'CUSTOM',tier:'HIGH',searchScope:'HIGH',baseRecordKey:JSON.stringify([sim.id,signature,'CUSTOM','HIGH','HIGH',true,changes]),uiMode:'advance',status:'NO_DEMONSTRATED_IMPROVEMENT',updatedAt:'2026-10-09T16:00:00Z',baseline:{oee:30,throughput:120},candidate:{oee:48,throughput:192},message:'Previous search complete.'}]};
  sim.whatIf.evaluations.push({...sim.whatIf.evaluations[0],recordKey:'legacy-draft',status:'NOT_EVALUATED',updatedAt:'2026-10-09T17:00:00Z',baseline:undefined,candidate:undefined,message:'Selections changed.'});
  h.d.documentElement.dataset.uiMode='basic';
  let card=h.w.STWhatIf.card({...project,changes:changes.slice().reverse()},()=>{},sim.equipment,sim);h.d.body.append(card);
  assert(card.querySelector('.scenario-basic-metrics').textContent.includes('48.0%'));assert.match(card.querySelector('.scenario-preview-status').textContent,/Configuration changed/);
  card.querySelector('.scenario-configure').click();const checkbox=card.querySelector('.scenario-change input');checkbox.checked=!checkbox.checked;checkbox.dispatchEvent(new h.w.Event('change'));
  assert(sim.whatIf.evaluations[0].lastResult);assert(card.querySelector('.scenario-basic-metrics').textContent.includes('48.0%'));
  const saved=JSON.parse(JSON.stringify(sim));saved.dynamicConfig.seed=123456;card.remove();
  card=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(card);
  assert(card.querySelector('.scenario-basic-metrics').textContent.includes('48.0%'));assert.match(card.querySelector('.scenario-preview-status').textContent,/previous inputs/);assert(card.querySelector('.scenario-create').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Basic: duration and sampling options persist and shift inputs retain hours per shift',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  await h.click('#basic-case-actions button[aria-label=Settings]');await h.click('#settings-tab-simulation');
  for(const id of ['duration-mode','run-duration','run-shift-hours','run-playback-rate'])assert(h.d.getElementById(id).closest('#simulation-duration-controls'));
  for(const id of ['run-sample-interval','run-events-enabled','run-chart-window'])assert(h.d.getElementById(id).closest('#settings-page-simulation'));
  assert.equal(h.d.querySelectorAll('[data-control=run-playback-rate]').length,0);
  const mode=h.d.getElementById('duration-mode');mode.value='FIXED';mode.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert(!h.d.getElementById('run-duration').disabled);assert(h.d.getElementById('run-shift-hours').closest('label').classList.contains('hidden'));
  h.d.getElementById('run-duration').value=120;h.d.getElementById('run-duration').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  h.d.getElementById('run-sample-interval').value=3;h.d.getElementById('run-sample-interval').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  mode.value='SHIFTS';mode.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert(!h.d.getElementById('run-shift-hours').closest('label').classList.contains('hidden'));assert(h.d.getElementById('run-duration').disabled);
  h.d.getElementById('run-shift-hours').value=6;h.d.getElementById('run-shift-hours').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.click('#settings-close');h.d.getElementById('settings-shift-count').value='2';h.d.getElementById('settings-shift-count').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(h.d.getElementById('run-shift-hours').value,'6');
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.shiftHours===6);
  const run=h.storedCases()[0].simulations[0].dynamicConfig;assert.equal(run.durationMode,'SHIFTS');assert.equal(run.durationSeconds,43200);assert.equal(run.sampleEverySeconds,3);assert.equal(run.shiftCount,2);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

for(const stage of ['before first round','background rounds','streaming first round'])test('UI: Reset fully stops '+stage+' and allows a fresh run',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');
  h.d.getElementById('run-duration').value=5;h.d.getElementById('run-sample-interval').value=1;h.d.getElementById('run-rounds').value=3;
  const original=h.w.SimulatorEngine.simulateBatch;let release,oldOptions,oldResult;const requests=[];
  h.w.SimulatorEngine.simulateBatch=async(input,options)=>{
   requests.push(JSON.parse(JSON.stringify(input)));
   if(requests.length>1)return original(input,options);
   oldOptions=options;
   oldResult=(await h.w.SimulatorEngine.simulateLineAsync(input,{detail:true})).result;
   if(stage==='background rounds')options.onFirstRound(oldResult);
   if(stage==='streaming first round')options.onFirstProgress({...oldResult,provisional:true,calculatedThroughSeconds:2});
   await new Promise(resolve=>release=resolve);
   return {ok:true,result:oldResult};
  };
  await h.click('#run-simulation');await waitFor(()=>release);
  assert(h.d.getElementById('run-rounds').disabled);
  await h.click('#reset-playback');
  assert(oldOptions.cancelled(),'engine cancellation is requested');
  assert.equal(h.d.getElementById('run-rounds').disabled,false);
  assert.equal(h.d.getElementById('run-simulation').disabled,false);
  assert(h.visible('batch-dialog')===false);
  if(stage==='streaming first round')assert.equal(h.visible('simulation-results'),false);
  h.d.getElementById('run-rounds').value=2;
  await h.click('#run-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
  await h.click('#pause-simulation');
  assert.equal(requests[1].run.rounds,2);
  const saved=JSON.stringify(h.storedCases()[0].simulations[0].results);
  release();await settle();await settle();
  assert.equal(JSON.stringify(h.storedCases()[0].simulations[0].results),saved,'late cancelled work cannot replace the new run');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

for(const uiMode of ['BASIC','ADVANCE'])test('UI: fresh scenario search clears restored metrics and saved fallback in '+uiMode,async()=>{
 const h=await setup({remember:true,uiMode});try{
  const sim=h.storedCases()[0].simulations[0],changes=h.w.STScenarios.catalog(sim).slice(0,3);
  const project={catalog:true,explore:true,kind:'CUSTOM',tier:'HIGH',searchScope:'HIGH',changes};
  sim.whatIf={evaluations:[{cardId:JSON.stringify([sim.id,'CAPEX','HIGH']),sourceSimulationId:sim.id,sourceSignature:h.w.STScenarios.signature(sim),kind:'CUSTOM',tier:'HIGH',searchScope:'HIGH',status:'NOT_EVALUATED',updatedAt:new Date().toISOString(),lastResult:{baseline:{oee:30,throughput:120},candidate:{oee:48,throughput:192}}}]};
  let release,options;
  h.w.SimulatorEngine.simulateBatch=async(input,opts)=>{options=opts;await new Promise(resolve=>release=resolve);return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:30,outputCount:120}}};};
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);
  assert(card.querySelector('.scenario-metrics').textContent);
  card.querySelector('.scenario-search').click();await waitFor(()=>release);
  assert.equal(card.querySelector('.scenario-metrics').textContent,'');
  assert(card.querySelector('.scenario-create').disabled);
  assert.equal(sim.whatIf.evaluations[0].candidate,undefined);
  assert.equal(sim.whatIf.evaluations[0].lastResult,undefined);
  card.querySelector('.scenario-search').click();card.querySelector('.scenario-search').click();assert(options.cancelled());release();
  await waitFor(()=>card.querySelector('.scenario-search').dataset.icon==='refresh');
  assert.equal(card.querySelector('.scenario-metrics').textContent,'');
  const saved=JSON.parse(JSON.stringify(sim));card.remove();
  const reopened=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(reopened);
  assert.equal(reopened.querySelector('.scenario-metrics').textContent,'');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});



test('UI: chat exports the current transcript as TXT or JSON and clears export availability with history',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');
  assert.equal(h.d.getElementById('export-gemini').getAttribute('aria-disabled'),'true');
  h.api.askGemini=()=>({text:'Respuesta **clara**',proposals:[]});h.d.getElementById('gemini-question').value='Pregunta de prueba';await h.click('#send-gemini');await waitFor(()=>!h.d.getElementById('send-gemini').disabled);
  let copied='',downloadName='',blob;Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}},configurable:true});
  h.w.URL.createObjectURL=value=>{blob=value;return 'blob:test';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){downloadName=this.download;};
  await h.click('[data-chat-export=copy]');assert.match(copied,/You.*\nPregunta de prueba[\s\S]*Gemini.*\nRespuesta/);
  await h.click('[data-chat-export=json]');assert.match(downloadName,/gemini-history-.*\.json$/);
  const read=await new Promise(resolve=>{const reader=new h.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const data=JSON.parse(read);assert.equal(data.messages.length,2);assert(!read.includes('equipment'));assert(!read.includes('apiKey'));
  await h.click('#clear-gemini');assert.equal(h.d.getElementById('export-gemini').getAttribute('aria-disabled'),'true');assert.equal(h.d.querySelectorAll('.gemini-message').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI + Apps Script: Basic chat creates a validated CAPEX clone through a simple button',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const source=h.storedCases()[0].simulations[0];
  const proposal={...h.w.STScenarios.plan(source).projects.find(p=>p.canApply),title:'Chat CAPEX copy'};assert(proposal.changes.length);
  h.api.askGemini=()=>({text:'Review the proposed input changes.',proposals:[proposal]});h.d.getElementById('gemini-question').value='Propose a CAPEX scenario';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-scenario-create')&&!h.d.querySelector('.gemini-scenario-create').disabled);
  assert.equal(h.d.querySelector('#gemini-messages .analysis-recommendation'),null);assert(h.d.querySelector('.gemini-message[data-role=model] > .gemini-scenario-create'));
  await h.click('.gemini-scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));assert.deepEqual(Array.from(h.d.querySelectorAll('.message-dialog th'),cell=>cell.textContent),['Equipment','Parameter','Current','Proposed']);assert.equal(h.d.querySelectorAll('.message-dialog tbody tr').length,proposal.changes.length);await h.click('.message-dialog .dialog-actions button:last-child');await waitFor(()=>h.calls.includes('prepareScenarioDraft')&&h.d.getElementById('save-case').classList.contains('has-changes'));assert.equal(h.storedCases()[0].simulations.length,1);assert.equal(h.calls.filter(x=>x==='saveCase').length,0);await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const saved=h.storedCases()[0],clone=saved.simulations[1];assert.equal(clone.name,'Chat CAPEX copy');assert.equal(clone.clonedFromSimulationId,source.id);assert.equal(clone.results,null);assert.equal(clone.scenario.origin,'GEMINI');assert.deepEqual(saved.simulations[0].equipment,source.equipment);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: reliability setting persists per simulation, clears stale results and restores its default in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({uiMode});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#open-settings');
  const checkbox=h.d.getElementById('settings-reliability-enabled');assert(checkbox.checked);assert(!checkbox.disabled);
  checkbox.checked=false;checkbox.dispatchEvent(new h.w.Event('change'));await h.click('#settings-close');if(uiMode==='BASIC')await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.reliabilityEnabled===false);assert.equal(h.storedCases()[0].simulations[0].results,null);
  await h.click('#open-settings');assert.equal(checkbox.checked,false);
  checkbox.checked=true;checkbox.dispatchEvent(new h.w.Event('change'));await h.click('#settings-close');if(uiMode==='BASIC')await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.reliabilityEnabled===undefined);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI Basic: numeric run controls keep focus across successive digits and save the complete value',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  const rounds=h.d.getElementById('run-rounds');rounds.focus();
  for(const value of ['','2','25']){rounds.value=value;rounds.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(h.d.activeElement,rounds,'focus must remain on Rounds after '+value);assert.equal(rounds.value,value);}
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.rounds===25);
  await h.click('#basic-case-actions button[aria-label=Settings]');await h.click('#settings-tab-simulation');
  const sample=h.d.getElementById('run-sample-interval');sample.focus();
  for(const value of ['1','12']){sample.value=value;sample.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert.equal(h.d.activeElement,sample);}
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: cloud saves keep edits in memory until Save and ignore obsolete local-mode preferences',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode});try{
  await h.click('.open-case');if(uiMode==='BASIC')await h.click('[data-basic-view=simulation]');
  const email=h.d.getElementById('user-email').textContent;h.w.STPreferences.write('localDriveMode.'+JSON.stringify([email,'preview']),'LOCAL');
  assert.equal(h.d.getElementById('storage-mode'),null);assert.equal(h.w.STLocalDrive,undefined);
  const before=h.calls.filter(name=>name==='saveCase').length,rounds=h.d.getElementById('run-rounds');
  for(const value of ['2','25']){rounds.value=value;rounds.dispatchEvent(new h.w.Event('input',{bubbles:true}));await settle();}
  assert.equal(h.calls.filter(name=>name==='saveCase').length,before);assert(h.d.getElementById('save-case').classList.contains('has-changes'));
  await h.click('#save-case');await waitFor(()=>!h.d.getElementById('save-case').classList.contains('has-changes'));
  assert.equal(h.calls.filter(name=>name==='saveCase').length,before+1);assert.equal(h.storedCases()[0].simulations[0].dynamicConfig.rounds,25);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI + Apps Script: Gemini scenario uses exact unchanged source values when proposal before values drift',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const source=h.storedCases()[0].simulations[0],original=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);
  const proposal={...original,title:'Exact source study',changes:original.changes.map(c=>({...c,before:Number(c.before)+.0000001}))};
  h.api.askGemini=()=>({text:'Review this scenario.',proposals:[proposal]});h.w.ST_GEMINI_CHAT_PRESENTATION.enabled=false;
  h.d.getElementById('gemini-question').value='Propose a scenario';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-scenario-create')&&!h.d.querySelector('.gemini-scenario-create').disabled);
  await h.click('.gemini-scenario-create');await h.click('.message-dialog .dialog-actions button:last-child');
  await waitFor(()=>h.d.getElementById('simulation-selector').value!=='simulation-a');assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const changes=h.storedCases()[0].simulations[1].scenario.changes;assert.deepEqual(changes.map(c=>c.before),Array.from(original.changes,c=>c.before));assert.deepEqual(changes.map(c=>c.after),Array.from(original.changes,c=>c.after));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: updated Sheet preview presents conveyor speed in G, accumulation in H and shifted geometry cells',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  const original=h.api.previewSheetImport;h.api.previewSheetImport=()=>{const data=original();data.layout='plant-sheet-v2';data.source.schemaVersion='plant-sheet-v2';const unit=data.equipment.find(e=>e.type==='CONVEYOR');unit.processData.accumulation={...unit.processData.accumulation,speedMode:'MANUAL',conveyorSpeedMmPerSecond:29.93*1000/60,declaredAccumulationSeconds:28};return data;};
  await h.click('.open-case');await h.click('[data-basic-view=equipment]');await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='synthetic-sheet-id';await h.click('#sheet-import-read');
  const section=h.d.querySelector('[data-source-index="1"]');assert(section);const belt=section.querySelector('[data-field="beltSpeed"]'),accumulation=section.querySelector('[data-field="declaredAccumulation"]');
  assert(belt);assert(accumulation);assert.match(belt.closest('tr').textContent,/G11.*m\/min.*29.93/);assert.match(accumulation.closest('tr').textContent,/H11.*reference.*28/);assert.match(section.querySelector('[data-field="length"]').closest('tr').textContent,/I11/);assert.match(section.querySelector('[data-field="overspeed"]').closest('tr').textContent,/Y11/);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Settings General exports the complete current case and every simulation without saving to Drive',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode});try{
   const get=h.api.getCase;h.api.getCase=id=>{const record=get(id),other=JSON.parse(JSON.stringify(record.simulations[0]));other.id='second-simulation';other.name='Second run';other.results={summary:{lineOeePercent:45},replay:{samples:[{virtualSecond:1,preserved:'full replay'}]},events:[{kind:'preserved event'}]};other.whatIf={evaluations:[{status:'NOT_REPRODUCED',detail:'preserved evidence'}]};other.geminiHistory=[{role:'user',text:'preserved case chat'}];record.simulations.push(other);return record;};
   let blob,filename;h.w.URL.createObjectURL=value=>{blob=value;return 'blob:full-case';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
   await h.click('.open-case');const rounds=h.d.getElementById('run-rounds');rounds.value='25';rounds.dispatchEvent(new h.w.Event('input',{bubbles:true}));
   h.w.STSettings.open();await h.click('#settings-tab-case');const name=h.d.getElementById('case-name');name.value='Complete case / current draft';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
   const grid=name.closest('.settings-case-general-grid'),button=h.d.getElementById('export-complete-case');assert.equal(grid.children[0].querySelector('input'),name);assert.equal(grid.children[1].querySelector('button'),button);
   const before=h.calls.filter(c=>c==='saveCase').length;await h.click('#export-complete-case');await waitFor(()=>h.d.querySelector('.case-export-dialog .dialog-actions button:last-child:not(:disabled)'));await h.click('.case-export-dialog .dialog-actions button:last-child');await waitFor(()=>blob);assert.equal(blob.type,'application/json');assert.match(filename,/Complete case - current draft-complete\.json/);
   const raw=await new Promise(resolve=>{const reader=new h.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);}),data=JSON.parse(raw);
   assert.equal(data.name,name.value);assert.equal(data.simulations.length,2);assert.equal(data.simulations[0].dynamicConfig.rounds,25);assert.equal(data.simulations[1].results.replay.samples[0].preserved,'full replay');assert.equal(data.simulations[1].whatIf.evaluations[0].detail,'preserved evidence');assert.equal(data.simulations[1].geminiHistory[0].text,'preserved case chat');assert.equal(data.activeSimulationId,'simulation-a');assert.equal(data.expectedRevision,undefined);
   assert.equal(h.calls.filter(c=>c==='saveCase').length,before);assert(h.d.getElementById('save-case').classList.contains('has-changes'));assert.equal(button.disabled,false);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: DOE is controlled from scenario cards and Settings does not duplicate or overwrite it',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode});try{
  await h.click('.open-case');if(uiMode==='BASIC')await h.click('[data-basic-view=whatif]');
  if(uiMode==='ADVANCE'){const simulation=h.storedCases()[0].simulations[0],host=h.d.createElement('article');host.className='analysis-recommendation';h.d.body.append(host);const project=h.w.STScenarios.plan(simulation).projects.find(p=>p.canApply);h.w.STScenarioExplorer.attach(host,project,()=>{},simulation);}
  const toggle=h.d.querySelector('.scenario-doe-enabled');assert(toggle);toggle.checked=true;toggle.onchange();assert(h.w.STScenarioExplorer.doeEnabled());
  h.w.STSettings.open();await h.click('#settings-tab-case');assert.equal(h.d.getElementById('settings-scenario-doe'),null);assert.equal(h.d.getElementById('settings-doe-section'),null);assert.equal(h.d.querySelector('#settings-page-case .scenario-doe-enabled'),null);
  await h.click('#settings-cancel');assert(h.w.STScenarioExplorer.doeEnabled());assert(toggle.checked);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: gallery exports the complete saved case without opening it and permits retry after a failed read',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC'});try{
  const data=h.api.getCase('demo'),other=JSON.parse(JSON.stringify(data.simulations[0]));other.id='other';other.results={summary:{lineOeePercent:42},replay:{samples:[{preserved:'full data'}]}};other.geminiHistory=[{role:'user',text:'saved chat'}];data.simulations.push(other);
  h.api.getCompleteCaseForExport=id=>{assert.equal(id,'demo');return data;};let blob,name;const downloads=[];h.w.URL.createObjectURL=value=>{blob=value;downloads.push(value);return 'blob:gallery-case';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){name=this.download;};
  const button=h.d.querySelector('.export-gallery-case');assert(button);await h.click('.export-gallery-case');await waitFor(()=>h.d.querySelector('.case-export-dialog .dialog-actions button:last-child:not(:disabled)'));await h.click('.case-export-dialog .dialog-actions button:last-child');await waitFor(()=>blob);assert.match(name,/-complete\.json$/);
  const raw=await new Promise(resolve=>{const reader=new h.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);}),record=JSON.parse(raw);assert.equal(record.simulations.length,2);assert.equal(record.simulations[1].results.replay.samples[0].preserved,'full data');assert.equal(record.simulations[1].geminiHistory[0].text,'saved chat');assert(h.visible('cases-panel'));assert(!h.visible('editor-panel'));assert(!h.calls.includes('getCase'));assert(!h.calls.includes('saveCase'));assert.equal(button.disabled,false);
  h.api.getCompleteCaseForExport=()=>{throw Error('Read failed');};await h.click('.export-gallery-case');await waitFor(()=>!button.disabled);assert.equal(downloads.length,1);
  h.api.getCompleteCaseForExport=()=>data;await h.click('.export-gallery-case');await waitFor(()=>h.d.querySelector('.case-export-dialog .dialog-actions button:last-child:not(:disabled)'));await h.click('.case-export-dialog .dialog-actions button:last-child');await waitFor(()=>downloads.length===2);assert.equal(button.disabled,false);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: plant calendar draft survives complete-case export in Basic and Advance without changing run duration',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode});try{
  let blob;h.w.URL.createObjectURL=value=>{blob=value;return 'blob:calendar';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){};
  await h.click('.open-case');const duration=h.d.getElementById('run-duration').value;
  await h.click('#open-plant-calendar');const calendar=h.d.getElementById('settings-plant-calendar');calendar.querySelector('input[type=checkbox]').click();
  const total=calendar.querySelector('input[type=number]');total.value='43200';total.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert.equal(h.d.getElementById('run-duration').value,duration);assert(h.d.getElementById('save-case').classList.contains('has-changes'));
  await h.click('#plant-calendar-done');h.w.STSettings.open();await h.click('#settings-tab-case');await h.click('#export-complete-case');await waitFor(()=>h.d.querySelector('.case-export-dialog .dialog-actions button:last-child:not(:disabled)'));await h.click('.case-export-dialog .dialog-actions button:last-child');await waitFor(()=>blob);
  const raw=await new Promise(resolve=>{const reader=new h.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const data=JSON.parse(raw);
  assert.equal(data.simulations[0].dynamicConfig.plantCalendar.totalMinutes,43200);assert.equal(data.simulations[0].dynamicConfig.plantCalendar.enabled,true);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: scheduled calendar reaches the engine, saves its audit and reopens without double-discounting',async()=>{
 const h=await setup({remember:true,realScenarioServer:true});try{
  await h.click('.open-case');await h.click('#open-plant-calendar');const calendar=h.d.getElementById('settings-plant-calendar');calendar.querySelector('input[type=checkbox]').click();
  const controls=calendar.querySelectorAll('.plant-calendar-inputs input');for(const [index,value] of [[0,'2'],[5,'0.3333333333333333']]){controls[index].value=value;controls[index].dispatchEvent(new h.w.Event('change',{bubbles:true}));}
  const mode=calendar.querySelector('select');mode.value='SCHEDULED';mode.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  assert.equal(calendar.querySelectorAll('[data-plan-field=count]').length,7);assert.match(calendar.textContent,/1 scheduled stops/);
  const full=Array.from(calendar.querySelectorAll('button')).find(b=>b.textContent==='Apply plant calendar');full.click();assert.equal(h.d.getElementById('duration-mode').value,'FIXED');assert.equal(h.d.getElementById('run-duration').value,'120');
  await h.click('#plant-calendar-done');h.d.getElementById('run-rounds').value='1';let completed;const calculate=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async(...args)=>{const response=await calculate(...args);if(response.result?.plantCalendar)completed=response;return response;};await h.click('#run-simulation');await waitFor(()=>completed);assert.equal(completed.ok,true);await settle();await h.click('#pause-simulation');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results?.plantCalendar?.completePeriod);
  await h.click('#pause-simulation');const saved=h.storedCases()[0].simulations[0];assert.equal(saved.results.plantCalendar.observedStopSeconds,20);assert.equal(saved.dynamicConfig.plantCalendar.mode,'SCHEDULED');assert.equal(saved.results.replay.plantCalendar.observedStopSeconds,20);
  await h.click('.sidebar [data-view="results"]');assert.match(h.d.getElementById('results-plant-comparison').textContent,/no additional downtime discount/);assert.doesNotMatch(h.d.getElementById('results-plant-comparison').textContent,/Actual|Difference/);await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="results"]');assert.match(h.d.getElementById('results-plant-comparison').textContent,/no additional downtime discount/);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: duration methods, optional shifts and graph window save consistently in Basic and Advance',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode});try{
  await h.click('.open-case');for(const id of ['duration-mode','run-duration','run-playback-rate'])assert(h.d.getElementById(id).closest('#run-panel'));for(const id of ['run-events-enabled','run-chart-window'])assert(h.d.getElementById(id).closest('#settings-page-simulation'));h.w.STSettings.open();await h.click('#settings-tab-simulation');const set=(id,value,type='change')=>{const e=h.d.getElementById(id);e.value=value;e.dispatchEvent(new h.w.Event(type,{bubbles:true}));};
  set('duration-mode','FIXED');set('run-duration','30','input');set('run-duration-unit','DAYS');assert.equal(h.w.STRunOptions.read().durationSeconds,2592000);assert.equal(h.w.STRunOptions.read().calculationMode,'FAST');
  set('duration-mode','DATES');set('run-start-at','2026-10-01T00:00');set('run-end-at','2026-10-31T00:00');assert.equal(h.w.STRunOptions.read().durationSeconds,2592000);
  set('duration-mode','SHIFTS');set('settings-shift-count','90','input');assert.equal(h.w.STRunOptions.read().durationSeconds,2592000);h.d.getElementById('run-track-shifts').checked=true;h.d.getElementById('run-track-shifts').dispatchEvent(new h.w.Event('change'));assert.equal(h.w.STRunOptions.read().shiftSeconds,28800);assert.match(h.d.getElementById('run-duration-summary').textContent,/90 complete shifts/);
  await h.w.STSettings.close();set('run-chart-window','86400');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.durationSeconds===2592000);const config=h.storedCases()[0].simulations[0].dynamicConfig;assert.equal(config.chartWindow,'86400');assert.equal(config.durationOptions.method,'SHIFTS');assert.equal(config.eventsEnabled,false);assert.equal(config.trackShifts,true);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});
test('UI: Apply plant calendar offers Add/Replace/Cancel, deduplicates and persists the visible event program',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-plant-calendar');const calendar=h.d.getElementById('settings-plant-calendar');calendar.querySelector('input[type=checkbox]').click();const numbers=calendar.querySelectorAll('.plant-calendar-inputs input');for(const [i,v] of [[0,'2'],[5,'0.3333333333333333']]){numbers[i].value=v;numbers[i].dispatchEvent(new h.w.Event('change',{bubbles:true}));}const mode=calendar.querySelector('select');mode.value='SCHEDULED';mode.dispatchEvent(new h.w.Event('change'));const apply=Array.from(calendar.querySelectorAll('button')).find(b=>b.textContent==='Apply plant calendar');apply.click();await settle();assert.equal(h.d.querySelectorAll('#planned-line-events tbody tr').length,1);assert.match(h.d.querySelector('#planned-line-events tbody th').textContent,/^[A-Z]/);assert(h.d.getElementById('run-events-enabled').checked);assert.equal(h.d.getElementById('simulation-event-section').classList.contains('hidden'),false);
  apply.click();await waitFor(()=>h.d.querySelector('.message-dialog[open]'));Array.from(h.d.querySelectorAll('.message-dialog .dialog-actions button')).find(b=>b.textContent==='Add').click();await settle();assert.equal(h.d.querySelectorAll('#planned-line-events tbody tr').length,1);
  numbers[0].value='3';numbers[0].dispatchEvent(new h.w.Event('change',{bubbles:true}));apply.click();await waitFor(()=>h.d.querySelector('.message-dialog[open]'));Array.from(h.d.querySelectorAll('.message-dialog .dialog-actions button')).find(b=>b.textContent==='Cancel').click();await settle();assert.equal(h.d.getElementById('run-duration').value,'120');
  apply.click();await waitFor(()=>h.d.querySelector('.message-dialog[open]'));Array.from(h.d.querySelectorAll('.message-dialog .dialog-actions button')).find(b=>b.textContent==='Replace').click();await settle();assert.equal(h.d.getElementById('run-duration').value,'180');assert.equal(h.d.querySelectorAll('#planned-line-events tbody tr').length,1);
  await h.click('#plant-calendar-done');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.plannedStops?.length===1);assert.equal(h.storedCases()[0].simulations[0].dynamicConfig.plantCalendar.application,'EVENTS');h.d.getElementById('run-events-enabled').click();await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.eventsEnabled===false);assert.equal(h.storedCases()[0].simulations[0].dynamicConfig.plannedStops.length,1);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Fast and Summary finish at the final snapshot without auto-playing a long history',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');for(const calculationMode of ['FAST','SUMMARY']){h.w.STSettings.open();await h.click('#settings-tab-simulation');for(const [id,value] of [['duration-mode','FIXED'],['run-duration','30'],['run-duration-unit','SECONDS'],['run-calculation-mode',calculationMode]]){const field=h.d.getElementById(id);field.value=value;field.dispatchEvent(new h.w.Event(id==='run-duration'?'input':'change',{bubbles:true}));}await h.w.STSettings.close();h.d.getElementById('run-rounds').value='1';await h.click('#run-simulation');await waitFor(()=>h.d.getElementById('playback-progress').textContent==='100.0%');await settle();assert.equal(h.d.getElementById('run-duration').disabled,false);assert.equal(h.d.getElementById('play-simulation').disabled,calculationMode==='SUMMARY');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.calculationMode===calculationMode);assert.equal(h.storedCases()[0].simulations[0].results.detailCoverage.recordingMode,calculationMode==='SUMMARY'?'SUMMARY':'BOUNDED');}
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: long-period loss diagnostics run only after an explicit request and then reuse the result',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');const record=h.storedCases()[0],simulation=record.simulations[0],run={durationSeconds:86400,tickSeconds:.25,sampleEverySeconds:60,seed:17,rounds:1};simulation.dynamicConfig=run;const result={durationSeconds:86400,seed:17,inputSignature:h.w.SimulatorEngine.inputSignature({case:{equipment:simulation.equipment,unitOfFlow:record.unitOfFlow},run}),summary:{lineOeePercent:50,outputCount:1000,qualityAssumption:'NO_REJECT_MODEL_ASSUMES_100_PERCENT'},equipmentMetrics:{},accumulationZoneMetrics:{},samples:[]};let calls=0;h.w.SimulatorEngine.simulateBatch=async()=>{calls++;return {ok:true,result:{summary:{lineOeePercent:60},durationSeconds:86400}};};h.w.STResults.render(result,record,simulation);await settle();assert.equal(calls,0);const calculate=Array.from(h.d.querySelectorAll('#results-loss-breakdown button')).find(b=>b.textContent==='Calculate matched loss diagnostics');assert(calculate);calculate.click();await waitFor(()=>simulation.whatIf?.lossDiagnostic?.status==='COMPLETE');assert.equal(calls,1);h.w.STResults.render(result,record,simulation);await settle();assert.equal(calls,1);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: enabling events exposes the editor and its calendar dialog in Basic and Advance',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');h.w.STSettings.open();await h.click('#settings-tab-simulation');
  assert.equal(h.d.querySelector('#settings-page-simulation #settings-plant-calendar'),null);
  const enable=h.d.getElementById('run-events-enabled');enable.click();await h.w.STSettings.close();
  const section=h.d.getElementById('simulation-event-section');assert(!section.classList.contains('hidden'));assert.equal(section.closest('#run-config'),null);assert.notEqual(h.w.getComputedStyle(h.d.getElementById('control-events')).display,'none');
  await h.click('#toggle-control-events');assert(h.d.getElementById('simulation-event-content').hidden);assert.equal(h.d.getElementById('toggle-control-events').getAttribute('aria-expanded'),'false');await h.click('#toggle-control-events');assert(!h.d.getElementById('simulation-event-content').hidden);
  await h.click('#open-plant-calendar');assert(h.d.getElementById('plant-calendar-dialog').open);assert(h.d.querySelector('#plant-calendar-dialog .plant-calendar-inputs'));await h.click('#plant-calendar-done');assert(!h.d.getElementById('plant-calendar-dialog').open);
  enable.click();assert(section.classList.contains('hidden'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: relational Formats tabs save product-linked packaging and preserve a single source of operating settings',async()=>{
 const h=await setup({uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view="products"]');assert(h.visible('products-panel'));assert(!h.visible('run-panel'));assert.equal(h.d.getElementById('products-title'),null);assert.equal(h.d.getElementById('products-panel').getAttribute('aria-label'),'Formats');
  const enter=(label,value)=>{const input=h.d.querySelector('[aria-label="'+label+'"]');assert(input,label);input.value=String(value);input.dispatchEvent(new h.w.Event('input',{bubbles:true}));};
  await h.click('[aria-label="Add product"]');enter('Product name','Product A');enter('Length along travel (mm)',60);
  await h.click('[data-format-tab="formats"]');await h.click('[aria-label="Add format"]');enter('Format name','A / Case 12');enter('Bottles per case',12);enter('Case length along travel (mm)',300);
  assert.equal(h.d.querySelectorAll('.product-settings-table select').length,0);assert.equal(h.d.querySelector('#products-workspace .dialog-actions'),null);await settle();assert(h.visible('products-panel'));assert(!h.visible('editor-panel'));assert(!h.visible('run-panel'));
  await h.click('[data-format-tab=products]');const unused=h.d.querySelector('#products-workspace tr[data-equipment-id] input[type=number]');assert(unused.disabled);await h.click('#save-case');assert(unused.disabled);await waitFor(()=>h.storedCases()[0].metadata?.formatCatalog?.formats?.length===1);const record=h.storedCases()[0],catalog=record.metadata.formatCatalog;assert.equal(catalog.products[0].name,'Product A');assert.equal(catalog.boxes,undefined);assert.equal(catalog.formats[0].case.lengthMm,300);assert.equal(catalog.formats[0].bottlesPerCase,12);assert.equal(catalog.formats[0].productId,catalog.products[0].id);assert.equal(record.metadata.products,undefined);
  await h.click('[data-basic-view="simulation"]');const selector=h.d.getElementById('run-initial-format');assert.equal(selector.closest('.simulation-duration-grid').firstElementChild,selector.closest('label'));assert(!selector.disabled);selector.value=catalog.formats[0].id;selector.dispatchEvent(new h.w.Event('change',{bubbles:true}));await settle();assert.equal(h.w.STProducts.runFields().initialFormatId,catalog.formats[0].id);assert.equal(h.w.STProducts.currentFormat().productName,'Product A');
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.initialFormatId===catalog.formats[0].id);assert.equal(h.d.querySelector('.equipment-material-flow').options.length,3);assert.equal(h.d.querySelector('.equipment-product-context'),null);await h.click('[data-basic-view=conveyors]');assert(h.d.querySelector('#equipment-inspector .basic-conveyor-worksheet'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: configuration import carries relational catalog references and rejects shared-record conflicts',async()=>{
 const h=await setup();try{
  const record=h.storedCases()[0],sim=record.simulations[0],current=h.w.STReports.configuration(record,sim),source=JSON.parse(JSON.stringify(current));
  source.case.metadata={formatCatalog:{version:1,products:[{id:'p',name:'Product',bottle:{lengthMm:60}}],boxes:[{id:'b',name:'Box',lengthMm:300}],formats:[{id:'f',name:'Format',productId:'p',boxId:'b',bottlesPerCase:12,equipment:{}}]}};
  source.simulation.equipment.forEach(e=>{e.processData.flowUnits={input:'BOTTLES',output:'BOTTLES'};});source.simulation.dynamicConfig={...source.simulation.dynamicConfig,durationMode:'FIXED',durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,rounds:1,seed:1,initialFormatId:'f',initialProductId:'f',commands:[]};
  const config=h.w.STConfigurationEditor.validate(JSON.stringify(source),current);assert.equal(config.formatCatalog.formats[0].productId,'p');assert.equal(config.dynamicConfig.productCatalog[0].boxId,'b');assert.equal(config.dynamicConfig.initialFormatId,'f');assert.equal(current.case.metadata.formatCatalog,undefined);
  current.case.metadata=JSON.parse(JSON.stringify(source.case.metadata));source.case.metadata.formatCatalog.products[0].bottle.lengthMm=61;assert.throws(()=>h.w.STConfigurationEditor.validate(JSON.stringify(source),current),/Shared products record/);assert.equal(current.case.metadata.formatCatalog.products[0].bottle.lengthMm,60);
 }finally{h.dom.window.close();}
});

test('UI Basic: conveyor default inputs are actually mounted and visible after navigating from Equipment',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view="equipment"]');await h.click('[data-basic-view="conveyors"]');
  assert.deepEqual(h.errors,[]);const inspector=h.d.getElementById('equipment-inspector'),fields=inspector.querySelector('.equipment-fields');
  assert(fields,JSON.stringify({html:inspector.outerHTML,selected:h.d.querySelectorAll('.equipment-selected').length,cards:h.d.querySelectorAll('.equipment-card').length,view:h.d.documentElement.dataset.basicView}));
  for(const key of ['package-length','discharge-pitch','infeed','moving-gap','accumulated-gap','speed-mode','belt-speed','lact','blocked-delay']){const control=fields.querySelector('.format-zone-'+key);assert(control,key);for(let parent=control.closest('label');parent&&parent!==h.d.body;parent=parent.parentElement)assert.notEqual(h.w.getComputedStyle(parent).display,'none',key+' hidden by '+parent.className);}
  const second=Array.from(h.d.querySelectorAll('.equipment-card')).filter(c=>c._fields.querySelector('.equipment-type').value==='CONVEYOR')[1];second.click();await settle();assert.equal(inspector.querySelector('.equipment-id').value,second.dataset.equipmentId);assert(inspector.querySelector('.format-zone-moving-gap'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI Advance: conveyor inspector opens with hidden serialization fields and can switch conveyors',async()=>{
 const h=await setup({remember:true,uiMode:'ADVANCE',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=conveyors]');const cards=Array.from(h.d.querySelectorAll('.equipment-card')).filter(c=>c._fields.querySelector('.equipment-type').value==='CONVEYOR'),inspector=h.d.getElementById('equipment-inspector');
  for(const card of cards.slice(0,2)){card.click();await settle();assert.equal(inspector.querySelector('.equipment-id').value,card.dataset.equipmentId);assert(inspector.querySelector('.format-zone-grid input'));assert.equal(inspector.querySelector('.equipment-unit').type,'hidden');assert.equal(inspector.querySelector('.equipment-material-flow').tagName,'SELECT');}assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: material toolbar icons and confirmation dialogs protect clear and delete actions',async()=>{
 const h=await setup({uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view=products]');await h.click('[aria-label="Add product"]');
  const field=h.d.querySelector('[aria-label="Product name"]');field.value='Protected';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));const selector=h.d.querySelector('[aria-label="Current product"]'),id=selector.value;
  assert.equal(h.d.getElementById('products-title'),null);for(const label of ['Clear fields','Import configuration','Export configuration']){const button=h.d.querySelector('[aria-label="'+label+'"]');assert(button.classList.contains('icon-button'));assert(button.querySelector('svg'));assert.equal(button.textContent,'');}
  await h.click('[aria-label="Clear fields"]');assert(h.d.querySelector('.message-dialog').open);await h.click('.message-dialog .ghost');assert.equal(h.d.querySelector('[aria-label="Product name"]').value,'Protected');
  await h.click('[aria-label="Clear fields"]');assert.equal(h.d.querySelector('.message-dialog .danger').textContent,'Clear fields');await h.click('.message-dialog .danger');assert.equal(h.d.querySelector('[aria-label="Product name"]').value,'');assert.equal(h.d.querySelector('[aria-label="Current product"]').value,id);
  const name=h.d.querySelector('[aria-label="Product name"]');name.value='Delete me';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('[aria-label="Delete product"]');await h.click('.message-dialog .ghost');assert.equal(h.d.querySelector('[aria-label="Current product"]').value,id);await h.click('[aria-label="Delete product"]');await h.click('.message-dialog .danger');assert.equal(h.d.querySelector('[aria-label="Product name"]'),null);await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata?.formatCatalog?.products?.length===0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: event multi-selection supports ranges, additive clicks and confirmed bulk deletion',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  h.d.getElementById('run-events-enabled').click();
  for(let i=0;i<3;i++)await h.click('#add-control-event');
  for(let i=0;i<3;i++)await h.click('#add-product-changeover');
  const rows=()=>Array.from(h.d.querySelectorAll('[data-event-selection]'));
  const select=(index,keys={})=>rows()[index].dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,...keys}));
  const selected=()=>rows().map((r,i)=>r.classList.contains('event-selected')?i:-1).filter(i=>i>=0);
  assert.equal(rows().length,6);select(0);select(2,{shiftKey:true});assert.deepEqual(selected(),[0,1,2]);
  select(4,{ctrlKey:true});assert.deepEqual(selected(),[0,1,2,4]);select(1,{metaKey:true});assert.deepEqual(selected(),[0,2,4]);
  rows()[5].querySelector('input[type=checkbox]').click();assert.deepEqual(selected(),[0,2,4,5]);
  assert(h.d.getElementById('select-all-control-events').indeterminate);
  await h.click('#delete-selected-control-events');assert(h.d.querySelector('.message-dialog').open);await h.click('.message-dialog .ghost');assert.equal(rows().length,6);
  await h.click('#delete-selected-control-events');await h.click('.message-dialog .danger');assert.equal(rows().length,2);assert.equal(h.d.querySelectorAll('#control-events [data-event-selection]').length,1);assert.equal(h.d.querySelectorAll('#planned-line-events tbody tr').length,1);
  assert(h.d.getElementById('delete-selected-control-events').disabled);
  await h.click('#select-all-control-events');assert.deepEqual(selected(),[0,1]);await h.click('#select-all-control-events');assert.deepEqual(selected(),[]);
  await h.click('#delete-all-control-events');await h.click('.message-dialog .ghost');assert.equal(rows().length,2);
  await h.click('#delete-all-control-events');await h.click('.message-dialog .danger');assert.equal(rows().length,0);assert(h.d.getElementById('delete-all-control-events').disabled);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.plannedStops?.length===0);
  const run=h.storedCases()[0].simulations[0].dynamicConfig;assert.equal(run.commands.length,0);assert.equal(run.plannedStops.length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: shift accounting is configured in Settings Simulation and persists through case save',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');const checkbox=h.d.getElementById('run-track-shifts');assert(checkbox.closest('#settings-page-simulation'));assert.equal(checkbox.closest('#run-panel'),null);
  h.w.STSettings.open();await h.click('#settings-tab-simulation');if(!checkbox.checked)checkbox.click();await h.w.STSettings.close();await h.click('#save-case');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.trackShifts===true);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: event ranges cross pages and selection resets when switching simulations',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  const record=h.storedCases()[0],sim=record.simulations[0];sim.dynamicConfig={...sim.dynamicConfig,eventsEnabled:true,commands:[],plannedStops:Array.from({length:102},(_,i)=>({category:'changeoverMinutes',startSeconds:i*60,endSeconds:(i+1)*60,restartPolicy:'RESTART'}))};
  const sibling=JSON.parse(JSON.stringify(sim));sibling.id='selection-sibling';sibling.name='Second';record.simulations.push(sibling);record.expectedRevision=record.revision;h.api.saveCase(record);
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  const rows=()=>Array.from(h.d.querySelectorAll('#planned-line-events tbody tr'));
  rows()[98].dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  Array.from(h.d.querySelectorAll('#planned-line-events button')).find(b=>b.textContent==='Next').click();
  rows()[1].dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,shiftKey:true}));assert.equal(h.d.getElementById('control-event-selection-status').textContent,'4 selected / 102 events');
  await h.click('#delete-selected-control-events');await h.click('.message-dialog .danger');assert.equal(rows().length,98);assert.equal(h.d.getElementById('control-event-selection-status').textContent,'0 selected / 98 events');
  rows()[0].click();const selector=h.d.getElementById('simulation-selector');selector.value='selection-sibling';selector.dispatchEvent(new h.w.Event('change',{bubbles:true}));await settle();assert.equal(h.d.getElementById('control-event-selection-status').textContent,'0 selected / 102 events');assert(h.d.getElementById('delete-selected-control-events').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: packing-format results retain matched reliability losses and sorted equipment states in Results and exports',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');const record=h.storedCases()[0],sim=record.simulations[0],machine=sim.equipment.find(e=>e.type!=='CONVEYOR');
  const run={durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:17,rounds:1,initialProductId:'format',productCatalog:[{id:'format',name:'Format',bottlesPerCase:12,equipment:{}}],plannedStops:[{category:'changeoverMinutes',startSeconds:10,endSeconds:20,restartPolicy:'RESTART'}]};
  sim.dynamicConfig=run;const result={durationSeconds:60,seed:17,inputSignature:h.w.SimulatorEngine.inputSignature({case:{equipment:sim.equipment,unitOfFlow:record.unitOfFlow},run}),products:{rows:[],timeline:[]},summary:{lineOeePercent:50,outputCount:1000,qualityAssumption:'NO_REJECT_MODEL_ASSUMES_100_PERCENT'},equipmentMetrics:{[machine.id]:{failureSeconds:6,blockedSeconds:12}},accumulationZoneMetrics:{},samples:[]};
  let calls=0;h.w.SimulatorEngine.simulateBatch=async input=>{calls++;assert.equal(input.run.reliabilityEnabled,false);assert.equal(input.run.initialProductId,'format');assert.equal(input.run.productCatalog[0].bottlesPerCase,12);assert.equal(input.run.plannedStops[0].endSeconds,20);assert.equal(input.run.seed,17);return {ok:true,result:{summary:{lineOeePercent:70},durationSeconds:60}};};
  h.w.STResults.render(result,record,sim);await waitFor(()=>sim.whatIf?.lossDiagnostic?.status==='COMPLETE');await settle();const target=h.d.getElementById('results-loss-breakdown'),cards=target.querySelectorAll('.result-kpi strong');assert.deepEqual(Array.from(cards,c=>c.textContent),['20%','—','30%']);
  const states=target.querySelectorAll('.observed-equipment-times tbody tr');assert.equal(states.length,2);assert.match(states[0].textContent,/Blocking20%/);assert.match(states[1].textContent,/Failure \/ repair10%/);assert.match(target.textContent,/Remaining loss includes speed/);
  const exported=h.w.STReports.lossBreakdown(result,sim);assert.equal(exported.conditionalReliabilityLoss,20);assert.equal(exported.remainingLossWithoutFailures,30);assert.equal(exported.nominalMachineSpeedGap,null);assert.equal(exported.observedEquipmentTimes.length,2);
  h.w.STResults.render(result,record,sim);await settle();assert.equal(calls,1);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: packing-format What-If retains full CAPEX controls and configuration',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode,autosaveSeconds:180});try{
  const record=h.storedCases()[0];record.simulations[0].dynamicConfig.initialFormatId='format';record.expectedRevision=record.revision;h.api.saveCase(record);
  await h.click('.open-case');await h.click('[data-basic-view=whatif]');const target=h.d.getElementById('simulation-analysis-content'),cards=target.querySelectorAll('.scenario-tier-grid > .analysis-recommendation');assert.equal(cards.length,4);assert.equal(target.querySelectorAll('.analysis-capex').length,uiMode==='BASIC'?3:4);assert.equal(target.querySelectorAll('.scenario-search').length,uiMode==='BASIC'?3:4);assert.equal(target.querySelectorAll('.scenario-create').length,uiMode==='BASIC'?3:4);assert.equal(target.querySelectorAll('.scenario-configure').length,uiMode==='BASIC'?3:4);assert.match(target.textContent,/Search retains the initial format/);target.querySelector('.scenario-configure').click();assert(h.d.querySelector('.scenario-config-dialog[open]'));assert(h.d.querySelector('.scenario-config-dialog[open] .scenario-search-depth'));await h.click('.scenario-config-dialog[open] .dialog-heading button');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: format CAPEX cards preserve saved metrics and actions even without current proposal targets',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  const sim=h.storedCases()[0].simulations[0];sim.dynamicConfig.initialFormatId='format';
  const signature=h.w.STScenarios.signature(sim);sim.whatIf={evaluations:[{cardId:JSON.stringify([sim.id,'CAPEX','HIGH']),sourceSimulationId:sim.id,sourceSignature:signature,kind:'CUSTOM',tier:'HIGH',searchScope:'HIGH',status:'NO_DEMONSTRATED_IMPROVEMENT',updatedAt:'2026-10-16T19:00:00Z',baseline:{oee:30,throughput:120},candidate:{oee:48,throughput:192},message:'Saved search result.'}]};
  const before=JSON.stringify(sim.whatIf),target=h.d.createElement('section');h.d.body.append(target);h.w.STScenarioExplorer.tools(target,sim,{candidates:[]},()=>{});
  const cards=target.querySelectorAll('.scenario-tier-grid > .analysis-recommendation');assert.equal(cards.length,4);for(const card of Array.from(cards).slice(1)){assert(card.querySelector('.scenario-configure'));assert(card.querySelector('.scenario-search'));assert(card.querySelector('.scenario-create'));}
  const high=cards[3];assert.match(high.querySelector('.scenario-basic-metrics').textContent,/48.0%/);assert.match(high.querySelector('.scenario-preview-status').textContent,/Saved search result|Previous result/);assert(high.querySelector('.scenario-create').disabled);assert.equal(JSON.stringify(sim.whatIf),before);high.querySelector('.scenario-configure').click();assert(high.querySelector('.scenario-config-dialog[open]'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: What-If evaluation preserves format snapshots and scheduled changeovers',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  const sim=h.storedCases()[0].simulations[0];sim.dynamicConfig={...sim.dynamicConfig,initialFormatId:'format',initialProductId:'format',productCatalog:[{id:'format',name:'Format',bottlesPerCase:12,equipment:{}}],plannedStops:[{category:'changeoverMinutes',startSeconds:10,endSeconds:20,restartPolicy:'RESTART',destinationFormatId:'format'}]};
  h.w.SimulatorEngine.validateSimulationInput=()=>({ok:true});let calls=0;h.w.SimulatorEngine.simulateBatch=async input=>{calls++;assert.equal(input.run.initialFormatId,'format');assert.equal(input.run.productCatalog[0].bottlesPerCase,12);assert.equal(input.run.plannedStops[0].destinationFormatId,'format');const summary={lineOeePercent:45,outputCount:1000,totalOverflowUnits:0};return {ok:true,result:{durationSeconds:input.run.durationSeconds,summary,batch:{rows:Array.from({length:input.run.rounds||1},(_,i)=>({seed:input.run.seed+i,summary})),statistics:{lineOeePercent:{mean:45},totalOverflowUnits:{mean:0}}}}};};
  const metric=await h.w.STScenarioExplorer.evaluate(sim,[],()=>false,0);assert.equal(metric.oee,45);assert.equal(calls,1);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: packing production and Plant calendar headers align with numeric values including scheduled stops',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  const target=h.d.createElement('section');h.d.body.append(target);
  h.w.STProducts.results(target,{products:{rows:[{name:'Case 12',productName:'Product',outputUnit:'CASES',outputNative:12.5,completeCases:12,partialCaseEquivalent:.5,outputBottleEquivalents:150,clearoutBottleEquivalents:0}]}});
  const table=target.querySelector('table');for(const row of table.rows)Array.from(row.cells).forEach((cell,i)=>{assert.equal(cell.classList.contains('numeric'),i>2);if(i>2)assert.equal(h.w.getComputedStyle(cell).textAlign,'right');});
  const simulation={dynamicConfig:{plantCalendar:{enabled:true,totalMinutes:60,externalMinutes:0,mode:'SCHEDULED'}}},result={durationSeconds:3600,summary:{lineOeePercent:50,qualityAssumption:'NO_REJECT_MODEL_ASSUMES_100_PERCENT'},plantCalendar:{completePeriod:true,plannedStopSeconds:60,observedStopSeconds:60,horizonSeconds:3600,restartPolicy:'RESTART'}};
  h.w.STPlantCalendar.renderResults(target,result,simulation);const calendar=target.querySelector('table');assert(calendar);for(const row of calendar.rows){assert.equal(row.cells[1].classList.contains('numeric'),true);assert.equal(h.w.getComputedStyle(row.cells[1]).textAlign,'right');}assert.match(calendar.rows[calendar.rows.length-1].textContent,/Observed planned line stops/);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: Sheet packing proposal reviews conversion, saves the initial format and preserves other simulations in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({empty:true,uiMode,autosaveSeconds:180});try{
   const runtime={};vm.createContext(runtime);for(const file of ['ApiResponse.gs','CaseService.gs','SheetImportService.gs'])vm.runInContext(read(file),runtime);
   const fixture=packingSheetFixture();const data=JSON.parse(JSON.stringify({...runtime.parseEquipmentSheet_(fixture.metadata,fixture.rows,[],'plant-sheet-v2'),source:{sheetName:'Packing',spreadsheetId:'packing-sheet',sheetId:0}}));
   if(uiMode==='BASIC')delete data.metadata.bottlesPerCase;
   h.api.previewSheetImport=()=>data;
   const getCase=h.api.getCase;let preserved;
   h.api.getCase=id=>{const record=getCase(id);preserved={...JSON.parse(JSON.stringify(record.simulations[0])),id:'preserved-run',name:'Preserved run',dynamicConfig:{durationSeconds:42},results:{summary:{outputCount:321,lineOeePercent:44},durationSeconds:42,samples:[],equipmentMetrics:[]}};record.simulations.push(preserved);return record;};
   await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view="equipment"]');await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='packing-sheet';
   h.d.getElementById('sheet-import-read').click();assert(h.d.querySelector('#sheet-import-dialog .dialog-request-progress'));await waitFor(()=>h.d.querySelector('#sheet-packing-enabled'));
   assert(h.d.getElementById('sheet-packing-enabled').checked);assert(h.d.querySelector('#sheet-packing-proposal .editor-subheading.compact-heading'));
   await h.click('#sheet-import-ack');assert(h.d.getElementById('sheet-import-apply').disabled);
   assert(!h.d.getElementById('sheet-import-readiness').hidden);assert(h.d.getElementById('sheet-import-readiness-text').closest('.dialog-actions'));
   if(uiMode==='BASIC'){
    assert.match(h.d.getElementById('sheet-import-readiness-text').textContent,/Bottles per case/);await h.click('#sheet-import-review-pending');assert.equal(h.d.activeElement.id,'sheet-packing-bottlesPerCase');
    const pack=h.d.getElementById('sheet-packing-bottlesPerCase');pack.value=12;pack.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert(!h.d.getElementById('sheet-import-ack').checked);await h.click('#sheet-import-ack');
   }
   assert.match(h.d.getElementById('sheet-import-readiness-text').textContent,/Source machine speeds/);await h.click('#sheet-import-review-pending');assert.equal(h.d.activeElement.id,'sheet-packing-sourceRateBasis');
   const basis=h.d.getElementById('sheet-packing-sourceRateBasis');assert.equal(basis.getAttribute('aria-invalid'),'true');assert(basis.validity.customError);
   basis.value='BOTTLES';basis.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert(!basis.hasAttribute('aria-invalid'));assert(!basis.validity.customError);assert.equal(h.d.querySelectorAll('#sheet-packing-review tbody tr').length,5);assert.match(h.d.getElementById('sheet-packing-review').textContent,/25/);
   assert.match(h.d.getElementById('sheet-import-readiness-text').textContent,/I reviewed/);await h.click('#sheet-import-ack');assert(!h.d.getElementById('sheet-import-apply').disabled);assert.match(h.d.getElementById('sheet-import-readiness-text').textContent,/Ready to apply/);
   const name=h.d.getElementById('sheet-packing-formatName');name.value='Reviewed Format C';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));assert(!h.d.getElementById('sheet-import-ack').checked);
   await h.click('#sheet-packing-enabled');assert(h.d.getElementById('sheet-packing-fields').disabled);assert(h.d.getElementById('sheet-packing-review').hidden);await h.click('#sheet-packing-enabled');
   await h.click('#sheet-import-ack');await h.click('#sheet-import-apply');assert(!h.d.getElementById('sheet-import-dialog').open);
   const initial=h.d.getElementById('run-initial-format');assert(initial.value);assert.equal(initial.selectedOptions[0].textContent,'Reviewed Format C');
   await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata.formatCatalog?.formats.length===1);
   const saved=h.storedCases()[0],active=saved.simulations.find(s=>s.id==='simulation-a'),format=saved.metadata.formatCatalog.formats[0];
   assert.equal(active.dynamicConfig.initialFormatId,format.id);assert.equal(active.dynamicConfig.engineId,'ST_CURRENT');assert.equal(active.equipment[2].nominalRatePerSecond,25/60);assert.equal(active.equipment[2].processData.flowUnits.output,'CASES');assert(Math.abs(active.equipment[3].processData.accumulation.conveyorSpeedMmPerSecond-data.equipment[3].processData.accumulation.conveyorSpeedMmPerSecond)<1e-10);
   assert.deepEqual(saved.simulations.find(s=>s.id==='preserved-run').equipment,preserved.equipment);assert.equal(saved.simulations.find(s=>s.id==='preserved-run').dynamicConfig.durationSeconds,42);assert.equal(saved.simulations.find(s=>s.id==='preserved-run').results.summary.outputCount,321);
   // Imported formats inherit editable machine speeds in both interfaces.
   await h.click('[data-basic-view=equipment]');
   const rateFor=id=>{const card=h.d.querySelector('.equipment-card[data-equipment-id="'+id+'"]');return card.querySelector('.equipment-rate')||card._fields.querySelector('.equipment-rate');};
   const packerId=active.equipment[2].id,rate=rateFor(packerId);assert(!rate.readOnly);assert(!rate.disabled);assert.equal(Number(rate.value),25);
   rate.value=24;rate.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#save-case');
   await waitFor(()=>h.storedCases()[0].simulations.find(s=>s.id==='simulation-a').equipment[2].nominalRatePerSecond===24/60);
   assert.equal(h.w.STProducts.currentFormat().equipment[packerId].ratePerMinute,undefined);
   await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=equipment]');assert.equal(Number(rateFor(packerId).value),24);assert(!rateFor(packerId).readOnly);
   await h.click('#open-sheet-import');await h.click('#sheet-import-read');assert(!h.d.getElementById('sheet-packing-enabled').checked);await h.click('#sheet-import-cancel');assert.equal(h.storedCases()[0].metadata.formatCatalog.formats.length,1);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: reported US-LAB values remain complete and show only information in the actual preview',async()=>{
 const h=await setup({empty:true,autosaveSeconds:180});try{
  const runtime={};vm.createContext(runtime);for(const file of ['ApiResponse.gs','CaseService.gs','SheetImportService.gs'])vm.runInContext(read(file),runtime);
  const machine=(type,name,speed)=>[type,name,'N',30,1,speed,...Array(19).fill('N/A')];
  const rows=[machine('CUSTOM','Unscrambler',320),['Conveyor','Conveyor US-LAB','N','N/A','N/A','N/A',29.93,28,15730,2540,0,0,60,80,2,3,80,2,0,0,1,.5,.5,1,5],machine('FILLER','Labeler',300)];
  h.api.previewSheetImport=()=>JSON.parse(JSON.stringify({...runtime.parseEquipmentSheet_(['','G','','700 ml',12,'',''],rows,[],'plant-sheet-v2'),source:{spreadsheetId:'case-c-book',sheetName:'Case C',schemaVersion:'plant-sheet-v2'}}));
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('[data-basic-view="equipment"]');await h.click('#open-sheet-import');h.d.getElementById('sheet-import-url').value='case-c-book';await h.click('#sheet-import-read');
  const card=h.d.querySelector('[data-source-index="1"]');assert.equal(card.dataset.importStatus,'info');assert.match(card.querySelector('.sheet-equipment-issues').textContent,/Info · D11:E11/);assert(!card.querySelector('.sheet-equipment-issues').textContent.includes('Model review'));
  assert.equal(card.querySelector('[data-field="speedFactor"]').closest('tr').children[3].textContent,'0');assert.equal(card.querySelector('[data-field="package"]').closest('tr').children[3].textContent,'60');assert(h.d.getElementById('sheet-import-model-review').classList.contains('hidden'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: card speed edits persist active product and format overrides without replacing installed defaults',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode,autosaveSeconds:180});try{
   const getCase=h.api.getCase;let ids,defaults;
   h.api.getCase=id=>{const record=getCase(id),sim=record.simulations[0];ids=sim.equipment.filter(e=>e.type!=='CONVEYOR').slice(0,2).map(e=>e.id);defaults=sim.equipment.filter(e=>ids.includes(e.id)).map(e=>e.nominalRatePerSecond);
    if(!record.metadata.formatCatalog){record.metadata.formatCatalog={version:3,products:[{id:'p',name:'Product',bottle:{lengthMm:60},equipment:{[ids[0]]:{enabled:true,ratePerMinute:120}}}],formats:[{id:'f',name:'Format',productId:'p',bottlesPerCase:12,case:{lengthMm:300},equipment:{[ids[1]]:{enabled:true,inputUnit:'BOTTLES',outputUnit:'CASES',ratePerMinute:20}}}]};sim.dynamicConfig.initialFormatId='f';}return record;};
   await h.click('.open-case');await h.click('[data-basic-view=equipment]');
   const rates=ids.map(id=>{const card=h.d.querySelector('.equipment-card[data-equipment-id="'+id+'"]');return card.querySelector('.equipment-rate')||card._fields.querySelector('.equipment-rate');});
   assert.deepEqual(rates.map(r=>Number(r.value)),[120,20]);rates.forEach((r,i)=>{assert(!r.readOnly);assert(!r.disabled);r.value=i?18:110;r.dispatchEvent(new h.w.Event('input',{bubbles:true}));});
   await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata.formatCatalog?.products[0].equipment[ids[0]].ratePerMinute===110);
   const saved=h.storedCases()[0];assert.equal(saved.metadata.formatCatalog.formats[0].equipment[ids[1]].ratePerMinute,18);assert.deepEqual(saved.simulations[0].equipment.filter(e=>ids.includes(e.id)).map(e=>e.nominalRatePerSecond),defaults);
   assert.equal(h.w.STProducts.runFields().productCatalog[0].equipment[ids[0]].ratePerMinute,110);assert.equal(h.w.STProducts.runFields().productCatalog[0].equipment[ids[1]].ratePerMinute,18);
   await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=equipment]');
   ids.forEach((id,i)=>{const card=h.d.querySelector('.equipment-card[data-equipment-id="'+id+'"]'),r=card.querySelector('.equipment-rate')||card._fields.querySelector('.equipment-rate');assert.equal(Number(r.value),i?18:110);});assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: Results switches all production tables between means and actual rounds in both modes',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode,autosaveSeconds:180});try{
  await h.click('.open-case');const record=h.storedCases()[0],model=record.equipment[0];
  const rows=[100,200,600].map((n,i)=>({round:i+1,seed:10+i,summary:{lineOeePercent:n/10,outputCount:n,totalStarvedSeconds:0,totalBlockedSeconds:0,totalFailureSeconds:i*10},equipmentMetrics:{[model.id]:{outputCount:n,oeePercent:n/10,failureSeconds:i*10,starvedSeconds:0,blockedSeconds:0}},products:{rows:[{formatId:'f',name:'Case 12',productName:'Product',outputUnit:'CASES',outputNative:n/12,completeCases:Math.floor(n/12),partialCaseEquivalent:n/12%1,outputBottleEquivalents:n,clearoutBottleEquivalents:0}]}}));
  const stats=h.w.JSON.parse(JSON.stringify({outputCount:{mean:300,min:100,max:600},lineOeePercent:{mean:30,min:10,max:60},throughputPerMinute:{mean:300,min:100,max:600}}));
  const result={...rows[0],durationSeconds:60,unitOfFlow:'BOTTLES',samples:[],batch:{rounds:3,rows,baseSeed:10,representativeRound:2,statistics:stats,equipmentStatistics:{[model.id]:{failureSeconds:{mean:10}}}}};
  h.w.STResults.render(result,record,record.simulations[0]);assert.match(h.d.getElementById('results-kpis').textContent,/300 bottles/i);assert.match(h.d.getElementById('results-products').textContent,/Mean of 3 rounds/);assert.match(h.d.getElementById('results-products').textContent,/300/);assert.match(h.d.getElementById('results-kpis').textContent,/Min 100 · Max 600/);
  const select=h.d.getElementById('results-round-select');select.value='representative';select.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.match(h.d.getElementById('results-kpis').textContent,/200 bottles/i);assert(!h.d.getElementById('results-kpis').textContent.includes('mean of'));assert.match(h.d.getElementById('results-products').textContent,/200/);assert.match(h.d.getElementById('results-meta').textContent,/Round 2/);
  h.d.getElementById('results-round-select').value='average';h.d.getElementById('results-round-select').dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.match(h.d.getElementById('results-kpis').textContent,/300 bottles/i);assert.equal(result.summary.outputCount,100);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: event units, date origin and generated groups survive saving and can be deleted together',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){const h=await setup({remember:true,uiMode,autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  const change=(id,value)=>{const input=h.d.getElementById(id);input.value=value;input.dispatchEvent(new h.w.Event('change',{bubbles:true}));};
  change('duration-mode','FIXED');change('run-duration',3600);
  if(!h.d.getElementById('run-events-enabled').checked)await h.click('#run-events-enabled');await h.click('#add-control-event');
  const unit=(index,value)=>{const input=h.d.querySelectorAll('.command-time-unit')[index];input.value=value;input.dispatchEvent(new h.w.Event('change',{bubbles:true}));};
  assert(!Array.from(h.d.querySelector('.command-time-unit').options).some(o=>o.value==='DATE'));assert.equal(h.d.getElementById('event-time-unit'),null);
  unit(0,'MINUTES');let time=h.d.querySelector('.command-time');time.value=15;time.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.click('#add-control-event');unit(1,'HOURS');let second=h.d.querySelectorAll('.command-time')[1];second.value=.5;second.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(h.d.querySelectorAll('.command-time-unit')[0].value,'MINUTES');assert.equal(Number(h.d.querySelector('.command-time').value),15);
  const remove=h.d.querySelectorAll('.remove-command')[1];assert(remove.classList.contains('icon-button'));assert(remove.querySelector('svg'));assert.equal(remove.getAttribute('aria-label'),'Remove event');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.commands?.length===2);assert.equal(h.storedCases()[0].simulations[0].dynamicConfig.commands[1].timeUnit,'HOURS');remove.click();await settle();
  change('duration-mode','DATES');change('run-start-at','2026-10-20T08:00');change('run-end-at','2026-10-20T09:00');change('run-time-zone','America/Mexico_City');unit(0,'DATE');assert.match(h.d.querySelector('.command-time').value,/2026-10-20T08:15/);
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.commands?.[0]?.timeUnit==='DATE');assert.equal(h.storedCases()[0].simulations[0].dynamicConfig.commands[0].atVirtualSecond,900);
  await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=simulation]');assert.equal(h.d.querySelector('.command-time-unit').value,'DATE');assert.match(h.d.querySelector('.command-time').value,/2026-10-20T08:15/);
  change('duration-mode','FIXED');assert(!Array.from(h.d.querySelector('.command-time-unit').options).some(o=>o.value==='DATE'));assert.equal(h.d.querySelector('.command-time-unit').value,'SECONDS');assert.equal(Number(h.d.querySelector('.command-time').value),900);
  await h.click('#delete-all-control-events');await h.click('.message-dialog .danger');
  change('duration-mode','FIXED');change('run-duration-unit','HOURS');change('run-duration',1);await h.click('#open-event-generator');assert(h.d.querySelector('.event-generator-dialog[open]'));assert(h.d.querySelector('.event-generator-dialog .dialog-heading'));assert(h.d.querySelector('.event-generator-dialog .editor-subheading'));
  const set=(name,value)=>{const input=h.d.getElementById('event-generator-'+name);input.value=value;input.dispatchEvent(new h.w.Event('input',{bubbles:true}));};
  set('name','Transport');set('total',10);const totalUnit=h.d.getElementById('event-generator-total-unit');assert(!Array.from(totalUnit.options).some(o=>o.value==='DATE'));change('event-generator-total-unit','HOURS');assert.equal(Number(h.d.getElementById('event-generator-total').value),1/6);change('event-generator-total-unit','SECONDS');assert.equal(Number(h.d.getElementById('event-generator-total').value),600);change('event-generator-total-unit','HOURS');set('count',4);set('start',0);set('end',60);const endUnit=h.d.getElementById('event-generator-end-unit');endUnit.value='HOURS';endUnit.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(Number(h.d.getElementById('event-generator-end').value),1);set('seed',42);const choices=h.d.querySelectorAll('.event-generator-equipment-choice');choices[0].checked=true;choices[2].checked=true;choices[0].dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.click('.event-generator-preview-button');assert(!h.d.querySelector('.event-generator-apply').disabled,JSON.stringify({mode:uiMode,status:h.d.querySelector('.event-generator-status').textContent,errors:h.errors,duration:h.d.getElementById('run-duration').value,invalid:Array.from(h.d.querySelectorAll('.event-generator-dialog input')).filter(i=>!i.validity.valid).map(i=>[i.id,i.value,i.validationMessage])}));await waitFor(()=>!h.d.querySelector('.event-generator-apply').disabled);assert.equal(h.d.querySelectorAll('.event-generator-preview tbody tr').length,4);assert.match(h.d.querySelector('.event-generator-preview thead').textContent,/Duration \(h\)/);assert.match(h.d.querySelector('.event-generator-status').textContent,/hours scheduled/);change('event-generator-total-unit','SECONDS');assert(h.d.querySelector('.event-generator-apply').disabled);set('seed',43);assert(h.d.querySelector('.event-generator-apply').disabled);await h.click('.event-generator-preview-button');assert(!h.d.querySelector('.event-generator-apply').disabled,JSON.stringify({mode:uiMode,status:h.d.querySelector('.event-generator-status').textContent,errors:h.errors,duration:h.d.getElementById('run-duration').value,invalid:Array.from(h.d.querySelectorAll('.event-generator-dialog input')).filter(i=>!i.validity.valid).map(i=>[i.id,i.value,i.validationMessage])}));await waitFor(()=>!h.d.querySelector('.event-generator-apply').disabled);await h.click('.event-generator-apply');
  assert.equal(h.d.querySelectorAll('#control-events .control-event').length,8);assert(h.d.getElementById('run-events-enabled').checked);await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.commands.length===8);
  const commands=h.storedCases()[0].simulations[0].dynamicConfig.commands,group=commands[0].groupId;assert(group);assert(commands.every(c=>c.groupId===group&&c.groupLabel==='Transport'&&c.generatorSeed===43));let total=0;const starts=new Map();commands.forEach(c=>{if(c.action==='PAUSE')starts.set(c.equipmentId,c.atVirtualSecond);else total+=c.atVirtualSecond-starts.get(c.equipmentId);});assert.equal(total,600);
  await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=simulation]');assert.equal(h.d.getElementById('event-group-select').value,group);await h.click('#delete-event-group');await h.click('.message-dialog .dialog-actions .ghost');assert.equal(h.d.querySelectorAll('#control-events .control-event').length,8);await h.click('#delete-event-group');await h.click('.message-dialog .danger');assert.equal(h.d.querySelectorAll('#control-events .control-event').length,0);assert.equal(h.d.getElementById('event-group-select'),null);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}}
});

test('UI: completed batches default playback to the chosen representative and retain its replay after reopening',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=30;h.d.getElementById('run-rounds').value=3;h.d.getElementById('run-sample-interval').value=1;
  const run=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async(...args)=>{const response=await run(...args);if(response.ok){response.result.batch.representativeRound=2;if(!response.result.batch.replays?.[0]){const replay=await h.w.SimulatorEngine.simulateLineAsync({case:args[0].case,run:{...args[0].run,seed:response.result.batch.rows[1].seed}},{detail:true});response.result.batch.representativeReplay={...replay.result,round:2};}}return response;};
  await h.click('#run-simulation');await waitFor(()=>h.d.getElementById('simulation-json-preview').value.includes('st-replications'));await h.click('#pause-simulation');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===3);assert.equal(h.d.getElementById('playback-round').value,'1');assert.match(h.d.getElementById('playback-round').selectedOptions[0].textContent,/Representative/);
  await h.click('[data-basic-view=results]');assert.equal(h.d.getElementById('results-round-select').value,'average');assert.match(h.d.getElementById('results-meta').textContent,/Mean of 3 rounds/);
  await h.click('#save-case');await h.click('#home-cases');await h.click('.open-case');await h.click('[data-basic-view=simulation]');assert.equal(h.d.getElementById('playback-round').value,'1');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: pause preview resolves shift and date horizons, window dates and visible validation errors',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');
  const change=(id,value)=>{const input=h.d.getElementById(id);input.value=value;input.dispatchEvent(new h.w.Event('change',{bubbles:true}));};
  change('duration-mode','SHIFTS');change('run-shift-hours',8);change('run-shift-count',3);await h.click('#open-event-generator');assert.equal(Number(h.d.getElementById('event-generator-end').value),1440);assert.match(h.d.querySelector('.event-generator-duration').textContent,/3 shift\(s\) × 8 h = 24 h \(1,440 min\)/);assert(!Array.from(h.d.getElementById('event-generator-end-unit').options).some(o=>o.value==='DATE'));
  await h.click('.event-generator-preview-button');assert.match(h.d.querySelector('.event-generator-status').textContent,/Choose equipment/);assert(h.d.querySelector('.event-generator-apply').disabled);
  h.d.querySelector('.event-generator-equipment-choice').checked=true;change('event-generator-count',201);await h.click('.event-generator-preview-button');assert.match(h.d.querySelector('.event-generator-status').textContent,/Number of pauses/);change('event-generator-count',12);await h.click('.event-generator-preview-button');await waitFor(()=>!h.d.querySelector('.event-generator-apply').disabled);assert.equal(h.d.querySelectorAll('.event-generator-preview tbody tr').length,12);
  const dialog=h.d.querySelector('.event-generator-dialog');await h.click('.event-generator-cancel');dialog.remove();
  change('duration-mode','DATES');change('run-start-at','2026-10-20T08:00');change('run-end-at','2026-10-21T08:00');change('run-time-zone','America/Mexico_City');await h.click('#open-event-generator');
  change('event-generator-start-unit','DATE');change('event-generator-end-unit','DATE');assert.match(h.d.getElementById('event-generator-start').value,/2026-10-20T08:00/);assert.match(h.d.getElementById('event-generator-end').value,/2026-10-21T08:00/);h.d.querySelector('.event-generator-equipment-choice').checked=true;
  change('event-generator-total',438);change('event-generator-count',6);await h.click('.event-generator-preview-button');await waitFor(()=>!h.d.querySelector('.event-generator-apply').disabled);assert.equal(h.d.querySelectorAll('.event-generator-preview tbody tr').length,6);
  change('event-generator-end','2026-10-22T08:00');assert(h.d.querySelector('.event-generator-apply').disabled);assert(!h.d.querySelector('.event-generator-window-warning').hidden);assert.match(h.d.querySelector('.event-generator-window-warning').textContent,/adjust Duration method or shift count/);await h.click('.event-generator-preview-button');assert.match(h.d.querySelector('.event-generator-status').textContent,/1,440/);assert(h.d.querySelector('.event-generator-apply').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: pause preview works without animation frames and shows validation beside its buttons',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');await h.click('#open-event-generator');
  const dialog=h.d.querySelector('.event-generator-dialog'),status=dialog.querySelector('.event-generator-status'),preview=dialog.querySelector('.event-generator-preview-button'),apply=dialog.querySelector('.event-generator-apply');assert(status.closest('.dialog-actions'));assert(status.textContent);await preview.onclick();assert.match(status.textContent,/Choose equipment/);assert(apply.disabled);
  dialog.querySelector('.event-generator-equipment-choice').checked=true;const original=h.w.requestAnimationFrame;h.w.requestAnimationFrame=()=>{throw Error('Animation frame unavailable');};try{await preview.onclick();}finally{h.w.requestAnimationFrame=original;}
  assert.equal(dialog.querySelectorAll('.event-generator-preview tbody tr').length,12,status.textContent);assert(!apply.disabled,status.textContent);assert(!dialog.hasAttribute('aria-busy'));
  const seed=h.d.getElementById('event-generator-seed');seed.value='';seed.dispatchEvent(new h.w.Event('input',{bubbles:true}));await preview.onclick();assert.match(status.textContent,/Random seed/);assert(apply.disabled);assert.equal(dialog.querySelectorAll('.event-generator-preview tbody tr').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: All generated groups delete together after confirmation while manual commands and line stops remain',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',autosaveSeconds:180});try{
  const original=h.api.getCase;h.api.getCase=id=>{const c=original(id),e=c.simulations[0].equipment[0].id;c.simulations[0].dynamicConfig.commands=[{atVirtualSecond:0,equipmentId:e,action:'PAUSE',groupId:'a',groupLabel:'A'},{atVirtualSecond:10,equipmentId:e,action:'RUN',groupId:'a',groupLabel:'A'},{atVirtualSecond:20,equipmentId:e,action:'PAUSE',groupId:'b',groupLabel:'B'},{atVirtualSecond:30,equipmentId:e,action:'RUN',groupId:'b',groupLabel:'B'},{atVirtualSecond:40,equipmentId:e,action:'RUN'}];c.simulations[0].dynamicConfig.plannedStops=[{category:'changeoverMinutes',startSeconds:60,endSeconds:120,restartPolicy:'RESTART'}];return c;};
  await h.click('.open-case');await h.click('[data-basic-view=simulation]');const select=h.d.getElementById('event-group-select');assert.equal(select.options[0].textContent,'All');select.value='';await h.click('#delete-event-group');assert.match(h.d.querySelector('.message-dialog').textContent,/4 commands in all generated groups/);await h.click('.message-dialog .dialog-actions .ghost');assert.equal(h.d.querySelectorAll('.control-event').length,5);await h.click('#delete-event-group');await h.click('.message-dialog .danger');assert.equal(h.d.querySelectorAll('.control-event').length,1);assert.equal(h.d.querySelectorAll('#planned-line-events tbody tr').length,1);assert.equal(h.d.getElementById('event-group-select'),null);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: real data follows Results, persists observations and compares the active saved batch',async()=>{
 for(const uiMode of ['BASIC','ADVANCE']){
  const h=await setup({remember:true,uiMode,autosaveSeconds:180});try{
   await h.click('.open-case');await h.click('[data-basic-view=realdata]');assert(h.visible('realdata-panel'));
   const nav=Array.from(h.d.querySelectorAll('#basic-navigation [data-basic-view]')).map(e=>e.dataset.basicView);assert.equal(nav.indexOf('realdata'),nav.indexOf('results')+1);
   assert.equal(h.d.documentElement.dataset.headerView,'realdata');await h.click('#real-data-new');
   const set=(id,value)=>{const e=h.d.getElementById(id);e.value=value;e.dispatchEvent(new h.w.Event('input',{bubbles:true}));};
   set('real-data-name','Observed day');set('real-data-production',10);set('real-data-source','Production log');set('real-data-durationSeconds',10/60);set('real-data-referenceSpeedBpm',60);
   const unit=h.d.getElementById('real-data-time-unit');unit.value='SECONDS';unit.dispatchEvent(new h.w.Event('change',{bubbles:true}));assert.equal(Number(h.d.getElementById('real-data-durationSeconds').value),10);
   await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata.realData?.records?.[0]?.production===10);
   await h.click('[data-basic-view=simulation]');const change=(id,value)=>{const e=h.d.getElementById(id);e.value=value;e.dispatchEvent(new h.w.Event('change',{bubbles:true}));};
   change('duration-mode','FIXED');change('run-duration-unit','SECONDS');set('run-duration',10);set('run-rounds',2);set('run-sample-interval',1);
   await h.click('#run-simulation');await waitFor(()=>h.d.getElementById('simulation-json-preview').value.includes('st-replications'));await h.click('#pause-simulation');await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);await h.click('[data-basic-view=realdata]');
   assert.match(h.d.getElementById('real-data-evidence').textContent,/Average of 2 rounds/);assert.equal(h.d.getElementById('real-data-view').value,'average');
   assert(h.d.querySelectorAll('#real-data-comparison tbody tr').length>5);const inputsBeforeObservationImport=JSON.stringify(h.storedCases()[0].simulations[0].equipment);
   const file=h.d.getElementById('real-data-file');Object.defineProperty(file,'files',{configurable:true,value:[{size:200,text:async()=>JSON.stringify({schema:'st-real-data-v1',records:[{name:'Second day',durationSeconds:86400,production:100,productionUnit:'BOTTLES'}]})}]});await file.onchange();assert.match(h.d.getElementById('real-data-status').textContent,/Imported 1/);
   await h.click('#save-case');await waitFor(()=>h.storedCases()[0].metadata.realData.records.length===2);assert.equal(JSON.stringify(h.storedCases()[0].simulations[0].equipment),inputsBeforeObservationImport);assert.equal(h.storedCases()[0].simulations[0].results.batch.rounds,2);await h.click('#home-cases');await h.click('.open-case');assert(h.visible('realdata-panel'));assert.equal(h.d.getElementById('real-data-record').options.length,2);
   let blob,name;h.w.URL.createObjectURL=value=>{blob=value;return 'blob:real-comparison';};h.w.URL.revokeObjectURL=()=>{};h.w.HTMLAnchorElement.prototype.click=function(){name=this.download;};await h.click('#real-data-export-json');assert.equal(name,'real-vs-simulated.json');const raw=await new Promise(resolve=>{const reader=new h.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const report=JSON.parse(raw);assert.equal(report.schema,'st-real-comparison-v1');assert.equal(report.observation.name,'Second day');assert.equal(report.run.statistics.n,2);assert(!raw.includes('apiKey'));
   assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});
