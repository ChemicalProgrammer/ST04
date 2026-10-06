import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const owner={email:'owner@example.test'};
function runtime(){
 const folders=new Map(),reads=[],logs=[];let clock=Date.now(),workspace='one',uuid=0;
 const iterator=values=>{let i=0;return {hasNext:()=>i<values.length,next:()=>values[i++]};};
 function folder(id){
  if(folders.has(id))return folders.get(id);
  const files=new Map();
  const result={files,
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
 const ctx=vm.createContext({console:{error:line=>logs.push(line)},Utilities:{getUuid:()=>String(++uuid)},
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
 assert.deepEqual(Array.from(h.ctx.listCases_(owner),c=>c.id).sort(),['a','b']);
 const changed=JSON.parse(a.content);changed.name='New name';changed.revision=2;a.setContent(JSON.stringify(changed));b.setTrashed(true);
 const reads=h.caseReads();const page=h.refresh();assert.equal(page.cases.length,1);assert.equal(page.cases[0].name,'New name');
 assert.equal(h.caseReads()-reads,3,'one changed file plus the unindexed foreign and malformed files');
 assert.throws(()=>h.ctx.getCase_('foreign',owner),e=>e.simulatorError.code==='CASE_NOT_FOUND');
});

test('create, save and delete update the catalog without rebuilding complete cases',()=>{
 const h=runtime(),created=h.ctx.createCase_({id:'created',name:'New'},owner);assert.equal(h.ctx.listCases_(owner)[0].name,'New');
 const saved=h.ctx.saveCase_({id:created.id,expectedRevision:1,name:'Renamed',equipment:[]},owner);
 assert.equal(saved.revision,2);assert.equal(h.ctx.listCases_(owner)[0].revision,2);assert.equal(h.ctx.listCases_(owner)[0].name,'Renamed');
 h.ctx.deleteCase_(created.id,owner);assert.equal(h.ctx.listCases_(owner).length,0);
});

test('creating a validated scenario updates the catalog revision in the same case write',()=>{
 const h=runtime();
 for(const name of ['PublicDemoCaseFactory.gs','ScenarioEngine.gs','ScenarioService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),h.ctx);
 h.ctx.createCase_({...h.ctx.createPublicDemoCaseRequest_(),id:'scenario-case'},owner);
 const source=h.ctx.getCase_('scenario-case',owner).simulations[0];
 const proposal=h.ctx.STScenarioEngine_.plan(source).projects.find(p=>p.canApply);assert(proposal);
 h.ctx.createScenario_({caseId:'scenario-case',simulationId:source.id,expectedRevision:1,sourceSignature:h.ctx.STScenarioEngine_.signature(source),proposal:{...proposal,title:'Selected scenario'},origin:'GEMINI'},owner);
 assert.equal(h.ctx.getCaseCatalog_(owner).cases[0].revision,2);
 assert.equal(h.ctx.getCase_('scenario-case',owner).simulations.length,2);
});

test('an index write failure never misreports a successful save, and metadata refresh repairs it',()=>{
 const h=runtime();h.ctx.createCase_({id:'a',name:'Original'},owner);h.refresh();
 const index=h.folder().files.get(h.ctx.caseIndexName_(owner));index.fail=true;
 const saved=h.ctx.saveCase_({id:'a',expectedRevision:1,name:'Saved despite catalog error',equipment:[]},owner);assert.equal(saved.revision,2);
 assert.equal(h.ctx.getCase_('a',owner).name,'Saved despite catalog error');assert.equal(h.ctx.listCases_(owner)[0].name,'Original');
 assert(h.logs.some(l=>l.includes('CASE_INDEX_UPDATE_FAILED')));assert(!h.logs.join('').includes('private index details'));
 index.fail=false;h.refresh();assert.equal(h.ctx.listCases_(owner)[0].name,'Saved despite catalog error');
});

test('a case created during a partial scan is retained and stale cursors cannot restart a scan',()=>{
 const h=runtime();for(let i=0;i<4;i++)h.seed('old-'+i);
 let page=h.ctx.refreshCaseCatalog_(owner);h.ctx.createCase_({id:'new',name:'Added during scan'},owner);
 const before=h.caseReads(),stale=h.ctx.refreshCaseCatalog_(owner,'wrong');assert.equal(stale.cursor,page.cursor);assert.equal(h.caseReads(),before);
 page=h.ctx.refreshCaseCatalog_(owner,page.cursor);assert.equal(page.cases.length,5);assert(!page.hasMore);assert(page.cases.some(c=>c.id==='new'));
});

test('workspace catalogs are isolated and a missing or corrupt index can be rebuilt',()=>{
 const h=runtime();h.seed('one');h.refresh();h.setWorkspace('two');assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.seed('two');h.refresh();
 assert.equal(h.ctx.listCases_(owner)[0].id,'two');h.setWorkspace('one');assert.equal(h.ctx.listCases_(owner)[0].id,'one');
 h.folder().files.get(h.ctx.caseIndexName_(owner)).setContent('{invalid');assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.refresh();assert.equal(h.ctx.listCases_(owner)[0].id,'one');
 const index=h.folder().files.get(h.ctx.caseIndexName_(owner));index.setContent(JSON.stringify({schemaVersion:'case-index-1',ownerEmail:owner.email,entries:[null]}));
 assert.equal(h.ctx.getCaseCatalog_(owner).cases.length,0);h.refresh();assert.equal(h.ctx.listCases_(owner)[0].id,'one');
 const catalog=JSON.parse(index.content);catalog.scan={id:'bad',queue:[null],position:0};index.setContent(JSON.stringify(catalog));h.refresh();assert.equal(h.ctx.listCases_(owner)[0].id,'one');
});
