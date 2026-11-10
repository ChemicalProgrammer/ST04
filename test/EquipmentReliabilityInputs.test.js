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
