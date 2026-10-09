import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const owner={email:'owner@example.test'};
function runtime(){
 const folders=new Map(),reads=[],logs=[];let clock=Date.now(),workspace='one',uuid=0;
 const iterator=values=>{let i=0;return {hasNext:()=>i<values.length,next:()=>values[i++]};};
 function folder(id){
  if(folders.has(id))return folders.get(id);
  const files=new Map(),children=new Map();
  const result={files,getName:()=>id.split('/').at(-1),trashed:false,
   getFolders:()=>iterator([...children.values()].filter(f=>!f.trashed)),
   getFoldersByName:name=>iterator([...children.values()].filter(f=>f.getName()===name&&!f.trashed)),
   createFolder(name){const child=folder(id+'/'+name);children.set(name,child);return child;},
   setTrashed(value){result.trashed=value;},
   getFiles:()=>iterator([...files.values()].filter(f=>!f.trashed)),
   getFilesByName:name=>iterator([...files.values()].filter(f=>f.name===name&&!f.trashed)),
   createFile(name,content){
    const file={name,content,modified:++clock,id:id+'-'+name,trashed:false,
     getName:()=>file.name,getId:()=>file.id,getLastUpdated:()=>new Date(file.modified),
     getBlob:()=>{reads.push(file.name);return {getDataAsString:()=>file.content};},
     setContent(value){if(file.fail)throw Error('private index details');file.content=value;file.modified=++clock;},
     setTrashed(value){file.trashed=value;}};
    files.set(name,file);return file;
   }};
  folders.set(id,result);return result;
 }
 const ctx=vm.createContext({console:{error:line=>logs.push(line)},Utilities:{getUuid:()=>String(++uuid),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value)=>Array.from(createHash(algorithm).update(value,'utf8').digest())},
  MimeType:{PLAIN_TEXT:'text/plain'},LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})}});
 for(const name of ['TextResources.gs','ApiResponse.gs','CaseService.gs','CaseIndex.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),ctx);
 ctx.getUserSettings_=()=>({workspaceRootFolderId:workspace});ctx.getWorkspaceFolders_=()=>({cases:folder(workspace)});
 ctx.getGeminiClientConfig_=()=>({configured:false});ctx.getInterfaceMode_=()=> 'BASIC';ctx.requireCurrentUser_=()=>owner;
 ctx.ST_CASE_INDEX_LIMITS.maxReadsPerBatch=2;
 function seed(id,email=owner.email){return folder(workspace).createFile(id+'.case.json',JSON.stringify({id,name:'Case '+id,ownerEmail:email,revision:1,updatedAt:'2026-10-06',equipment:[],simulations:[{id:'sim-a',name:'A',results:{largeReplay:'x'.repeat(100000)}}]}));}
 function refresh(){let result=ctx.refreshCaseCatalog_(owner);while(result.hasMore)result=ctx.refreshCaseCatalog_(owner,result.cursor);return result;}
 return {ctx,seed,refresh,reads,logs,folder:()=>folder(workspace),setWorkspace:id=>{workspace=id;},caseReads:()=>reads.filter(n=>n.endsWith('.case.json')).length};
}

test('cold bootstrap never reads case blobs; the catalog builds in bounded batches',()=>{
 const h=runtime();for(let i=0;i<5;i++)h.seed('case-'+i);
 const bootstrap=h.ctx.getBootstrap();assert(bootstrap.ok);assert.equal(bootstrap.data.cases.length,0);assert(bootstrap.data.caseCatalog.refreshRequired);assert.equal(h.caseReads(),0);
 let page=h.ctx.refreshCaseCatalog_(owner);assert.equal(h.caseReads(),2);assert.equal(page.cases.length,2);assert(page.hasMore);
 page=h.ctx.refreshCaseCatalog_(owner,page.cursor);assert.equal(h.caseReads(),4);assert.equal(page.cases.length,4);
 page=h.ctx.refreshCaseCatalog_(owner,page.cursor);assert.equal(h.caseReads(),5);assert.equal(page.cases.length,5);assert.equal(page.hasMore,false);
 assert(!JSON.stringify(page).includes('largeReplay'));
 const before=h.caseReads();const warm=h.ctx.getBootstrap();assert.equal(warm.data.cases.length,5);assert.equal(h.caseReads(),before);assert(warm.data.caseCatalog.complete);
 h.refresh();assert.equal(h.caseReads(),before,'unchanged case files require no blob reads');
});

test('catalog reads only modified cases, drops deleted files and excludes other owners and malformed JSON',()=>{
 const h=runtime(),a=h.seed('a'),b=h.seed('b');h.seed('foreign','someone@example.test');h.folder().createFile('invalid.case.json','{bad');h.refresh();
 assert.deepEqual(Array.from(h.ctx.getCaseCatalog_(owner).cases,c=>c.id).sort(),['a','b']);
 const changed=JSON.parse(a.content);changed.name='New name';changed.revision=2;a.setContent(JSON.stringify(changed));b.setTrashed(true);
 const reads=h.caseReads();const page=h.refresh();assert.equal(page.cases.length,1);assert.equal(page.cases[0].name,'New name');
 assert.equal(h.caseReads()-reads,3,'one changed file plus the unindexed foreign and malformed files');
 assert.throws(()=>h.ctx.getCase_('foreign',owner),e=>e.simulatorError.code==='CASE_NOT_FOUND');
});

test('create, save and delete update the catalog without rebuilding complete cases',()=>{
 const h=runtime(),created=h.ctx.createCase_({id:'created',name:'New'},owner);assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].name,'New');
 const saved=h.ctx.saveCase_({id:created.id,expectedRevision:1,name:'Renamed',equipment:[]},owner);
 assert.equal(saved.revision,2);assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].revision,2);assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].name,'Renamed');
 h.ctx.deleteCase_(created.id,owner);assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);
});

