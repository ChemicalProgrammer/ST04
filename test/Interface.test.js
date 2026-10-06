import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import postcss from 'postcss';
import { renderAppsScript } from '../scripts/render-apps-script.mjs';
import selectorParser from 'postcss-selector-parser';
const read = file => fs.readFileSync(new URL('../apps-script/'+file,import.meta.url),'utf8');
const settle = () => new Promise(resolve=>setTimeout(resolve,35));
async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate())return;await settle();}assert(predicate(),'Asynchronous UI did not settle');}
function stubScenarioGain(h){
 let calls=0;
 h.w.SimulatorEngine.simulateBatch=async()=>{
  const gain=calls++%2;
  return {ok:true,result:{summary:{lineOeePercent:50+gain,outputCount:100+gain},durationSeconds:60}};
 };
}

async function setup({remember=false,fail=false,many=false,invalidSheet=false,empty=false,realScenarioServer=false,fingerprintMismatch=false,autosaveSeconds=1,uiMode='ADVANCE',flowUnit,savedAccent,savedUiMode}={}) {
 const context={}; vm.createContext(context);vm.runInContext(read('PublicDemoCaseFactory.gs'),context);
 const initial=JSON.parse(JSON.stringify(context.createPublicDemoCaseRequest_()));
 if(flowUnit)initial.unitOfFlow=flowUnit;
 Object.assign(initial,{id:'demo',revision:1,updatedAt:'2026-09-15T10:00:00Z'});
 const sourceEquipment=JSON.parse(JSON.stringify(initial.equipment));
 if(empty)initial.equipment=[];
 initial.simulations=[{id:'simulation-a',name:'Simulation A',equipment:JSON.parse(JSON.stringify(initial.equipment)),dynamicConfig:{},results:null,playbackRate:1}];
 let cases=[initial], stored={workspaceRootFolderId:'preview',preferredPlaybackRate:10}, calls=[], geminiConfigured=true;
 if(many) cases=Array.from({length:60},(_,i)=>({...initial,id:'case-'+i,name:'Line '+String(i).padStart(2,'0')}));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const api={
  getBootstrap:()=>({uiMode,user:{email:'preview@example.test'},settings:stored,gemini:{configured:geminiConfigured,model:'gemini-2.5-flash'},cases:cases.map(c=>({id:c.id,name:c.name,equipmentCount:c.equipment.length,isSimulationReady:c.equipment.length>1,updatedAt:c.updatedAt}))}),
  askGemini:()=>({text:'Analysis of the saved case.'}),
  previewSheetImport:()=>({canImport:!invalidSheet,source:{schemaVersion:'plant-sheet-v1',sheetName:'Synthetic sheet',readAt:'2026-09-16',spreadsheetId:'synthetic-id'},metadata:{site:'Synthetic site',formatName:'Imported format'},equipment:copy(sourceEquipment.slice(0,3)).map((e,i)=>({...e,noiseProfile:{...e.noiseProfile,reliability:{...e.noiseProfile.reliability,mtbfMinutes:e.noiseProfile.reliability.mtbfMinutes+60}},processData:{...e.processData,equipment:{...e.processData.equipment,mtbfMinutes:e.processData.equipment.mtbfMinutes+60}},characteristics:{...e.characteristics,sourceSheetRow:i+10}})),sourceRows:[],errors:invalidSheet?[{cell:'D10:E10',message:'Supply both MTBF and MTTR.'}]:[],warnings:[],notes:['Review model assumptions.']}),
  getCase:id=>copy(cases.find(c=>c.id===id)),
  saveCase:c=>{c=copy(c);c.revision=c.expectedRevision+1;cases=cases.map(x=>x.id===c.id?c:x);return c;},
  getScenarioSourceSignature:request=>{const record=cases.find(c=>c.id===request.caseId),simulation=record?.simulations.find(s=>s.id===request.simulationId);if(!simulation||record.revision!==request.expectedRevision)throw Error('Stale scenario source');return {revision:record.revision,simulationId:simulation.id,signature:dom.window.STScenarios.signature(simulation)};},
  saveUserSettings:s=>{if(s.gemini?.apiKey)geminiConfigured=true;return stored=s;},
  deleteGeminiApiKey:()=>{geminiConfigured=false;return {configured:false,model:'gemini-2.5-flash'};},
  cloneCase:id=>{const source=cases.find(c=>c.id===id),record=copy(source);record.id='copy-'+id;record.name='Copy of '+source.name;record.revision=1;record.updatedAt=new Date().toISOString();cases.push(record);return {id:record.id,name:record.name,equipmentCount:record.equipment.length,isSimulationReady:record.equipment.length>1,updatedAt:record.updatedAt};},
  deleteCase:id=>{cases=cases.filter(c=>c.id!==id);return {id};},
  createCase:c=>{c={...c,id:'new',equipment:[],revision:1,updatedAt:new Date().toISOString()};cases.push(c);return c;}
 };
 if(realScenarioServer){
  // Execute the real RPC, persistence normalization, planner and clone service.
  // Only Google storage, identity and the transport are replaced by fixtures.
  for(const file of ['ApiResponse.gs','CaseService.gs','ScenarioEngine.gs','ScenarioService.gs','Main.gs'])vm.runInContext(read(file),context);
  context.requireCurrentUser_=()=>({email:'preview@example.test'});
  context.Utilities={getUuid:()=> 'scenario-uuid'};
  context.LockService={getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
  context.getOwnedCaseFile_=(id,user)=>{assert.equal(user.email,'preview@example.test');const record=cases.find(c=>c.id===id);assert(record);return {caseData:copy(record),file:{setContent:value=>{cases=cases.map(c=>c.id===id?JSON.parse(value):c);}}};};
  for(const name of ['getCase','saveCase','getScenarioSourceSignature','createScenario'])api[name]=(...args)=>{
   args=copy(args);if(name==='createScenario'&&fingerprintMismatch)args[0].sourceSignature='different-client-fingerprint';
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
  function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,key)=>o[key]||((...args)=>{calls.push(key);w.setTimeout(()=>{try{if(fail)throw Error('offline');if(!api[key])throw Error('Unmocked '+key);success({ok:true,data:api[key](...args)});}catch(e){failure(e);}},0);})});}
  w.google={script:{run:runner()}};
 }});
 await new Promise(r=>dom.window.addEventListener('load',r));await settle();
 const w=dom.window,d=w.document;
 return {w,d,dom,errors,calls,media,storedCases:()=>copy(cases),api,click:async selector=>{if(selector.startsWith('.message-dialog'))await waitFor(()=>d.querySelector(selector));d.querySelector(selector).click();await settle();},visible:id=>!d.getElementById(id).classList.contains('hidden')};
}
test('UI: cases-only entry, accessible navigation, theme settings and remembered access',async()=>{
 const h=await setup();try{
  assert.equal(h.d.documentElement.dataset.theme,'light');assert(h.visible('auth-panel'));assert(!h.visible('application'));
  h.d.getElementById('remember-session').checked=true;await h.click('#sign-in-button');
  assert(h.visible('cases-panel'));assert(!h.visible('case-sidebar'));assert.equal(h.d.querySelectorAll('[data-theme-picker]').length,1);assert(!h.d.querySelector('#auth-panel select'));for(const id of ['run-panel','editor-panel','results-panel','whatif-panel'])assert(!h.visible(id));
  assert.equal(h.d.querySelectorAll('.case-row').length,1);assert.equal(h.w.localStorage.getItem('st.ui.v1.remember'),'yes');
  await h.click('#cases-settings');assert(h.d.getElementById('settings-dialog').open);
  const theme=h.d.getElementById('settings-theme');theme.value='dark';theme.dispatchEvent(new h.w.Event('change'));assert.equal(h.d.documentElement.dataset.theme,'dark');
  theme.value='auto';theme.dispatchEvent(new h.w.Event('change'));h.media.matches=true;h.media.listener();assert.equal(h.d.documentElement.dataset.theme,'dark');
  h.media.matches=false;h.media.listener();assert.equal(h.d.documentElement.dataset.theme,'light');
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
  await h.click('.message-dialog .ghost');assert(!button.disabled);assert(!h.calls.includes('deleteGeminiApiKey'));
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
  assert.match(h.d.getElementById('results-reference').textContent,/equipment-minutes/);assert(!h.d.getElementById('export-results').disabled);
  await h.click('.sidebar [data-view="editor"]');await h.click('#clone-case');await settle();
  await h.click('.sidebar [data-view="whatif"]');assert(h.visible('whatif-panel'));assert(!h.visible('comparison-panel'));await h.click('.workspace-tab-comparison');assert(h.visible('comparison-panel'));assert(!h.visible('whatif-panel'));assert(h.d.querySelector('#case-comparison-content .comparison-context'));
  await h.click('.sidebar [data-view="simulation"]');await h.click('#run-simulation');await settle();await h.click('#pause-simulation');
  await h.click('.workspace-tab-comparison');assert(h.d.querySelector('#case-comparison-content table'));assert.match(h.d.getElementById('case-comparison-content').textContent,/Absolute Δ/);
  await h.click('.sidebar [data-view="simulation"]');h.d.getElementById('run-duration').value='90';h.d.getElementById('run-duration').dispatchEvent(new h.w.Event('input',{bubbles:true}));assert(!h.visible('simulation-results'),'changing run inputs hides stale results immediately');
  await h.click('#open-settings');await h.click('#delete-case');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog .danger');await waitFor(()=>h.d.querySelectorAll('.case-row').length===0);assert(h.visible('cases-panel'));
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
  await h.click('#rename-simulation');const dialog=h.d.querySelector('.message-dialog');assert(dialog.open);const input=dialog.querySelector('input');input.value='Proposed B';await h.click('.message-dialog button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations[1].name==='Proposed B');
  await h.click('#delete-simulation');await h.click('.message-dialog button:first-child');assert.equal(h.storedCases()[0].simulations.length,2);
  await h.click('#delete-simulation');await h.click('.message-dialog .danger');await waitFor(()=>h.storedCases()[0].simulations.length===1);
  await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.querySelector('.equipment-name').value,'Automatically saved equipment');
  assert.deepEqual(Array.from(h.d.querySelector('#run-playback-rate').options).map(o=>o.value),['1','5','10','50','100']);assert.deepEqual(h.errors,[]);
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
  assert.equal(h.d.querySelectorAll('.scenario-grid>article').length,h.w.STWhatIf.visibleProjects(h.w.STScenarios.plan(h.storedCases()[0].simulations[0])).length);assert(!h.d.querySelector('.scenario-grid').textContent.includes('Not enough evidence'));assert.match(h.d.querySelector('.scenario-grid').textContent,/Static inputs only/);
  await h.click('.scenario-grid .scenario-evaluate');await waitFor(()=>!h.d.querySelector('.scenario-grid .scenario-create').disabled);await h.click('.scenario-grid .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  assert(!h.storedCases()[0].simulations[0].results);assert.equal(h.storedCases()[0].simulations[1].results,null);
  h.api.askGemini=request=>{
    const source=h.storedCases()[0].simulations.find(s=>s.id===request.simulationId),proposal=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);
    assert(proposal);return {text:'Review these input changes.',proposals:[{...proposal,title:'Chat proposal'}]};
  };
  await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Suggest an improvement';await h.click('#send-gemini');await waitFor(()=>!!h.d.querySelector('#gemini-messages .analysis-recommendation button'));
  await h.click('#gemini-messages .scenario-evaluate');await waitFor(()=>!h.d.querySelector('#gemini-messages .scenario-create').disabled);await h.click('#gemini-messages .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===3);
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
  await waitFor(()=>!!h.d.querySelector('#gemini-messages .analysis-recommendation button'));
  await h.click('#gemini-messages .scenario-evaluate');await waitFor(()=>!h.d.querySelector('#gemini-messages .scenario-create').disabled);await h.click('#gemini-messages .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog button:last-child');
  await waitFor(()=>h.d.getElementById('status').textContent.includes('changed'));assert.equal(h.storedCases()[0].simulations.length,1);assert(!h.calls.includes('createScenario'));
  assert(h.calls.includes('getScenarioSourceSignature'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI + Apps Script: a local proposal with a different fingerprint is regenerated from saved inputs',async()=>{
 const h=await setup({realScenarioServer:true,fingerprintMismatch:true});try{
  stubScenarioGain(h);
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  await h.click('.scenario-grid .scenario-evaluate');await waitFor(()=>!h.d.querySelector('.scenario-grid .scenario-create').disabled);await h.click('.scenario-grid .scenario-create');await waitFor(()=>h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog button:last-child');
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
test('styles have valid selectors and all custom properties are defined',()=>{
 const html=renderAppsScript().html,parsed=new JSDOM(html),css=Array.from(parsed.window.document.querySelectorAll('style')).map(el=>el.textContent).join('\n');parsed.window.close();const ast=postcss.parse(css),defined=new Set(),used=new Set();
 ast.walkRules(rule=>{selectorParser().astSync(rule.selector);assert.doesNotMatch(rule.selector,/:\s+(?:hover|not|active|disabled)/);});
 ast.walkDecls(decl=>{if(decl.prop.startsWith('--'))defined.add(decl.prop);for(const m of decl.value.matchAll(/var\((--[\w-]+)/g))used.add(m[1]);});
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
 await h.click('#sign-in-button');await h.click('.open-case');assert(h.visible('case-sidebar'));
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
 async function waitFor(predicate){for(let i=0;i<30;i++){if(predicate())return;await settle();}assert(predicate(),'Asynchronous UI did not settle');}
 await h.click('#sign-in-button');await h.click('.open-case');h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value='30';await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');await h.click('#clone-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');
 let before=h.storedCases()[0];assert.equal(before.simulations.length,2,JSON.stringify({calls:h.calls,errors:h.errors,status:h.d.getElementById('status').textContent}));const simId=before.simulations[1].id,firstId=before.equipment[0].id,oldMTBF=before.equipment[0].noiseProfile.reliability.mtbfMinutes;
 const field=h.d.querySelector('.equipment-name');field.value='Local equipment name';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));
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
  h.d.getElementById('gemini-question').value='Check this line';await h.click('#send-gemini');await waitFor(()=>h.d.getElementById('gemini-messages').textContent.includes('Analysis of the saved case.'));
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
  assert(saved.results.batch.replays[0].samples.length<=121);
  await h.click('.sidebar [data-view="simulation"]');assert(!h.d.getElementById('playback-round-control').classList.contains('hidden'));
  const selector=h.d.getElementById('playback-round');assert.equal(selector.options.length,2);
  selector.value='1';selector.dispatchEvent(new h.w.Event('change'));assert.match(h.d.getElementById('playback-status').textContent,/Round 2 \/ 2/);
  assert(h.d.querySelector('.live-control-stop').disabled);
  selector.value='0';selector.dispatchEvent(new h.w.Event('change'));assert(!h.d.querySelector('.live-control-stop').disabled);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="results"]');
  assert(h.visible('batch-results'));assert.equal(h.d.getElementById('run-rounds').value,'2');assert.equal(h.d.getElementById('run-shift-count').value,'2');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: a live control in round one recalculates every round with the same event',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');
  for(const [id,value] of [['run-duration','60'],['run-sample-interval','1'],['run-rounds','2']]){const el=h.d.getElementById(id);el.value=value;el.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  await h.click('#run-simulation');await waitFor(()=>h.storedCases()[0].simulations[0].results?.batch?.rounds===2);
  await h.click('#pause-simulation');await h.click('#home-cases');await h.click('.open-case');
  await h.click('#reset-playback');await h.click('.live-control-stop');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.commands?.length===1);
  const saved=h.storedCases()[0].simulations[0];assert.equal(saved.dynamicConfig.commands[0].atVirtualSecond,0);
  assert(saved.results.batch.rows.every(r=>r.summary.outputCount===0));assert.equal(saved.results.batch.replays[0].samples.at(-1).outputCount,0);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: playback advances to the next round automatically',async()=>{
 const h=await setup();try{
  await h.click('#sign-in-button');await h.click('.open-case');
  for(const [id,value] of [['run-duration','2'],['run-sample-interval','1'],['run-rounds','2']]){const el=h.d.getElementById(id);el.value=value;el.dispatchEvent(new h.w.Event('input',{bubbles:true}));}
  await h.click('#run-simulation');await waitFor(()=>h.d.getElementById('playback-round').value==='1');
  assert.match(h.d.getElementById('playback-status').textContent,/Round 2 \/ 2/);
  assert(h.d.querySelector('.live-control-stop').disabled);assert.deepEqual(h.errors,[]);
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
  assert.equal(button.textContent,entry.textContent);assert.equal(button.className,entry.className);
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

test('UI Basic: inline equipment and fixed conveyor fields persist across the five top sections',async()=>{
 const h=await setup({remember:true,uiMode:null});try{
  const style=e=>h.w.getComputedStyle(e).display;
  await h.click('.open-case');assert.equal(h.d.documentElement.dataset.uiMode,'basic');
  assert.equal(style(h.d.getElementById('case-sidebar')),'none');
  assert.equal(h.d.querySelectorAll('#basic-navigation button:not(.hidden)').length,5);
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

test('UI: Basic hides units and modes, JSON visibility is a per-mode preference and pacemaker remains a role',async()=>{
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
  assert.equal(display(card._fields.querySelector('.equipment-json-details')),'block');
  assert.equal(h.w.localStorage.getItem('st.ui.v1.jsonFields.basic'),'yes');
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
  assert.equal(advanced.w.localStorage.getItem('st.ui.v1.jsonFields.advance'),'no');
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
   const remove=h.d.getElementById('delete-simulation');assert.match(remove.textContent,/Delete/);assert(remove.classList.contains('secondary'));assert(remove.querySelector('svg'));
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
  await h.click('.accent-choice[data-accent="a-lorange"]');assert.equal(h.d.getElementById('accent-name').textContent,'à l’orange');
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
  const toggle=h.d.getElementById('toggle-gemini');assert.equal(toggle.parentElement.id,'basic-section-row');assert.equal(h.d.getElementById('basic-navigation').parentElement,toggle.parentElement);assert(!h.d.getElementById('basic-navigation').contains(toggle));
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

test('UI Advance: simulation actions align right without a selector or enclosing frame',async()=>{
 const h=await setup({remember:true,uiMode:'ADVANCE'});try{
  await h.click('.open-case');
  const toolbar=h.d.getElementById('simulation-toolbar'),style=h.w.getComputedStyle(toolbar);
  assert.equal(h.w.getComputedStyle(h.d.querySelector('.simulation-picker')).display,'none');
  assert.equal(style.justifyContent,'flex-end');assert.equal(style.borderTopWidth,'0px');assert.equal(style.backgroundColor,'rgba(0, 0, 0, 0)');
  assert.equal(h.d.querySelectorAll('#simulation-toolbar button').length,3);assert(h.visible('case-sidebar'));
  assert.equal(h.d.getElementById('toggle-gemini').parentElement.className,'topbar');
  for(const [view,panel] of [['editor','editor'],['simulation','run'],['results','results'],['whatif','whatif']]){
   await h.click('.sidebar [data-view="'+view+'"]');
   assert.equal(toolbar.parentElement,h.d.querySelector('#'+panel+'-panel > .section-heading'));
   assert.equal(h.w.getComputedStyle(toolbar).marginTop,'0px');
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
  assert.equal(h.d.querySelector('#gemini-messages .analysis-recommendation'),null);
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
  assert.equal(fields.querySelectorAll('.basic-worksheet-group').length,4);assert.equal(fields.querySelectorAll('.basic-conveyor-worksheet input').length,23);
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

test('UI Basic: compact machine fields remain visible, palette has seven colors and simulation space is reclaimed',async()=>{
 const h=await setup({uiMode:'BASIC'});try{
  await h.click('#sign-in-button');await h.click('.open-case');
  const card=h.d.querySelector('.basic-machine');
  for(const selector of ['.equipment-rate','.reliability-mtbfMinutes','.reliability-mttrMinutes']){
   const input=card._fields.querySelector(selector);
   for(let node=input.closest('label');node&&node!==card.parentNode;node=node.parentElement)assert.notEqual(h.w.getComputedStyle(node).display,'none',selector+' is hidden');
  }
  assert.equal(h.w.getComputedStyle(card._fields.querySelector('.equipment-name').closest('label')).display,'none');
  assert.match(card.querySelector('.basic-availability').textContent,/Avail.*%/);
  assert.equal(h.d.querySelectorAll('#accent-palette .accent-choice:not(.hidden)').length,7);
  assert(!h.d.querySelector('#accent-palette [data-accent="amparo-blue"]').classList.contains('hidden'));
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
  await h.click('#settings-cancel');assert.equal(h.w.localStorage.getItem('st.ui.v1.scenarioDoe'),'yes');await h.click('#open-settings');assert(section.classList.contains('hidden'));assert.equal(doe.checked,true);
  h.d.getElementById('case-name').value='Mode change preserves draft';h.d.getElementById('case-name').dispatchEvent(new h.w.Event('input',{bubbles:true}));
  for(let i=0;i<5;i++)press(dialog);picker.value='ADVANCE';await h.click('#settings-cancel');
  await waitFor(()=>!dialog.open);assert.equal(h.d.documentElement.dataset.uiMode,'advance',JSON.stringify({error:h.d.getElementById('settings-error').textContent,errors:h.errors,local:h.w.localStorage.getItem('st.ui.v1.interfaceMode')}));assert(section.classList.contains('hidden'));assert.equal(h.w.localStorage.getItem('st.ui.v1.interfaceMode'),'ADVANCE');
  await waitFor(()=>h.storedCases()[0].name==='Mode change preserves draft');
  assert.equal(h.d.querySelectorAll('#accent-palette .accent-choice:not(.hidden)').length,57);
  await h.click('#open-settings');assert(section.classList.contains('hidden'));for(let i=0;i<5;i++)press(dialog);picker.value='BASIC';await h.click('#settings-cancel');
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
  assert.match(card.querySelector('.scenario-preview-status').textContent,/OEE.*Throughput/);card.querySelector('.scenario-create').click();assert.equal(created.changes[0].after,15000);assert.equal(created.reviewed,true);
  const exported=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim));assert.equal(exported.evaluations.length,1);const evaluation=exported.evaluations[0];assert.equal(evaluation.status,'IMPROVEMENT_REPRODUCED');assert.equal(evaluation.evaluatedChanges[0].after,15000);assert.equal(evaluation.selections[0].limit,15000);assert.equal(evaluation.run.seed,42);assert.equal(evaluation.independentCheck.seed,1000045);assert.equal(evaluation.independentCheck.passed,true);assert.equal(evaluation.delta.throughputPerMinute,1);assert.equal(evaluation.plantValidated,false);
  const report=h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim));assert.match(report,/IMPROVEMENT_REPRODUCED/);assert.match(report,/Independent seeds/);assert.match(report,/15000/);
  const changed=JSON.parse(JSON.stringify(sim));changed.dynamicConfig.seed++;assert.equal(h.w.STReports.whatIfData(changed,h.w.STScenarios.plan(changed)).evaluations.length,0);
  const checkbox=rows[1].querySelector('input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new h.w.Event('change'));card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);card.querySelector('.scenario-create').click();assert.equal(created.changes.length,1);
  checkbox.checked=true;calls.length=0;card.querySelector('.scenario-search').click();await waitFor(()=>card.querySelector('.scenario-preview-status').textContent.startsWith('Complete:')&&!card.querySelector('.scenario-create').disabled);
  assert(calls.length>3);assert(calls.every(c=>[42,1000045].includes(c.run.seed)&&c.run.durationSeconds===10));assert(calls.some(c=>c.run.seed===1000045));assert(calls.every(c=>c.case.equipment[1].processData.geometry.lactMm<=15000));assert.match(card.querySelector('.scenario-preview-status').textContent,/candidates checked/);
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
  // A fresh card has an independent baseline cache. The screening seeds improve,
  // the validation seeds regress. This must not become an approved recommendation.
  calls=0;h.w.SimulatorEngine.simulateBatch=async()=>{const i=calls++,gain=i===1?2:i===3?-2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const second=h.w.STWhatIf.card(project,()=>{created=true;},sim.equipment,sim);h.d.body.append(second);
  second.querySelector('.scenario-evaluate').click();await waitFor(()=>second.querySelector('.scenario-preview-status').dataset.state==='rejected');
  assert.match(second.textContent,/did not reproduce/);assert(second.querySelector('.scenario-create').disabled);assert.equal(calls,4);assert.equal(created,false);
  evidence=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0];assert.equal(evidence.status,'NOT_REPRODUCED');assert.equal(evidence.independentCheck.passed,false);assert.match(h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim)),/NOT_REPRODUCED/);
 }finally{h.dom.window.close();}
});


test('UI: enabled DOE uses replicated factorial combinations and exports effects without changing baseline',async()=>{
 const h=await setup({remember:true});try{
  h.w.STPreferences.write('scenarioDoe','yes');
  const sim=h.storedCases()[0].simulations[0];sim.dynamicConfig={durationSeconds:10,tickSeconds:.25,sampleEverySeconds:1,seed:42,rounds:1,commands:[]};
  const e=sim.equipment[1];e.processData.geometry.lactMm=10000;e.processData.accumulation.speedMode='MANUAL';e.processData.accumulation.conveyorSpeedMmPerSecond=500;
  const snapshot=JSON.stringify(sim),changes=[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:20000,unit:'mm'},{equipmentId:e.id,path:'processData.accumulation.conveyorSpeedMmPerSecond',before:500,after:550,unit:'mm/s'}];
  const project={title:'DOE test',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',changes,explore:true},card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);
  const calls=[];h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(JSON.parse(JSON.stringify(input)));const belt=input.case.equipment[1],gain=belt.processData.geometry.lactMm>10000&&belt.processData.accumulation.conveyorSpeedMmPerSecond>500?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  assert.equal(card.querySelector('.scenario-doe').hidden,false);card.querySelector('.scenario-change input[type=number]').value='15';
  card.querySelector('.scenario-search').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const record=h.w.STReports.whatIfData(sim,h.w.STScenarios.plan(sim)).evaluations[0];assert.equal(record.method,'COORDINATE_SEARCH_WITH_DOE');assert.equal(record.doe.combinations,4);assert.equal(record.doe.observations.length,4);assert.equal(record.doe.factors[0].high,15000);assert(record.doe.analysis.complete);assert(record.doe.analysis.effects.some(e=>e.type==='TWO_FACTOR_INTERACTION'&&e.throughput>0));
  assert(calls.every(c=>c.run.rounds===3));assert(calls.some(c=>c.run.seed===1000045));assert(calls.every(c=>c.case.equipment[1].processData.geometry.lactMm<=15000));assert.equal(JSON.stringify({...sim,whatIf:undefined}),snapshot);assert.match(h.w.STReports.whatIfHtml(sim,h.w.STScenarios.plan(sim)),/FULL_FACTORIAL_TWO_LEVEL/);
  h.w.STPreferences.write('scenarioDoe','no');h.w.dispatchEvent(new h.w.Event('st-doe-change'));assert(card.querySelector('.scenario-doe').hidden);assert(card.querySelector('.scenario-create').disabled);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});


test('UI: category searches are independent, Basic hides individual hypotheses, and running controls are protected',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],target=h.d.createElement('section');h.d.body.append(target);
  h.d.documentElement.dataset.uiMode='basic';h.w.STWhatIf.render(sim,target,()=>{});
  assert.equal(target.querySelector('.scenario-candidate-details'),null);
  assert.equal(target.querySelector('.scenario-scope'),null);
  assert.equal(target.querySelector('.scenario-tier-grid').children.length,4);
  assert.match(target.querySelector('.scenario-tier-grid').lastElementChild.textContent,/All CAPEX/);
  h.d.documentElement.dataset.uiMode='advance';h.w.STWhatIf.render(sim,target,()=>{});
  assert(target.querySelector('.scenario-candidate-details'));
  const card=target.querySelector('.scenario-tier-grid .analysis-recommendation:has(.scenario-evaluate)');
  let release,calls=0;h.w.SimulatorEngine.simulateBatch=async()=>{calls++;await new Promise(resolve=>release=resolve);return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}};};
  const search=card.querySelector('.scenario-search');search.click();
  await waitFor(()=>release);assert(search.disabled);assert(card.querySelector('input').disabled);
  assert.match(card.querySelector('.scenario-search-progress').textContent,/Baseline.*up to.*round.*Elapsed/);
  assert(!Array.from(target.querySelectorAll('button')).some(b=>b.textContent==='Add improvement'));
  assert(!target.textContent.includes('Explore the whole line'));
  assert.equal(target.querySelector('.scenario-explorer > details'),null);
  assert(card.isConnected);assert.equal(calls,1);
  h.w.STPreferences.write('scenarioDoe','yes');h.w.dispatchEvent(new h.w.Event('st-doe-change'));
  assert.match(card.querySelector('.scenario-preview-status').textContent,/Simulating baseline/);
  card.querySelector('.scenario-evaluate').click();card.querySelector('.scenario-evaluate').click();release();
  await waitFor(()=>!search.disabled);assert.match(card.querySelector('.scenario-search-progress').textContent,/Stopped/);
  assert.equal(calls,1);assert(card.querySelector('.scenario-create').disabled);assert.equal(card.querySelector('input').disabled,false);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: reproduced gains with audit warnings require acknowledgement and remain review scenarios',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply),apply=h.w.STScenarios.apply;
  h.w.STScenarios.apply=(source,changes)=>{const result=apply(source,changes);result.scenarioWarnings=[{equipmentId:changes[0].equipmentId,rule:'BACKUP_POSITION',before:'PASS',after:'FAIL'}];return result;};
  let calls=0,created;h.w.SimulatorEngine.simulateBatch=async()=>{const gain=calls++%2;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-evaluate').click();
  await waitFor(()=>card.querySelector('.scenario-audit-warnings input'));
  const save=card.querySelector('.scenario-create'),ack=card.querySelector('.scenario-audit-warnings input');
  assert(save.disabled);assert(card.querySelector('.scenario-audit-warnings').open);assert.match(card.textContent,/BACKUP_POSITION: PASS → FAIL/);
  ack.checked=true;ack.dispatchEvent(new h.w.Event('change'));assert.equal(save.disabled,false);save.click();
  assert(created.reviewed);assert.equal(created.evidence.engineeringReview,'ACKNOWLEDGED_REQUIRES_REVIEW');
  const evidence=h.w.STScenarioExplorer.evaluations(sim)[0];assert.equal(evidence.status,'ENGINEERING_REVIEW_REQUIRED');assert(evidence.engineeringReviewAcknowledged);assert(evidence.independentCheck.passed);
  card.querySelector('.scenario-configure').click();const limit=card.querySelector('.scenario-change input[type=number]');limit.value='';limit.dispatchEvent(new h.w.Event('input'));assert(save.disabled);assert.equal(card.querySelector('.scenario-audit-warnings'),null);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: modal DOE selection exposes more than four factors and runs the user-selected later variables',async()=>{
 const h=await setup({remember:true});try{
  // This test covers the complete DOE; search-limit behavior has its own tests.
  h.w.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200};
  h.w.STPreferences.write('scenarioDoe','yes');const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];
  const paths=['conveyorSpeedFactorPercent','blockedTimeDelaySeconds','clearTimeDelaySeconds','backupSensorPositionMm','downstreamRampUpSeconds','conveyorSpeedMmPerSecond'];
  const changes=paths.map(key=>{e.processData.accumulation[key]=10;return {equipmentId:e.id,path:'processData.accumulation.'+key,before:10,after:12,unit:'test'};});
  const card=h.w.STWhatIf.card({title:'All factors',kind:'CUSTOM',tier:'HIGH',changes,explore:true},()=>{},sim.equipment,sim);h.d.body.append(card);
  const dialog=card.querySelector('dialog');assert.equal(dialog.open,false);card.querySelector('.scenario-configure').click();assert(dialog.open);
  assert.equal(dialog.querySelectorAll('.scenario-doe-factor').length,6);assert.match(dialog.querySelector('.scenario-factor-count').textContent,/4 \/ 4 selected · 6 eligible/);
  const uses=Array.from(dialog.querySelectorAll('.scenario-doe-factor input[type=checkbox]'));assert(uses[4].disabled);
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
  let card=h.d.querySelector('.scenario-grid .analysis-recommendation');card.querySelector('.scenario-evaluate').click();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  await waitFor(()=>h.storedCases()[0].simulations[0].whatIf?.evaluations?.some(e=>e.status==='IMPROVEMENT_REPRODUCED'));
  assert.equal(JSON.stringify(h.storedCases()[0].simulations[0].dynamicConfig),baseline);
  const metric=card.querySelector('.scenario-metrics').textContent;assert.match(metric,/BaseProposedChange/);assert.equal(card.querySelectorAll('.scenario-metric-table').length,1);
  assert.equal(card.querySelector('.scenario-verification'),null);
  assert(h.storedCases()[0].simulations[0].whatIf.evaluations.some(e=>e.independentCheck?.passed));
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  card=h.d.querySelector('.scenario-grid .analysis-recommendation');assert.equal(card.querySelector('.scenario-metrics').textContent,metric);assert.equal(card.querySelector('.scenario-create').disabled,false);
  card.querySelector('.scenario-configure').click();const checkbox=card.querySelector('.scenario-change input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new h.w.Event('change'));
  await waitFor(()=>h.storedCases()[0].simulations[0].whatIf.evaluations.some(e=>e.status==='NOT_EVALUATED'));
  Array.from(card.querySelectorAll('button')).find(b=>b.textContent==='Done').click();await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  card=h.d.querySelector('.scenario-grid .analysis-recommendation');assert.equal(card.querySelector('.scenario-change input[type=checkbox]').checked,false);assert(card.querySelector('.scenario-create').disabled);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: stored DOE results survive serialization and stale inputs never restore approval',async()=>{
 const h=await setup({remember:true});try{
  h.w.STPreferences.write('scenarioDoe','yes');const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);
  h.w.SimulatorEngine.simulateBatch=async()=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}});
  let card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-search').click();await waitFor(()=>card.querySelector('.scenario-preview-status').dataset.state==='rejected');
  const saved=JSON.parse(JSON.stringify(sim)),entry=saved.whatIf.evaluations[0];assert(entry.doe.observations.length);card.remove();
  card=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(card);assert(card.querySelector('.scenario-doe-results'));assert.match(card.textContent,/No demonstrated improvement/);assert.equal(h.w.STScenarioExplorer.evaluations(saved)[0].doe.observations.length,entry.doe.observations.length);
  saved.dynamicConfig.seed=991;card.remove();card=h.w.STWhatIf.card(project,()=>{},saved.equipment,saved);h.d.body.append(card);assert.equal(card.querySelector('.scenario-doe-results'),null);assert(card.querySelector('.scenario-create').disabled);assert.equal(h.w.STScenarioExplorer.evaluations(saved).length,0);assert(saved.whatIf.evaluations.length);
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
  h.d.getElementById('settings-seed-policy').value='RANDOM';await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.read('seedPolicy'),'RANDOM');
  let next=1234;h.w.crypto.getRandomValues=a=>{a[0]=next++;return a;};
  h.d.getElementById('run-duration').value=5;await h.click('#run-simulation');await h.click('#pause-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.seed===1234);
  await h.click('#run-simulation');await h.click('#pause-simulation');
  await waitFor(()=>h.storedCases()[0].simulations[0].dynamicConfig.seed===1235);
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
  await h.click('#home-cases');assert(h.d.querySelector('.message-dialog[open]'));await h.click('.message-dialog button:first-child');
  assert.equal(h.d.getElementById('case-name').value,'Manual draft');assert(!h.d.getElementById('case-sidebar').classList.contains('hidden'));
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].name==='Manual draft');
  h.d.getElementById('duration-mode').value='FIXED';h.d.getElementById('run-duration').value=5;await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await h.click('#pause-simulation');
  const saves=h.calls.filter(c=>c==='saveCase').length;await new Promise(resolve=>setTimeout(resolve,1200));assert.equal(h.calls.filter(c=>c==='saveCase').length,saves);assert.equal(h.storedCases()[0].simulations[0].results,null);
  await h.click('#save-case');await waitFor(()=>!!h.storedCases()[0].simulations[0].results);
  n.value='Discard this draft';n.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#home-cases');await h.click('.message-dialog button:nth-child(2)');await h.click('.open-case');
  assert.equal(h.d.getElementById('case-name').value,'Manual draft');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Advance Settings controls autosave interval and manual saving without implicit Settings saves',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#open-settings');assert(!h.d.getElementById('settings-save-section').classList.contains('hidden'));
  const enabled=h.d.getElementById('settings-autosave'),seconds=h.d.getElementById('settings-autosave-seconds');
  enabled.checked=false;enabled.dispatchEvent(new h.w.Event('change'));assert(seconds.disabled);seconds.value=2;await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.read('autosaveEnabled'),'no');
  const name=h.d.getElementById('case-name');name.value='Manual Advance';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,1200));assert.notEqual(h.storedCases()[0].name,'Manual Advance');
  await h.click('#open-settings');await h.click('#settings-cancel');assert.notEqual(h.storedCases()[0].name,'Manual Advance');
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].name==='Manual Advance');
  await h.click('#open-settings');enabled.checked=true;enabled.dispatchEvent(new h.w.Event('change'));seconds.value=2;await h.click('#settings-cancel');
  assert.equal(h.w.STPreferences.read('autosaveSeconds'),'2');assert(h.d.getElementById('save-case').classList.contains('hidden'));
  name.value='Automatic Advance';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,500));assert.equal(h.storedCases()[0].name,'Manual Advance');await waitFor(()=>h.storedCases()[0].name==='Automatic Advance');
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: interrupted scenario restarts with clear status, icon actions and a working Stop control',async()=>{
 const h=await setup({remember:true});try{
  const sim=h.storedCases()[0].simulations[0],project=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply);let created;
  let release;h.w.SimulatorEngine.simulateBatch=async()=>{await new Promise(resolve=>release=resolve);return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}};};
  let card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);card.querySelector('.scenario-evaluate').click();await waitFor(()=>release);card.querySelector('.scenario-evaluate').click();release();await waitFor(()=>card.querySelector('.scenario-evaluate').dataset.icon==='search');card.remove();
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
   h.w.STPreferences.write('scenarioDoe','yes');
   const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];e.processData.geometry.lactMm=10000;
   sim.dynamicConfig={durationSeconds:10,seed:42,rounds:5};
   const project={title:'Early winner',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',explore:true,changes:[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}]};
   let created,pending;const calls=[];
   h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(input);await new Promise(resolve=>pending=resolve);const changed=input.case.equipment[1].processData.geometry.lactMm!==10000,gain=changed?(input.run.seed!==42&&outcome==='fail'?-2:2):0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
   const card=h.w.STWhatIf.card(project,p=>created=p,sim.equipment,sim);h.d.body.append(card);
   const stop=card.querySelector('.scenario-evaluate'),save=card.querySelector('.scenario-create');
   async function finishBatch(){const release=pending;pending=null;release();await waitFor(()=>pending||stop.dataset.icon==='search');}
   card.querySelector('.scenario-search').click();await waitFor(()=>pending);
   assert.match(stop.title,/Finish search/);
   if(outcome!=='empty'){await finishBatch();assert.equal(calls.length,2);}
   stop.click();assert.match(stop.title,/Cancel/);assert(save.disabled);
   await finishBatch();
   if(outcome==='empty'){
    assert.equal(calls.length,1);assert(save.disabled);assert.equal(sim.whatIf.evaluations[0].status,'NO_DEMONSTRATED_IMPROVEMENT');
   }else{
    assert.equal(calls.length,3);assert.equal(calls[2].run.seed,1000045);assert(save.disabled);assert.match(stop.title,/Cancel validation/);
    if(outcome==='cancel'){stop.click();await finishBatch();assert.equal(calls.length,3);assert(save.disabled);assert.equal(sim.whatIf.evaluations[0].status,'CANCELLED');}
    else{
     await finishBatch();assert.equal(calls.length,4);assert(save.disabled);await finishBatch();
     const record=sim.whatIf.evaluations[0];assert(record.searchStoppedEarly);assert.equal(record.trialHistory.length,1);assert.equal(record.trialHistory[0].throughput,102);assert.equal(record.trialHistory[0].changes[0].after,15000);assert.match(record.doeSkippedReason,/finished early/);assert.equal(record.independentCheck.passed,outcome==='pass');assert.equal(save.disabled,outcome!=='pass');
     if(outcome==='pass'){save.click();assert.equal(created.changes[0].after,15000);assert.match(card.textContent,/search finished early/);}
    }
   }
   assert.equal(stop.dataset.icon,'search');assert.equal(e.processData.geometry.lactMm,10000);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});

