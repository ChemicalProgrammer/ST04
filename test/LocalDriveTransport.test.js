import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
test('local transport binds origin, window and token and never falls back to cloud writes',async()=>{
 const dom=new JSDOM('<select id="storage-mode"></select><button id="connect-local-drive"></button><div id="local-drive-status"></div>',{runScripts:'outside-only',url:'https://app.script.googleusercontent.com'}),w=dom.window,prefs=new Map(),sent=[];
 try{
 w.STPreferences={read:k=>prefs.get(k),write:(k,v)=>prefs.set(k,v)};w.crypto.randomUUID=()=> 'test-session-token';const popup={closed:false,postMessage:(m,o)=>sent.push({m,o})};w.open=()=>popup;
 const rpc=[];w.google={script:{run:{withFailureHandler(fn){this.failure=fn;return this;},withSuccessHandler(fn){this.success=fn;return this;},prepareLocalWorkspace(){rpc.push('prepareLocalWorkspace');this.success({ok:true,data:{workspaceId:'drive-id',markerId:'cloud-marker'}});}}}};
 w.eval(fs.readFileSync('apps-script/LocalDrive.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));const client=w.STLocalDrive;client.configure({email:'owner@test'},'drive-id');assert.equal(client.handles('saveCase'),false);const connection=client.connect();await Promise.resolve();
 const emit=(data,{source=popup,origin='http://127.0.0.1:8765'}={})=>w.dispatchEvent(new w.MessageEvent('message',{data:{channel:'simuline-local-drive',token:'test-session-token',...data},source,origin}));
 emit({type:'connected',name:'Wrong'},{origin:'https://evil.test'});assert.equal(client.connected(),false);emit({type:'connected',name:'Drive workspace'});await connection;assert(client.handles('saveCase'));
 const draft={id:'case-a',expectedRevision:1,equipment:[{id:'m'}]},pending=client.dispatch('saveCase',[draft]);const job=sent.at(-1);assert.equal(job.m.action,'save');assert.equal(job.m.args[0].ownerEmail,'owner@test');assert.equal(job.o,'http://127.0.0.1:8765');
 emit({type:'response',id:job.m.id,ok:true,data:{id:'case-a',name:'A',revision:2,equipment:[{id:'m'}]}});assert.equal((await pending).revision,2);assert.deepEqual(rpc,['prepareLocalWorkspace']);popup.closed=true;await assert.rejects(client.dispatch('saveCase',[draft]),/reconnect/i);
 const snap=client.snapshot({id:'a',activeSimulationId:'s',simulations:[{id:'s',equipment:[],results:{samples:['RAW'],events:['RAW'],replay:{secret:'RAW'}}}]});assert(!JSON.stringify(snap).includes('RAW'));
 }finally{w.close();}
});
test('Drive workspace marker is created once and reused without modifying cloud cases',()=>{
 let content,writes=0,creates=0;const root={getId:()=> 'drive-id',getFilesByName:name=>({hasNext:()=>!!content,next:()=>({getBlob:()=>({getDataAsString:()=>content}),setContent:v=>{content=v;writes++;}})}),createFile:(name,value)=>{assert.equal(name,'simuline-workspace.json');content=value;creates++;}};
 const ctx={executeServerAction_:fn=>({ok:true,data:fn({email:'owner@test'})}),getWorkspaceFolders_:()=>({root}),Utilities:{getUuid:()=> 'marker-token'},MimeType:{PLAIN_TEXT:'text/plain'},createSimulatorError_:(code,message)=>Object.assign(Error(message),{code})};vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/Main.gs','utf8'),ctx);ctx.executeServerAction_=fn=>({ok:true,data:fn({email:'owner@test'})});assert.equal(ctx.prepareLocalWorkspace().data.markerId,'marker-token');assert.equal(ctx.prepareLocalWorkspace().data.markerId,'marker-token');assert.equal(creates,1);assert.equal(writes,0);
});