test('creating a validated scenario updates the catalog revision in the same case write',()=>{
 const h=runtime();
 for(const name of ['PublicDemoCaseFactory.gs','ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),h.ctx);
 h.ctx.createCase_({...h.ctx.createPublicDemoCaseRequest_(),id:'scenario-case'},owner);
 const source=h.ctx.getCase_('scenario-case',owner).simulations[0];
 const proposal=h.ctx.STScenarioEngine_.plan(source).projects.find(p=>p.canApply);assert(proposal);
 h.ctx.createScenario_({caseId:'scenario-case',simulationId:source.id,expectedRevision:1,sourceSignature:h.ctx.STScenarioEngine_.signature(source),proposal:{...proposal,title:'Selected scenario'},origin:'GEMINI'},owner);
 assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].revision,2);
 assert.equal(h.ctx.getCase_('scenario-case',owner).simulations.length,5);
});

test('an index write failure never misreports a successful save, and metadata refresh repairs it',()=>{
 const h=runtime();h.ctx.createCase_({id:'a',name:'Original'},owner);h.refresh();
 const index=h.folder().files.get(h.ctx.caseIndexName_(owner));index.fail=true;
 const saved=h.ctx.saveCase_({id:'a',expectedRevision:1,name:'Saved despite catalog error',equipment:[]},owner);assert.equal(saved.revision,2);
 assert.equal(h.ctx.getCase_('a',owner).name,'Saved despite catalog error');assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].name,'Original');
 assert(h.logs.some(l=>l.includes('CASE_INDEX_UPDATE_FAILED')));assert(!h.logs.join('').includes('private index details'));
 index.fail=false;h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].name,'Saved despite catalog error');
});

test('a case created during a partial scan is retained and stale cursors cannot restart a scan',()=>{
 const h=runtime();for(let i=0;i<4;i++)h.seed('old-'+i);
 let page=h.ctx.refreshCaseCatalog_(owner);h.ctx.createCase_({id:'new',name:'Added during scan'},owner);
 const before=h.caseReads(),stale=h.ctx.refreshCaseCatalog_(owner,'wrong');assert.equal(stale.cursor,page.cursor);assert.equal(h.caseReads(),before);
 page=h.ctx.refreshCaseCatalog_(owner,page.cursor);assert.equal(page.cases.length,5);assert(!page.hasMore);assert(page.cases.some(c=>c.id==='new'));
});

test('workspace catalogs are isolated and a missing or corrupt index can be rebuilt',()=>{
 const h=runtime();h.seed('one');h.refresh();h.setWorkspace('two');assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.seed('two');h.refresh();
 assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].id,'two');h.setWorkspace('one');assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].id,'one');
 h.folder().files.get(h.ctx.caseIndexName_(owner)).setContent('{invalid');assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].id,'one');
 const index=h.folder().files.get(h.ctx.caseIndexName_(owner));index.setContent(JSON.stringify({schemaVersion:'case-index-1',ownerEmail:owner.email,entries:[null]}));
 assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].id,'one');
 const catalog=JSON.parse(index.content);catalog.scan={id:'bad',queue:[null],position:0};index.setContent(JSON.stringify(catalog));h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].id,'one');
});

