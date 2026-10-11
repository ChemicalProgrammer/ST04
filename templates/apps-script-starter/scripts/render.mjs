import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export const sourceDirectory=fileURLToPath(new URL('../apps-script/',import.meta.url));
export function read(name){return fs.readFileSync(new URL('../apps-script/'+name,import.meta.url),'utf8');}
export function render(){return read('WebApp.html').replace(/<\?!=\s*include_\('([A-Za-z]+)'\);\s*\?>/g,(_,name)=>read(name+'.html'));}
