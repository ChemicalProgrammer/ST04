import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const load=()=>{const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync('apps-script/RunOptions.html','utf8').replace(/<\/?script>/g,''));return dom.window.STRunOptions;};
test('duration units and shift counts resolve to elapsed seconds without stop events',()=>{const api=load();assert.equal(api.resolve({method:'FIXED',amount:30,unit:'DAYS'}),2592000);assert.equal(api.resolve({method:'FIXED',amount:.3,unit:'SECONDS'}),.5);assert.equal(api.resolve({method:'FIXED',amount:2,unit:'WEEKS'}),1209600);assert.equal(api.resolve({method:'SHIFTS',shiftCount:90,shiftHours:8}),2592000);assert.throws(()=>api.resolve({method:'FIXED',amount:0,unit:'DAYS'}),/positive/);});
test('date ranges use the requested timezone, reject invalid local dates and require positive ranges',()=>{const api=load();const start='2026-10-01T00:00',end='2026-10-31T00:00';assert.equal(new Date(api.zonedTimestamp(start,'America/Mexico_City')).toISOString(),'2026-10-01T06:00:00.000Z');assert.equal(api.resolve({method:'DATES',start,end,timeZone:'America/Mexico_City'}),2592000);assert.throws(()=>api.resolve({method:'DATES',start:end,end:start,timeZone:'UTC'}),/follow/);assert.throws(()=>api.zonedTimestamp('2026-02-30T00:00','UTC'),/Invalid date/);assert.throws(()=>api.zonedTimestamp('2026-03-08T02:30','America/New_York'),/does not exist/);});



test('simulation failure toggle restores independent run values and locks during execution',()=>{
 const dom=new JSDOM(fs.readFileSync('apps-script/WebApp.html','utf8'),{runScripts:'outside-only'}),w=dom.window;
 try{
  w.eval(fs.readFileSync('apps-script/RunOptions.html','utf8').replace(/<\/?script>/g,''));
  const toggle=w.document.getElementById('run-reliability-enabled');
  assert(toggle.closest('#run-panel'));assert(!toggle.closest('#settings-dialog'));
  assert.equal(w.document.getElementById('settings-reliability-enabled'),null);
  const a={durationSeconds:600,durationMode:'FIXED',reliabilityEnabled:false},b={durationSeconds:600,durationMode:'FIXED'};
  w.STRunOptions.apply(a);assert.equal(toggle.checked,false);
  w.STRunOptions.apply(b);assert.equal(toggle.checked,true);
  w.STRunOptions.apply(a);assert.equal(toggle.checked,false);
  w.STRunOptions.sync(true);assert.equal(toggle.disabled,true);
  w.STRunOptions.sync(false);assert.equal(toggle.disabled,false);
  assert.equal(a.reliabilityEnabled,false);assert.equal(b.reliabilityEnabled,undefined);
 }finally{w.close();}
});
