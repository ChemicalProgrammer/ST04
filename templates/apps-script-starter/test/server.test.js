import test from 'node:test';
import assert from 'node:assert/strict';
import {server,project} from './helpers.mjs';
test('CRUD persists projects, protects revisions and moves deleted records to trash',()=>{
  const s=server();assert.deepEqual(s.call('getBootstrap').data.projects,[]);assert.equal(s.folders.size,0);
  const created=s.call('createProject',project);assert(created.ok);assert.equal(created.data.revision,1);assert.equal(s.folders.size,1);
  const id=created.data.id;assert.equal(s.call('getProject',id).data.description,project.description);
  const saved=s.call('saveProject',{...project,id,expectedRevision:1,status:'ACTIVE',ownerEmail:'forged@example.test'});
  assert(saved.ok);assert.equal(saved.data.revision,2);assert.equal(saved.data.ownerEmail,'one@example.test');
  assert.equal(s.call('saveProject',{...project,id,expectedRevision:1}).error.code,'CONFLICT');
  assert.equal(s.call('deleteProject',{id,expectedRevision:1}).error.code,'CONFLICT');
  assert(s.call('deleteProject',{id,expectedRevision:2}).ok);assert.equal(s.call('listProjects').data.length,0);assert.equal(s.call('getProject',id).error.code,'NOT_FOUND');
});
test('identity is checked before storage and shared-folder records remain account-scoped',()=>{
  const s=server();s.account('one@example.test','owner@example.test');assert.equal(s.call('getBootstrap').error.code,'DEPLOYMENT_IDENTITY');assert.equal(s.folders.size,0);
  s.account('one@example.test');const record=s.call('createProject',project).data;const folder=s.properties.get('one@example.test').get('PROJECTS_FOLDER_V1');
  s.account('two@example.test');assert.equal(s.call('getProject',record.id).error.code,'NOT_FOUND');
  s.properties.get('two@example.test').set('PROJECTS_FOLDER_V1',folder);assert.deepEqual(s.call('listProjects').data,[]);
  assert.equal(s.call('saveProject',{...project,id:record.id,expectedRevision:1}).error.code,'NOT_FOUND');
  assert.equal(s.call('deleteProject',{id:record.id,expectedRevision:1}).error.code,'NOT_FOUND');
});
test('invalid inputs and lock failures create no records; failed writes preserve saved revision',()=>{
  const s=server();for(const bad of [{...project,name:''},{...project,description:'x'.repeat(4001)},{...project,status:'UNKNOWN'},{...project,dueDate:'2026-02-30'}])assert.equal(s.call('createProject',bad).error.code,'INVALID_PROJECT');
  assert.equal(s.folders.size,0);s.fail.lock=true;assert.equal(s.call('createProject',project).error.code,'BUSY');s.fail.lock=false;
  const record=s.call('createProject',project).data;s.fail.writes=true;assert.equal(s.call('saveProject',{...project,id:record.id,expectedRevision:1,name:'Changed'}).error.code,'REQUEST_FAILED');
  s.fail.writes=false;assert.equal(s.call('getProject',record.id).data.revision,1);assert.equal(s.call('getProject',record.id).data.name,project.name);
});
test('preferences are isolated per account and unavailable folders are not silently replaced',()=>{
  const s=server();assert(s.call('savePreferences',{theme:'dark',accent:'teal'}).ok);assert.equal(s.call('savePreferences',{theme:'bad',accent:'teal'}).error.code,'INVALID_SETTINGS');
  s.account('two@example.test');assert.equal(s.call('getBootstrap').data.preferences.theme,'system');s.account('one@example.test');assert.equal(s.call('getBootstrap').data.preferences.theme,'dark');
  s.call('createProject',project);const folder=[...s.folders.values()][0];folder.trashed=true;assert.equal(s.call('createProject',project).error.code,'WORKSPACE_UNAVAILABLE');assert.equal(s.folders.size,1);
});
