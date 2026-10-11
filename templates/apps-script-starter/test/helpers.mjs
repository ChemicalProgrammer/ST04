import vm from 'node:vm';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {read,sourceDirectory} from '../scripts/render.mjs';
export function server(){
  let email='one@example.test',effective=email;
  const properties=new Map(),folders=new Map(),fail={writes:false,lock:false};
  const iterator=items=>{let index=0;return {hasNext:()=>index<items.length,next:()=>items[index++]};};
  function props(){if(!properties.has(email))properties.set(email,new Map());return properties.get(email);}
  function file(name,content){return {name,content,trashed:false,getName(){return this.name;},getBlob(){return {getDataAsString:()=>this.content};},setContent(value){if(fail.writes)throw Error('Offline storage');this.content=value;},setTrashed(value){if(fail.writes)throw Error('Offline storage');this.trashed=value;}};}
  function folder(name){const result={id:randomUUID(),name,files:[],trashed:false,getId(){return this.id;},isTrashed(){return this.trashed;},getFiles(){return iterator(this.files.filter(f=>!f.trashed));},getFilesByName(name){return iterator(this.files.filter(f=>!f.trashed&&f.name===name));},createFile(name,content){if(fail.writes)throw Error('Offline storage');const value=file(name,content);this.files.push(value);return value;}};folders.set(result.id,result);return result;}
  const context=vm.createContext({console:{error(){}},Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>effective})},PropertiesService:{getUserProperties:()=>({getProperty:key=>props().get(key)||null,setProperty:(key,value)=>props().set(key,value)})},DriveApp:{createFolder:folder,getFolderById:id=>{if(!folders.has(id))throw Error('No access');return folders.get(id);}},LockService:{getUserLock:()=>({tryLock:()=>!fail.lock,releaseLock(){}})},Utilities:{getUuid:randomUUID},MimeType:{PLAIN_TEXT:'text/plain'}});
  fs.readdirSync(sourceDirectory).filter(name=>name.endsWith('.gs')).forEach(name=>vm.runInContext(read(name),context));
  return {context,fail,folders,properties,account(value,as=value){email=value;effective=as;},call(name,...args){return JSON.parse(JSON.stringify(context[name](...args)));}};
}
export const project={name:'Quarterly planning',description:'Agree on the next steps.',status:'PLANNED',dueDate:'2026-12-15'};
