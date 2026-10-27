import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const faq=fs.readFileSync('apps-script/Faq.html','utf8'),web=fs.readFileSync('apps-script/WebApp.html','utf8'),basic=fs.readFileSync('apps-script/BasicMode.html','utf8');
test('FAQ opens from the toolbar, switches language and restores focus after closing',()=>{
 const dom=new JSDOM('<!doctype html><button id="faq-gallery" data-faq-trigger>?</button><button id="faq-header-settings"></button>'+faq,{runScripts:'outside-only'}),w=dom.window,d=w.document;try{
  w.STSettings={open(){}};
  const dialog=d.getElementById('faq-dialog');dialog.showModal=function(){this.open=true;};dialog.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(faq.match(/<script>([\s\S]*)<\/script>/)[1]);d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const b=d.getElementById('faq-gallery');b.focus();b.click();assert(dialog.open);assert(b.querySelector('svg'));assert.equal(d.querySelectorAll('#faq-answers > details').length,6);
  assert(d.getElementById('faq-answers').textContent.includes('MTBFᵢ / (MTBFᵢ + MTTRᵢ)'));
  assert(d.getElementById('faq-answers').textContent.includes('No solicita automáticamente una nueva rampa'));
  const language=d.getElementById('faq-language');language.value='en';language.dispatchEvent(new w.Event('change'));assert.equal(dialog.lang,'en');assert.equal(d.getElementById('faq-title').textContent,'Frequently asked questions');assert(d.getElementById('faq-answers').textContent.includes('comparison-only'));
  d.getElementById('faq-close').click();assert(!dialog.open);assert.equal(d.activeElement,b);
 }finally{w.close();}
});
test('FAQ controls sit next to Settings in gallery, advanced header and basic header',()=>{
 const dom=new JSDOM(web.replace(/<\?[\s\S]*?\?>/g,'')),d=dom.window.document;try{
 assert.equal(d.getElementById('cases-settings').nextElementSibling.id,'faq-gallery');
 assert.equal(d.getElementById('faq-header-settings').nextElementSibling.id,'faq-header');
 assert.match(basic,/\['open-settings',[^\n]+\['faq-gallery','FAQ \/ Preguntas frecuentes'/);
 assert(web.indexOf("include_('Faq')")<web.indexOf('includeClient_()'));
 for(const id of ['faq-gallery','faq-header']){assert.equal(d.getElementById(id).getAttribute('aria-controls'),'faq-dialog');assert.equal(d.getElementById(id).getAttribute('aria-haspopup'),'dialog');}
 }finally{dom.window.close();}
});
