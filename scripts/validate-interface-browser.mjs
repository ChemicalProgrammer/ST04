// Local browser check with synthetic Apps Script RPCs; no live deployment or Gemini call.
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {renderAppsScript} from './render-apps-script.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const {chromium}=await import(option('--playwright')||'playwright');
const runtime={};vm.createContext(runtime);vm.runInContext(fs.readFileSync('apps-script/DemoCaseFactory.gs','utf8'),runtime);
const record={...runtime.createDemoCaseRequest_(),id:'browser-case',revision:1,updatedAt:'2026-10-07T17:00:00Z'};
record.simulations=[{id:'simulation-a',name:'Simulation A',equipment:record.equipment,dynamicConfig:{},geminiHistory:[],playbackRate:1}];
const html=renderAppsScript().html;
const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(request.url==='/app'?html:'<iframe style="border:0;width:100%;height:100vh" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" src="/app"></iframe>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:option('--chromium'),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.addInitScript(initial=>{
  if(!localStorage.getItem('synthetic-case'))localStorage.setItem('synthetic-case',JSON.stringify(initial));
  localStorage.setItem('st.ui.v1.remember','yes');localStorage.setItem('st.ui.v1.interfaceMode','ADVANCE');localStorage.setItem('st.ui.v1.autosaveSeconds','1');
  const copy=x=>JSON.parse(JSON.stringify(x)),read=()=>JSON.parse(localStorage.getItem('synthetic-case'));
  const api={
   getBootstrap:()=>({uiMode:'ADVANCE',user:{email:'test@example.test'},settings:{workspaceRootFolderId:'preview'},gemini:{configured:true,model:'gemini-2.5-flash',generation:JSON.parse(localStorage.getItem('synthetic-generation')||'{}')},cases:[{id:initial.id,name:initial.name,equipmentCount:initial.equipment.length,isSimulationReady:true,revision:read().revision}]}),
   getCase:()=>read(),saveCase:request=>{const result={...copy(request),revision:request.expectedRevision+1};localStorage.setItem('synthetic-case',JSON.stringify(result));return result;},
   askGemini:request=>({text:'**Answer:** '+request.question}),saveUserSettings:request=>{localStorage.setItem('synthetic-generation',JSON.stringify(request.gemini.generation));return request;}
  };
  function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,key)=>o[key]||((...args)=>setTimeout(()=>{try{success({ok:true,data:api[key](...args)});}catch(error){failure(error);}},20))});}
  window.google={script:{run:runner()}};
 },JSON.parse(JSON.stringify(record)));
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const app=page.frameLocator('iframe');await app.locator('.open-case').click();await app.locator('#toggle-gemini').click();
 let frame=page.frames().find(f=>f.url().endsWith('/app'));
 assert.equal(await frame.evaluate(()=>document.documentElement.dataset.accent),'boat-house');
 await app.locator('#close-gemini').click();assert(await frame.evaluate(()=>document.getElementById('gemini-panel').inert));await app.locator('#gemini-panel').waitFor({state:'hidden'});await app.locator('#toggle-gemini').click();assert(await frame.evaluate(()=>document.getElementById('gemini-panel').getAnimations().length>0));
 await page.emulateMedia({reducedMotion:'reduce'});await app.locator('#close-gemini').click();assert(await frame.evaluate(()=>document.getElementById('gemini-panel').classList.contains('hidden')));await app.locator('#toggle-gemini').click();await page.emulateMedia({reducedMotion:'no-preference'});
 // Actual pointer capture must end after mouseup; ordinary hover cannot resize.
 const grip=app.locator('#gemini-resize');let bounds=await grip.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,450);await page.mouse.down();await page.mouse.move(bounds.x-100,450);await page.mouse.up();
 const released=await grip.getAttribute('aria-valuenow');bounds=await grip.boundingBox();await page.mouse.move(bounds.x+2,450);await page.mouse.move(bounds.x-40,450);assert.equal(await grip.getAttribute('aria-valuenow'),released);
 // Simulate a lost pointerup: an observed released mouse button must clear drag state.
 await frame.evaluate(()=>{const g=document.getElementById('gemini-resize');g.dispatchEvent(new PointerEvent('pointerdown',{pointerId:15,button:0,buttons:1,clientX:600}));g.dispatchEvent(new PointerEvent('pointermove',{pointerId:15,buttons:0,clientX:560}));g.dispatchEvent(new PointerEvent('pointermove',{pointerId:15,buttons:1,clientX:500}));});
 assert.equal(await grip.getAttribute('aria-valuenow'),released);
 await frame.evaluate(()=>{ST_GEMINI_CHAT_PRESENTATION.enabled=false;});
 async function ask(question){await app.locator('#gemini-question').fill(question);await app.locator('#send-gemini').click();await app.locator('.gemini-message[data-role=model]').last().waitFor();await app.locator('#send-gemini').isEnabled();await frame.waitForFunction(()=>!document.getElementById('send-gemini').disabled);}
 await ask('First question');await ask('Later question');
 await app.locator('.gemini-message[data-role=user] button[aria-label="Edit and regenerate"]').first().click();await app.locator('.gemini-message-editor textarea').fill('Revised question');await app.locator('.gemini-message-editor button[type=submit]').click();await frame.waitForFunction(()=>JSON.parse(localStorage.getItem('synthetic-case')).simulations[0].geminiHistory?.[1]?.text==='**Answer:** Revised question');
 assert.equal(await app.locator('.gemini-message').count(),2);
 await frame.waitForFunction(()=>document.getElementById('gemini-progress').classList.contains('hidden'));
 await page.reload();frame=page.frames().find(f=>f.url().endsWith('/app'));await app.locator('.open-case').click();await app.locator('#toggle-gemini').click();assert((await app.locator('#gemini-messages').innerText()).includes('Revised question'));
 await frame.evaluate(()=>STSettings.open());await app.locator('#settings-tab-case').click();
 const columns=await frame.evaluate(()=>({count:document.querySelectorAll('#settings-chart-colors > table').length,grid:getComputedStyle(document.getElementById('settings-chart-colors')).gridTemplateColumns,autosave:document.getElementById('settings-save-section').parentElement.id}));
 assert.equal(columns.count,2);assert.equal(columns.autosave,'settings-page-case');assert.equal(columns.grid.split(' ').length,2);
 await app.locator('#settings-close').click();
 await frame.evaluate(()=>document.querySelector(document.documentElement.dataset.uiMode==='basic'?'[data-basic-view=whatif]':'.sidebar [data-view=whatif]').click());
 await frame.evaluate(()=>{window.ST_SCENARIO_SEARCH_LIMITS={maxCandidates:200,maxSearchMs:600000,maxWithoutImprovement:200};SimulatorEngine.simulateBatch=async()=>({ok:true,result:{durationSeconds:60,summary:{lineOeePercent:50,outputCount:100}}});});
 const scenario=app.locator('.scenario-tier-grid > .analysis-recommendation').nth(0);
 await scenario.locator('.scenario-configure').click();await scenario.locator('.scenario-doe-enabled').check();
 const factors=scenario.locator('.scenario-doe-select');assert(await factors.count()>4);assert(await scenario.locator('.scenario-doe-select:enabled').count()>4);
 await scenario.getByRole('button',{name:'Done',exact:true}).click();await scenario.locator('.scenario-search').click();await frame.waitForFunction(()=>document.querySelector('.scenario-tier-grid .scenario-preview-status')?.dataset.state==='rejected');
 await scenario.locator('.scenario-configure').click();assert(await scenario.locator('.scenario-doe-select:enabled').count()>4);assert.equal(await scenario.locator('.scenario-doe-select:checked').count(),0);
 for(let i=0;i<5;i++)await factors.nth(i).click();assert.equal(await scenario.locator('.scenario-doe-select:checked').count(),4);assert(await factors.nth(4).isEnabled());await scenario.getByRole('button',{name:'Done',exact:true}).click();
 const interventions=app.locator('.scenario-interventions');await interventions.locator('summary').click();await interventions.locator('[aria-label="Intervention target (minutes)"]').fill('800');await interventions.locator('textarea').fill('Preventive maintenance; target from supplier reliability trial.');await interventions.locator('.scenario-add-intervention').click();
 const medium=app.locator('.scenario-tier-grid > .analysis-recommendation').nth(1);assert.equal(await medium.locator('.scenario-change').count(),1);assert.equal(await medium.locator('.scenario-doe-select:enabled').count(),1);await medium.locator('.scenario-search').click();await frame.waitForFunction(()=>document.querySelectorAll('.scenario-tier-grid > .analysis-recommendation')[1].querySelector('.scenario-preview-status')?.dataset.state==='rejected');await medium.locator('.scenario-configure').click();assert.equal(await medium.locator('.scenario-doe-select:enabled').count(),1);await medium.locator('.scenario-doe-select').check();await medium.getByRole('button',{name:'Done',exact:true}).click();
 await frame.evaluate(()=>STSettings.open());await app.locator('#settings-tab-gemini').click();assert(await app.locator('#gemini-generation-section').isVisible());await app.locator('#gemini-temperature').fill('0.2');await app.locator('#gemini-response-mode').selectOption('FAST');await app.locator('#gemini-display-mode').selectOption('IMMEDIATE');await app.locator('#settings-close').click();await frame.waitForFunction(()=>localStorage.getItem('synthetic-generation')!==null&&!document.getElementById('settings-dialog').open);assert.equal(await frame.evaluate(()=>JSON.parse(localStorage.getItem('synthetic-generation')).responseMode),'FAST');
 assert.equal(await app.locator('.gemini-message[data-role=model] [data-action=edit]').count(),0);
 await frame.evaluate(()=>STSettings.open());await app.locator('#settings-tab-gemini').click();
 await page.screenshot({path:option('--screenshot')||'/tmp/st-interface-browser.png',fullPage:true});
 const report={ok:true,browser:browser.version(),checks:['real mouse drag and release','hover after release','lost pointerup recovery','saved chat after page reload','edit and regenerate truncates later messages','progress disappears','two chart color columns','autosave under Case','boat blue default','supported DOE factors available before category search','DOE factors remain selectable after category trials','no preselected DOE factors','any four factors with fifth-selection feedback','explicit reliability intervention in Medium CAPEX','Advance response settings persist','no edit button on Gemini answers','panel open and close animation','panel reduced motion'],liveAppsScriptTested:false};
 console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

