import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

function setup(){
 const dom=new JSDOM('<html class="restoring-session"><body><section id="auth-panel" class="hidden"><p id="auth-status"></p><button id="sign-in-button" disabled>Sign in</button></section><main id="application" class="hidden"></main></body></html>',{runScripts:'outside-only'});
 const w=dom.window,timers=new Map();let id=0,failures=0;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};w.clearTimeout=id=>timers.delete(id);
 w.addEventListener('st-startup-failure',()=>failures++);
 const source=fs.readFileSync('apps-script/UiPreferences.html','utf8');
 w.eval(source.slice(source.indexOf('window.STStartup='),source.indexOf('// Browser preferences')));
 return {dom,w,timers,get failures(){return failures;}};
}
test('startup timeout reveals an error and stops the remembered-session screen',()=>{
 const h=setup();
 try{
   const timer=[...h.timers.values()][0];assert.equal(timer.ms,45000);timer.fn();
   assert(!h.w.document.documentElement.classList.contains('restoring-session'));
   assert.match(h.w.document.getElementById('auth-status').textContent,/45 seconds/);
   assert.equal(h.w.document.getElementById('sign-in-button').disabled,false);
   assert.equal(h.failures,1);
 }finally{h.dom.window.close();}
});
test('early script errors are visible and completed startups ignore later unrelated errors',()=>{
 const h=setup();
 try{
   h.w.dispatchEvent(new h.w.ErrorEvent('error',{message:'STDialog is not defined',error:new h.w.ReferenceError('STDialog is not defined')}));
   assert.match(h.w.document.getElementById('auth-status').textContent,/STDialog is not defined/);
   assert.equal(h.failures,1);
   h.w.STStartup.start();h.w.STStartup.ready();assert.equal(h.timers.size,0);
   h.w.dispatchEvent(new h.w.ErrorEvent('error',{message:'An unrelated chart error'}));assert.equal(h.failures,1);
 }finally{h.dom.window.close();}
});
