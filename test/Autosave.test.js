import {readClientSource} from '../scripts/render-apps-script.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function setup(clock){
 const sent=[],statuses=[];let value='first',revision=1;
 const ctx={window:{},setTimeout,clearTimeout,__ST_TEXT__:x=>x,...clock};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Autosave.html','utf8').replace(/<\/?script>/g,''),ctx);
 const queue=ctx.window.STAutosave({capture:()=>({value,expectedRevision:revision}),send:(payload,done)=>sent.push({payload,done}),accept:s=>{revision=s.revision;},status:(s,e)=>statuses.push({s,e})});
 return {queue,sent,statuses,edit:v=>{value=v;queue.change();},revision:()=>revision};
}
test('autosave serializes edits during flight without replacing the current editor',async()=>{
 const h=setup();h.edit('first');const pending=h.queue.flush();assert.equal(h.sent.length,1);h.edit('second');assert.equal(h.sent.length,1);
 h.sent[0].done({ok:true,data:{revision:2}});assert.equal(h.sent.length,2);assert.equal(h.sent[1].payload.value,'second');assert.equal(h.sent[1].payload.expectedRevision,2);
 h.sent[1].done({ok:true,data:{revision:3}});await pending;assert(!h.queue.pending());assert.equal(h.revision(),3);
});
test('autosave retains failed edits and retries transient errors',async()=>{
 const h=setup();h.edit('retained');const failed=h.queue.flush();h.sent[0].done({ok:false,error:{code:'NETWORK_ERROR',message:'offline'}});await assert.rejects(failed,/offline/);assert(h.queue.pending());
 const retry=h.queue.retry();assert.equal(h.sent[1].payload.value,'retained');h.sent[1].done({ok:true,data:{revision:2}});await retry;assert(!h.queue.pending());
});
test('autosave never silently retries a conflicting revision',async()=>{
 const h=setup();h.edit('local');const failed=h.queue.flush();h.sent[0].done({ok:false,error:{code:'CASE_CONFLICT',message:'conflict'}});await assert.rejects(failed,/conflict/);
 h.edit('more local edits');await assert.rejects(h.queue.flush(),/conflict/);assert.equal(h.sent.length,1);assert(h.queue.pending());h.queue.reset();
});

function clock(){
 let now=0,id=0;const timers=new Map();
 return {Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
 advance(ms){const end=now+ms;while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}};
}
test('background save waits for idle and captures only the latest draft',()=>{
 const c=clock(),h=setup(c);c.advance(20000);assert.equal(h.sent.length,0);
 h.edit('a');c.advance(1000);h.edit('b');c.advance(1499);assert.equal(h.sent.length,0);
 c.advance(1);assert.equal(h.sent.length,1);assert.equal(h.sent[0].payload.value,'b');
 h.sent[0].done({ok:true,data:{revision:2}});c.advance(20000);assert.equal(h.sent.length,1);
});
test('continuous editing saves at the maximum wait without concurrent requests',()=>{
 const c=clock(),h=setup(c);h.edit('0');for(let i=1;i<10;i++){c.advance(1000);h.edit(String(i));}
 c.advance(1000);assert.equal(h.sent.length,1);assert.equal(h.sent[0].payload.value,'9');
 h.edit('in flight');c.advance(20000);assert.equal(h.sent.length,1);
 h.sent[0].done({ok:true,data:{revision:2}});c.advance(0);assert.equal(h.sent.length,2);
 assert.equal(h.sent[1].payload.expectedRevision,2);h.sent[1].done({ok:true,data:{revision:3}});
});
test('edits during a quick background request remain coalesced until idle',()=>{
 const c=clock(),h=setup(c);h.edit('first');c.advance(1500);h.edit('second');c.advance(100);
 h.sent[0].done({ok:true,data:{revision:2}});assert.equal(h.sent.length,1);
 c.advance(1399);assert.equal(h.sent.length,1);c.advance(1);assert.equal(h.sent.length,2);
 h.sent[1].done({ok:true,data:{revision:3}});
});
test('reset ignores stale responses and rejects outstanding flushes',async()=>{
 const c=clock(),h=setup(c);h.edit('old');const flushed=h.queue.flush();
 const rejected=assert.rejects(flushed,/autosave.reset/);h.queue.reset();await rejected;
 h.edit('new');c.advance(1500);h.sent[0].done({ok:true,data:{revision:99}});
 assert.equal(h.revision(),1);assert(h.queue.pending());
 h.sent[1].done({ok:true,data:{revision:2}});assert(!h.queue.pending());
});

