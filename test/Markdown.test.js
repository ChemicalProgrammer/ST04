import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function renderer(){const dom=new JSDOM('<div id="body"></div>',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync('apps-script/Markdown.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));return {dom,body:dom.window.document.getElementById('body'),render:text=>dom.window.STMarkdown.render(text,dom.window.document.getElementById('body'))};}
test('Markdown renders engineering headings, emphasis, lists, tables, quotes and code',()=>{
 const h=renderer();try{
 h.render('# Diagnóstico\n\n**OEE** y *throughput* con `seed`.\n\n- Primer cambio\n- Segundo cambio\n\n| Variable | Valor |\n| --- | ---: |\n| OEE | 42.5% |\n\n> Hipótesis\n\n```json\n{"seed":123}\n```');
 assert.equal(h.body.querySelector('h1').textContent,'Diagnóstico');assert.equal(h.body.querySelector('strong').textContent,'OEE');assert.equal(h.body.querySelector('em').textContent,'throughput');assert.equal(h.body.querySelectorAll('li').length,2);assert.equal(h.body.querySelector('tbody td').textContent,'OEE');assert.equal(h.body.querySelector('blockquote').textContent,'Hipótesis');assert.equal(h.body.querySelector('pre code').textContent,'{"seed":123}');
 h.render('Primer párrafo.\n\nSegundo párrafo.');assert.equal(h.body.textContent,'Primer párrafo.\n\nSegundo párrafo.');
 }finally{h.dom.window.close();}
});
test('Markdown displays untrusted HTML as text and rejects executable links',()=>{
 const h=renderer();try{
 h.render('<img src=x onerror=alert(1)>\n\n[bad](javascript:alert) [data](data:text/html,evil) [good](https://example.test) **<script>evil</script>**');
 assert.equal(h.body.querySelector('img,script'),null);assert.equal(h.body.querySelectorAll('a').length,1);assert.equal(h.body.querySelector('a').getAttribute('rel'),'noopener noreferrer');assert(h.body.textContent.includes('<img'));assert.equal(h.body.querySelector('strong').textContent,'<script>evil</script>');
 }finally{h.dom.window.close();}
});
