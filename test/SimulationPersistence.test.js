import {readClientSource} from '../scripts/render-apps-script.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function persistence(){
 const code=readClientSource(),context=vm.createContext({Blob,window:{ST_CASE_SAVE_LIMITS:{maxBytes:3*1024*1024}},state:{activeSimulationId:'a'},cloneJson:value=>JSON.parse(JSON.stringify(value))});
 for(const name of ['findSampleIndexAtOrBefore','retainedReplaySamples','compactReplay','expandStoredReplay','compactStoredReplays','fitCaseSave']){
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
 assert(replay.samples.every(sample=>sample.extraDetail===undefined&&sample.accumulationZones[0].geometry===undefined));// Existing storage contract retains up to 2000 events instead of discarding all traces.
 assert.equal(replay.events.length,100);assert(replay.events.every(event=>event.event==='engine trace'));assert.equal(replay.detailCoverage.savedEventsOmitted,0);
 const stored=JSON.stringify(replay);h.compactReplay(replay,600,123.25);assert.equal(JSON.stringify(replay),stored,'unchanged history must not create another dirty simulation');
 const expanded=h.expandStoredReplay(replay,{summary:{outputCount:57600}});assert.equal(expanded.summary.outputCount,57600);assert.equal(expanded.samples.at(-1).accumulationZones[0].geometry.usableLengthMm,20000);
 h.compactReplay(replay,30,123.25);assert(replay.samples.length<=30);for(const time of [0,123,123.25,599.75,600])assert(replay.samples.some(sample=>sample.virtualSecond===time));assert.equal(replay.detailCoverage.savedEventsOmitted,0);
});

test('emergency replay sampling reaches six frames and preserves displayed/final frames',()=>{
 const h=persistence(),replay={samples:Array.from({length:241},(_,i)=>({virtualSecond:i,outputCount:i,accumulationZones:[]}))};
 h.compactReplay(replay,6,100);
 assert(replay.samples.length<=6);
 for(const time of [0,99,100,239,240])assert(replay.samples.some(sample=>sample.virtualSecond===time));
 assert(replay.samples.every(Boolean));
 const once=JSON.stringify(replay);h.compactReplay(replay,6,100);assert.equal(JSON.stringify(replay),once);
});

test('save budget includes representative replay for multiple simulations without changing metrics',()=>{
 const h=persistence();
 const makeReplay=()=>({samples:Array.from({length:240},(_,i)=>({virtualSecond:i,outputCount:i,equipment:[{id:'m',detail:'x'.repeat(12000)}],accumulationZones:[]})),events:Array.from({length:100},()=>({message:'e'.repeat(1000)}))});
 const makeSimulation=id=>({id,name:id,equipment:[{id:'m',nominalRatePerSecond:1}],results:{summary:{outputCount:240},equipmentMetrics:{m:{failureSeconds:15}},view:{virtualSecond:100},replay:makeReplay(),batch:{rounds:10,representativeRound:7,statistics:{outputCount:{mean:230}},rows:[{round:7,summary:{outputCount:230}}],replays:[],representativeReplay:Object.assign(makeReplay(),{round:7})}}});
 const source={simulations:[makeSimulation('a'),makeSimulation('b')]},original=JSON.stringify(source);
 const draft=JSON.parse(original);h.fitCaseSave(draft);
 assert(new Blob([JSON.stringify(draft)]).size<=h.window.ST_CASE_SAVE_LIMITS.maxBytes);
 assert.equal(draft.simulations.length,2);assert.equal(JSON.stringify(source),original,'capture compacts a detached draft');
 draft.simulations.forEach((s,i)=>{
  assert.deepEqual(s.equipment,source.simulations[i].equipment);
  for(const key of ['summary','equipmentMetrics'])assert.deepEqual(s.results[key],source.simulations[i].results[key]);
  for(const key of ['statistics','rows','representativeRound'])assert.deepEqual(s.results.batch[key],source.simulations[i].results.batch[key]);
  assert(s.results.batch.representativeReplay.samples.length<120);
  assert.equal(s.results.batch.representativeReplay.events.length,0);
  assert.equal(s.results.batch.representativeReplay.detailCoverage.savedEventsOmitted,100);
  const restored=h.expandStoredReplay(s.results.batch.representativeReplay,s.results.batch.rows[0]);
  assert.equal(restored.summary.outputCount,230);assert(restored.samples.length);
 });
});

test('oversized essential case data still fails explicitly without dropping simulations or results',()=>{
 const h=persistence(),draft={simulations:[{id:'a',results:{summary:{outputCount:1},batch:{rows:[]}}}],notes:'x'.repeat(3*1024*1024)};
 assert.throws(()=>h.fitCaseSave(draft),error=>error.code==='CASE_SAVE_SIZE');
 assert.equal(draft.simulations.length,1);assert.equal(draft.simulations[0].results.summary.outputCount,1);
});

test('legacy replay still opens with its original metrics and empty history is valid',()=>{
 const h=persistence(),legacy={summary:{outputCount:15},equipmentMetrics:{m:{oee:75}},samples:[{virtualSecond:60,accumulationZones:[{id:'z',geometry:{usableLengthMm:1500}}]}]};
 assert.deepEqual(JSON.parse(JSON.stringify(h.expandStoredReplay(legacy))),legacy);const empty={samples:[]};assert.equal(h.compactReplay(empty,600),empty);
});
