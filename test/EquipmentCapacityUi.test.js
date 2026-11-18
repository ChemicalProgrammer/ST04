import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

test('internal capacity label follows the incoming unit and preserves the saved number',()=>{
 const dom=new JSDOM('<div class="equipment-grid"></div><input class="equipment-input-unit" value="BOTTLES"><input class="equipment-unit" value="CASES"><input class="equipment-process-data"><input class="equipment-characteristics">',{runScripts:'outside-only'});
 const w=dom.window;w.__ST_TEXT__=key=>key;
 w.eval(fs.readFileSync('apps-script/EquipmentRoles.html','utf8').replace(/<\/?script>/g,''));
 const fields=w.document.body,card={_fields:fields};
 w.STEquipmentRoles.attach(card,{type:'CASE_PACKER',processData:{equipment:{internalCapacityBottles:24}}});
 const capacity=fields.querySelector('.equipment-internal-capacity');
 assert.match(capacity.parentNode.textContent,/Internal capacity \(bottles\)/);
 fields.querySelector('.equipment-input-unit').value='CASES';
 fields.querySelector('.equipment-unit').dispatchEvent(new w.Event('change'));
 assert.match(capacity.parentNode.textContent,/Internal capacity \(cases\)/);
 assert.equal(capacity.value,'24');
 const data={};assert(w.STEquipmentRoles.readCapacity(fields,data));assert.equal(data.equipment.internalCapacityBottles,24);
 dom.window.close();
});
