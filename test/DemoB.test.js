import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function factory(){const ctx=vm.createContext({});for(const name of ['SheetImportService.gs','DemoBCaseFactory.gs'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8'),ctx);return ctx;}
test('Demo B preserves photo inputs, missing values and the pitch warning with a fixed test run',()=>{
 const record=factory().createDemoBCaseRequest_();assert.equal(record.name,'Demo B');assert.equal(record.equipment.length,13);assert.equal(record.equipment[0].characteristics.isPacemaker,true);assert.equal(record.equipment[4].nominalRatePerSecond,3);
 assert.equal(record.equipment[11].processData.geometry.lactMm,135870);assert.equal(record.equipment[3].processData.upstream.dischargePitchMm,88.9);assert(record.metadata.importWarnings.some(w=>w.cell==='L13'));
 assert.equal(record.equipment[1].noiseProfile.reliability,undefined);assert.equal(record.simulations[0].dynamicConfig.seed,20261013);assert.equal(record.simulations[0].results,null);
});
test('demo RPC accepts Demo B while the default remains Demo A',()=>{
 const f=factory();for(const file of ['TextResources.gs','ApiResponse.gs','DemoCaseFactory.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),f);
 f.requireCurrentUser_=()=>({});let request;f.createCase_=r=>{request=r;return {id:r.id};};
 assert(f.createDemoCase({variant:'B'}).ok);assert.equal(request.name,'Demo B');assert(f.createDemoCase().ok);assert.notEqual(request.name,'Demo B');
});
test('Demo B survives the real case-normalization and persistence path',()=>{
 const f=factory();for(const file of ['TextResources.gs','ApiResponse.gs','CaseService.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),f);
 f.requireCurrentUser_=()=>({email:'owner@test'});f.LockService={getUserLock:()=>({tryLock:()=>true,releaseLock(){}})};
 f.getWorkspaceFolders_=()=>({cases:{getFilesByName:()=>({hasNext:()=>false}),getFoldersByName:()=>({hasNext:()=>false})}});
 let saved;f.persistCaseRecord_=record=>{saved=record;return {getId:()=> 'demo-b-file'};};
 const response=f.createDemoCase({variant:'B'});assert(response.ok,JSON.stringify(response));assert.equal(saved.name,'Demo B');assert.equal(saved.simulations.length,1);assert.equal(saved.simulations[0].equipment.length,13);assert.equal(saved.metadata.sourceRows[3][11],88.9);assert.equal(saved.simulations[0].equipment[0].characteristics.isPacemaker,true);
});