test('UI: finishing during DOE preserves partial observations without estimating effects',async()=>{
 const h=await setup({remember:true});try{
  h.w.STPreferences.write('scenarioDoe','yes');const sim=h.storedCases()[0].simulations[0],e=sim.equipment[1];e.processData.geometry.lactMm=10000;sim.dynamicConfig={durationSeconds:10,seed:42,rounds:3};
  const project={title:'Partial DOE',tier:'HIGH',kind:'CUSTOM',basis:'STATIC',explore:true,changes:[{equipmentId:e.id,path:'processData.geometry.lactMm',before:10000,after:15000,unit:'mm'}]};
  let release;const calls=[];h.w.SimulatorEngine.simulateBatch=async input=>{calls.push(input);const length=input.case.equipment[1].processData.geometry.lactMm;if(input.run.seed===42&&length===11000)await new Promise(resolve=>release=resolve);const gain=length>10000?2:0;return {ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50+gain,outputCount:100+gain}}};};
  const card=h.w.STWhatIf.card(project,()=>{},sim.equipment,sim);h.d.body.append(card);const levels=card.querySelectorAll('.scenario-doe-factor input[type=number]');levels[0].value=11;levels[1].value=14;
  card.querySelector('.scenario-search').click();await waitFor(()=>release);assert.match(card.querySelector('.scenario-search-progress').textContent,/DOE/);
  card.querySelector('.scenario-evaluate').click();release();await waitFor(()=>!card.querySelector('.scenario-create').disabled);
  const record=sim.whatIf.evaluations[0];assert(record.searchStoppedEarly);assert.equal(record.doe.observations.length,1);assert.equal(record.doe.analysis.complete,false);assert.equal(record.doe.analysis.effects.length,0);assert(record.independentCheck.passed);assert(!calls.some(c=>c.case.equipment[1].processData.geometry.lactMm===14000));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI + Apps Script: All CAPEX creation saves the validated winner from manual Basic mode',async()=>{
 const h=await setup({remember:true,uiMode:'BASIC',realScenarioServer:true});try{
  await h.click('.open-case');const before=h.storedCases()[0],signature=JSON.stringify(before.simulations[0].equipment);
  h.w.SimulatorEngine.simulateBatch=async input=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:JSON.stringify(input.case.equipment)===signature?50:51,outputCount:JSON.stringify(input.case.equipment)===signature?100:101}}});
  await h.click('[data-basic-view=whatif]');const card=h.d.querySelector('.scenario-tier-grid').lastElementChild;
  let selection=0;for(const row of card.querySelectorAll('.scenario-change')){const input=row.querySelector('input[type=checkbox]');input.checked=selection++===0;input.dispatchEvent(new h.w.Event('change'));}
  card.querySelector('.scenario-search').click();for(let i=0;i<400&&card.querySelector('.scenario-evaluate').dataset.icon!=='search';i++)await settle();assert.equal(card.querySelector('.scenario-evaluate').dataset.icon,'search');
  if(card.querySelector('.scenario-audit-warnings input')){const ack=card.querySelector('.scenario-audit-warnings input');ack.checked=true;ack.dispatchEvent(new h.w.Event('change'));}
  assert.equal(card.querySelector('.scenario-create').disabled,false,card.querySelector('.scenario-preview-status').textContent);
  assert.equal(h.calls.filter(c=>c==='saveCase').length,0);
  await h.click('.scenario-tier-grid .analysis-recommendation:last-child .scenario-create');await h.click('.message-dialog button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations.length===2);
  const saved=h.storedCases()[0],scenario=saved.simulations[1];
  assert.equal(scenario.scenario.origin,'REVIEWED');assert(scenario.scenario.changes.length>0);assert.equal(JSON.stringify(saved.simulations[0].equipment),signature);assert.equal(scenario.results,null);
  assert(saved.simulations[0].whatIf.evaluations.some(e=>e.searchScope==='ALL'&&e.independentCheck?.passed));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: Gemini reveals complete paragraphs progressively and shows cards only after Advance text finishes',async()=>{
 for(const uiMode of ['ADVANCE','BASIC']){
  const h=await setup({remember:true,uiMode});try{
   await h.click('.open-case');await h.click('#toggle-gemini');
   const sim=h.storedCases()[0].simulations[0],proposal=h.w.STScenarios.plan(sim).projects.find(p=>p.canApply),answer='Primer párrafo.\n\nSegundo párrafo.\n\nTercer párrafo.';
   h.api.askGemini=()=>({text:answer,proposals:[proposal]});
   const timers=[],original=h.w.setTimeout;h.w.ST_GEMINI_CHAT_PRESENTATION.paragraphDelayMs=5000;h.w.ST_GEMINI_CHAT_PRESENTATION.maxDurationMs=15000;
   h.w.setTimeout=(fn,ms,...args)=>ms===5000?(timers.push(fn),900001):original(fn,ms,...args);
   h.d.getElementById('gemini-question').value='¿Qué mejoras sugieres?';await h.click('#send-gemini');await waitFor(()=>timers.length===1);
   const body=h.d.querySelector('.gemini-message[data-role=model] .gemini-message-body');assert.equal(body.textContent,'Primer párrafo.\n\n');assert(h.d.getElementById('send-gemini').disabled);assert.equal(h.d.querySelector('#gemini-messages .analysis-recommendation'),null);
   timers.shift()();assert.equal(body.textContent,'Primer párrafo.\n\nSegundo párrafo.\n\n');assert.equal(timers.length,1);assert.equal(h.d.querySelector('#gemini-messages .analysis-recommendation'),null);
   timers.shift()();assert.equal(body.textContent,answer);assert.equal(h.d.getElementById('send-gemini').disabled,false);assert.equal(h.d.getElementById('gemini-messages').getAttribute('aria-busy'),'false');
   assert.equal(!!h.d.querySelector('#gemini-messages .analysis-recommendation'),uiMode==='ADVANCE');assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
 }
});
test('UI: Gemini paragraph reveal respects reduced motion and stops when leaving the source case',async()=>{
 const h=await setup({remember:true});try{
  await h.click('.open-case');await h.click('#toggle-gemini');const answer='First paragraph.\n\nSecond paragraph.';h.api.askGemini=()=>({text:answer});
  h.media.matches=true;h.d.getElementById('gemini-question').value='Explain';await h.click('#send-gemini');await waitFor(()=>h.d.querySelector('.gemini-message[data-role=model]'));
  assert.equal(h.d.querySelector('.gemini-message[data-role=model] .gemini-message-body').textContent,answer);assert.equal(h.d.getElementById('send-gemini').disabled,false);
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
  const run=h.w.SimulatorEngine.simulateBatch;h.w.SimulatorEngine.simulateBatch=async(...args)=>{const response=await run(...args);for(const replay of [response.result,...response.result.batch.replays])for(const sample of replay.samples)sample.extraDetail='x'.repeat(8000);return response;};
  await h.click('[data-basic-view=simulation]');await h.click('#run-simulation');await waitFor(()=>!h.d.getElementById('batch-dialog').open&&h.d.getElementById('simulation-json-preview').value.includes('st-replications'));await h.click('#pause-simulation');
  const full=JSON.parse(h.d.getElementById('simulation-json-preview').value),originalSave=h.api.saveCase;let payloadBytes;
  h.api.saveCase=request=>{payloadBytes=new h.w.Blob([JSON.stringify(request)]).size;return originalSave(request);};h.w.ST_CASE_SAVE_LIMITS.maxBytes=800000;
  await h.click('#save-case');await waitFor(()=>h.storedCases()[0].simulations[0].results||h.d.getElementById('autosave-status').dataset.state==='error');assert(h.storedCases()[0].simulations[0].results,h.d.getElementById('status').textContent+' '+h.d.getElementById('autosave-status').title);
  const saved=h.storedCases()[0].simulations[0].results;assert(payloadBytes<=800000);assert(saved.replay.samples.length<full.samples.length);assert.equal(saved.replay.samples[0].virtualSecond,0);assert.equal(saved.replay.samples.at(-1).virtualSecond,60);assert.deepEqual(saved.batch.statistics,full.batch.statistics);assert.deepEqual(saved.equipmentMetrics,full.equipmentMetrics);assert(saved.replay.detailCoverage.savedReplaySampled);assert.deepEqual(h.errors,[]);
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
