// Format settings are applied on copies; installation and reliability stay shared.
export const PRODUCT_FLOW_UNITS = ['BOTTLES', 'CASES'];
export function productFlowUnit(equipment, side='output') {
  return equipment.processData?.flowUnits?.[side] || 'BOTTLES';
}
export function productUnitFactor(equipment, product, side='output') {
  return productFlowUnit(equipment, side)==='CASES' ? product.bottlesPerCase : 1;
}
export function applyProductProfile(equipment, product) {
  return equipment.map(original=>{
    const item=JSON.parse(JSON.stringify(original)),profile=product.equipment?.[item.id]||{};
    item.processData=item.processData||{};
    if(profile.ratePerMinute!==undefined)item.nominalRatePerSecond=profile.ratePerMinute/60;
    if(profile.startupSeconds!==undefined)item.startupDelaySeconds=profile.startupSeconds;
    if(profile.startupSeconds!==undefined)item.processData.upstream={...item.processData.upstream,startupTimeSeconds:profile.startupSeconds};
    if(profile.rampSeconds!==undefined)item.restartRampUpSeconds=profile.rampSeconds;
    if(profile.rampSeconds!==undefined)item.processData.downstream={...item.processData.downstream,rampUpTimeSeconds:profile.rampSeconds};
    item.processData.productInputRatePerSecond=item.nominalRatePerSecond*productUnitFactor(item,product)/productUnitFactor(item,product,'input');
    if(item.type==='CONVEYOR'||item.processData.role==='CONVEYOR') {
      const length=productFlowUnit(item)==='CASES'?product.caseLengthMm:product.bottleLengthMm;
      const upstream={...item.processData.upstream,packageLengthMm:length},accumulation={...item.processData.accumulation};
      if(accumulation.productLengthMm!==undefined)accumulation.productLengthMm=length;
      if(accumulation.productPitchMm!==undefined&&profile.movingGapMm!==undefined)accumulation.productPitchMm=length+profile.movingGapMm;
      if(profile.movingGapMm!==undefined)accumulation.productSpacingOverride=true;
      for(const key of ['movingGapMm','accumulatedGapMm'])if(profile[key]!==undefined)accumulation[key]=profile[key];
      if(profile.dischargeGapMm!==undefined)upstream.dischargePitchMm=length+profile.dischargeGapMm;
      const downstream={...item.processData.downstream};
      if(profile.infeedGapMm!==undefined)downstream.infeedPitchMm=length+profile.infeedGapMm;
      if(profile.speedMmPerSecond!==undefined){accumulation.speedMode='MANUAL';accumulation.conveyorSpeedMmPerSecond=profile.speedMmPerSecond;delete accumulation.targetPopulationPercent;delete accumulation.targetOverspeedPercent;}
      item.processData={...item.processData,upstream,downstream,accumulation};
    }
    return item;
  });
}
export function validateProductSetup(input) {
  const products=input?.run?.productCatalog;
  if(!products?.length&&!input?.run?.initialProductId){if(input?.run?.eventsEnabled!==false&&input?.run?.plannedStops?.some(e=>e.targetProductId))throw Error('Select an initial product before assigning a changeover destination.');return [];}
  if(!Array.isArray(products)||!products.length||products.length>100)throw Error('Configure between 1 and 100 products.');
  if(input.run.engineId&&input.run.engineId!=='ST_CURRENT')throw Error('Product profiles and bottle/case conversion require the ST engine.');
  const positive=value=>Number.isFinite(value)&&value>0,nonnegative=value=>Number.isFinite(value)&&value>=0;
  const ids=new Set(),equipment=input.case?.equipment||[];
  for(const p of products){
    if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim())throw Error('Products require unique IDs and a name.');ids.add(p.id);
    if(!Number.isInteger(p.bottlesPerCase)||p.bottlesPerCase<1||p.bottlesPerCase>10000)throw Error(p.name+': bottles per case must be an integer from 1 to 10,000.');
    if(!positive(p.bottleLengthMm))throw Error(p.name+': enter the bottle length along the conveyor.');
    if(equipment.some(e=>productFlowUnit(e)==='CASES')&&!positive(p.caseLengthMm))throw Error(p.name+': enter the case length along the conveyor.');
    for(const [id,profile] of Object.entries(p.equipment||{})){
      if(!equipment.some(e=>e.id===id))continue;
      for(const key of ['movingGapMm','accumulatedGapMm','dischargeGapMm','infeedGapMm','startupSeconds','rampSeconds'])if(profile[key]!==undefined&&!nonnegative(profile[key]))throw Error(p.name+' / '+id+': '+key+' must be nonnegative.');
      for(const key of ['ratePerMinute','speedMmPerSecond'])if(profile[key]!==undefined&&!positive(profile[key]))throw Error(p.name+' / '+id+': '+key+' must be positive.');
    }
  }
  if(!ids.has(input.run.initialProductId))throw Error('Select an initial product.');
  for(let i=0;i<equipment.length;i++){
    const e=equipment[i],isBelt=e.type==='CONVEYOR'||e.processData?.role==='CONVEYOR',units=e.processData?.flowUnits;
    if(!units||!PRODUCT_FLOW_UNITS.includes(units.input)||!PRODUCT_FLOW_UNITS.includes(units.output))throw Error(e.name+': select input and output units.');
    if(isBelt&&units.input!==units.output)throw Error(e.name+': a conveyor cannot convert bottles to cases.');
    if(!isBelt&&units.input!==units.output&&!(e.type==='CASE_PACKER'&&units.input==='BOTTLES'&&units.output==='CASES'))throw Error(e.name+': bottle-to-case conversion belongs on a Case Packer.');
    if(i===0&&units.input!=='BOTTLES')throw Error('The first machine must receive bottles.');
    if(i&&productFlowUnit(equipment[i-1])!==units.input)throw Error(e.name+': input unit does not match the preceding output.');
  }
  for(const event of input.run.eventsEnabled===false?[]:(input.run.plannedStops||[]))if(event.targetProductId){
    if(event.category!=='changeoverMinutes'||!ids.has(event.targetProductId))throw Error('A changeover must reference an existing destination product.');
  }
  return products.map(product=>({product,equipment:applyProductProfile(equipment,product)}));
}
