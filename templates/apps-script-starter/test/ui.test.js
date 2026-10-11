import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import postcss from 'postcss';
import {render} from '../scripts/render.mjs';
import {server,project} from './helpers.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await tick();}assert(predicate(),'UI did not settle');}
async function setup(){
  const backend=server(),errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(render(),{url:'https://starter.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.matchMedia=()=>({matches:false,addEventListener(){}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:(target,key)=>target[key]||((...args)=>w.setTimeout(()=>{try{success(backend.call(key,...JSON.parse(JSON.stringify(args))));}catch(error){failure(error);}},0))});}
    w.google={script:{run:runner()}};
  }});
  await new Promise(resolve=>dom.window.addEventListener('load',resolve));
  const d=dom.window.document,el=id=>d.getElementById(id);
  const click=async id=>{el(id).click();await tick();await until(()=>el('request-progress').classList.contains('hidden'));};
  const input=(id,value)=>{el(id).value=value;el(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  return {backend,dom,d,el,click,input,errors};
}
test('standalone template resolves includes, parses scripts/styles and has unique control IDs',()=>{
  const html=render();assert(!html.includes('<?'));const dom=new JSDOM(html);
  for(const script of dom.window.document.querySelectorAll('script'))new Function(script.textContent);
  for(const style of dom.window.document.querySelectorAll('style'))postcss.parse(style.textContent);
  const ids=[...dom.window.document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);dom.window.close();
});
test('UI creates, edits, filters, reloads and deletes projects without interpreting user text as markup',async()=>{
  const h=await setup();try{
    await h.click('sign-in');assert(!h.el('application').classList.contains('hidden'));await h.click('new-project');
    const name='<img src=x onerror=alert(1)> Project';h.input('project-name',name);h.input('project-description','First draft');await h.click('save-project');
    assert.equal(h.backend.call('listProjects').data.length,1);assert(!h.el('project-list').querySelector('img'));assert.equal(h.el('project-list').querySelector('strong').textContent,name);assert.equal(h.el('project-list').querySelector('button').disabled,false);
    h.input('project-description','Updated description');await h.click('save-project');assert.equal(h.backend.call('listProjects').data[0].revision,2);
    h.input('project-search','not present');assert(!h.el('empty-state').classList.contains('hidden'));h.input('project-search','');
    await h.click('close-editor');h.el('project-list').querySelector('button').click();await until(()=>h.el('project-description').value==='Updated description');
    h.input('project-description','Unsaved');await h.click('close-editor');h.d.querySelector('dialog:not(#settings-dialog) button').click();assert.equal(h.el('project-description').value,'Unsaved');
    await h.click('reload-project');h.d.querySelector('dialog:not(#settings-dialog) button:last-child').click();await until(()=>h.el('project-description').value==='Updated description');
    await h.click('delete-project');h.d.querySelector('dialog:not(#settings-dialog) button:last-child').click();await until(()=>h.backend.call('listProjects').data.length===0);assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
});
test('UI retains a conflicting draft, saves preferences and clears account data on sign out',async()=>{
  const h=await setup();try{
    const record=h.backend.call('createProject',project).data;await h.click('sign-in');h.el('project-list').querySelector('button').click();await until(()=>h.el('project-name').value===project.name);
    h.backend.call('saveProject',{...project,id:record.id,expectedRevision:1,name:'Remote edit'});h.input('project-name','Local draft');await h.click('save-project');assert.match(h.el('editor-error').textContent,/changed elsewhere/);assert.equal(h.el('project-name').value,'Local draft');
    await h.click('open-settings');h.el('theme').value='dark';h.el('accent').value='teal';await h.click('save-settings');assert.equal(h.d.documentElement.dataset.theme,'dark');assert.equal(h.backend.call('getBootstrap').data.preferences.accent,'teal');
    await h.click('sign-out');h.d.querySelector('dialog:not(#settings-dialog) button:last-child').click();await until(()=>h.el('application').classList.contains('hidden'));assert.equal(h.el('project-list').children.length,0);assert.equal(h.el('account-label').textContent,'');assert.deepEqual(h.errors,[]);
  }finally{h.dom.window.close();}
});