test('manual mode retains all changes until explicit flush, including immediate edits',async()=>{
 const c=clock(),h=setup(c);h.queue.configure({enabled:false,intervalMs:2000});h.edit('manual');h.queue.change(true);
 c.advance(60000);assert.equal(h.sent.length,0);assert(h.queue.pending());
 const saved=h.queue.flush();assert.equal(h.sent.length,1);assert.equal(h.sent[0].payload.value,'manual');
 h.sent[0].done({ok:true,data:{revision:2}});await saved;assert(!h.queue.pending());
});
test('configured interval saves continuous edits on time, ignores immediate hints and stops when disabled',()=>{
 const c=clock(),h=setup(c);h.queue.configure({enabled:true,intervalMs:5000});h.edit('a');h.queue.change(true);
 c.advance(1500);h.edit('b');c.advance(3499);assert.equal(h.sent.length,0);c.advance(1);assert.equal(h.sent.length,1);
 assert.equal(h.sent[0].payload.value,'b');h.edit('during request');h.queue.configure({enabled:false,intervalMs:5000});
 h.sent[0].done({ok:true,data:{revision:2}});c.advance(30000);assert.equal(h.sent.length,1);assert(h.queue.pending());
 h.queue.configure({enabled:true,intervalMs:1000});c.advance(0);assert.equal(h.sent.length,2);
 h.sent[1].done({ok:true,data:{revision:3}});
});
test('disabling autosave cancels an already scheduled background write',()=>{
 const c=clock(),h=setup(c);h.edit('pending');c.advance(1000);h.queue.configure({enabled:false,intervalMs:1000});c.advance(60000);
 assert.equal(h.sent.length,0);assert(h.queue.pending());
});

function geminiFlush(h,prepareCaseDraft,snapshot=record=>record){
 const source=readClientSource();
 const start=source.indexOf('    function flushForServer()');
 const end=source.indexOf('    async function leaveCase()',start);
 const ctx={prepareCaseDraft,autosave:h.queue,automaticSaving:()=>false,Promise,state:{activeCase:{id:'case'},activeSimulationId:'simulation-a'},window:{STCaseContext:{snapshot}}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 return ctx.flushForServer;
}
test('Gemini uses the current manual draft without flushing pending edits to Drive',async()=>{
 const c=clock(),h=setup(c);h.queue.configure({enabled:false});
 const flush=geminiFlush(h,()=>{h.edit('current simulation inputs');return Promise.resolve();});
 const context=await flush();assert.equal(context.id,'case');assert.equal(context.activeSimulationId,'simulation-a');
 assert.equal(h.sent.length,0);assert(h.queue.pending());c.advance(60000);assert.equal(h.sent.length,0);h.queue.reset();
});
test('Gemini preparation blocks invalid drafts but does not require a successful cloud save',async()=>{
 const c=clock(),h=setup(c);h.queue.configure({enabled:false});
 await assert.rejects(geminiFlush(h,()=>Promise.reject(new Error('invalid inputs')))(),/invalid inputs/);
 assert.equal(h.sent.length,0);h.edit('unsaved');
 assert.equal((await geminiFlush(h,()=>Promise.resolve())()).id,'case');assert(h.queue.pending());assert.equal(h.sent.length,0);
 await assert.rejects(geminiFlush(h,()=>Promise.resolve(),()=>{throw Error('context too large');})(),/context too large/);h.queue.reset();
});
