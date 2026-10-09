import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
import {renderAppsScript} from '../scripts/render-apps-script.mjs';

test('brand motion shares speed across welcome/About, excludes editing and pauses while hidden',async()=>{
 const dom=new JSDOM(renderAppsScript().html,{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 try{
  await new Promise(resolve=>w.addEventListener('load',resolve));
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),context);
  const nodes=[...d.querySelectorAll('.brand-conveyor')],animations=nodes.map(()=>({rate:1,currentTime:450,effect:{getTiming:()=>({duration:1800})},state:'running',updatePlaybackRate(rate){this.rate=rate;},pause(){this.state='paused';},play(){this.state='running';}}));
  assert.equal(nodes.length,2);nodes.forEach((node,i)=>{node.getAnimations=()=>[animations[i]];});
  w.eval(context.resolveTextResources_(fs.readFileSync('apps-script/BrandConveyorMotion.html','utf8')).replace(/<\/?script>/g,''));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  function press(key,target=d.body,extra={}){const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;}
  press('+');assert.equal(w.STBrandConveyor.speed(),1.5);assert.equal(animations[0].rate,1.5);assert.equal(animations[1].state,'paused');
  press('ArrowLeft');assert.equal(w.STBrandConveyor.direction(),'left');assert.equal(nodes[0].dataset.direction,'left');assert.equal(animations[0].currentTime,1350);assert.equal(animations[0].rate,1.5);
  press('ArrowRight',d.getElementById('gemini-question'));assert.equal(w.STBrandConveyor.direction(),'left');
  press('ArrowRight');assert.equal(w.STBrandConveyor.direction(),'right');assert.equal(animations[0].currentTime,450);
  press('-',d.getElementById('gemini-question'));assert.equal(w.STBrandConveyor.speed(),1.5);press('-',d.body,{ctrlKey:true});assert.equal(w.STBrandConveyor.speed(),1.5);
  for(let i=0;i<20;i++)press('+');assert.equal(w.STBrandConveyor.speed(),4);for(let i=0;i<20;i++)press('-');assert.equal(w.STBrandConveyor.speed(),.25);
  d.getElementById('auth-panel').classList.add('hidden');await new Promise(resolve=>w.setTimeout(resolve,0));assert.equal(animations[0].state,'paused');assert(!press('+').defaultPrevented);
  d.getElementById('app-info-dialog').open=true;await new Promise(resolve=>w.setTimeout(resolve,0));assert.equal(animations[1].state,'running');press('+');assert.equal(w.STBrandConveyor.speed(),.5);assert.equal(animations[1].rate,.5);
  press('ArrowLeft');assert.equal(nodes[1].dataset.direction,'left');assert.equal(animations[1].rate,.5);
  assert(nodes[1].title.includes('0.5×'));assert(nodes[1].title.includes('←'));
  const css=fs.readFileSync('apps-script/BrandConveyorStyles.html','utf8');assert.match(css,/fill:var\(--accent\)/);assert.match(css,/fill:var\(--secondary\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert(!/opacity|gradient|stroke|border|shadow|outline/.test(css));
  assert.equal(nodes[0].querySelectorAll('.brand-bottles path').length,8,'seven visible bottles plus one entering the loop');
  assert.equal(nodes[1].parentElement,d.querySelector('.app-info-brand'),'animation and icon share the same centered flex row');
 }finally{w.close();}
});

async function interactiveHarness(isReduced=false){
 const dom=new JSDOM(renderAppsScript().html,{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 await new Promise(resolve=>w.addEventListener('load',resolve));
 let clock=100,id=0;const frames=new Map(),timers=new Map(),media={matches:isReduced,addEventListener(){}};
 w.matchMedia=()=>media;w.performance.now=()=>clock;
 w.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};w.cancelAnimationFrame=key=>frames.delete(key);
 w.setTimeout=(callback,delay)=>{timers.set(++id,{callback,due:clock+delay});return id;};w.clearTimeout=key=>timers.delete(key);
 const node=d.querySelector('.brand-conveyor'),svg=node.querySelector('svg');svg.getBoundingClientRect=()=>({left:0,top:0,width:208,height:48});
 const context=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),context);
 w.eval(context.resolveTextResources_(fs.readFileSync('apps-script/BrandConveyorMotion.html','utf8')).replace(/<\/?script>/g,''));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const paths=()=>[...node.querySelectorAll('.brand-bottles path')],x=path=>Number(path.getAttribute('transform').match(/translate\(([-\d.]+)/)[1]);
 function advance(ms){for(let remaining=ms;remaining>0;){const dt=Math.min(20,remaining);clock+=dt;remaining-=dt;for(const [key,timer] of [...timers])if(timer.due<=clock){timers.delete(key);timer.callback();}const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(clock));}}
 function pointer(type,target=node,point={x:100,y:15}){const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:point.x,clientY:point.y});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);}
 function key(value,target=node){const event=new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true});target.dispatchEvent(event);return event;}
 return {w,d,node,paths,x,advance,pointer,key,frames,media,close:async()=>{await Promise.resolve();w.close();}};
}

