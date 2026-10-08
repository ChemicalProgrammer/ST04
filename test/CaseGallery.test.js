import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function setup(grid){
 const dom=new JSDOM('<div id="cases-list"></div><div id="case-pagination"></div><input id="case-search"><select id="case-filter"><option value="all">All</option></select><select id="case-sort"><option value="name">Name</option></select><span id="case-count"></span><button id="case-layout"></button>',{runScripts:'outside-only'}),w=dom.window;
 w.STPreferences={read:()=>grid?'grid':'list',write(){}};w.STIcons={svg:()=>'<svg viewBox="0 0 24 24"><path d="M3 7h18v13H3Z"/></svg>'};w.__ST_TEXT__=key=>' '+key;w.eval(fs.readFileSync('apps-script/CaseGallery.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1]);
 const opened=[],cloned=[],deleted=[];w.STCaseGallery.render([{id:'one',name:'Case One',equipmentCount:13,isSimulationReady:true,updatedAt:'2026-10-08T21:00:00Z'}],id=>opened.push(id),id=>cloned.push(id),{deleteCase:id=>deleted.push(id)});
 return {dom,w,opened,cloned,deleted};
}
test('list and grid cases open from the card, folder, metadata and native title button exactly once',()=>{
 for(const grid of [false,true]){const h=setup(grid);try{for(const selector of ['.case-row','.case-glyph svg path','.case-description','.case-date','.badge','.open-case']){h.w.document.querySelector(selector).dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));}assert.deepEqual(h.opened,Array(6).fill('one'));const button=h.w.document.querySelector('.open-case');assert.equal(button.tagName,'BUTTON');assert.equal(button.type,'button');assert(h.w.document.getElementById(button.getAttribute('aria-describedby')));assert.equal(h.w.document.querySelector('.case-glyph').getAttribute('aria-hidden'),'true');assert.equal(h.w.document.querySelector('time').dateTime,'2026-10-08T21:00:00.000Z');}finally{h.dom.window.close();}}
});
test('clone, delete and their icon clicks never open the case',()=>{
 const h=setup(true);try{h.w.document.querySelector('.clone-case svg path').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));h.w.document.querySelector('.delete-gallery-case svg path').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));h.w.document.querySelector('.case-tools').click();assert.deepEqual(h.cloned,['one']);assert.deepEqual(h.deleted,['one']);assert.deepEqual(h.opened,[]);}finally{h.dom.window.close();}
});
