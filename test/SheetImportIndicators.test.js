import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {normalizeFormatCatalog} from '../src/simulation/FormatCatalog.js';

function setup(){
 const dom=new JSDOM(`<button id="open-sheet-import"></button><dialog id="sheet-import-dialog"><form id="sheet-import-form"><input id="sheet-import-url"><input id="sheet-import-tab"><button id="sheet-import-read"></button></form><div id="sheet-import-preview"></div><p id="sheet-import-error"></p><p id="sheet-import-summary"></p><input type="checkbox" id="sheet-import-ack"><button id="sheet-import-apply"></button><button id="sheet-import-close"></button><button id="sheet-import-cancel"></button></dialog>`,{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(fs.readFileSync('apps-script/TextResources.gs','utf8'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const file of ['Icons.html','SheetImportMerge.html','SheetImport.html'])w.eval(fs.readFileSync('apps-script/'+file,'utf8').replace(/<\/?script>/g,''));
 const units=Array.from({length:4},(_,i)=>({id:'sheet-row-'+(10+i),name:'Machine '+i,type:'CUSTOM',nominalRatePerSecond:2,initialMode:'AUTO',characteristics:{sourceSheetRow:10+i},noiseProfile:{},processData:{role:'MACHINE',equipment:{maximumSpeedBpm:120}}}));
 const preview={equipment:units,source:{sheetName:'Test',spreadsheetId:'test',sheetId:0},sourceRows:units.map((u,i)=>({row:10+i,values:{}})),metadata:{},notes:[],errors:[{cell:'D12:E12',message:'Invalid reliability values.'}],warnings:[{cell:'F11',message:'Confirm the speed unit.'}]};
 let modelReview=true;
 w.SimulatorEngine={normalizeFormatCatalog,validateSimulationInput(input){const index=input.case.equipment.findIndex(e=>e.name==='Machine 3');return modelReview&&index>=0?{ok:false,error:{details:[{path:'case.equipment['+index+'].nominalRatePerSecond',reason:'Check installed speed.'}]}}:{ok:true};}};
 w.STSheetCorrections={render(){}};w.STDialog={beginActivity(){return ()=>{};}};w.STErrors={capture(){}};
 w.google={script:{run:{withFailureHandler(){return this;},withSuccessHandler(fn){this.success=fn;return this;},previewSheetImport(){this.success({ok:true,data:preview});}}}};
 const state={activeCase:{id:'test'},activeSimulationId:'sim',requestEpoch:1},snapshot={equipment:[],sourceImport:{}};
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
