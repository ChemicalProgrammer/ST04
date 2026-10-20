import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../apps-script/ClientSimulation.html',import.meta.url),'utf8'),runtime={};vm.createContext(runtime);
vm.runInContext(source.slice(source.indexOf('    function eventTimestamp('),source.indexOf('    function configureEventTime('))+source.slice(source.indexOf('    function distributeEventPauses('),source.indexOf('    function occupiedEventIntervals(')),runtime);
const options={start:0,end:86400,total:481*60,count:40,equipmentIds:['filler','feeder','labeler'],seed:123,blocked:[[2000,5000],[10000,12000]]};
test('random pause distribution is reproducible, exact, bounded and avoids existing stops',()=>{
 const a=runtime.distributeEventPauses(options),b=runtime.distributeEventPauses(options);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.notEqual(JSON.stringify(a),JSON.stringify(runtime.distributeEventPauses({...options,seed:124})));
 assert.equal(a.length,40);assert.equal(a.reduce((n,e)=>n+e.end-e.start,0),481*60);
 a.forEach((e,i)=>{assert(e.start>=0&&e.end<=86400);assert(e.end>e.start);assert.equal(e.start%.25,0);assert(options.equipmentIds.includes(e.equipmentId));if(i)assert(e.start>=a[i-1].end);assert(options.blocked.every(([s,t])=>e.end<=s||e.start>=t));});
});
test('invalid totals, excessive count, missing targets and insufficient free time cannot generate events',()=>{
 for(const edit of [{total:0},{total:1000000},{count:201},{equipmentIds:[]},{total:.1},{blocked:[[0,86400]]}])assert.throws(()=>runtime.distributeEventPauses({...options,...edit}));
});
test('event units and local dates map to the same virtual seconds without changing offsets',()=>{
 assert.equal(runtime.eventSeconds(2,'HOURS'),7200);assert.equal(runtime.eventSeconds(120,'MINUTES'),7200);assert.equal(runtime.eventSeconds(7200,'SECONDS'),7200);
 assert.equal(runtime.eventSeconds('2026-10-20T10:00','DATE','2026-10-20T08:00'),7200);assert.equal(runtime.eventDate(7200,'2026-10-20T08:00'),'2026-10-20T10:00:00.000');
 assert.throws(()=>runtime.eventSeconds('2026-10-19T08:00','DATE','2026-10-20T08:00'));assert.throws(()=>runtime.eventSeconds('','MINUTES'));assert.throws(()=>runtime.eventSeconds('2026-10-20T10:00','DATE',''));
});

test('date events use the simulation timezone across daylight-saving transitions',()=>{
 runtime.window={};vm.runInContext(fs.readFileSync(new URL('../apps-script/RunOptions.html',import.meta.url),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,''),runtime);runtime.STRunOptions=runtime.window.STRunOptions;
 assert.equal(runtime.eventSeconds('2026-11-01T02:30','DATE','2026-11-01T00:30','America/New_York'),10800);
 assert.equal(runtime.eventDate(10800,'2026-11-01T00:30','America/New_York'),'2026-11-01T02:30:00.000');
 assert.equal(runtime.eventSeconds('2026-10-20T08:15:00.250','DATE','2026-10-20T08:00','America/Mexico_City'),900.25);
});
