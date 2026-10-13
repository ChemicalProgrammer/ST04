import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEquipmentRandom} from '../src/simulation/SeededRandom.js';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
test('equipment/event random streams are independent of draw counts and initialization order',()=>{
 const a=createEquipmentRandom(31,'a','failure'),b=createEquipmentRandom(31,'b','failure'),again=createEquipmentRandom(31,'b','failure'),micro=createEquipmentRandom(31,'b','microstop-occurrence');
 for(let i=0;i<100;i++){for(let j=0;j<i;j++)a.next();micro.next();assert.equal(b.next(),again.next());}
 assert.notEqual(createEquipmentRandom(31,'b','failure').next(),createEquipmentRandom(32,'b','failure').next());
});
test('changing one machine reliability preserves unrelated failure schedules in the engine',()=>{
 const s=JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8')).simulations[0];for(const e of s.equipment)if(e.type!=='CONVEYOR')e.noiseProfile.reliability={mtbfMinutes:1,mttrMinutes:.1};
 const input={case:{id:'streams',equipment:s.equipment},run:{durationSeconds:600,tickSeconds:.25,sampleEverySeconds:30,seed:20261013,commands:[]}};
 const original=simulateLine(input);assert(original.ok);const other=structuredClone(input);other.case.equipment[0].noiseProfile.reliability.mtbfMinutes=3;const changed=simulateLine(other);assert(changed.ok);
 const target=s.equipment.at(-1).id,events=r=>r.result.events.filter(e=>e.equipmentId===target&&['FAILURE_STARTED','REPAIR_COMPLETED'].includes(e.type));assert(events(original).length>0);assert.deepEqual(events(original),events(changed));assert.equal(original.result.engineVersion,'0.13.0');
});
