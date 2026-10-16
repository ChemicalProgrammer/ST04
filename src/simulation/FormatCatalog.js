// Relational authoring catalog; simulation receives immutable resolved format snapshots.
export function normalizeFormatCatalog(metadata={},equipment) {
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
export function resolvePackingFormats(catalog){
  return catalog.formats.map(format=>{
    const product=catalog.products.find(p=>p.id===format.productId),box=catalog.boxes.find(b=>b.id===format.boxId);
    if(!product||!box)throw Error((format.name||'Packing format')+': select an existing product and box.');
    const profiles={};
    for(const id of new Set([...Object.keys(product.equipment||{}),...Object.keys(box.equipment||{}),...Object.keys(format.equipment||{})])){
      const local=format.equipment?.[id]||{},input=local.inputUnit||'BOTTLES',output=local.outputUnit||input;
      const shared=input!==output?{}:(output==='CASES'?box.equipment?.[id]:product.equipment?.[id])||{};
      profiles[id]={...JSON.parse(JSON.stringify(shared)),...JSON.parse(JSON.stringify(local))};
    }
    return {id:format.id,formatId:format.id,name:format.name,productId:product.id,productName:product.name,boxId:box.id,boxName:box.name,
      volumeMl:product.volumeMl,bottleLengthMm:product.bottle?.lengthMm,caseLengthMm:box.lengthMm,bottlesPerCase:format.bottlesPerCase,packPattern:format.packPattern||'',
      presentations:{bottle:JSON.parse(JSON.stringify(product.bottle||{})),case:{lengthMm:box.lengthMm,widthMm:box.widthMm,heightMm:box.heightMm,bottlesPerCase:format.bottlesPerCase}},
      equipment:profiles};
  });
}
export function validateFormatCatalog(catalog){
  for(const [kind,items] of [['Product',catalog.products],['Box',catalog.boxes],['Packing format',catalog.formats]]){
    if(!Array.isArray(items)||items.length>100)throw Error(kind+': at most 100 records are supported.');
    const ids=new Set();for(const item of items){if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim())throw Error(kind+' requires a name and a unique ID.');ids.add(item.id);}
  }
  for(const p of catalog.products){if(p.volumeMl!==undefined&&(!Number.isFinite(p.volumeMl)||p.volumeMl<0))throw Error(p.name+': volume must be nonnegative.');}
  for(const item of [...catalog.products.map(p=>({...p,...p.bottle})),...catalog.boxes])for(const key of ['lengthMm','widthMm','heightMm'])if(item[key]!==undefined&&(!Number.isFinite(item[key])||item[key]<=0))throw Error(item.name+': dimensions must be positive.');
  const formats=resolvePackingFormats(catalog);
  for(const f of formats)if(!Number.isInteger(f.bottlesPerCase)||f.bottlesPerCase<1||f.bottlesPerCase>10000)throw Error(f.name+': bottles per case must be an integer from 1 to 10,000.');
  return formats;
}
export function mergeFormatCatalogs(current,incoming){
  validateFormatCatalog(current);validateFormatCatalog(incoming);
  const result=JSON.parse(JSON.stringify(current));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  for(const key of ['products','boxes','formats'])for(const record of incoming[key]){
    const existing=result[key].find(item=>item.id===record.id);
    if(existing&&JSON.stringify(canonical(existing))!==JSON.stringify(canonical(record)))throw Error('Shared '+key+' record '+record.name+' differs from the current case. Import the complete case or use matching catalog records.');
    if(!existing)result[key].push(JSON.parse(JSON.stringify(record)));
  }
  validateFormatCatalog(result);return result;
}