test('folder storage keeps general data separate, reuses unchanged simulations and rebuilds only manifests',()=>{
 const h=runtime();h.ctx.createCase_({id:'split',name:'Separate files',simulations:[{id:'a',name:'A',results:{largeReplay:'x'.repeat(100000)}},{id:'b',name:'B'}]},owner);
 const child=h.folder().getFoldersByName('split').next(),manifest=child.files.get('case.json'),general=JSON.parse(manifest.content);
 assert.equal(general.simulations,undefined);assert.equal(general.simulationFiles.length,2);assert(!manifest.content.includes('largeReplay'));
 const before=general.simulationFiles.map(e=>e.fileName),record=h.ctx.getCase_('split',owner);record.name='Renamed';record.expectedRevision=1;
 h.ctx.saveCase_(record,owner);assert.deepEqual(JSON.parse(manifest.content).simulationFiles.map(e=>e.fileName),before);
 h.folder().files.get(h.ctx.caseIndexName_(owner)).setTrashed(true);h.reads.length=0;h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].name,'Renamed');
 assert(h.reads.includes('case.json'));assert(!h.reads.some(n=>n.startsWith('simulation-')));
 h.ctx.deleteCase_('split',owner);assert(child.trashed);h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);assert.throws(()=>h.ctx.getCase_('split',owner));
});

test('legacy cases migrate on save and a failed manifest commit retains the previous simulations',()=>{
 const h=runtime(),legacy=h.seed('legacy');const record=h.ctx.getCase_('legacy',owner);record.expectedRevision=1;
 h.ctx.saveCase_(record,owner);assert(legacy.trashed);const child=h.folder().getFoldersByName('legacy').next(),manifest=child.files.get('case.json');
 const original=manifest.content;const next=h.ctx.getCase_('legacy',owner);next.expectedRevision=2;next.name='Failed draft';next.simulations[0].name='New simulation';manifest.fail=true;
 assert.throws(()=>h.ctx.saveCase_(next,owner),e=>e.simulatorError.code==='CASE_SAVE_FAILED');assert.equal(manifest.content,original);
 const recovered=h.ctx.getCase_('legacy',owner);assert.equal(recovered.revision,2);assert.equal(recovered.simulations[0].name,'A');
 assert.equal([...child.files.values()].filter(f=>!f.trashed&&f.name.startsWith('simulation-')).length,1);
 manifest.fail=false;h.ctx.saveCase_(next,owner);assert.equal(h.ctx.getCase_('legacy',owner).name,'Failed draft');assert.equal(h.ctx.getCase_('legacy',owner).simulations[0].name,'New simulation');
});

test('failed legacy migration leaves the old file usable and foreign folder ownership is enforced',()=>{
 const h=runtime(),legacy=h.seed('a');const original=h.folder().createFolder;
 h.folder().createFolder=function(name){const child=original.call(this,name),create=child.createFile;child.createFile=function(name,content){if(name==='case.json')throw Error('commit failed');return create.call(this,name,content);};return child;};
 const record=h.ctx.getCase_('a',owner);record.expectedRevision=1;assert.throws(()=>h.ctx.saveCase_(record,owner));assert(!legacy.trashed);assert.equal(h.ctx.getCase_('a',owner).revision,1);
 h.folder().createFolder=original;h.ctx.createCase_({id:'foreign-folder',name:'Private'}, {email:'another@example.test'});
 assert.throws(()=>h.ctx.getCase_('foreign-folder',owner),e=>e.simulatorError.code==='CASE_NOT_FOUND');assert.throws(()=>h.ctx.deleteCase_('foreign-folder',owner));h.refresh();assert(!h.ctx.getCaseCatalog_(owner).cases.some(c=>c.id==='foreign-folder'));
});

test('deletion removes a leftover owned legacy file so migration cleanup errors cannot resurrect a case',()=>{
 const h=runtime(),legacy=h.seed('leftover'),trash=legacy.setTrashed;legacy.setTrashed=()=>{throw Error('cleanup failed');};
 const record=h.ctx.getCase_('leftover',owner);record.expectedRevision=1;h.ctx.saveCase_(record,owner);assert(!legacy.trashed);h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,1);assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].revision,2);
 legacy.setTrashed=trash;h.ctx.deleteCase_('leftover',owner);assert(legacy.trashed);h.refresh();assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);
});

