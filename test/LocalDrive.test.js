import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createLocalCaseStore} from '../src/local-drive/Store.js';
function missing(){return Object.assign(Error('Missing'),{name:'NotFoundError'});}
class Directory{
 constructor(dir,stats){this.dir=dir;this.stats=stats;this.kind='directory';}
 async getDirectoryHandle(name,{create=false}={}){const dir=path.join(this.dir,name);if(create)await fs.mkdir(dir,{recursive:true});try{await fs.access(dir);}catch(_){throw missing();}return new Directory(dir,this.stats);}
 async getFileHandle(name,{create=false}={}){const file=path.join(this.dir,name),stats=this.stats;if(create){try{await fs.access(file);}catch(_){await fs.writeFile(file,'');}}else{try{await fs.access(file);}catch(_){throw missing();}}
  return {kind:'file',getFile:async()=>({text:()=>fs.readFile(file,'utf8')}),createWritable:async()=>({write:async text=>{if(stats.fail===name)throw Error('DISK_WRITE_FAILED');await fs.writeFile(file+'.pending',text);},close:async()=>{await fs.rename(file+'.pending',file);stats.writes.push(name);},abort:async()=>{await fs.rm(file+'.pending',{force:true});}})};
 }
 async *entries(){for(const d of await fs.readdir(this.dir,{withFileTypes:true}))yield [d.name,d.isDirectory()?new Directory(path.join(this.dir,d.name),this.stats):{kind:'file'}];}
 async removeEntry(name,{recursive=false}={}){await fs.rm(path.join(this.dir,name),{recursive});}
}
async function setup(){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'st-local-')),stats={writes:[]},store=createLocalCaseStore(new Directory(dir,stats),{workspaceId:'drive-id',email:'owner@test'});return {store,stats,dir,close:()=>fs.rm(dir,{recursive:true,force:true})};}
const record=()=>({id:'case-a',name:'Local line',ownerEmail:'owner@test',revision:1,equipment:[{id:'m',name:'M'}],simulations:[{id:'simulation-a',name:'A',equipment:[{id:'m',speed:10}],dynamicConfig:{seed:1}},{id:'simulation-b',name:'B',equipment:[{id:'m',speed:20}]}]});
test('local saves overwrite the same simulation file and leave unchanged files alone',async()=>{const h=await setup();try{
 const first=await h.store.save(record(),{create:true}),before=await fs.readdir(path.join(h.dir,'SimulatorTemplate Cases','case-a'));h.stats.writes=[];
 first.expectedRevision=first.revision;first.simulations[0].name='Renamed';first.simulations[0].equipment[0].speed=25;const saved=await h.store.save(first);
 assert.deepEqual(await fs.readdir(path.join(h.dir,'SimulatorTemplate Cases','case-a')),before);assert(!h.stats.writes.includes('simulation-simulation-b.json'));assert.equal((await h.store.get('case-a')).simulations[0].equipment[0].speed,25);assert.equal(saved.revision,2);assert.equal((await h.store.catalog()).length,1);
 await assert.rejects(h.store.save(first),/CASE_CONFLICT/);
 }finally{await h.close();}});
test('legacy Drive file references are kept, traversal and another owner are rejected',async()=>{const h=await setup();try{
 await h.store.save(record(),{create:true});const folder=path.join(h.dir,'SimulatorTemplate Cases','case-a'),manifest=path.join(folder,'case-a.case.json');const header=JSON.parse(await fs.readFile(manifest,'utf8'));await fs.rename(path.join(folder,header.simulationFiles[0].fileName),path.join(folder,'abc123-simulation-1.json'));header.simulationFiles[0].fileName='abc123-simulation-1.json';await fs.writeFile(manifest,JSON.stringify(header));const next=await h.store.get('case-a');next.expectedRevision=next.revision;next.simulations[0].name='Changed';await h.store.save(next);assert.equal(JSON.parse(await fs.readFile(manifest,'utf8')).simulationFiles[0].fileName,'abc123-simulation-1.json');
 await assert.rejects(h.store.get('../escape'),/INVALID_LOCAL_ID/);await assert.rejects(h.store.save({...next,ownerEmail:'other@test'}),/INVALID_LOCAL_CASE/);
 }finally{await h.close();}});
test('failed local writes retain the last committed file and return no save acknowledgement',async()=>{const h=await setup();try{
 const next=await h.store.save(record(),{create:true});next.expectedRevision=next.revision;next.simulations[0].name='Not committed';h.stats.fail='simulation-simulation-a.json';await assert.rejects(h.store.save(next),/DISK_WRITE_FAILED/);assert.equal((await h.store.get('case-a')).simulations[0].name,'A');assert.equal((await h.store.get('case-a')).revision,1);
 }finally{await h.close();}});

test('a failure on a later simulation rolls earlier overwritten files back',async()=>{const h=await setup();try{
 const next=await h.store.save(record(),{create:true});next.expectedRevision=next.revision;next.simulations[0].name='First changed';next.simulations[1].name='Second changed';h.stats.fail='simulation-simulation-b.json';await assert.rejects(h.store.save(next),/DISK_WRITE_FAILED/);const restored=await h.store.get('case-a');assert.equal(restored.simulations[0].name,'A');assert.equal(restored.simulations[1].name,'B');assert.equal(restored.revision,1);
 }finally{await h.close();}});
