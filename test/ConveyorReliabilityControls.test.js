import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function setup(type='CONVEYOR',profile={},data={}){
 const dom=new JSDOM('<article id="card"><section class="fields"><div class="equipment-grid"><select class="equipment-type"><option>CONVEYOR</option><option>FILLER</option></select></div><textarea class="equipment-noise-profile"></textarea><textarea class="equipment-process-data"></textarea></section></article>',{runScripts:'outside-only'}),w=dom.window;
 w.__ST_TEXT__=x=>x;w.STBasicMode={isBasic:()=>false};const card=w.document.getElementById('card');card._fields=card.querySelector('.fields');card.querySelector('select').value=type;card.querySelector('.equipment-noise-profile').value=JSON.stringify(profile);card.querySelector('.equipment-process-data').value=JSON.stringify(data);
 w.eval(fs.readFileSync('apps-script/ConfigurationEditor.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));w.STReliabilityControls(card);
 return {w,card,toggle:card.querySelector('.reliability-enabled'),noise:()=>JSON.parse(card.querySelector('.equipment-noise-profile').value),data:()=>JSON.parse(card.querySelector('.equipment-process-data').value)};
}
test('conveyor defaults hide MTBF/MTTR and explain intentional no-own-failures assumption',()=>{
 const h=setup();try{
  assert.equal(h.toggle.checked,false);for(const key of ['mtbfMinutes','mttrMinutes'])assert(h.card.querySelector('.reliability-'+key).parentElement.hidden);
  assert(h.card.textContent.includes('Model own conveyor failures (exception)'));assert(h.card.textContent.includes('MTBF and MTTR are not required'));
  h.toggle.dispatchEvent(new h.w.Event('change'));assert.deepEqual(h.noise(),{});assert.deepEqual(h.data(),{});assert(h.w.STReliabilityControls.valid(h.card));
  h.toggle.checked=true;h.toggle.dispatchEvent(new h.w.Event('change'));assert(!h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);assert(!h.w.STReliabilityControls.valid(h.card));
  for(const [key,value] of [['mtbfMinutes',60],['mttrMinutes',2]]){const input=h.card.querySelector('.reliability-'+key);input.value=value;input.dispatchEvent(new h.w.Event('input'));}
  assert.deepEqual(h.noise().reliability,{mtbfMinutes:60,mttrMinutes:2});assert(h.w.STReliabilityControls.valid(h.card));
 }finally{h.w.close();}
});
test('legacy conveyor exception is visible and preserved until deliberately disabled',()=>{
 const rel={mtbfMinutes:120,mttrMinutes:3},h=setup('CONVEYOR',{reliability:rel},{equipment:rel,geometry:{lactMm:1000}});try{
  assert(h.toggle.checked);assert(!h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);assert.deepEqual(h.noise().reliability,rel);
  h.toggle.checked=false;h.toggle.dispatchEvent(new h.w.Event('change'));assert.equal(h.noise().reliability,undefined);assert.deepEqual(h.data().equipment,rel);assert.equal(h.data().geometry.lactMm,1000);
  assert(h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);
  h.toggle.checked=true;h.toggle.dispatchEvent(new h.w.Event('change'));assert.deepEqual(h.noise().reliability,rel);
 }finally{h.w.close();}
});
test('machine reliability fields remain visible and changing type refreshes visibility',()=>{
 const h=setup('FILLER');try{
  assert(!h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);assert(h.card.querySelector('.conveyor-reliability-assumption').hidden);
  h.card.querySelector('select').value='CONVEYOR';h.card.querySelector('select').dispatchEvent(new h.w.Event('change'));assert(h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);
  h.card.querySelector('select').value='FILLER';h.card.querySelector('select').dispatchEvent(new h.w.Event('change'));assert(!h.card.querySelector('.reliability-mtbfMinutes').parentElement.hidden);
 }finally{h.w.close();}
});