test('deleting an owned folder uses its manifest without requiring valid simulation results',()=>{
 const h=runtime();h.ctx.createCase_({id:'broken',name:'Broken simulation'},owner);const child=h.folder().getFoldersByName('broken').next();const manifest=JSON.parse(child.files.get('case.json').content);child.files.get(manifest.simulationFiles[0].fileName).setContent('{bad');
 assert.throws(()=>h.ctx.getCase_('broken',owner));h.reads.length=0;h.ctx.deleteCase_('broken',owner);assert(child.trashed);assert(!h.reads.some(n=>n.startsWith('simulation-')));
});

test('opening through the RPC migrates an unchanged legacy case without editing its revision or data',()=>{
 const h=runtime(),legacy=h.seed('open-migration'),original=JSON.parse(legacy.content);
 const response=h.ctx.getCase('open-migration');assert(response.ok);assert(legacy.trashed);assert.equal(response.data.storageVersion,'case-folder-1');assert.equal(response.data.revision,original.revision);assert.equal(response.data.updatedAt,original.updatedAt);
 const child=h.folder().getFoldersByName('open-migration').next(),manifest=JSON.parse(child.files.get('case.json').content);assert.equal(manifest.revision,1);assert.equal(manifest.simulations,undefined);assert.equal(manifest.simulationFiles.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(response.data.simulations)),original.simulations);assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].fileId,child.files.get('case.json').getId());
 const before=child.files.size;const next=h.ctx.getCase('open-migration');assert(next.ok);assert.equal(child.files.size,before,'opening a migrated case creates no additional simulation files');
});

test('failed automatic migration keeps a legacy case accessible and retries on the next open',()=>{
 const h=runtime(),legacy=h.seed('retry-migration'),create=h.folder().createFolder;
 h.folder().createFolder=()=>{throw Error('private conversion details');};const first=h.ctx.getCase('retry-migration');assert(first.ok);assert(first.data.storageMigrationPending);assert(!legacy.trashed);assert.equal(first.data.revision,1);assert(!h.logs.join('').includes('private conversion details'));
 h.folder().createFolder=create;const second=h.ctx.getCase('retry-migration');assert(second.ok);assert(!second.data.storageMigrationPending);assert(legacy.trashed);assert.equal(second.data.revision,1);
 const foreign=h.seed('foreign-open','other@example.test');assert.equal(h.ctx.getCase('foreign-open').ok,false);assert(!foreign.trashed);assert(!h.folder().getFoldersByName('foreign-open').hasNext());
});


test('Save fingerprints avoid simulation reads and rewrite only the edited JSON',()=>{
 const h=runtime();h.ctx.createCase_({id:'dirty-only',name:'Original',simulations:[{id:'a',name:'A'},{id:'b',name:'B'}]},owner);
 const child=h.folder().getFoldersByName('dirty-only').next(),manifest=child.files.get('case.json');
 const before=JSON.parse(manifest.content).simulationFiles,record=h.ctx.getCase_('dirty-only',owner);h.reads.length=0;
 record.expectedRevision=1;record.name='Renamed';
 const saved=h.ctx.saveCase_(record,owner);assert.equal(saved.revision,2);
 assert.deepEqual(JSON.parse(manifest.content).simulationFiles,before);assert(!h.reads.some(name=>name.startsWith('simulation-')));
 record.expectedRevision=2;record.simulations[1].name='Changed B';h.reads.length=0;h.ctx.saveCase_(record,owner);
 const after=JSON.parse(manifest.content).simulationFiles;
 assert.equal(after[0].fileName,before[0].fileName);assert.notEqual(after[1].fileName,before[1].fileName);assert(!h.reads.some(name=>name.startsWith('simulation-')));
 assert.equal(h.ctx.getCase_('dirty-only',owner).simulations[1].name,'Changed B');
});

