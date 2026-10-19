import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {normalizeFormatCatalog} from '../src/simulation/FormatCatalog.js';

function setup({importVersion='sheet-import-20261019-1',informational=false,rememberedTab=null}={}){
 const dom=new JSDOM(`<button id="open-sheet-import"></button><dialog id="sheet-import-dialog"><form id="sheet-import-form"><input id="sheet-import-url"><input id="sheet-import-tab"><button id="sheet-import-read"></button></form><div id="sheet-import-preview"></div><p id="sheet-import-error"></p><p id="sheet-import-summary"></p><input type="checkbox" id="sheet-import-ack"><button id="sheet-import-apply"></button><button id="sheet-import-close"></button><button id="sheet-import-cancel"></button></dialog>`,{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync('apps-script/TextResources.gs','utf8'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const file of ['Icons.html','SheetImportMerge.html','SheetImport.html'])w.eval(fs.readFileSync('apps-script/'+file,'utf8').replace(/<\/?script>/g,''));
 const units=Array.from({length:4},(_,i)=>({id:'sheet-row-'+(10+i),name:'Machine '+i,type:'CUSTOM',nominalRatePerSecond:2,initialMode:'AUTO',characteristics:{sourceSheetRow:10+i},noiseProfile:{},processData:{role:'MACHINE',equipment:{maximumSpeedBpm:120}}}));
 const preview={equipment:units,source:{sheetName:'Test',spreadsheetId:'test',sheetId:0},sourceRows:units.map((u,i)=>({row:10+i,values:{}})),metadata:{},notes:[],errors:[{cell:'D12:E12',message:'Invalid reliability values.'}],warnings:[{cell:'F11',message:'Confirm the speed unit.'}]};
 if(informational){preview.errors=[];preview.warnings=[{cell:'D10:E10',severity:'info',code:'NO_RELIABILITY_DATA',message:'Random failures disabled.'},{cell:'F10',severity:'info',code:'INHERITED_CONVEYOR_RATE',message:'Using upstream machine rate.'}];}
 let modelReview=!informational;
 w.SimulatorEngine={normalizeFormatCatalog,validateSimulationInput(input){const index=input.case.equipment.findIndex(e=>e.name==='Machine 3');return modelReview&&index>=0?{ok:false,error:{details:[{path:'case.equipment['+index+'].nominalRatePerSecond',reason:'Check installed speed.'}]}}:{ok:true};}};
 w.STSheetCorrections={render(){}};w.STDialog={beginActivity(){return ()=>{};}};w.STErrors={capture(){}};
 w.google={script:{run:{withFailureHandler(){return this;},withSuccessHandler(fn){this.success=fn;return this;},previewSheetImport(request){this.lastRequest=request;this.success({ok:true,data:preview,importVersion});}}}};
 const state={activeCase:{id:'test'},activeSimulationId:'sim',requestEpoch:1},snapshot={equipment:[],sourceImport:rememberedTab?{source:{spreadsheetId:'previous-book',sheetName:rememberedTab}}:{}};
 w.STSheetImport(state,{capture:()=>snapshot,apply:()=>true}).init();w.document.getElementById('open-sheet-import').click();w.document.getElementById('sheet-import-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return {dom,w,d:w.document,preview,setModelReview(value){modelReview=value;}};
}

test('import cards show accessible right-edge success, warning and error indicators, including skipped rows',()=>{
 const h=setup();try{
  const cards=[...h.d.querySelectorAll('.sheet-equipment-choice')];assert.equal(cards.length,4);
  assert.deepEqual(cards.map(c=>c.dataset.importStatus),['ok','warning','error','warning']);
  assert.match(cards[0].querySelector('.sheet-import-row-status').getAttribute('aria-label'),/No issues detected/);
  assert(cards[0].querySelector('.sheet-equipment-issues').hidden);
  assert.match(cards[1].querySelector('.sheet-import-row-status').title,/F11.*speed unit/);
  assert.match(cards[2].querySelector('summary').textContent,/Skipped/);
  assert.match(cards[2].querySelector('.sheet-equipment-issues').textContent,/D12:E12.*Invalid reliability/);
  assert.match(cards[3].querySelector('.sheet-equipment-issues').textContent,/Model review.*Check installed speed/);
  for(const card of cards){const icon=card.querySelector('summary [role=img]');assert(icon.querySelector('svg'));assert.equal(icon.getAttribute('aria-describedby'),card.querySelector('.sheet-equipment-issues').id);}
 }finally{h.dom.window.close();}
});

test('import indicators refresh when selection or target changes without losing source warnings',()=>{
 const h=setup();try{
  h.setModelReview(false);h.d.getElementById('sheet-import-ack').click();assert.equal(h.d.querySelector('[data-source-index="3"]').dataset.importStatus,'ok');
  const select=h.d.querySelector('[data-source-index="1"] .sheet-target');select.value='skip';select.onchange();
  const card=h.d.querySelector('[data-source-index="1"]');assert.equal(card.dataset.importStatus,'warning');assert.match(card.querySelector('.sheet-equipment-issues').textContent,/Confirm the speed unit/);assert(card.open);
 }finally{h.dom.window.close();}
});


test('physical review and card issue list show the same expected Sheet cell',()=>{
 const h=setup();try{
  assert.match(h.d.getElementById('sheet-import-model-review').textContent,/F13/);
  assert.match(h.d.querySelector('[data-source-index="3"] .sheet-equipment-issues').textContent,/F13/);
  assert.match(h.d.querySelector('[data-source-index="3"] .sheet-import-row-status').title,/F13/);
 }finally{h.dom.window.close();}
});

test('normal conveyor notes use an information icon instead of a warning',()=>{
 const h=setup({informational:true});try{
  const row=h.d.querySelector('[data-source-index="0"]');assert.equal(row.dataset.importStatus,'info');assert.match(row.querySelector('.sheet-import-row-status').getAttribute('aria-label'),/no action required/);assert.match(row.querySelector('.sheet-equipment-issues').textContent,/Info · D10:E10/);assert(!row.querySelector('.sheet-equipment-issues').textContent.includes('Warning ·'));
  assert.match(h.d.getElementById('sheet-import-preview').textContent,/Source information/);
 }finally{h.dom.window.close();}
});
test('a mixed deployment stops before previewing or applying equipment',()=>{
 const h=setup({importVersion:'sheet-import-20260917-2'});try{
  assert.match(h.d.getElementById('sheet-import-error').textContent,/client and server versions do not match/);assert(h.d.getElementById('sheet-import-apply').disabled);assert.equal(h.d.querySelectorAll('.sheet-equipment-choice').length,0);
 }finally{h.dom.window.close();}
});

test('a remembered worksheet cannot override a newly pasted URL gid, but an explicit worksheet can',()=>{
 const h=setup({rememberedTab:'Previous tab'});try{
  const url=h.d.getElementById('sheet-import-url'),tab=h.d.getElementById('sheet-import-tab');assert.equal(tab.value,'Previous tab');
  url.value='https://docs.google.com/spreadsheets/d/new-book/edit#gid=123';url.dispatchEvent(new h.w.Event('input'));assert.equal(tab.value,'');h.d.getElementById('sheet-import-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.equal(h.w.google.script.run.lastRequest.sheetName,'');
  h.d.getElementById('open-sheet-import').click();tab.value='Explicit tab';tab.dispatchEvent(new h.w.Event('input'));url.value='new-book';url.dispatchEvent(new h.w.Event('input'));assert.equal(tab.value,'Explicit tab');h.d.getElementById('sheet-import-form').dispatchEvent(new h.w.Event('submit',{cancelable:true}));assert.equal(h.w.google.script.run.lastRequest.sheetName,'Explicit tab');
 }finally{h.dom.window.close();}
});
