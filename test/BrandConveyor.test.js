import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
import {renderAppsScript} from '../scripts/render-apps-script.mjs';

test('brand motion shares speed across welcome/About, excludes editing and pauses while hidden',async()=>{
 const dom=new JSDOM(renderAppsScript().html,{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 try{
  await new Promise(resolve=>w.addEventListener('load',resolve));
  const context=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),context);
  const nodes=[...d.querySelectorAll('.brand-conveyor')],animations=nodes.map(()=>({rate:1,state:'running',updatePlaybackRate(rate){this.rate=rate;},pause(){this.state='paused';},play(){this.state='running';}}));
  assert.equal(nodes.length,2);nodes.forEach((node,i)=>{node.getAnimations=()=>[animations[i]];});
  w.eval(context.resolveTextResources_(fs.readFileSync('apps-script/BrandConveyorMotion.html','utf8')).replace(/<\/?script>/g,''));d.dispatchEvent(new w.Event('DOMContentLoaded'));
  function press(key,target=d.body,extra={}){const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;}
  press('+');assert.equal(w.STBrandConveyor.speed(),1.5);assert.equal(animations[0].rate,1.5);assert.equal(animations[1].state,'paused');
  press('-',d.getElementById('gemini-question'));assert.equal(w.STBrandConveyor.speed(),1.5);press('-',d.body,{ctrlKey:true});assert.equal(w.STBrandConveyor.speed(),1.5);
  for(let i=0;i<20;i++)press('+');assert.equal(w.STBrandConveyor.speed(),4);for(let i=0;i<20;i++)press('-');assert.equal(w.STBrandConveyor.speed(),.25);
  d.getElementById('auth-panel').classList.add('hidden');await new Promise(resolve=>w.setTimeout(resolve,0));assert.equal(animations[0].state,'paused');assert(!press('+').defaultPrevented);
  d.getElementById('app-info-dialog').open=true;await new Promise(resolve=>w.setTimeout(resolve,0));assert.equal(animations[1].state,'running');press('+');assert.equal(w.STBrandConveyor.speed(),.5);assert.equal(animations[1].rate,.5);
  assert(nodes[1].title.includes('0.5×'));assert.equal(nodes[1].tabIndex,0);
  const css=fs.readFileSync('apps-script/BrandConveyorStyles.html','utf8');assert.match(css,/fill:var\(--accent\)/);assert.match(css,/stroke:var\(--secondary\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/stroke-dashoffset:-28/);
 }finally{w.close();}
});
