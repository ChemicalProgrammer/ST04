// Local browser check with synthetic Apps Script RPCs; no live deployment or Gemini call.
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {renderAppsScript} from './render-apps-script.mjs';
const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const {chromium}=await import(option('--playwright')||'playwright');
const runtime={};vm.createContext(runtime);vm.runInContext(fs.readFileSync('apps-script/PublicDemoCaseFactory.gs','utf8'),runtime);
const record={...runtime.createPublicDemoCaseRequest_(),id:'browser-case',revision:1,updatedAt:'2026-10-07T17:00:00Z'};
record.simulations=[{id:'simulation-a',name:'Simulation A',equipment:record.equipment,dynamicConfig:{},geminiHistory:[],playbackRate:1}];
const html=renderAppsScript().html;
const server=http.createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end(request.url==='/app'?html:'<iframe style="border:0;width:100%;height:100vh" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" src="/app"></iframe>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({executablePath:option('--chromium'),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.addInitScript(initial=>{
  if(!localStorage.getItem('synthetic-case'))localStorage.setItem('synthetic-case',JSON.stringify(initial));
  localStorage.setItem('st.ui.v1.remember','yes');localStorage.setItem('st.ui.v1.autosaveSeconds','1');
  const copy=x=>JSON.parse(JSON.stringify(x)),read=()=>JSON.parse(localStorage.getItem('synthetic-case'));
  const api={
   getBootstrap:()=>({uiMode:'ADVANCE',user:{email:'test@example.test'},settings:{workspaceRootFolderId:'preview'},gemini:{configured:true,model:'synthetic'},cases:[{id:initial.id,name:initial.name,equipmentCount:initial.equipment.length,isSimulationReady:true,revision:read().revision}]}),
   getCase:()=>read(),saveCase:request=>{const result={...copy(request),revision:request.expectedRevision+1};localStorage.setItem('synthetic-case',JSON.stringify(result));return result;},
   askGemini:request=>({text:'**Answer:** '+request.question}),saveUserSettings:request=>request
  };
  function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,key)=>o[key]||((...args)=>setTimeout(()=>{try{success({ok:true,data:api[key](...args)});}catch(error){failure(error);}},20))});}
  window.google={script:{run:runner()}};
 },JSON.parse(JSON.stringify(record)));
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const app=page.frameLocator('iframe');await app.locator('.open-case').click();await app.locator('#toggle-gemini').click();
 let frame=page.frames().find(f=>f.url().endsWith('/app'));
 assert.equal(await frame.evaluate(()=>document.documentElement.dataset.accent),'boat-house');
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
 await page.screenshot({path:option('--screenshot')||'/tmp/st-interface-browser.png',fullPage:true});
 const report={ok:true,browser:browser.version(),checks:['real mouse drag and release','hover after release','lost pointerup recovery','saved chat after page reload','edit and regenerate truncates later messages','progress disappears','two chart color columns','autosave under Case','boat blue default'],liveAppsScriptTested:false};
 console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
