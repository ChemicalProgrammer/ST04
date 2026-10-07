// Optional real browser/WASM validation. No credentials, Apps Script or Cloud.
// Supply official Pyodide 0.27.7 files extracted from `npm pack pyodide@0.27.7`.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {renderAppsScript} from './render-apps-script.mjs';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const runtime=arg('--runtime'),executable=arg('--chromium');
if(!process.argv.includes('--runtime'))throw Error('Required: --runtime /path/to/pyodide-0.27.7/package. Optional: --chromium /path/to/chromium --playwright /path/to/playwright/index.mjs');
const {chromium}=await import(process.argv.includes('--playwright')?pathToFileURL(path.resolve(arg('--playwright'))).href:'playwright');
const input=JSON.parse(fs.readFileSync(new URL('../test/fixtures/simpy-pipeline.json',import.meta.url)));
const record={...input.case,id:'browser-case',name:'Browser SimPy validation',revision:1,createdAt:'2026-10-07',updatedAt:'2026-10-07',
  simulations:[{id:'simulation-a',name:'Simulation A',equipment:input.case.equipment,dynamicConfig:input.run,results:null}]};
const mock=`<script>
window.__savedCase=${JSON.stringify(record)};
const api={getBootstrap:()=>({uiMode:'ADVANCE',user:{email:'preview@example.test'},settings:{workspaceRootFolderId:'synthetic'},gemini:{configured:false},cases:[{id:'browser-case',name:'Browser SimPy validation',equipmentCount:3}]}),getCase:()=>window.__savedCase,saveCase:c=>(window.__savedCase=JSON.parse(JSON.stringify({...c,revision:c.expectedRevision+1}))),saveUserSettings:c=>c};
function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(o,k)=>o[k]||((...args)=>setTimeout(()=>{try{success({ok:true,data:api[k](...args)});}catch(e){failure(e);}},0))});}
window.google={script:{run:runner()}};
</script>`;
const html=renderAppsScript().html.replace('<head>','<head>'+mock);
// Match the relevant Apps Script iframe flags locally; live deployment and
// corporate CDN availability remain separate checks.
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/app'?html:'<iframe src="/app" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals" style="width:100%;height:100vh;border:0"></iframe>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{}),args:['--no-sandbox']});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
  // Only runtime assets are served locally. The actual generated module Worker,
  // Python bundle, SimPy, adapter, UI, persistence and cancellation are unchanged.
  await page.route('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1),file=path.join(runtime,name);
    if(!fs.existsSync(file))throw Error('Missing runtime asset '+name);
    await route.fulfill({body:fs.readFileSync(file),contentType:name.endsWith('.wasm')?'application/wasm':/\.m?js$/.test(name)?'text/javascript':name.endsWith('.json')?'application/json':'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);console.error('Loaded sandbox preview');
  const app=page.frames().find(frame=>frame.url().endsWith('/app'));
  await app.locator('#sign-in-button').click();await app.locator('.open-case').click();
  await app.waitForTimeout(200);
  await app.locator('#application.case-open').waitFor();console.error('Opened case');
  await app.evaluate(()=>STSettings.open());await app.locator('[data-settings-tab="simulation"]').click();
  assert.equal(await app.locator('#settings-simulation-engine').inputValue(),'ST_CURRENT');
  await app.locator('#settings-simulation-engine').selectOption('DES_SIMPY_EXPERIMENTAL');console.error('Selected SimPy');await app.locator('#settings-close').click();
  await app.locator('#run-simulation').click();console.error('Started UI run');
  await app.waitForFunction(()=>window.__savedCase.simulations[0].results?.replicationStatus?.state==='COMPLETE'||!!document.querySelector('.message-dialog[open]')||document.getElementById('status').classList.contains('error'),{},{timeout:120000});
  const saved=await app.evaluate(()=>window.__savedCase.simulations[0]);
  if(!saved.results)throw Error('No results: '+await app.locator('#status').textContent()+' '+JSON.stringify(await app.evaluate(()=>SimulatorEngine.validateSimulationInput({case:window.__savedCase,run:window.__savedCase.simulations[0].dynamicConfig}))));
  assert.equal(saved.dynamicConfig.engineId,'DES_SIMPY_EXPERIMENTAL');assert.equal(saved.results.summary.outputCount,598);
  assert.equal(saved.results.summary.materialBalance.residualUnits,0);assert.equal(saved.results.replay.engine.libraryVersion,'4.1.2');
  assert.equal(saved.results.summary.lineOeePercent,null);
  // Direct API rounds, exact shift boundaries, and cancel/restart use that same worker.
  console.error('Saved UI result');
  const checks=await app.evaluate(async input=>{
    input.run={...input.run,engineId:'DES_SIMPY_EXPERIMENTAL',rounds:2,shiftSeconds:150};
    const batch=await SimulatorEngine.simulateBatch(input),slow=JSON.parse(JSON.stringify(input));
    slow.run.durationSeconds=100000;delete slow.run.shiftSeconds;
    let cancelled=false;setTimeout(()=>{cancelled=true;},10);
    let cancellation;try{await SimulatorEngine.simulateLineAsync(slow,{cancelled:()=>cancelled});}catch(e){cancellation=e.message;}
    const restarted=await SimulatorEngine.simulateLineAsync(input);
    return {outputs:batch.result.batch.rows.map(r=>r.summary.outputCount),seeds:batch.result.batch.rows.map(r=>r.seed),
      shifts:batch.result.shifts.map(s=>s.outputCount),cancellation,restarted:restarted.result.summary.outputCount};
  },input);
  assert.deepEqual(checks.outputs,[598,598]);assert.deepEqual(checks.shifts,[148,150,150,150]);
  assert.equal(checks.cancellation,'BATCH_CANCELLED');assert.equal(checks.restarted,598);assert.deepEqual(errors,[]);
  const report={ok:true,browser:await browser.version(),pyodide:'0.27.7',simpy:'4.1.2',output:saved.results.summary.outputCount,
    residualUnits:0,checks,coverage:['module Worker inside sandbox iframe','selector default and selection','saved engine provenance','two rounds','four exact shifts','cancel synchronous Python','restart after cancellation'],
    runtimeAssets:'official npm Pyodide files served locally through browser request interception',liveAppsScriptTested:false,corporateCdnAccessTested:false};
  console.log(JSON.stringify(report,null,2));
}finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