test('Older manifests gain fingerprints without rewriting unchanged simulation JSON',()=>{
 const h=runtime();h.ctx.createCase_({id:'old-digest',name:'Old'},owner);
 const child=h.folder().getFoldersByName('old-digest').next(),manifest=child.files.get('case.json'),general=JSON.parse(manifest.content);
 const fileName=general.simulationFiles[0].fileName;delete general.simulationFiles[0].digest;manifest.setContent(JSON.stringify(general));
 const record=h.ctx.getCase_('old-digest',owner);record.expectedRevision=1;h.reads.length=0;h.ctx.saveCase_(record,owner);
 const saved=JSON.parse(manifest.content).simulationFiles[0];assert.equal(saved.fileName,fileName);assert.match(saved.digest,/^[a-f0-9]{64}$/);
 assert.equal(h.reads.filter(name=>name===fileName).length,1);
});

test('saving reuses the verified manifest and looks up changed simulation files only for cleanup',()=>{
 const h=runtime();h.ctx.createCase_({id:'fast-save',name:'Original'},owner);
 const record=h.ctx.getCase_('fast-save',owner),child=h.folder().getFoldersByName('fast-save').next();
 const old=JSON.parse(child.files.get('case.json').content).simulationFiles[0].fileName;
 const lookups=[],lookup=child.getFilesByName;
 child.getFilesByName=name=>{lookups.push(name);return lookup(name);};
 record.expectedRevision=1;record.simulations[0].name='Changed';h.ctx.saveCase_(record,owner);
 assert.equal(lookups.filter(name=>name==='case.json').length,1);
 assert.equal(lookups.filter(name=>name===old).length,1);
 assert.equal(h.ctx.getCase_('fast-save',owner).simulations[0].name,'Changed');
});

test('an unchanged digest still verifies the simulation exists and recreates a missing file',()=>{
 const h=runtime();h.ctx.createCase_({id:'missing-file',name:'Original'},owner);
 const record=h.ctx.getCase_('missing-file',owner),child=h.folder().getFoldersByName('missing-file').next();
 const old=JSON.parse(child.files.get('case.json').content).simulationFiles[0].fileName;
 child.files.get(old).setTrashed(true);record.expectedRevision=1;h.ctx.saveCase_(record,owner);
 assert.notEqual(JSON.parse(child.files.get('case.json').content).simulationFiles[0].fileName,old);
 assert.equal(h.ctx.getCase_('missing-file',owner).revision,2);
});

test('compact saves commit small simulations together and retain a lightweight acknowledgement',()=>{
 const h=runtime();h.ctx.createCase_({id:'compact',name:'Compact',simulations:[{id:'a',name:'A'},{id:'b',name:'B'}]},owner);
 let record=h.ctx.getCase_('compact',owner),child=h.folder().getFoldersByName('compact').next();
 record.expectedRevision=record.revision;record.compactStorage=true;
 const ack=h.ctx.saveCase(record);assert(ack.ok);assert.equal(ack.data.revision,2);assert.equal(ack.data.simulations,undefined);
 let manifest=JSON.parse(child.files.get('case.json').content);assert.equal(manifest.storageVersion,'case-folder-2');assert(manifest.simulationFiles.every(e=>e.inline?.id===e.id&&!e.fileName));
 assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.getCase_('compact',owner).simulations)),JSON.parse(JSON.stringify(record.simulations)));
 assert.equal(h.ctx.getCase_('compact',owner).simulationFiles,undefined,'storage entries are omitted from the client response');
 assert.throws(()=>h.ctx.getCase_('compact',{email:'other@example.test'}),e=>e.simulatorError.code==='CASE_NOT_FOUND');
 const queries=[],mutations=[],lookup=child.getFilesByName,listing=child.getFiles,create=child.createFile;
 child.getFilesByName=name=>{queries.push(name);return lookup(name);};child.getFiles=()=>{queries.push('list');return listing();};child.createFile=(name,...args)=>{mutations.push(name);return create(name,...args);};
 record=h.ctx.getCase_('compact',owner);queries.length=0;record.expectedRevision=2;record.compactStorage=true;record.simulations[0].name='Edited';
 h.ctx.saveCase_(record,owner);assert.deepEqual(queries,['case.json']);assert.deepEqual(mutations,[],'small edits need no simulation file creation or cleanup');
 assert.equal(h.ctx.getCase_('compact',owner).simulations[0].name,'Edited');
});

