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
async function setup({remember=false,fail=false,many=false,invalidSheet=false,empty=false,realScenarioServer=false,fingerprintMismatch=false}={}) {
 const context={}; vm.createContext(context);vm.runInContext(read('PublicDemoCaseFactory.gs'),context);
 const initial=JSON.parse(JSON.stringify(context.createPublicDemoCaseRequest_()));
 Object.assign(initial,{id:'demo',revision:1,updatedAt:'2026-09-15T10:00:00Z'});
 const sourceEquipment=JSON.parse(JSON.stringify(initial.equipment));
 if(empty)initial.equipment=[];
 initial.simulations=[{id:'simulation-a',name:'Simulation A',equipment:JSON.parse(JSON.stringify(initial.equipment)),dynamicConfig:{},results:null,playbackRate:1}];
 let cases=[initial], stored={workspaceRootFolderId:'preview',preferredPlaybackRate:10}, calls=[], geminiConfigured=true;
 if(many) cases=Array.from({length:60},(_,i)=>({...initial,id:'case-'+i,name:'Line '+String(i).padStart(2,'0')}));
 const copy=x=>JSON.parse(JSON.stringify(x));
 const api={
  getBootstrap:()=>({user:{email:'preview@example.test'},settings:stored,gemini:{configured:geminiConfigured,model:'gemini-2.5-flash'},cases:cases.map(c=>({id:c.id,name:c.name,equipmentCount:c.equipment.length,isSimulationReady:c.equipment.length>1,updatedAt:c.updatedAt}))}),
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
  if(remember)w.localStorage.setItem('st.ui.v1.remember','yes');
  media={matches:false,addEventListener(_,fn){this.listener=fn;}};w.matchMedia=()=>media;
  w.confirm=()=>true;w.scrollBy=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{}});
  function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,key)=>o[key]||((...args)=>{calls.push(key);w.setTimeout(()=>{try{if(fail)throw Error('offline');if(!api[key])throw Error('Unmocked '+key);success({ok:true,data:api[key](...args)});}catch(e){failure(e);}},0);})});}
  w.google={script:{run:runner()}};
 }});
 await new Promise(r=>dom.window.addEventListener('load',r));await settle();
 const w=dom.window,d=w.document;
 return {w,d,dom,errors,calls,media,storedCases:()=>copy(cases),api,click:async selector=>{d.querySelector(selector).click();await settle();},visible:id=>!d.getElementById(id).classList.contains('hidden')};
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
  h.d.getElementById('settings-dialog').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));await settle();assert(!h.d.getElementById('settings-dialog').open);assert.equal(field.value,'new-folder');
  await h.click('#cases-settings');field.value='saved-folder';field.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#settings-cancel');assert(!h.d.getElementById('settings-dialog').open);assert.equal(field.value,'saved-folder');
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
  assert(!h.d.querySelector('#save-case,#save-workspace-case,#settings-save,#reload-case,.delete-case'));
  const name=h.d.querySelector('.equipment-name');name.value='Automatically saved equipment';name.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].name==='Automatically saved equipment');assert.equal(h.d.activeElement===name,false);
  assert.equal(h.d.getElementById('autosave-status').textContent,'Saved');
  await h.click('#clone-case');await waitFor(()=>h.storedCases()[0].simulations?.length===2);
  await h.click('#rename-simulation');const dialog=h.d.querySelector('.message-dialog');assert(dialog.open);const input=dialog.querySelector('input');input.value='Proposed B';await h.click('.message-dialog button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations[1].name==='Proposed B');
  await h.click('#delete-simulation');await h.click('.message-dialog button:first-child');assert.equal(h.storedCases()[0].simulations.length,2);
  await h.click('#delete-simulation');await h.click('.message-dialog .danger');await waitFor(()=>h.storedCases()[0].simulations.length===1);
  await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.querySelector('.equipment-name').value,'Automatically saved equipment');
  assert.deepEqual(Array.from(h.d.querySelector('#run-playback-rate').options).map(o=>o.value),['0.5','1','2','5','10','20','50','100','200','500','1000']);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: local and Gemini chat buttons clone only validated changes into persistent scenarios',async()=>{
 const h=await setup();try{
  h.api.createScenario=request=>{
    const source=h.storedCases()[0],simulation=source.simulations.find(s=>s.id===request.simulationId);
    assert.equal(request.sourceSignature,h.w.STScenarios.signature(simulation));
    const copy=h.w.STScenarios.apply(simulation,request.proposal.changes);copy.id='scenario-'+source.simulations.length;copy.name=request.proposal.title;copy.scenario={changes:request.proposal.changes,sourceSimulationId:simulation.id};
    source.simulations.push(copy);const saved=h.api.saveCase({...source,expectedRevision:source.revision});return {case:saved,simulationId:copy.id};
  };
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  assert.equal(h.d.querySelectorAll('.scenario-grid>article').length,h.w.STWhatIf.visibleProjects(h.w.STScenarios.plan(h.storedCases()[0].simulations[0])).length);assert(!h.d.querySelector('.scenario-grid').textContent.includes('Not enough evidence'));assert.match(h.d.querySelector('.scenario-grid').textContent,/Static inputs only/);
  await h.click('.scenario-grid button');await h.click('.message-dialog button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===2);
  assert(!h.storedCases()[0].simulations[0].results);assert.equal(h.storedCases()[0].simulations[1].results,null);
  h.api.askGemini=request=>{
    const source=h.storedCases()[0].simulations.find(s=>s.id===request.simulationId),proposal=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);
    assert(proposal);return {text:'Review these input changes.',proposals:[{...proposal,title:'Chat proposal'}]};
  };
  await h.click('#toggle-gemini');h.d.getElementById('gemini-question').value='Suggest an improvement';await h.click('#send-gemini');await waitFor(()=>!!h.d.querySelector('#gemini-messages .analysis-recommendation button'));
  await h.click('#gemini-messages .analysis-recommendation button');await h.click('.message-dialog button:last-child');await waitFor(()=>h.storedCases()[0].simulations.length===3);
  assert.equal(h.storedCases()[0].simulations[2].name,'Chat proposal');assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI: Gemini proposal creation uses the fingerprint of the persisted server record',async()=>{
 const h=await setup();try{
  let expectedSignature;
  h.api.getScenarioSourceSignature=request=>{const record=h.storedCases()[0];assert.equal(request.expectedRevision,record.revision);expectedSignature='server-fingerprint-'+record.revision;return {revision:record.revision,simulationId:request.simulationId,signature:expectedSignature};};
  h.api.createScenario=request=>{assert.equal(request.sourceSignature,expectedSignature);const record=h.storedCases()[0],source=record.simulations.find(s=>s.id===request.simulationId);const clone=h.w.STScenarios.apply(source,request.proposal.changes);clone.id='verified-scenario';clone.name=request.proposal.title;record.simulations.push(clone);return {case:h.api.saveCase({...record,expectedRevision:record.revision}),simulationId:clone.id};};
  h.api.askGemini=request=>{const source=h.storedCases()[0].simulations.find(s=>s.id===request.simulationId),proposal=h.w.STScenarios.plan(source).projects.find(p=>p.canApply);return {text:'Review this proposal.',proposals:[{...proposal,title:'Chat proposal'}]};};
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('#toggle-gemini');
  h.d.getElementById('gemini-question').value='Suggest an improvement';await h.click('#send-gemini');
  await waitFor(()=>!!h.d.querySelector('#gemini-messages .analysis-recommendation button'));
  await h.click('#gemini-messages .analysis-recommendation button');await h.click('.message-dialog button:last-child');
  await waitFor(()=>h.storedCases()[0].simulations.length===2);
  assert(h.calls.includes('getScenarioSourceSignature'));assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
test('UI + Apps Script: a local proposal with a different fingerprint is regenerated from saved inputs',async()=>{
 const h=await setup({realScenarioServer:true,fingerprintMismatch:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="whatif"]');
  await h.click('.scenario-grid button');await h.click('.message-dialog button:last-child');
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
  json.value=previous;json.dispatchEvent(new h.w.Event('input',{bubbles:true}));await h.click('#home-cases');assert(h.visible('cases-panel'));assert.deepEqual(h.errors,[]);
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
 h.d.getElementById('gemini-question').value='Where is the bottleneck?';await h.click('#send-gemini');assert(h.calls.includes('askGemini'));assert.match(h.d.getElementById('gemini-messages').textContent,/Analysis of the saved case/);
 await h.click('#close-gemini');assert(!h.visible('gemini-panel'));
 await h.click('#open-settings');await h.click('[data-accent="teal"].accent-choice');assert.equal(h.d.documentElement.dataset.accent,'teal');await h.click('#settings-close');
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
 await h.click('#open-settings');assert.equal(h.d.querySelectorAll('.accent-choice').length,25);assert(!h.d.getElementById('settings-save'));assert(!h.d.querySelector('.dialog-body #settings-cancel'));
 await h.click('#settings-cancel');assert(!h.d.getElementById('status').textContent.includes('Loading console'));
 await h.click('#toggle-gemini');const grip=h.d.getElementById('gemini-resize');const initial=Number(grip.getAttribute('aria-valuenow'));grip.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft'}));assert(Number(grip.getAttribute('aria-valuenow'))>initial);
 assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('UI: selective Sheet reload updates the active simulation, preserves other runs and saves selection',async()=>{
 const h=await setup();try{
 async function waitFor(predicate){for(let i=0;i<30;i++){if(predicate())return;await settle();}assert(predicate(),'Asynchronous UI did not settle');}
 await h.click('#sign-in-button');await h.click('.open-case');h.d.getElementById('run-duration').value='30';await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');await h.click('#clone-case');await waitFor(()=>h.storedCases()[0].simulations.length===2);await h.click('#run-simulation');await h.click('#pause-simulation');await h.click('.sidebar [data-view="editor"]');
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
  await h.click('.sidebar [data-view="simulation"]');const speed=h.d.getElementById('run-playback-rate');speed.value='20';speed.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].simulations[0].playbackRate===20);
  await h.click('#home-cases');await h.click('.open-case');assert.equal(h.d.getElementById('run-playback-rate').value,'20');
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
  assert.match(h.d.getElementById('gemini-error').textContent,/could not be reached/);
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
  assert.equal(saved.results.replay.samples.length,361);assert(saved.results.batch.replays[0].samples.length<=121);
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
 const h=await setup({realScenarioServer:true});try{
  await h.click('#sign-in-button');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');
  h.d.querySelector('.equipment-card').click();const rate=h.d.querySelector('#equipment-inspector .equipment-rate');
  assert(Math.abs(Number(rate.value)-h.storedCases()[0].equipment[0].nominalRatePerSecond*60)<1e-9);
  const flow=h.d.getElementById('unit-of-flow');flow.value='cases';flow.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  rate.value='345.5';rate.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await waitFor(()=>h.storedCases()[0].equipment[0].nominalRatePerSecond===345.5/60);
  assert.match(h.d.querySelector('.equipment-header strong').textContent,/345.5 BPM/);
  await h.click('#home-cases');await h.click('.open-case');await h.click('.sidebar [data-view="editor"]');h.d.querySelector('.equipment-card').click();
  assert.equal(h.d.querySelector('#equipment-inspector .equipment-rate').value,'345.5');assert.equal(h.d.getElementById('unit-of-flow').value,'cases');assert.deepEqual(h.errors,[]);
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
