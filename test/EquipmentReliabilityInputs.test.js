import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('equipment editor accepts general and split reliability and validates the full split',()=>{
 const {window:w}=new JSDOM('<article><div class="equipment-grid"><select class="equipment-type"><option>FILLER</option></select></div><textarea class="equipment-noise-profile">{"reliability":{"mtbfMinutes":20,"mttrMinutes":3}}</textarea><textarea class="equipment-process-data">{}</textarea></article>',{runScripts:'outside-only'});
 w.__ST_TEXT__=key=>key;
 w.eval(fs.readFileSync('apps-script/ConfigurationEditor.html','utf8').replace(/<\/?script>/g,''));
 const card=w.document.querySelector('article');card._fields=card;
 w.STReliabilityControls(card);
 const mode=card.querySelector('[aria-label="Stop inputs"]');
 const set=(input,value)=>{input.value=value;input.dispatchEvent(new w.Event('input'));};
 assert.equal(mode.value,'general');
 set(mode,'split');assert.equal(w.STReliabilityControls.valid(card),false);
 for(const [text,value] of [['Minor MTBF [min]',10],['Minor MTTR [min]',2],['Major MTBF [min]',40],['Major MTTR [min]',17]]){
  const label=[...card.querySelectorAll('label')].find(item=>item.textContent===text);
  set(label.querySelector('input'),value);
 }
 const noise=()=>JSON.parse(card.querySelector('.equipment-noise-profile').value);
 const process=()=>JSON.parse(card.querySelector('.equipment-process-data').value);
 assert(w.STReliabilityControls.valid(card));
 assert.deepEqual(noise().reliability,{mtbfMinutes:8,mttrMinutes:5});
 assert.equal(process().equipment.stopInputs.major.mttrMinutes,17);
 set(mode,'general');
 assert.equal(process().equipment.stopInputs,undefined);
 assert.deepEqual(noise().reliability,{mtbfMinutes:8,mttrMinutes:5});
});

test('save reports the equipment validation message and retains its code',async()=>{
 const {window:w}=new JSDOM('',{runScripts:'outside-only'});
 w.STProducts={validateForSave(){}};
 w.state={activeCase:{}};
 w.__ST_TEXT__=()=> 'Generic validation error';
 w.syncPersistentSimulation=()=>{
  w.state.lastInputError={code:'INVALID_EQUIPMENT_RELIABILITY',message:'Filler · Major stops: enter MTBF and MTTR.'};
  return false;
 };
 const source=fs.readFileSync('apps-script/ClientCases.html','utf8');
 w.eval(source.slice(source.indexOf('    function prepareCaseDraft()'),source.indexOf('    function flushCase(')));
 await assert.rejects(w.prepareCaseDraft(),error=>error.code==='INVALID_EQUIPMENT_RELIABILITY'&&error.message.includes('Filler · Major stops'));
});

test('save commits completed split fields even when autofill did not emit input events',()=>{
 const {window:w}=new JSDOM('<article><div class="equipment-grid"><select class="equipment-type"><option>FILLER</option></select></div><textarea class="equipment-noise-profile">{}</textarea><textarea class="equipment-process-data">{}</textarea></article>',{runScripts:'outside-only'});
 w.__ST_TEXT__=key=>key;
 w.eval(fs.readFileSync('apps-script/ConfigurationEditor.html','utf8').replace(/<\/?script>/g,''));
 const card=w.document.querySelector('article');card._fields=card;
 w.STReliabilityControls(card);
 const mode=card.querySelector('[aria-label="Stop inputs"]');mode.value='split';mode.dispatchEvent(new w.Event('change'));
 assert.equal(w.STReliabilityControls.valid(card),false);
 assert.match(card.querySelector('.reliability-controls').dataset.validationMessage,/Minor/);
 for(const [text,value] of [['Minor MTBF [min]',10],['Minor MTTR [min]',2],['Major MTBF [min]',0],['Major MTTR [min]',0]]){
  [...card.querySelectorAll('label')].find(label=>label.textContent===text).querySelector('input').value=value;
 }
 card.querySelector('.reliability-enabled').checked=true;
 assert(w.STReliabilityControls.valid(card));
 assert.deepEqual(JSON.parse(card.querySelector('.equipment-noise-profile').value).reliability,{mtbfMinutes:10,mttrMinutes:2});
});