test('compact storage bounds UTF-8 bytes, keeps larger results external and verifies them in one listing',()=>{
 const h=runtime();h.ctx.createCase_({id:'mixed',name:'Mixed',simulations:[{id:'a',results:{note:'瓶'.repeat(8000)}},{id:'b',results:{note:'large'.repeat(10000)}},{id:'c',name:'Small'}]},owner);
 let record=h.ctx.getCase_('mixed',owner),child=h.folder().getFoldersByName('mixed').next();record.expectedRevision=1;record.compactStorage=true;h.ctx.saveCase_(record,owner);
 const manifest=JSON.parse(child.files.get('case.json').content);assert(manifest.simulationFiles[0].fileName);assert(manifest.simulationFiles[1].fileName);assert(manifest.simulationFiles[2].inline);
 assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.getCase_('mixed',owner).simulations)),JSON.parse(JSON.stringify(record.simulations)));
 const queries=[],lookup=child.getFilesByName,listing=child.getFiles;child.getFilesByName=name=>{queries.push(name);return lookup(name);};child.getFiles=()=>{queries.push('list');return listing();};
 record=h.ctx.getCase_('mixed',owner);queries.length=0;record.expectedRevision=2;record.compactStorage=true;h.ctx.saveCase_(record,owner);assert.deepEqual(queries,['case.json','list']);
 assert.equal(h.ctx.caseJsonBytesWithin_('abc瓶😀',10),10);assert.equal(h.ctx.caseJsonBytesWithin_('abc瓶😀',9),null);
});

test('failed compact commits keep old data and size growth safely moves inline results into files',()=>{
 const h=runtime();h.ctx.createCase_({id:'atomic-inline',name:'Atomic',simulations:[{id:'a',name:'Original'}]},owner);
 const child=h.folder().getFoldersByName('atomic-inline').next(),manifest=child.files.get('case.json');let record=h.ctx.getCase_('atomic-inline',owner);record.expectedRevision=1;record.compactStorage=true;
 const old=manifest.content;manifest.fail=true;assert.throws(()=>h.ctx.saveCase_(record,owner));assert.equal(manifest.content,old);assert.equal(h.ctx.getCase_('atomic-inline',owner).simulations[0].name,'Original');
 manifest.fail=false;h.ctx.saveCase_(record,owner);assert(JSON.parse(manifest.content).simulationFiles[0].inline);
 record=h.ctx.getCase_('atomic-inline',owner);record.expectedRevision=2;record.compactStorage=true;record.simulations[0].results={large:'x'.repeat(20000)};const beforeGrowth=manifest.content;
 manifest.fail=true;assert.throws(()=>h.ctx.saveCase_(record,owner));assert.equal(manifest.content,beforeGrowth);assert.equal(h.ctx.getCase_('atomic-inline',owner).simulations[0].results.large,undefined);
 manifest.fail=false;h.ctx.saveCase_(record,owner);assert(JSON.parse(manifest.content).simulationFiles[0].fileName);assert.equal(h.ctx.getCase_('atomic-inline',owner).simulations[0].results.large.length,20000);
 assert.throws(()=>h.ctx.saveCase_(record,owner),e=>e.simulatorError.code==='CASE_CONFLICT');
});

test('inline storage respects the total manifest budget and survives cloning and later server writes',()=>{
 const h=runtime(),simulations=['a','b','c','d'].map(id=>({id,name:id,results:{payload:'x'.repeat(12000)}}));
 h.ctx.createCase_({id:'bounded-inline',name:'Bounded',simulations},owner);let record=h.ctx.getCase_('bounded-inline',owner);record.expectedRevision=1;record.compactStorage=true;h.ctx.saveCase_(record,owner);
 const child=h.folder().getFoldersByName('bounded-inline').next(),refs=JSON.parse(child.files.get('case.json').content).simulationFiles,inline=refs.filter(e=>e.inline);
 assert.equal(inline.length,2);assert(inline.reduce((bytes,e)=>bytes+Buffer.byteLength(JSON.stringify(e.inline)),0)<=h.ctx.ST_CASE_STORAGE_LIMITS.inlineCaseBytes);
 const clone=h.ctx.cloneCase_('bounded-inline',owner),loaded=h.ctx.getCase_(clone.id,owner);assert.deepEqual(JSON.parse(JSON.stringify(loaded.simulations)),JSON.parse(JSON.stringify(record.simulations)));
 record=h.ctx.getCase_('bounded-inline',owner);record.expectedRevision=2;record.name='Server update';h.ctx.saveCase_(record,owner);
 assert.equal(JSON.parse(child.files.get('case.json').content).simulationFiles.filter(e=>e.inline).length,2,'existing inline storage is retained without the client hint');
 assert.equal(h.ctx.getCase_('bounded-inline',owner).simulations[3].results.payload.length,12000);
});

