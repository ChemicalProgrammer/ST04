import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

function server(pages, key='private-test-key') {
 const calls=[];
 const ctx={PropertiesService:{getUserProperties:()=>({getProperty:()=>key})},createSimulatorError_:(code,message)=>Object.assign(new Error(message),{code}),UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const page=pages.shift();if(page instanceof Error)throw page;return {getResponseCode:()=>page.status??200,getContentText:()=>page.raw??JSON.stringify(page)};}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/GeminiService.gs','utf8'),ctx);
 return {ctx,calls};
}
const model=(id,methods=['generateContent'])=>({name:'models/'+id,displayName:'Name '+id,supportedGenerationMethods:methods});
test('model discovery paginates, filters specialist models and keeps credentials out of returned data',()=>{
 const h=server([{models:[model('gemini-2.5-pro'),model('gemini-embedding-001',['embedContent']),model('gemini-2.5-flash-image'),model('gemini-2.5-flash-preview-tts'),model('gemini-live-test'),model('gemma-test')],nextPageToken:'page&2'},{models:[model('gemini-2.5-flash'),model('gemini-2.5-pro')]}]);
 const result=h.ctx.listGeminiModels_();
 assert.deepEqual(Array.from(result.models,m=>m.id),['gemini-2.5-flash','gemini-2.5-pro']);
 assert.equal(h.calls.length,2);assert.match(h.calls[1].url,/pageToken=page%262/);
 for(const call of h.calls){assert.equal(call.options.headers['x-goog-api-key'],'private-test-key');assert.equal(call.options.method,'get');assert(!call.url.includes('private-test-key'));}
 assert(!JSON.stringify(result).includes('private-test-key'));
});
test('model discovery requires the current account key before making a request',()=>{
 const h=server([],null);assert.throws(()=>h.ctx.listGeminiModels_(),e=>e.code==='GEMINI_NOT_CONFIGURED');assert.equal(h.calls.length,0);
});
test('model discovery sanitizes API errors and transport exceptions',()=>{
 for(const page of [{status:403,raw:'private-test-key remote debug'},new Error('private-test-key transport debug'),{raw:'private-test-key invalid JSON'}]){
  const h=server([page]);assert.throws(()=>h.ctx.listGeminiModels_(),e=>e.code==='GEMINI_MODELS_UNAVAILABLE'&&!e.message.includes('private-test-key'));
 }
});
test('model discovery rejects incomplete pagination and malformed lists',()=>{
 for(const pages of [[{models:[],nextPageToken:'same'},{models:[],nextPageToken:'same'}],[{notModels:[]}]] ){
  const h=server(pages);assert.throws(()=>h.ctx.listGeminiModels_(),e=>e.code==='GEMINI_MODELS_UNAVAILABLE');
 }
 const h=server([{models:[]}]);assert.equal(h.ctx.listGeminiModels_().models.length,0);
});

function client() {
 const dom=new JSDOM(fs.readFileSync('apps-script/WebApp.html','utf8').replace(/<\?[\s\S]*?\?>/g,''));
 const {window}=dom,requests=[],saves=[];
 const ctx={window,document:window.document,Event:window.Event,setTimeout:()=>1,clearTimeout:()=>{},__ST_TEXT__:x=>x,STMotion:{reveal:()=>{}},STPreferences:{},STErrors:{capture:()=>{}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Settings.html','utf8').replace(/<\/?script>/g,''),ctx);
 const settings=window.STSettings,el=id=>window.document.getElementById(id);
 settings.connectModels(done=>requests.push(done));settings.connect((payload,done)=>saves.push({payload,done}));
 settings.init();settings.configureGemini({configured:true,model:'gemini-2.5-flash'});
 el('workspace-folder-id').value='folder';
 return {settings,el,requests,saves,window};
}
test('model selector loads on the Gemini tab, preserves selection and refreshes on demand',()=>{
 const h=client();assert.equal(h.el('gemini-model').tagName,'SELECT');
 const columns=h.el('gemini-model').closest('.gemini-connection-grid').children;
 assert(columns[0].contains(h.el('gemini-api-key')));assert(columns[1].contains(h.el('gemini-model')));
 assert(h.el('gemini-key-verified').classList.contains('hidden'));
 h.el('settings-tab-gemini').click();assert.equal(h.requests.length,1);assert(h.el('gemini-refresh-models').disabled);
 h.requests[0]({ok:true,data:{models:[{id:'gemini-2.5-flash',label:'Flash'},{id:'gemini-2.5-pro',label:'Pro'}]}});
 assert.equal(h.el('gemini-model').value,'gemini-2.5-flash');assert(!h.el('gemini-key-verified').classList.contains('hidden'));h.el('gemini-model').value='gemini-2.5-pro';
 h.el('settings-tab-gemini').click();assert.equal(h.requests.length,1);
 h.el('gemini-refresh-models').click();assert.equal(h.requests.length,2);
 h.requests[1]({ok:true,data:{models:[{id:'gemini-2.5-flash',label:'Flash'}]}});
 assert.equal(h.el('gemini-model').value,'gemini-2.5-pro');assert.match(h.el('gemini-model').selectedOptions[0].textContent,/not in list/);
});
test('model selector ignores stale results after key deletion and retains selection on errors',()=>{
 const h=client();h.el('settings-tab-gemini').click();h.settings.setKeyConfigured(false);
 h.requests[0]({ok:true,data:{models:[{id:'gemini-other',label:'Other'}]}});
 assert.equal(h.el('gemini-model').options.length,1);assert(h.el('gemini-refresh-models').disabled);assert(h.el('gemini-key-verified').classList.contains('hidden'));
 h.settings.setKeyConfigured(true);h.el('gemini-refresh-models').click();
 h.requests[1]({ok:false,error:{message:'HTTP 403'}});
 assert.equal(h.el('gemini-model').value,'gemini-2.5-flash');assert.match(h.el('gemini-model-status').textContent,/403/);assert(!h.el('gemini-refresh-models').disabled);assert(h.el('gemini-key-verified').classList.contains('hidden'));
});
test('saving a replacement key refreshes the catalog and ignores its previous pending response',async()=>{
 const h=client();h.el('settings-tab-gemini').click();
 h.el('gemini-api-key').value='new-key';h.el('gemini-api-key').dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert(h.el('gemini-refresh-models').disabled);assert(h.el('gemini-key-verified').classList.contains('hidden'));
 h.requests[0]({ok:true,data:{models:[{id:'gemini-old',label:'Old'}]}});assert.equal(h.el('gemini-model').options.length,1);
 const saved=h.settings.flush();assert.equal(h.saves[0].payload.gemini.apiKey,'new-key');
 h.saves[0].done({ok:true,data:{}});assert.equal(await saved,true);assert.equal(h.requests.length,2);
 h.requests[1]({ok:true,data:{models:[{id:'gemini-new',label:'New'}]}});
 assert(Array.from(h.el('gemini-model').options).some(o=>o.value==='gemini-new'));assert(!h.el('gemini-key-verified').classList.contains('hidden'));
 assert(!Array.from(h.el('gemini-model').options).some(o=>o.value==='gemini-old'));
});
