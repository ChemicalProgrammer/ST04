import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const code=fs.readFileSync('apps-script/EquipmentOptions.html','utf8').replace(/^<script>|<\/script>\s*$/g,'');
test('repair ramp checkbox defaults off, persists an explicit boolean and preserves other ramp controls',()=>{
 const dom=new JSDOM('<!doctype html><article id="card"><section class="fields"><select class="equipment-type"><option>FILLER</option></select><input class="equipment-name" value="Filler"><textarea class="equipment-noise-profile">{}</textarea><textarea class="equipment-process-data">{"downstream":{"rampUpTimeSeconds":4},"metadata":{"preserve":true}}</textarea><details class="equipment-json-details"></details></section></article>',{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{
 d.documentElement.dataset.uiMode='advance';w.STIcons={svg(){return '';}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const card=d.getElementById('card');card._fields=card.querySelector('.fields');w.eval(code);w.STEquipmentOptions.attach(card);card.querySelector('.equipment-options-button').click();
 const checkbox=d.querySelector('[data-path="downstream.rampAfterRepair"]');assert(checkbox);assert.equal(checkbox.checked,false);checkbox.checked=true;d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 let data=JSON.parse(card.querySelector('.equipment-process-data').value);assert.equal(data.downstream.rampAfterRepair,true);assert.equal(data.downstream.rampUpTimeSeconds,4);assert.equal(data.metadata.preserve,true);
 card.querySelector('.equipment-options-button').click();assert.equal(checkbox.isConnected,false);const saved=d.querySelector('[data-path="downstream.rampAfterRepair"]');assert.equal(saved.checked,true);saved.checked=false;d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));data=JSON.parse(card.querySelector('.equipment-process-data').value);assert.equal(data.downstream.rampAfterRepair,false);assert.equal(data.downstream.rampUpTimeSeconds,4);
 }finally{w.close();}
});
