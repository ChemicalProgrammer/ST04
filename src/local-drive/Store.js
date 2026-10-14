// Browser directory handles only; no cloud write and no arbitrary absolute paths.
export function createLocalCaseStore(root,{workspaceId,email,locks=globalThis.navigator?.locks}={}){
  const copy=v=>JSON.parse(JSON.stringify(v)),safe=(v)=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(v))throw Error('INVALID_LOCAL_ID');return v;};
  const filename=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/.test(v)||v.includes('..'))throw Error('INVALID_LOCAL_FILE');return v;};
  const missing=e=>e.name==='NotFoundError';
  async function read(dir,name){try{return JSON.parse(await (await dir.getFileHandle(filename(name))).getFile().then(f=>f.text()));}catch(e){if(missing(e))return null;throw e;}}
  async function write(dir,name,data){let file,existed=true;try{file=await dir.getFileHandle(filename(name));}catch(e){if(!missing(e))throw e;existed=false;file=await dir.getFileHandle(filename(name),{create:true});}const text=JSON.stringify(data);if(await (await file.getFile()).text()===text)return false;const stream=await file.createWritable();try{await stream.write(text);await stream.close();return true;}catch(e){try{await stream.abort();if(!existed)await dir.removeEntry(name);}catch(_){}throw e;}}

  async function cases(){return root.getDirectoryHandle('SimulatorTemplate Cases',{create:true});}
  function owned(record){if(!record||record.ownerEmail!==email)throw Error('LOCAL_CASE_NOT_FOUND');return record;}
  function summary(r){return {id:r.id,name:r.name,revision:r.revision,updatedAt:r.updatedAt,equipmentCount:r.equipment?.length||0,isSimulationReady:(r.equipment?.length||0)>=2,fileId:'local:'+r.id,dataClassification:r.metadata?.dataClassification||null};}
  async function manifest(id){const home=await cases();try{const dir=await home.getDirectoryHandle(safe(id));return {dir,record:await read(dir,id+'.case.json')};}catch(e){if(!missing(e))throw e;return {dir:home,record:await read(home,safe(id)+'.case.json'),legacy:true};}}
  async function get(id){const found=await manifest(id),r=owned(found.record);if(!r.simulationFiles)return copy(r);const simulations=[];for(const ref of r.simulationFiles){const s=await read(found.dir,ref.fileName);if(!s||s.id!==ref.id)throw Error('LOCAL_SIMULATION_FILE_MISSING');simulations.push(s);}return {...copy(r),simulations};}
  async function catalog(){const home=await cases(),records=new Map();for await(const [name,handle] of home.entries()){
    let r;if(handle.kind==='directory'&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name))r=await read(handle,name+'.case.json');else if(handle.kind==='file'&&name.endsWith('.case.json'))r=await read(home,name);
    if(r?.ownerEmail===email&&r.id&&r.name){if(!records.has(r.id)||handle.kind==='directory')records.set(r.id,summary(r));}
  }return [...records.values()].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
  async function save(draft,{create=false}={}){safe(draft.id);if(JSON.stringify(draft).length>8*1024*1024)throw Error('LOCAL_CASE_TOO_LARGE');if(!Array.isArray(draft.simulations)||!draft.simulations.length||draft.ownerEmail!==email)throw Error('INVALID_LOCAL_CASE');const ids=new Set();for(const s of draft.simulations){safe(s.id);if(ids.has(s.id)||!Array.isArray(s.equipment))throw Error('INVALID_LOCAL_SIMULATION');ids.add(s.id);}
    async function commit(){const found=await manifest(draft.id),old=found.record;if(create&&old)throw Error('CASE_ALREADY_EXISTS');if(old){owned(old);if(Number(draft.expectedRevision)!==Number(old.revision))throw Error('CASE_CONFLICT');}
      const home=await cases(),dir=await home.getDirectoryHandle(draft.id,{create:true}),record=copy({...old,...draft});delete record.expectedRevision;record.ownerEmail=email;record.revision=old?Number(old.revision)+1:Number(record.revision)||1;record.updatedAt=new Date().toISOString();record.createdAt=old?.createdAt||record.createdAt||record.updatedAt;
      const previous=new Map((old?.simulationFiles||[]).map(ref=>[ref.id,ref])),refs=[];
      const undo=[];
      try{
        for(const simulation of record.simulations){const name=previous.get(simulation.id)?.fileName||'simulation-'+safe(simulation.id)+'.json',before=await read(dir,name);if(await write(dir,name,simulation))undo.push({name,before});refs.push({id:simulation.id,fileName:name});}
        const header={...record,storageVersion:'case-folder-1',simulationFiles:refs,localStorage:{version:1,workspaceId,sync:'DRIVE_DESKTOP_EXTERNAL'}};delete header.simulations;await write(dir,record.id+'.case.json',header);
      }catch(error){
        for(const item of undo.reverse()){try{if(item.before===null)await dir.removeEntry(item.name);else await write(dir,item.name,item.before);}catch(_){error.message+='; rollback incomplete, reconnect and review the local files';}}
        throw error;
      }
      for(const ref of old?.simulationFiles||[])if(!ids.has(ref.id)){try{await dir.removeEntry(filename(ref.fileName));}catch(e){record.localCleanupPending=true;}}
      return record;
    }
    return locks?locks.request('simuline:'+workspaceId+':'+draft.id,commit):commit();
  }
  async function remove(id){const found=await manifest(id);owned(found.record);const home=await cases();if(found.legacy)await home.removeEntry(safe(id)+'.case.json');else await home.removeEntry(safe(id),{recursive:true});return {id,name:found.record.name};}
  return {get,catalog,save,remove,summary};
}