test('interactive conveyor accumulates without overlap, releases and reverses without jumps',async()=>{
 const h=await interactiveHarness();try{
  const held=h.paths()[4],origin=h.x(held);h.pointer('pointerdown',held);h.advance(7000);
  assert.equal(h.x(held),origin,'held bottle remains fixed while the belt runs');
  const positions=h.paths().map(h.x).sort((a,b)=>a-b);for(let i=1;i<positions.length;i++)assert(positions[i]-positions[i-1]>=15.999,'bottles do not overlap in the queue');
  assert(h.paths().some(path=>Math.abs(h.x(path)-(origin-16))<.001),'upstream bottles accumulate against the held bottle');
  assert(h.paths().length<=15,'accumulation has a bounded pool');
  h.pointer('pointerup');h.advance(1000);assert(h.x(held)>origin,'released bottles resume transport');
  const before=h.x(held);h.key('ArrowLeft');assert.equal(h.x(held),before,'reversal does not relocate bottles');h.advance(600);assert(h.x(held)<before);
  h.pointer('pointerdown',held);h.advance(3000);const reversed=h.paths().map(h.x).sort((a,b)=>a-b);for(let i=1;i<reversed.length;i++)assert(reversed[i]-reversed[i-1]>=15.999);
  h.pointer('pointercancel');assert(!h.node.hasAttribute('data-holding'));
 }finally{await h.close();}
});

test('bottle gestures distinguish domino, robot and removal, including cancellation',async()=>{
 const h=await interactiveHarness();try{
  const clicked=h.paths()[4];h.pointer('pointerdown',clicked);h.pointer('pointerup');h.advance(500);
  assert(!clicked.getAttribute('transform').includes('rotate(0 '),'single click tilts the first bottle');
  assert(h.paths().filter(path=>!path.getAttribute('transform').includes('rotate(0 ')).length>=2,'domino propagates downstream');
  h.advance(1500);assert(h.paths().every(path=>path.getAttribute('transform').includes('rotate(0 ')),'bottles stand up again');
  const picked=h.paths().find(path=>h.x(path)>70&&h.x(path)<120);h.pointer('pointerdown',picked);h.pointer('pointerup');h.advance(100);h.pointer('pointerdown',picked);h.pointer('pointerup');
  assert.equal(h.node.querySelector('.brand-robot').getAttribute('visibility'),'visible');h.advance(650);
  assert.equal(picked.getAttribute('visibility'),'hidden');assert.equal(h.node.querySelector('.brand-robot-bottle').getAttribute('visibility'),'visible');
  assert(h.paths().every(path=>path.getAttribute('transform').includes('rotate(0 ')),'double click suppresses domino');
  h.advance(900);assert(!picked.isConnected);assert.equal(h.node.querySelector('.brand-robot').getAttribute('visibility'),'hidden');
  const dragged=h.paths()[3];h.pointer('pointerdown',dragged);h.pointer('pointermove',h.node,{x:100,y:-20});assert.equal(h.node.querySelector('.brand-drag-layer').children.length,1);
  h.pointer('pointerup');assert(!dragged.isConnected,'dragging away removes the bottle');assert.equal(h.node.querySelector('.brand-drag-layer').children.length,0);
  const cancelled=h.paths()[3];h.pointer('pointerdown',cancelled);h.pointer('pointermove',h.node,{x:100,y:-20});h.pointer('pointercancel');assert(cancelled.isConnected);assert.equal(cancelled.getAttribute('visibility'),'visible');
  h.key('Escape');assert.equal(h.paths().length,8);assert.deepEqual(h.paths().map(h.x),[-21,7,35,63,91,119,147,175]);
 }finally{await h.close();}
});

test('interactive conveyor pauses when hidden and respects reduced motion and keyboard controls',async()=>{
 const h=await interactiveHarness();try{
  h.key(' ');assert(h.node.hasAttribute('data-holding'));h.key(' ');assert(!h.node.hasAttribute('data-holding'));
  h.key('r');assert.equal(h.node.querySelector('.brand-robot').getAttribute('visibility'),'visible');
  h.d.getElementById('auth-panel').classList.add('hidden');h.w.STBrandConveyor.sync();assert.equal(h.frames.size,0);assert.equal(h.node.querySelector('.brand-robot').getAttribute('visibility'),'hidden');
  const positions=h.paths().map(h.x);h.advance(5000);assert.deepEqual(h.paths().map(h.x),positions);
  h.d.getElementById('app-info-dialog').open=true;h.w.STBrandConveyor.sync();assert.equal(h.frames.size,1,'one loop handles both instances');
 }finally{await h.close();}
 const reduced=await interactiveHarness(true);try{
  assert.equal(reduced.frames.size,0);reduced.key('d');assert(reduced.paths().every(path=>path.getAttribute('transform').includes('rotate(0 ')));
  const bottle=reduced.paths()[4];reduced.pointer('pointerdown',bottle);reduced.pointer('pointermove',reduced.node,{x:100,y:-20});reduced.pointer('pointercancel');assert.equal(bottle.getAttribute('visibility'),'visible');
  reduced.key('r');assert.equal(reduced.paths().length,7,'keyboard robot removes without animated motion');reduced.key('Escape');assert.equal(reduced.paths().length,8);
 }finally{await reduced.close();}
});
