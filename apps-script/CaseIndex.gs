// Rebuildable catalog of folder manifests and legacy flat cases.
var ST_CASE_INDEX_LIMITS = {maxReadsPerBatch:8,maxBatchMs:4000};

function caseIndexName_(user) { return 'cases-index-'+encodeURIComponent(user.email.toLowerCase())+'.json'; }
function readCaseIndex_(folder,user) {
  var files=folder.getFilesByName(caseIndexName_(user)),file=files.hasNext()?files.next():null;
  var data=file?tryReadCaseFile_(file):null;
  if(!data||data.schemaVersion!=='case-index-1'||data.ownerEmail!==user.email||!Array.isArray(data.entries)||!data.entries.every(function(e){return e&&typeof e.id==='string'&&/^[a-z0-9-]+$/i.test(e.id)&&typeof e.name==='string'&&typeof e.fileId==='string';})) {
    data={schemaVersion:'case-index-1',ownerEmail:user.email,entries:[],complete:false};
  }
  if(data.scan&&!(typeof data.scan.id==='string'&&Array.isArray(data.scan.queue)&&Number.isInteger(data.scan.position)&&data.scan.position>=0&&data.scan.position<=data.scan.queue.length&&data.scan.queue.every(function(e){return e&&typeof e.fileId==='string'&&typeof e.name==='string'&&/^[a-z0-9-]+\.case\.json$/i.test(e.name)&&(!e.folderName||/^[a-z0-9-]+$/i.test(e.folderName));}))) {delete data.scan;data.complete=false;}
  return {file:file,data:data};
}
function writeCaseIndex_(folder,index,user) {
  var json=JSON.stringify(index.data);
  if(index.file)index.file.setContent(json);
  else index.file=folder.createFile(caseIndexName_(user),json,MimeType.PLAIN_TEXT);
}
function caseFileModifiedAt_(file,fallback) {
  return typeof file.getLastUpdated==='function'?file.getLastUpdated().getTime():Date.parse(fallback)||0;
}
function caseCatalogEntries_(data) {
  return data.entries.filter(function(e){return typeof e.id==='string'&&/^[a-z0-9-]+$/i.test(e.id)&&typeof e.name==='string';})
    .map(function(e){return {id:e.id,name:e.name,equipmentCount:e.equipmentCount,isSimulationReady:e.isSimulationReady,
      revision:e.revision,updatedAt:e.updatedAt,fileId:e.fileId,dataClassification:e.dataClassification};})
    .sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));});
}
function getCaseCatalog_(user) {
  if(!getUserSettings_().workspaceRootFolderId)return {cases:[],refreshRequired:false,complete:true};
  var index=readCaseIndex_(getWorkspaceFolders_().cases,user);
  // Bootstrap reads only the small catalog, never the complete case results.
  return {cases:caseCatalogEntries_(index.data),refreshRequired:true,complete:index.data.complete===true};
}

function refreshCaseCatalog_(user,cursor) {
  return withCaseWriteLock_(function(){
    if(!getUserSettings_().workspaceRootFolderId)return {cases:[],hasMore:false,cursor:null};
    var folder=getWorkspaceFolders_().cases,index=readCaseIndex_(folder,user),data=index.data;
    if(cursor&&(!data.scan||data.scan.id!==cursor))return {cases:caseCatalogEntries_(data),hasMore:!!data.scan,cursor:data.scan?.id||null};
    if(!cursor) {
      var files=folder.getFiles(),queue=[],liveIds=new Set(),known=new Map(data.entries.map(function(e){return [e.fileId,e.fileModifiedAt];}));
      while(files.hasNext()) {
        var file=files.next(),name=file.getName();
        if(!/^[a-z0-9-]+\.case\.json$/i.test(name))continue;
        var id=file.getId(),modified=caseFileModifiedAt_(file);
        liveIds.add(id);
        if(known.get(id)!==modified)queue.push({fileId:id,name:name,modifiedAt:modified});
      }
      var children=folder.getFolders();
      while(children.hasNext()) {
        var child=children.next(),childName=child.getName();if(!/^[a-z0-9-]+$/i.test(childName))continue;
        var manifest=findCaseManifest_(child,childName);if(!manifest)continue;
        var manifestId=manifest.getId(),modified=caseFileModifiedAt_(manifest);
        liveIds.add(manifestId);
        if(known.get(manifestId)!==modified)queue.push({fileId:manifestId,name:childName+'.case.json',folderName:childName,modifiedAt:modified});
      }
      data.entries=data.entries.filter(function(e){return liveIds.has(e.fileId);});
      queue.sort(function(a,b){return b.modifiedAt-a.modifiedAt;});
      data.scan={id:Utilities.getUuid(),queue:queue,position:0};
    }
    var scan=data.scan,started=Date.now(),reads=0;
    while(scan.position<scan.queue.length&&reads<ST_CASE_INDEX_LIMITS.maxReadsPerBatch&&(reads===0||Date.now()-started<ST_CASE_INDEX_LIMITS.maxBatchMs)) {
      var item=scan.queue[scan.position++],container=folder;
      if(item.folderName){var children=folder.getFoldersByName(item.folderName);if(!children.hasNext())continue;container=children.next();}
      var matches=item.folderName?null:container.getFilesByName(item.name),current=item.folderName?findCaseManifest_(container,item.folderName):matches.hasNext()?matches.next():null;
      // A moved/deleted file is not read through its stale ID.
      if(!current||current.getId()!==item.fileId)continue;
      var record=tryReadCaseFile_(current);reads++;
      data.entries=data.entries.filter(function(e){return e.fileId!==item.fileId;});
      if(record&&record.ownerEmail===user.email&&record.id+'.case.json'===item.name&&typeof record.name==='string') {
        var existing=data.entries.find(function(e){return e.id===record.id;});
        if(item.folderName||!existing?.folderName){
          data.entries=data.entries.filter(function(e){return e.id!==record.id;});
          data.entries.push(Object.assign(toCaseSummary_(record,current),{folderName:item.folderName||null,fileModifiedAt:caseFileModifiedAt_(current,record.updatedAt)}));
        }
      }
    }
    var hasMore=scan.position<scan.queue.length;
    if(!hasMore){delete data.scan;data.complete=true;data.reconciledAt=new Date().toISOString();}
    writeCaseIndex_(folder,index,user);
    return {cases:caseCatalogEntries_(data),hasMore:hasMore,cursor:hasMore?scan.id:null};
  });
}

// Called under the same user lock as the case write. A catalog failure must not
// turn a successfully persisted case into an ambiguous failed-save response.
function updateCaseIndex_(caseData,file,user,removed) {
  try {
    var folder=getWorkspaceFolders_().cases,index=readCaseIndex_(folder,user);
    index.data.entries=index.data.entries.filter(function(e){return e.id!==caseData.id&&e.fileId!==file.getId();});
    if(!removed)index.data.entries.push(Object.assign(toCaseSummary_(caseData,file),{folderName:([caseManifestName_(caseData.id),'case.json'].includes(file.getName()))?caseData.id:null,fileModifiedAt:caseFileModifiedAt_(file,caseData.updatedAt)}));
    writeCaseIndex_(folder,index,user);
  }catch(error){console.error(JSON.stringify({event:'CASE_INDEX_UPDATE_FAILED',type:error?.name||'Error'}));}
}

