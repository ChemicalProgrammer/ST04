// Relational authoring catalog; simulation receives immutable resolved format snapshots.
export function normalizeFormatCatalog(metadata={}) {
  const clone=value=>JSON.parse(JSON.stringify(value));
  if(metadata.formatCatalog){
    const source=clone(metadata.formatCatalog);
    return {version:1,products:source.products||[],boxes:source.boxes||[],formats:source.formats||[]};
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
  return result;
}
export function resolvePackingFormats(catalog){
  return catalog.formats.map(format=>{
    const product=catalog.products.find(p=>p.id===format.productId),box=catalog.boxes.find(b=>b.id===format.boxId);
    if(!product||!box)throw Error((format.name||'Packing format')+': select an existing product and box.');
    return {id:format.id,formatId:format.id,name:format.name,productId:product.id,productName:product.name,boxId:box.id,boxName:box.name,
      volumeMl:product.volumeMl,bottleLengthMm:product.bottle?.lengthMm,caseLengthMm:box.lengthMm,bottlesPerCase:format.bottlesPerCase,packPattern:format.packPattern||'',
      presentations:{bottle:JSON.parse(JSON.stringify(product.bottle||{})),case:{lengthMm:box.lengthMm,widthMm:box.widthMm,heightMm:box.heightMm,bottlesPerCase:format.bottlesPerCase}},
      equipment:JSON.parse(JSON.stringify(format.equipment||{}))};
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
