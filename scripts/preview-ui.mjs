// Local-only preview using synthetic demo data. Never included in the Apps Script bundle.
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { renderAppsScript } from './render-apps-script.mjs';
const context={}; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../apps-script/DemoCaseFactory.gs',import.meta.url),'utf8'),context);
const demo=context.createDemoCaseRequest_();
demo.id='preview-case';demo.revision=1;demo.createdAt=demo.updatedAt=new Date().toISOString();
const mock=`<script>
(function(){
var demo=${JSON.stringify(demo)}, cases=[demo], settings={workspaceRootFolderId:'synthetic-preview',preferredPlaybackRate:10};
function copy(v){return JSON.parse(JSON.stringify(v));}
var api={
 getBootstrap:function(){return {user:{email:'preview@example.test'},settings:settings,cases:cases.map(function(c){return {id:c.id,name:c.name,equipmentCount:c.equipment.length,isSimulationReady:c.equipment.length>1,updatedAt:c.updatedAt};})};},
 getCase:function(id){return copy(cases.find(c=>c.id===id));},
 saveCase:function(c){c=copy(c);c.revision=(c.revision||0)+1;c.updatedAt=new Date().toISOString();cases=cases.map(x=>x.id===c.id?c:x);return c;},
 saveUserSettings:function(s){settings=s;return s;},
 createCase:function(c){c=Object.assign({equipment:[],revision:1,updatedAt:new Date().toISOString()},c,{id:'preview-'+Date.now()});cases.push(c);return copy(c);},
 createDemoCase:function(){var c=copy(demo);c.id='demo-'+Date.now();cases.push(c);return c;},
 cloneCase:function(id){var source=cases.find(c=>c.id===id),record=copy(source);record.id='copy-'+Date.now();record.name='Copy of '+source.name;record.revision=1;record.updatedAt=new Date().toISOString();cases.push(record);return {id:record.id,name:record.name,equipmentCount:record.equipment.length,isSimulationReady:record.equipment.length>1,updatedAt:record.updatedAt};},
 deleteCase:function(id){cases=cases.filter(c=>c.id!==id);return {id:id};},
};
function runner(success,failure){return new Proxy({withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn)},{get:function(target,key){return target[key]||function(...args){setTimeout(function(){try{if(!api[key])throw new Error('Unmocked method: '+key);success({ok:true,data:api[key](...args)});}catch(e){console.error(e);failure(e);}},50);};}});}
window.google={script:{run:runner()}};
})();
</script>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(renderAppsScript().html.replace('<head>','<head>'+mock));});
server.listen(8765,'0.0.0.0',()=>console.log('Synthetic UI preview: http://127.0.0.1:8765'));
