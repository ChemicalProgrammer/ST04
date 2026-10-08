import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('workspace folders resolve only requested children once per execution and follow root changes', () => {
  const calls=[]; let rootId='one';
  const context=vm.createContext({
    getUserSettings_:()=>({workspaceRootFolderId:rootId}),
    DriveApp:{getFolderById:id=>{
      calls.push('root:'+id);
      return {getName:()=>id,getFoldersByName:name=>{
        calls.push(id+':'+name);
        return {hasNext:()=>true,next:()=>({id:id+'/'+name})};
      }};
    }}
  });
  vm.runInContext(fs.readFileSync('apps-script/DriveService.gs','utf8'),context);
  const first=context.getWorkspaceFolders_();
  assert.deepEqual(calls,['root:one']);
  const cases=first.cases;
  assert.equal(context.getWorkspaceFolders_().cases,cases);
  assert.deepEqual(calls,['root:one','one:SimulatorTemplate Cases']);
  assert.equal(first.exports.id,'one/SimulatorTemplate Exports');
  assert(!calls.some(call=>call.includes('Artifacts')));
  rootId='two';
  assert.equal(context.getWorkspaceFolders_().cases.id,'two/SimulatorTemplate Cases');
  assert.deepEqual(calls.slice(-2),['root:two','two:SimulatorTemplate Cases']);
});
