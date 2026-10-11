// Local preview of the modular WebApp.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function readClientSource(repositoryRoot = root) {
  const read = name => fs.readFileSync(path.join(repositoryRoot,'apps-script',name+'.html'),'utf8');
  function expand(source) {
    return source.replace(/<\?!=\s*include_\('([A-Za-z0-9]+)'\);\s*\?>/g,(_,name)=>expand(read(name)));
  }
  return expand(read('Client'));
}
export function renderAppsScript(repositoryRoot = root) {
  const directory = path.join(repositoryRoot, 'apps-script');
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
  const context = vm.createContext({
    HtmlService:{createTemplateFromFile:name=>({getRawContent:()=>read(name+'.html')})},
    __previewEscape:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  });
  for(const file of ['TextResources.gs','DeveloperConfig.gs','Main.gs'])vm.runInContext(read(file),context);
  const template=context.resolveTextResources_(read('WebApp.html'));
  let body='var __previewParts=[];\n',previous=0;
  for(const match of template.matchAll(/<\?(!=|=)?([\s\S]*?)\?>/g)) {
    body+='__previewParts.push('+JSON.stringify(template.slice(previous,match.index))+');\n';
    const expression=match[2].trim().replace(/;$/,'');
    body+=match[1]?'__previewParts.push('+(match[1]==='='?'__previewEscape('+expression+')':expression)+');\n':match[2]+'\n';
    previous=match.index+match[0].length;
  }
  body+='__previewParts.push('+JSON.stringify(template.slice(previous))+');\n__previewParts.join("");';
  const html=vm.runInContext(body,context);
  if(html.includes('<?'))throw Error('Unresolved WebApp template expression.');
  const server=fs.readdirSync(directory).filter(name=>name.endsWith('.gs')).sort()
    .map(name=>'// Source: apps-script/'+name+'\n'+read(name)).join('\n');
  return {html,server};
}
