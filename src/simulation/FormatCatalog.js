// Relational authoring catalog; simulation receives immutable resolved format snapshots.
function legacyCatalog(metadata={},equipment) {
  const clone=value=>JSON.parse(JSON.stringify(value));
  if(metadata.formatCatalog){
    const source=clone(metadata.formatCatalog);
    const catalog={...source,version:source.version||1,products:source.products||[],boxes:source.boxes||[],formats:source.formats||[]};
    return equipment?shareFormatBehavior(catalog,equipment):catalog;
  }
  const result={version:1,products:[],boxes:[],formats:[]};
  for(const old of metadata.products||[]){
    const bottle=old.presentations?.bottle||{lengthMm:old.bottleLengthMm};
    const box=old.presentations?.case||{lengthMm:old.caseLengthMm};
    const productId='product-'+old.id,boxId='box-'+old.id;
    result.products.push({id:productId,name:old.name,volumeMl:old.volumeMl,bottle:clone(bottle)});
    result.boxes.push({id:boxId,name:(old.name||'Product')+' box',lengthMm:box.lengthMm,widthMm:box.widthMm,heightMm:box.heightMm});
    result.formats.push({id:old.id,name:old.name,productId,boxId,bottlesPerCase:box.bottlesPerCase??old.bottlesPerCase??12,packPattern:old.packPattern||'',equipment:clone(old.equipment||{})});
  }
  return equipment?shareFormatBehavior(result,equipment):result;
}
// Move reusable behavior to its material owner, retaining only genuine format exceptions.
export function shareFormatBehavior(catalog,equipment){
  if(catalog.version>=2)return catalog;
  const clone=value=>JSON.parse(JSON.stringify(value));
  for(const record of [...catalog.products,...catalog.boxes])record.equipment=record.equipment||{};
  for(const format of catalog.formats){
    const product=catalog.products.find(p=>p.id===format.productId),box=catalog.boxes.find(b=>b.id===format.boxId);
    if(!product||!box)continue;
    for(const [id,profile] of Object.entries(format.equipment||{})){
      const base=equipment.find(e=>e.id===id),input=profile.inputUnit||base?.processData?.flowUnits?.input||'BOTTLES',output=profile.outputUnit||base?.processData?.flowUnits?.output||'BOTTLES';
      if(input!==output)continue;
      const owner=output==='CASES'?box:product,behavior={...profile};delete behavior.inputUnit;delete behavior.outputUnit;
      const existing=owner.equipment[id];
      if(!existing)owner.equipment[id]=clone(behavior);
      // Identical values become shared; differing fields remain explicit compatibility overrides.
      const override={inputUnit:input,outputUnit:output};
      for(const [key,value] of Object.entries(behavior))if(JSON.stringify(value)!==JSON.stringify(owner.equipment[id][key]))override[key]=clone(value);
      format.equipment[id]=override;
    }
  }
  catalog.version=2;return catalog;
}
function resolveLegacyPackingFormats(catalog){
  return catalog.formats.map(format=>{
    const product=catalog.products.find(p=>p.id===format.productId),box=catalog.boxes.find(b=>b.id===format.boxId);
    if(!product||!box)throw Error((format.name||'Packing format')+': select an existing product and box.');
    const profiles={};
    for(const id of new Set([...Object.keys(product.equipment||{}),...Object.keys(box.equipment||{}),...Object.keys(format.equipment||{})])){
      const local=format.equipment?.[id]||{},input=local.inputUnit||'BOTTLES',output=local.outputUnit||input;
      const shared=input!==output?{}:(output==='CASES'?box.equipment?.[id]:product.equipment?.[id])||{};
      const active=profile=>{const result=JSON.parse(JSON.stringify(profile));if(result.enabled===false||result.applies===false){for(const key of Object.keys(result))if(!['inputUnit','outputUnit'].includes(key))delete result[key];}delete result.enabled;return result;};
      profiles[id]={...active(shared),...active(local)};
    }
    return {id:format.id,formatId:format.id,name:format.name,productId:product.id,productName:product.name,boxId:box.id,boxName:box.name,
      volumeMl:product.volumeMl,bottleLengthMm:product.bottle?.lengthMm,caseLengthMm:box.lengthMm,bottlesPerCase:format.bottlesPerCase,packPattern:format.packPattern||'',
      presentations:{bottle:JSON.parse(JSON.stringify(product.bottle||{})),case:{lengthMm:box.lengthMm,widthMm:box.widthMm,heightMm:box.heightMm,bottlesPerCase:format.bottlesPerCase}},
      equipment:profiles};
  });
}
// Version 3 owns packaging dimensions and case behavior directly on each format.
export function normalizeFormatCatalog(metadata={},equipment){
  if(metadata.formatCatalog?.version>=3)return JSON.parse(JSON.stringify(metadata.formatCatalog));
  const previous=legacyCatalog(metadata,equipment),snapshots=resolveLegacyPackingFormats(previous);
  const catalog={version:3,products:previous.products,formats:previous.formats.map((format,index)=>{
    const resolved=snapshots[index],profiles={};for(const [id,p] of Object.entries(resolved.equipment)){const units={inputUnit:p.inputUnit||'BOTTLES',outputUnit:p.outputUnit||p.inputUnit||'BOTTLES'};profiles[id]=units.inputUnit==='BOTTLES'&&units.outputUnit==='BOTTLES'?JSON.parse(JSON.stringify(format.equipment?.[id]||units)):p;}
    return {id:format.id,name:format.name,productId:format.productId,bottlesPerCase:format.bottlesPerCase,case:{lengthMm:resolved.caseLengthMm,widthMm:resolved.presentations.case.widthMm,heightMm:resolved.presentations.case.heightMm},equipment:profiles,legacyBoxId:resolved.boxId,legacyBoxName:resolved.boxName,packPattern:format.packPattern||''};
  })};
  // Keep pre-migration input records for recovery; run snapshots and IDs are never rewritten.
  if(previous.products.length||previous.boxes.length||previous.formats.length)catalog.legacyCatalog=JSON.parse(JSON.stringify(previous));
  return catalog;
}
export function resolvePackingFormats(catalog){
  if((catalog.version||1)<3)return resolveLegacyPackingFormats(catalog);
  const active=profile=>{const p=JSON.parse(JSON.stringify(profile||{}));if(p.enabled===false||p.applies===false)for(const key of Object.keys(p))if(!['inputUnit','outputUnit'].includes(key))delete p[key];delete p.enabled;return p;};
  return catalog.formats.map(format=>{
    const product=catalog.products.find(p=>p.id===format.productId);if(!product)throw Error((format.name||'Format')+': select an existing product.');
    const box=format.case||{},profiles={};
    for(const id of new Set([...Object.keys(product.equipment||{}),...Object.keys(format.equipment||{})])){
      const local=format.equipment?.[id]||{},input=local.inputUnit||'BOTTLES',output=local.outputUnit||input;
      const shared=input==='BOTTLES'&&output==='BOTTLES'?product.equipment?.[id]||{}:{};
      profiles[id]={...active(shared),...active(local)};
    }
    return {id:format.id,formatId:format.id,name:format.name,productId:product.id,productName:product.name,boxId:format.legacyBoxId||format.id,boxName:format.legacyBoxName||format.name,volumeMl:product.volumeMl,bottleLengthMm:product.bottle?.lengthMm,caseLengthMm:box.lengthMm,bottlesPerCase:format.bottlesPerCase,packPattern:format.packPattern||'',presentations:{bottle:JSON.parse(JSON.stringify(product.bottle||{})),case:{lengthMm:box.lengthMm,widthMm:box.widthMm,heightMm:box.heightMm,bottlesPerCase:format.bottlesPerCase}},equipment:profiles};
  });
}
export function validateFormatCatalog(catalog){
  for(const [kind,items] of [['Product',catalog.products],...((catalog.version||1)<3?[['Box',catalog.boxes]]:[]),['Packing format',catalog.formats]]){
    if(!Array.isArray(items)||items.length>100)throw Error(kind+': at most 100 records are supported.');
    const ids=new Set();for(const item of items){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim())throw Error(kind+' requires a name and a unique ID.');ids.add(item.id);}
  }
  for(const p of catalog.products){if(p.volumeMl!==undefined&&(!Number.isFinite(p.volumeMl)||p.volumeMl<0))throw Error(p.name+': volume must be nonnegative.');}
  for(const item of [...catalog.products.map(p=>({...p,...p.bottle})),...(catalog.boxes||[]),...(catalog.formats||[]).map(f=>({...f,...f.case}))])for(const key of ['lengthMm','widthMm','heightMm'])if(item[key]!==undefined&&(!Number.isFinite(item[key])||item[key]<=0))throw Error(item.name+': dimensions must be positive.');
  for(const p of catalog.products)validateMaterialRecord(p,'products');
  for(const b of catalog.boxes||[])validateMaterialRecord(b,'boxes');
  if(catalog.version>=3)for(const f of catalog.formats)validateMaterialRecord(f,'formats');
  const formats=resolvePackingFormats(catalog);
  for(const f of formats)if(!Number.isInteger(f.bottlesPerCase)||f.bottlesPerCase<1||f.bottlesPerCase>10000)throw Error(f.name+': bottles per case must be an integer from 1 to 10,000.');
  return formats;
}
export function mergeFormatCatalogs(current,incoming){
  current=normalizeFormatCatalog({formatCatalog:current});incoming=normalizeFormatCatalog({formatCatalog:incoming});validateFormatCatalog(current);validateFormatCatalog(incoming);
  const result=JSON.parse(JSON.stringify(current));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  for(const key of ['products','formats'])for(const record of incoming[key]){
    const existing=result[key].find(item=>item.id===record.id);
    if(existing&&JSON.stringify(canonical(existing))!==JSON.stringify(canonical(record)))throw Error('Shared '+key+' record '+record.name+' differs from the current case. Import the complete case or use matching catalog records.');
    if(!existing)result[key].push(JSON.parse(JSON.stringify(record)));
  }
  validateFormatCatalog(result);return result;
}

