import {readClientSource} from '../scripts/render-apps-script.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function persistence(){
 const code=readClientSource(),context=vm.createContext({cloneJson:value=>JSON.parse(JSON.stringify(value))});
 for(const name of ['findSampleIndexAtOrBefore','retainedReplaySamples','compactReplay','expandStoredReplay']){
  const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+10);assert(start>=0);
  vm.runInContext(code.slice(start,end),context);
 }
 return context;
}

test('compact chart persistence is bounded and idempotent, preserving exact saved and final frames',()=>{
 const h=persistence(),samples=Array.from({length:2401},(_,i)=>({virtualSecond:i/4,outputCount:i*i/100,buffers:[i%50],equipment:[{id:'m',actualRatePerSecond:i%7}],accumulationZones:[{id:'zone',ownerEquipmentId:'m',name:'Conveyor',geometry:{usableLengthMm:20000},inventoryUnits:i%50,prime:{state:i%2?'ON':'OFF'}}],extraDetail:'unused diagnostic'}));
 const replay={samples,events:Array.from({length:100},()=>({event:'engine trace'}))};h.compactReplay(replay,600,123.25);
 assert(replay.samples.length<=600);assert.equal(replay.samples[0].virtualSecond,0);assert.equal(replay.samples.at(-1).virtualSecond,600);
 for(const time of [123,123.25,599.75,600])assert(replay.samples.some(sample=>sample.virtualSecond===time),'exact frame '+time);
 assert(replay.samples.every(sample=>sample.extraDetail===undefined&&sample.accumulationZones[0].geometry===undefined));assert.equal(replay.events.length,0);assert.equal(replay.detailCoverage.savedEventsOmitted,100);
 const stored=JSON.stringify(replay);h.compactReplay(replay,600,123.25);assert.equal(JSON.stringify(replay),stored,'unchanged history must not create another dirty simulation');
 const expanded=h.expandStoredReplay(replay,{summary:{outputCount:57600}});assert.equal(expanded.summary.outputCount,57600);assert.equal(expanded.samples.at(-1).accumulationZones[0].geometry.usableLengthMm,20000);
 h.compactReplay(replay,30,123.25);assert(replay.samples.length<=30);for(const time of [0,123,123.25,599.75,600])assert(replay.samples.some(sample=>sample.virtualSecond===time));assert.equal(replay.detailCoverage.savedEventsOmitted,100);
});

test('legacy replay still opens with its original metrics and empty history is valid',()=>{
 const h=persistence(),legacy={summary:{outputCount:15},equipmentMetrics:{m:{oee:75}},samples:[{virtualSecond:60,accumulationZones:[{id:'z',geometry:{usableLengthMm:1500}}]}]};
 assert.deepEqual(JSON.parse(JSON.stringify(h.expandStoredReplay(legacy))),legacy);const empty={samples:[]};assert.equal(h.compactReplay(empty,600),empty);
});

