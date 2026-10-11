import test from 'node:test';
import {readClientSource} from '../scripts/render-apps-script.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

function resources() {
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),context);
  return context;
}

test('text resources handle quotes, HTML characters and script terminators safely',()=>{
  const ctx=resources();
  const value='Save "draft" & \'case\' <new> </script>\nNext\u2028line';
  ctx.ST_TEXT_RESOURCES['test.text']=value;
  const js=ctx.resolveTextResources_("__ST_TEXT__('test.text')");
  assert.equal(vm.runInNewContext(js),value);
  assert(!js.includes('</script>'));
  const markup=ctx.resolveTextResources_('<button title="<?= __ST_TEXT__(\'test.text\') ?>"><?= __ST_TEXT__(\'test.text\') ?></button>');
  const dom=new JSDOM(markup),button=dom.window.document.querySelector('button');
  assert.equal(button.title,value);assert.equal(button.textContent,value);
  const fragment=vm.runInNewContext(ctx.resolveTextResources_("__ST_HTML_TEXT__('test.text')"));
  const fragmentDom=new JSDOM('<div>'+fragment+'</div>');
  assert.equal(fragmentDom.window.document.querySelector('div').textContent,value);
  assert.equal(fragmentDom.window.document.querySelector('script'),null);
  dom.window.close();fragmentDom.window.close();
});

test('unknown keys fail explicitly; resource values do not contain view markup',()=>{
  const ctx=resources();
  assert.throws(()=>ctx.resolveTextResources_("__ST_TEXT__('missing.key')"),/Unknown text resource/);
  for(const [key,value] of Object.entries(ctx.ST_TEXT_RESOURCES)) {
    assert.equal(typeof value,'string',key);
    assert(!/<(?:div|button|input|span|table)\b/.test(value),key);
  }
});

test('production includes resolve conveyor attribute templates from raw source before HTML parsing',()=>{
 const ctx=resources();
 ctx.HtmlService={
  createTemplateFromFile:name=>({getRawContent:()=>fs.readFileSync('apps-script/'+name+'.html','utf8')}),
  createHtmlOutputFromFile:()=>{throw Error('Do not parse unresolved resource attributes as HtmlOutput');}
 };
 vm.runInContext(fs.readFileSync('apps-script/Main.gs','utf8'),ctx);
 ctx.ST_TEXT_RESOURCES['brand.motion_label']='Bottles "moving" & <flow> </script>';
 const fragment=ctx.include_('BrandConveyor');assert(!fragment.includes('<?'));assert(!fragment.includes('&lt;?'));
 const dom=new JSDOM(fragment),conveyor=dom.window.document.querySelector('.brand-conveyor');
 assert.equal(conveyor.getAttribute('aria-label'),ctx.ST_TEXT_RESOURCES['brand.motion_label']);assert(!conveyor.hasAttribute('title'));
 assert.equal(dom.window.document.querySelectorAll('script').length,0);assert.equal(conveyor.querySelectorAll('.brand-bottles path').length,8);dom.window.close();
 const webapp=fs.readFileSync('apps-script/WebApp.html','utf8');
 for(const name of new Set([...webapp.matchAll(/include_\('([A-Za-z0-9]+)'\)/g)].map(match=>match[1]))) {
  const included=ctx.include_(name);assert(!included.includes('<?'),name);assert(!/__ST_(?:HTML_)?TEXT__\('/.test(included),name);
 }
});

test('dictionary edits reach static views and dynamic messages through the same resolver',()=>{
  const ctx=resources();
  ctx.ST_TEXT_RESOURCES['client.loading_console']='Preparando espacio de trabajo…';
  const view=ctx.resolveTextResources_(fs.readFileSync('apps-script/WebApp.html','utf8'));
  const controller=ctx.resolveTextResources_(readClientSource());
  assert(view.includes('Preparando espacio de trabajo…'));
  assert(controller.includes('Preparando espacio de trabajo…'));
  assert(!/__ST_(?:HTML_)?TEXT__\('/.test(view));
  assert(!/__ST_(?:HTML_)?TEXT__\('/.test(controller));
  new Function(controller.replace(/<\/?script>/g,''));
});


test('critical machine terminology replaces the legacy name in all interface text',()=>{
  const ctx=resources();
  assert.equal(ctx.ST_TEXT_RESOURCES['equipment.pacemaker'],'Critical machine');
  for(const [key,value] of Object.entries(ctx.ST_TEXT_RESOURCES))assert(!/pacemaker/i.test(value),key);
});


