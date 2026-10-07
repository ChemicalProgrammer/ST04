import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('returns safe default settings before a workspace is configured', () => {
  const runtime = createAppsScriptRuntime();

  const settings = runtime.getUserSettings_();

  assert.deepEqual(toPlainObject(settings), {
    schemaVersion: '1.0',
    workspaceRootFolderId: '',
    preferredPlaybackRate: 1
  });
});

test('stores only a workspace folder that the active user can open', () => {
  const runtime = createAppsScriptRuntime({ accessibleFolderIds: ['workspace-1'] });

  const settings = runtime.saveUserSettings_({
    workspaceRootFolderId: 'workspace-1',
    preferredPlaybackRate: 1.5
  });

  assert.equal(settings.workspaceRootFolderId, 'workspace-1');
  assert.equal(settings.preferredPlaybackRate, 2, 'legacy 1.5× preference migrates to the supported 2× option');
  assert.ok(runtime.userProperties.USER_SETTINGS_JSON);
});

test('returns a structured error when the workspace folder is unavailable', () => {
  const runtime = createAppsScriptRuntime();

  assert.throws(
    () => runtime.saveUserSettings_({ workspaceRootFolderId: 'missing-folder', preferredPlaybackRate: 1 }),
    (error) => error.simulatorError?.code === 'WORKSPACE_FOLDER_UNAVAILABLE'
  );
});

function createAppsScriptRuntime(options = {}) {
  const userProperties = {};
  const scriptProperties = {};
  const accessibleFolderIds = new Set(options.accessibleFolderIds || []);
  const context = vm.createContext({
    JSON,
    Error,
    Boolean,
    Number,
    Array,
    isFinite,
    PropertiesService: {
      getUserProperties: () => ({
        getProperty: (key) => userProperties[key] || null,
        getProperties: () => ({...userProperties}),
        setProperty: (key, value) => { userProperties[key] = value; },
        setProperties: entries => Object.assign(userProperties,entries),
        deleteProperty: key => delete userProperties[key]
      }),
      getScriptProperties: () => ({
        getProperty: (key) => scriptProperties[key] || null
      })
    },
    DriveApp: {
      getFolderById: (id) => {
        if (!accessibleFolderIds.has(id)) throw new Error('Folder unavailable');
        return { getName: () => id };
      }
    }
  });

  ['ApiResponse.gs', 'ConfigService.gs', 'DriveService.gs', 'GeminiService.gs'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(repositoryRoot, 'apps-script', file), 'utf8'), context, { filename: file });
  });
  context.userProperties = userProperties;
  return context;
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}


test('saves account prompt overrides without exposing credentials and rejects invalid drafts before writing',()=>{
 const runtime=createAppsScriptRuntime({accessibleFolderIds:['workspace-1']}),prompts={personality:{enabled:false,text:'Use later'},mediumCapex:{enabled:true,text:'Defined local retrofit scope'}};
 runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash',apiKey:'private-test-key',prompts}});
 assert.deepEqual(toPlainObject(runtime.getGeminiClientConfig_().promptOverrides),prompts);assert(!JSON.stringify(runtime.getGeminiClientConfig_()).includes('private-test-key'));
 const previous=JSON.stringify(runtime.userProperties);
 assert.throws(()=>runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash',apiKey:'changed-key',prompts:{personality:{enabled:true,text:'x'.repeat(8001)}}}}),e=>e.simulatorError.code==='INVALID_GEMINI_PROMPTS');
 assert.equal(JSON.stringify(runtime.userProperties),previous);
 runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash'}});assert.deepEqual(toPlainObject(runtime.getGeminiPrompts_()),prompts);
});

test('account generation options survive reload, omitted updates and invalid drafts without partial writes',()=>{
 const runtime=createAppsScriptRuntime({accessibleFolderIds:['workspace-1']}),generation={temperature:.2,responseMode:'FAST',maxOutputTokens:4096,displayMode:'IMMEDIATE'};
 runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash',apiKey:'private-key',generation}});assert.deepEqual(toPlainObject(runtime.getGeminiClientConfig_().generation),generation);
 runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash'}});assert.deepEqual(toPlainObject(runtime.getGeminiClientConfig_().generation),generation);
 const snapshot=JSON.stringify(runtime.userProperties);assert.throws(()=>runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash',apiKey:'changed-key',generation:{temperature:3}}}),e=>e.simulatorError.code==='INVALID_GEMINI_SETTINGS');assert.equal(JSON.stringify(runtime.userProperties),snapshot);
});

test('factory reset clears only app account settings and never reads or deletes Drive data',()=>{
 const runtime=createAppsScriptRuntime({accessibleFolderIds:['workspace-1']});
 runtime.saveUserSettings_({workspaceRootFolderId:'workspace-1',gemini:{model:'gemini-2.5-flash',apiKey:'private-key',prompts:{personality:{enabled:true,text:'Custom prompt'}}}});
 runtime.userProperties.GEMINI_PROMPTS_PART_9='orphan';runtime.userProperties.UNRELATED='keep';
 runtime.DriveApp.getFolderById=()=>{throw Error('Reset must not access Drive');};
 assert.equal(runtime.resetAppSettings_().workspaceRootFolderId,'');
 assert.deepEqual(runtime.userProperties,{UNRELATED:'keep'});assert.equal(runtime.getGeminiClientConfig_().configured,false);
});