const MATERIAL_PROFILE_KEYS=['ratePerMinute','startupSeconds','rampSeconds','movingGapMm','accumulatedGapMm','dischargeGapMm','infeedGapMm','speedMmPerSecond','enabled','applies'];
function validateMaterialRecord(record,kind){
  if(!record||typeof record.name!=='string'||!record.name.trim())throw Error('Enter a '+(kind==='formats'?'format':kind==='boxes'?'box':'product')+' name.');
  for(const value of Object.values(record.equipment||{})){
    if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Equipment settings must be objects.');
    for(const key of ['enabled','applies'])if(value[key]!==undefined&&typeof value[key]!=='boolean')throw Error(key+' must be a checkbox value.');
    for(const key of MATERIAL_PROFILE_KEYS.filter(k=>!['enabled','applies'].includes(k)))if(value[key]!==undefined&&(!Number.isFinite(value[key])||value[key]<0||(['ratePerMinute','speedMmPerSecond'].includes(key)&&value[key]===0)))throw Error(record.name+': '+key+' must be '+(['ratePerMinute','speedMmPerSecond'].includes(key)?'positive.':'nonnegative.'));
  }
  const shape=kind==='formats'?record.case||{}:kind==='boxes'?record:record.bottle||{};
  for(const key of ['lengthMm','widthMm','heightMm'])if(shape[key]!==undefined&&(!Number.isFinite(shape[key])||shape[key]<=0))throw Error(record.name+': dimensions must be positive.');
  if(kind==='formats'&&(typeof record.productId!=='string'||!record.productId||!Number.isInteger(record.bottlesPerCase)||record.bottlesPerCase<1||record.bottlesPerCase>10000))throw Error('Select a product and a whole number of bottles per case from 1 to 10,000.');
  if(record.volumeMl!==undefined&&(!Number.isFinite(record.volumeMl)||record.volumeMl<0))throw Error(record.name+': volume must be nonnegative.');
}
export function materialConfiguration(kind,record,equipment=[]){
  if(!['products','boxes','formats'].includes(kind))throw Error('Choose a product or format configuration.');
  validateMaterialRecord(record,kind);
  return {schema:kind==='formats'?'st-material-configuration-v2':'st-material-configuration-v1',kind,record:JSON.parse(JSON.stringify(record))};
}
export function readMaterialConfiguration(text,kind,currentId,equipment=[]){
  if(text.length>1048576)throw Error('Configuration exceeds 1 MB.');
  const payload=JSON.parse(text,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw Error('Unsafe configuration key.');return value;});
  if(!['st-material-configuration-v1','st-material-configuration-v2'].includes(payload.schema)||payload.kind!==kind||!payload.record)throw Error('Import a matching '+(kind==='formats'?'format':kind==='boxes'?'box':'product')+' configuration.');
  const source=payload.record,allowed=kind==='formats'?['id','name','productId','bottlesPerCase','case','equipment','legacyBoxId','legacyBoxName','packPattern']:kind==='boxes'?['id','name','lengthMm','widthMm','heightMm','equipment']:['id','name','volumeMl','bottle','equipment'];
  for(const key of Object.keys(source))if(!allowed.includes(key))throw Error('Unsupported material field: '+key);
  if(source.case)for(const key of Object.keys(source.case))if(!['lengthMm','widthMm','heightMm'].includes(key))throw Error('Unsupported case field: '+key);
  if(source.bottle)for(const key of Object.keys(source.bottle))if(!['lengthMm','widthMm','heightMm'].includes(key))throw Error('Unsupported bottle field: '+key);
  const result={...source,id:currentId,equipment:{}};
  if(source.equipment&&(Array.isArray(source.equipment)||typeof source.equipment!=='object'))throw Error('Equipment settings must be an object.');
  for(const [id,profile] of Object.entries(source.equipment||{})){
    if(!equipment.some(e=>e.id===id))throw Error('Equipment '+id+' is not installed in this simulation. Import into a matching line.');
    if(!profile||Array.isArray(profile)||typeof profile!=='object')throw Error('Equipment settings must be objects.');
    for(const key of Object.keys(profile))if(!MATERIAL_PROFILE_KEYS.includes(key)&&!(kind==='formats'&&['inputUnit','outputUnit'].includes(key)))throw Error('Unsupported equipment field: '+key);
    if(kind==='formats')for(const side of ['inputUnit','outputUnit'])if(profile[side]!==undefined&&!['BOTTLES','CASES'].includes(profile[side]))throw Error('Invalid physical unit.');
    result.equipment[id]={...profile};
  }
  validateMaterialRecord(result,kind);return result;
}
