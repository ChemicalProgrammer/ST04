import {createLocalCaseStore} from './Store.js';
const token=new URLSearchParams(location.hash.slice(1)).get('token');let parent,origin,identity,store;
const el=id=>document.getElementById(id),send=data=>parent?.postMessage({channel:'simuline-local-drive',token,...data},origin);
function allowed(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname.endsWith('.googleusercontent.com'))||u.hostname==='localhost'||u.hostname==='127.0.0.1';}catch(_){return false;}}
window.addEventListener('message',async event=>{
 const data=event.data;if(event.source!==window.opener||!allowed(event.origin)||data?.channel!=='simuline-local-drive'||data.token!==token)return;
 if(data.type==='init'){
   if(parent&&(event.source!==parent||event.origin!==origin))return;
   parent=event.source;origin=event.origin;identity=data.identity;
   if(!identity?.workspaceId||!identity.email)return;
   el('identity').textContent=identity.email+' · Drive folder ID: '+identity.workspaceId;el('connect').disabled=false;send({type:'ready'});return;
 }
 if(event.source!==parent||event.origin!==origin||!store||data.type!=='request')return;
 try{let result;switch(data.action){case 'catalog':result={cases:await store.catalog(),hasMore:false};break;case 'get':result=await store.get(data.args[0]);break;case 'save':result=await store.save(data.args[0],data.args[1]||{});break;case 'delete':result=await store.remove(data.args[0]);break;default:throw Error('UNSUPPORTED_LOCAL_OPERATION');}
   el('status').textContent='Local operation completed · '+new Date().toLocaleTimeString()+'. Drive upload status is managed by Drive for desktop.';send({type:'response',id:data.id,ok:true,data:result});
 }catch(error){send({type:'response',id:data.id,ok:false,error:{code:error.name==='NotAllowedError'?'LOCAL_PERMISSION_REQUIRED':error.message,message:error.message}});el('status').textContent='Local operation failed: '+error.message;}
});
el('connect').onclick=async()=>{
 try{
  if(!window.showDirectoryPicker)throw Error('Use Chrome or Edge with local folder access enabled.');
  const root=await showDirectoryPicker({mode:'readwrite',id:'simuline-drive-workspace'});
  let marker;try{marker=JSON.parse(await (await (await root.getFileHandle('simuline-workspace.json')).getFile()).text());}catch(e){if(e.name==='NotFoundError')throw Error('Wait for Drive to sync the workspace marker, then select the configured Drive folder.');throw e;}
  if(marker?.workspaceId!==identity.workspaceId||marker?.markerId!==identity.markerId)throw Error('This is not the configured Drive workspace. Select the folder that contains its synchronized marker.');
  store=createLocalCaseStore(root,identity);el('status').textContent='Connected to '+root.name+'. Keep this window open.';send({type:'connected',name:root.name});
 }catch(error){el('status').textContent=error.message;send({type:'connect-error',message:error.message});}
};
// The opener may begin before this page finishes loading.
window.opener?.postMessage({channel:'simuline-local-drive',token,type:'hello'},'*');
