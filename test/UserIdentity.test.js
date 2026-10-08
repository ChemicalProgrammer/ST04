import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime(){
 const accounts={owner:{},visitor:{}};let active='owner@example.test',effective=active,reads=0,driveReads=0;
 const context=vm.createContext({
  Session:{getActiveUser:()=>({getEmail:()=>active}),getEffectiveUser:()=>({getEmail:()=>effective})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null}),getUserProperties:()=>{
   reads++;const store=accounts[effective.split('@')[0]];
   return {getProperty:key=>store[key]||null,setProperty:(key,value)=>store[key]=value,setProperties:values=>Object.assign(store,values),getProperties:()=>({...store}),deleteProperty:key=>delete store[key]};
  }},
  DriveApp:{getFolderById:id=>{driveReads++;if(id!==effective.split('@')[0]+'-folder')throw Error('Private folder');return {getName:()=>id};}}
 });
 for(const file of ['ApiResponse.gs','AuthService.gs','ConfigService.gs','DriveService.gs','GeminiService.gs','InterfaceMode.gs','Main.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),context,{filename:file});
 context.getCaseCatalog_=()=>({cases:[],refreshRequired:false,complete:true});
 return {context,accounts,identity:(user,executor=user)=>{active=user;effective=executor;},reads:()=>reads,driveReads:()=>driveReads};
}

test('owner execution cannot return or change another account settings, keys or Drive data',()=>{
 const h=runtime();h.context.saveUserSettings({workspaceRootFolderId:'owner-folder',gemini:{model:'gemini-2.5-flash',apiKey:'owner-secret'}});
 const initial=JSON.stringify(h.accounts),reads=h.reads(),driveReads=h.driveReads();h.identity('visitor@example.test','owner@example.test');
 for(const response of [h.context.getBootstrap(),h.context.saveUserSettings({workspaceRootFolderId:'visitor-folder',gemini:{model:'gemini-2.5-flash',apiKey:'visitor-secret'}}),h.context.deleteGeminiApiKey(),h.context.resetAppSettings(),h.context.askGemini({scope:'GENERAL',question:'Hello'})]){
  assert.equal(response.ok,false);assert.equal(response.error.code,'DEPLOYMENT_IDENTITY_MISMATCH');assert.doesNotMatch(JSON.stringify(response),/owner-secret|owner-folder/);
 }
 assert.equal(h.reads(),reads);assert.equal(h.driveReads(),driveReads);assert.equal(JSON.stringify(h.accounts),initial);
});

test('authorized users have independent folders and Gemini keys, and new users start empty',()=>{
 const h=runtime();assert(h.context.saveUserSettings({workspaceRootFolderId:'owner-folder',gemini:{model:'gemini-2.5-flash',apiKey:'owner-secret'}}).ok);
 h.identity('visitor@example.test');let response=h.context.getBootstrap();assert(response.ok);assert.equal(response.data.settings.workspaceRootFolderId,'');assert.equal(response.data.gemini.configured,false);
 assert(h.context.saveUserSettings({workspaceRootFolderId:'https://drive.google.com/drive/u/0/folders/visitor-folder',gemini:{model:'gemini-2.5-flash',apiKey:'visitor-secret'}}).ok);
 response=h.context.getBootstrap();assert.equal(response.data.settings.workspaceRootFolderId,'visitor-folder');assert.equal(response.data.gemini.configured,true);assert.doesNotMatch(JSON.stringify(response),/owner-secret|visitor-secret|owner-folder/);
 assert.equal(h.context.saveUserSettings({workspaceRootFolderId:'owner-folder'}).error.code,'WORKSPACE_FOLDER_UNAVAILABLE');
 assert(h.context.resetAppSettings().ok);assert.equal(h.accounts.owner.GEMINI_API_KEY,'owner-secret');h.identity('owner@example.test');assert.equal(h.context.getBootstrap().data.settings.workspaceRootFolderId,'owner-folder');
});

test('unidentified visitors are rejected before reading account configuration',()=>{
 const h=runtime();h.identity('','owner@example.test');assert.equal(h.context.getBootstrap().error.code,'IDENTITY_UNAVAILABLE');assert.equal(h.reads(),0);assert.equal(h.driveReads(),0);
});


test('sign-in reports authorization and missing-module stages without exposing raw errors',()=>{
 const h=runtime();h.context.requireCurrentUser_=()=>{throw Error('You do not have permission to call Session.getActiveUser secret-fragment');};
 let response=h.context.getBootstrap();assert.equal(response.error.code,'SIGNIN_AUTHORIZATION_REQUIRED');assert.equal(response.startupVersion,'startup-20261008-2');assert.equal(response.error.details[0],'Stage: IDENTITY');assert.doesNotMatch(JSON.stringify(response),/secret-fragment/);
 h.context.requireCurrentUser_=()=>({email:'owner@example.test'});h.context.getCaseCatalog_=()=>{throw new ReferenceError('CaseIndex missing secret-fragment');};
 response=h.context.getBootstrap();assert.equal(response.error.code,'SIGNIN_MODULE_MISSING');assert.equal(response.error.details[0],'Stage: CASE_CATALOG');assert.doesNotMatch(JSON.stringify(response),/secret-fragment/);
 h.context.getCaseCatalog_=()=>({cases:[]});h.context.getGeminiClientConfig_=()=>{throw Error('private-key-fragment');};
 response=h.context.getBootstrap();assert.equal(response.error.code,'SIGNIN_START_FAILED');assert.equal(response.error.details[0],'Stage: GEMINI_CONFIG');assert.doesNotMatch(JSON.stringify(response),/private-key-fragment/);
});
