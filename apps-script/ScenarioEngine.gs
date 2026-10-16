var STScenarioEngine_ = (function(){
// Relational authoring catalog; simulation receives immutable resolved format snapshots.
function normalizeFormatCatalog(metadata={},equipment) {
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
function shareFormatBehavior(catalog,equipment){
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
function resolvePackingFormats(catalog){
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
function validateFormatCatalog(catalog){
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
function mergeFormatCatalogs(current,incoming){
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

// Format settings are applied on copies; installation and reliability stay shared.
const PRODUCT_FLOW_UNITS = ['BOTTLES', 'CASES'];
function productFlowUnit(equipment, side='output') {
  return equipment.processData?.flowUnits?.[side] || 'BOTTLES';
}
function productPresentation(product,unit='BOTTLES'){
  return product.presentations?.[unit==='CASES'?'case':'bottle']||{lengthMm:unit==='CASES'?product.caseLengthMm:product.bottleLengthMm,bottlesPerCase:product.bottlesPerCase};
}
function productPackSize(product){return productPresentation(product,'CASES').bottlesPerCase??product.bottlesPerCase;}
function productProfileUnits(equipment,product){
  const profile=product.equipment?.[equipment.id]||{},base=equipment.processData?.flowUnits||{};
  return {input:profile.inputUnit||base.input||'BOTTLES',output:profile.outputUnit||base.output||'BOTTLES'};
}
function productUnitFactor(equipment, product, side='output') {
  return productFlowUnit(equipment, side)==='CASES' ? productPackSize(product) : 1;
}
function applyProductProfile(equipment, product) {
  return equipment.map(original=>{
    const item=JSON.parse(JSON.stringify(original)),profile=product.equipment?.[item.id]||{};
    item.processData=item.processData||{};
    if(profile.applies===false){item.processData.productApplies=false;return item;}
    item.processData.flowUnits=productProfileUnits(item,product);
    item.unitOfFlow=item.processData.flowUnits.output.toLowerCase();
    if(profile.ratePerMinute!==undefined)item.nominalRatePerSecond=profile.ratePerMinute/60;
    if(profile.startupSeconds!==undefined)item.startupDelaySeconds=profile.startupSeconds;
    if(profile.startupSeconds!==undefined)item.processData.upstream={...item.processData.upstream,startupTimeSeconds:profile.startupSeconds};
    if(profile.rampSeconds!==undefined)item.restartRampUpSeconds=profile.rampSeconds;
    if(profile.rampSeconds!==undefined)item.processData.downstream={...item.processData.downstream,rampUpTimeSeconds:profile.rampSeconds};
    item.processData.productInputRatePerSecond=item.nominalRatePerSecond*productUnitFactor(item,product)/productUnitFactor(item,product,'input');
    if(item.type==='CONVEYOR'||item.processData.role==='CONVEYOR') {
      const length=productPresentation(product,productFlowUnit(item)).lengthMm??item.processData.upstream?.packageLengthMm??item.processData.accumulation?.productLengthMm;
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
function validateProductDefinitions(products,equipment=[],options={}){
  if(!Array.isArray(products)||products.length>100)throw Error('Configure at most 100 products.');
  const positive=value=>Number.isFinite(value)&&value>0,nonnegative=value=>Number.isFinite(value)&&value>=0,ids=new Set();
  for(const p of products){
    if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim())throw Error('Products require unique IDs and a name.');ids.add(p.id);
    const pack=productPackSize(p);if(!Number.isInteger(pack)||pack<1||pack>10000)throw Error(p.name+': bottles per case must be an integer from 1 to 10,000.');
    if(p.volumeMl!==undefined&&!nonnegative(p.volumeMl))throw Error(p.name+': volume must be nonnegative.');
    for(const unit of PRODUCT_FLOW_UNITS){
      const presentation=productPresentation(p,unit),used=equipment.some(e=>p.equipment?.[e.id]?.applies!==false&&Object.values(productProfileUnits(e,p)).includes(unit));
      if(options.requireDimensions!==false&&used&&presentation.lengthMm===undefined){const belts=equipment.filter(e=>(e.type==='CONVEYOR'||e.processData?.role==='CONVEYOR')&&productProfileUnits(e,p).output===unit&&p.equipment?.[e.id]?.applies!==false);if(belts.some(e=>!positive(e.processData?.upstream?.packageLengthMm??e.processData?.accumulation?.productLengthMm)))throw Error(p.name+': enter the '+(unit==='CASES'?'case':'bottle')+' length along the conveyor, or set a default on each conveyor.');}
      for(const key of ['lengthMm','widthMm','heightMm'])if(presentation[key]!==undefined&&!positive(presentation[key]))throw Error(p.name+': '+unit.toLowerCase()+' '+key+' must be positive.');
    }
    for(const [id,profile] of Object.entries(p.equipment||{})){
      if(!equipment.some(e=>e.id===id))continue;
      if(profile.applies!==undefined&&typeof profile.applies!=='boolean')throw Error(p.name+' / '+id+': applicability must be a checkbox value.');
      for(const key of ['inputUnit','outputUnit'])if(profile[key]!==undefined&&!PRODUCT_FLOW_UNITS.includes(profile[key]))throw Error(p.name+' / '+id+': select a bottle or case presentation.');
      if(profile.applies===false)continue;
      for(const key of ['movingGapMm','accumulatedGapMm','dischargeGapMm','infeedGapMm','startupSeconds','rampSeconds'])if(profile[key]!==undefined&&!nonnegative(profile[key]))throw Error(p.name+' / '+id+': '+key+' must be nonnegative.');
      for(const key of ['ratePerMinute','speedMmPerSecond'])if(profile[key]!==undefined&&!positive(profile[key]))throw Error(p.name+' / '+id+': '+key+' must be positive.');
    }
  }
}
function validateProductSetup(input) {
  const products=input?.run?.productCatalog,initialId=input?.run?.initialFormatId??input?.run?.initialProductId;
  if(input?.run?.initialFormatId&&input?.run?.initialProductId&&input.run.initialFormatId!==input.run.initialProductId)throw Error('Initial format references disagree.');
  if(!products?.length&&!initialId){if(input?.run?.eventsEnabled!==false&&input?.run?.plannedStops?.some(e=>e.targetFormatId||e.targetProductId))throw Error('Select an initial product before assigning a changeover destination.');return [];}
  if(!Array.isArray(products)||!products.length)throw Error('Configure at least one product.');
  if(input.run.engineId&&input.run.engineId!=='ST_CURRENT')throw Error('Product profiles and bottle/case conversion require the ST engine.');
  const equipment=input.case?.equipment||[];validateProductDefinitions(products,equipment,{requireDimensions:false});
  const ids=new Set(products.map(p=>p.id)),used=new Set([initialId]);
  if(!ids.has(initialId))throw Error('Select an initial product.');
  for(const event of input.run.eventsEnabled===false?[]:(input.run.plannedStops||[])){const destination=event.targetFormatId??event.targetProductId;if(!destination)continue;if(event.targetFormatId&&event.targetProductId&&event.targetFormatId!==event.targetProductId)throw Error('Changeover format references disagree.');if(event.category!=='changeoverMinutes'||!ids.has(destination))throw Error('A changeover must reference an existing destination packing format.');used.add(destination);}
  const scheduled=products.filter(p=>used.has(p.id)),initial=scheduled.find(p=>p.id===initialId);
  for(const product of scheduled)for(const e of equipment){const a=productProfileUnits(e,initial),b=productProfileUnits(e,product);if(a.input!==b.input||a.output!==b.output)throw Error(e.name+': changing bottle/case presentation at the same installed step during a run is not supported; use separate simulations.');}
  return scheduled.map(product=>{
    validateProductDefinitions([product],equipment);
    for(let i=0;i<equipment.length;i++){
      const e=equipment[i],profile=product.equipment?.[e.id]||{},isBelt=e.type==='CONVEYOR'||e.processData?.role==='CONVEYOR',units=productProfileUnits(e,product);
      if(profile.applies===false)throw Error(product.name+' does not apply to '+e.name+'. This serial line has no bypass; select a compatible product or include this equipment.');
      // Legacy equipment must explicitly declare units unless the product supplies them.
      if(!e.processData?.flowUnits&&!profile.inputUnit&&!profile.outputUnit)throw Error(e.name+': select input and output units.');
      if(!PRODUCT_FLOW_UNITS.includes(units.input)||!PRODUCT_FLOW_UNITS.includes(units.output))throw Error(e.name+': select input and output units.');
      if(isBelt&&units.input!==units.output)throw Error(e.name+': a conveyor cannot convert bottles to cases.');
      if(!isBelt&&units.input!==units.output&&!(e.type==='CASE_PACKER'&&units.input==='BOTTLES'&&units.output==='CASES'))throw Error(e.name+': bottle-to-case conversion belongs on a Case Packer.');
      if(i===0&&units.input!=='BOTTLES')throw Error('The first machine must receive bottles.');
      if(i&&productProfileUnits(equipment[i-1],product).output!==units.input)throw Error(e.name+': input unit does not match the preceding output.');
    }
    return {product,equipment:applyProductProfile(equipment,product)};
  });
}

// Calendar exclusions are mutually exclusive line stops; reporting adjustments
// stay outside the physical schedule. Event timing is independent of the RNG.
const PLANT_STOP_FIELDS = ['changeoverMinutes','cleaningMinutes','autonomousMaintenanceMinutes','plannedMaintenanceMinutes','breakMinutes','trainingMinutes','experimentationMinutes'];
function plantCalendarSchedule(calendar, tickSeconds=.25) {
  if(!calendar?.enabled||calendar.mode!=='SCHEDULED')return {events:[],horizonSeconds:null};
  const fail=message=>{throw new Error('Plant calendar: '+message);};
  if(!Number.isFinite(tickSeconds)||tickSeconds<=0)fail('invalid tick duration.');
  for(const key of ['totalMinutes','externalMinutes','coReportingErrorMinutes',...PLANT_STOP_FIELDS])if(calendar[key]!=null&&(!Number.isFinite(calendar[key])||calendar[key]<0))fail(key+' must be nonnegative.');
  if(!(calendar.totalMinutes>0))fail('total time is required.');
  const horizonSeconds=(calendar.totalMinutes-(calendar.externalMinutes||0)-(calendar.coReportingErrorMinutes||0))*60;
  if(!(horizonSeconds>0))fail('exclusions leave no simulation time.');
  if(!['EVEN','TIMED',undefined].includes(calendar.distribution))fail('unsupported event distribution.');
  if(!['RESTART','RESUME',undefined].includes(calendar.restartPolicy))fail('unsupported restart policy.');
  const events=[];
  for(const key of PLANT_STOP_FIELDS){const minutes=calendar[key]||0;if(!minutes)continue;
    const plan=calendar.plans?.[key]||{},count=plan.count??1;
    if(!Number.isInteger(count)||count<1||count>1000)fail(key+' requires 1–1,000 events.');
    if(events.length+count>5000)fail('at most 5,000 events are supported.');
    const durationSeconds=minutes*60/count;
    if(durationSeconds<tickSeconds)fail(key+' events are shorter than one simulation tick.');
    for(let i=0;i<count;i++){
      let start=null;
      if(calendar.distribution==='TIMED'){
        if(!Number.isFinite(plan.firstStartMinutes)||plan.firstStartMinutes<0)fail(key+' requires a nonnegative first start.');
        if(count>1&&(!Number.isFinite(plan.intervalMinutes)||plan.intervalMinutes<=0))fail(key+' requires a positive interval.');
        start=(plan.firstStartMinutes+i*(plan.intervalMinutes||0))*60;
      }
      events.push({category:key,occurrence:i+1,startSeconds:start,durationSeconds});
    }
  }
  const stopped=events.reduce((sum,e)=>sum+e.durationSeconds,0),free=horizonSeconds-stopped;
  if(free<tickSeconds)fail('exclusions must leave positive operating time.');
  if(calendar.distribution!=='TIMED'){
    let cursor=free/(events.length+1);
    // Interleave categories so repeated events do not become a single cluster.
    events.sort((a,b)=>a.occurrence-b.occurrence||PLANT_STOP_FIELDS.indexOf(a.category)-PLANT_STOP_FIELDS.indexOf(b.category));
    events.forEach(e=>{e.startSeconds=cursor;cursor+=e.durationSeconds+free/(events.length+1);});
  }
  const align=seconds=>Math.ceil((seconds-1e-8)/tickSeconds)*tickSeconds;
  events.forEach(e=>{e.endSeconds=align(e.startSeconds+e.durationSeconds);e.startSeconds=align(e.startSeconds);e.durationSeconds=e.endSeconds-e.startSeconds;if(e.endSeconds>horizonSeconds+1e-8)fail(e.category+' extends beyond the calendar.');});
  events.sort((a,b)=>a.startSeconds-b.startSeconds);
  for(let i=1;i<events.length;i++)if(events[i].startSeconds<events[i-1].endSeconds-1e-8)fail('planned events overlap; adjust first start or interval.');
  return {events,horizonSeconds,plannedStopSeconds:events.reduce((n,e)=>n+e.durationSeconds,0),restartPolicy:calendar.restartPolicy||'RESTART'};
}

function resolvePlannedStops(run) {
  if(run.eventsEnabled===false)return {events:[],horizonSeconds:null};
  if(run.plannedStops!==undefined){
    if(!Array.isArray(run.plannedStops)||run.plannedStops.length>5000)throw new Error('Planned stops must be an array of at most 5,000 events.');
    if(run.plantCalendar?.application==='EVENTS'&&(!Number.isFinite(run.plantCalendar.appliedHorizonSeconds)||run.plantCalendar.appliedHorizonSeconds<=0))throw new Error('Applied calendar horizon is invalid.');
    const tick=run.tickSeconds,events=run.plannedStops.map((e,index)=>{
      if(!e||!Number.isFinite(e.startSeconds)||e.startSeconds<0||!Number.isFinite(e.endSeconds)||e.endSeconds<=e.startSeconds)throw new Error('Invalid planned stop '+(index+1));
      if(!['RESTART','RESUME'].includes(e.restartPolicy||'RESTART'))throw new Error('Invalid planned stop restart policy.');
      const startSeconds=Math.ceil((e.startSeconds-1e-8)/tick)*tick,endSeconds=Math.ceil((e.endSeconds-1e-8)/tick)*tick;
      if(endSeconds-startSeconds<tick-1e-8)throw new Error('Planned stop is shorter than one tick.');
      if(e.targetFormatId&&e.targetProductId&&e.targetFormatId!==e.targetProductId)throw new Error('Changeover format references disagree.');
      return {...e,targetProductId:e.targetFormatId??e.targetProductId,startSeconds,endSeconds,durationSeconds:endSeconds-startSeconds,restartPolicy:e.restartPolicy||'RESTART'};
    }).sort((a,b)=>a.startSeconds-b.startSeconds);
    events.forEach((e,i)=>{if(i&&e.startSeconds<events[i-1].endSeconds-1e-8)throw new Error('Planned stops overlap.');if(run.plantCalendar?.application==='EVENTS'&&e.endSeconds>run.plantCalendar.appliedHorizonSeconds+1e-8)throw new Error('A line stop extends beyond the applied calendar horizon.');});
    return {events,horizonSeconds:run.plantCalendar?.application==='EVENTS'?run.plantCalendar.appliedHorizonSeconds:run.durationSeconds,plannedStopSeconds:events.reduce((s,e)=>s+e.durationSeconds,0),restartPolicy:'PER_EVENT'};
  }
  return plantCalendarSchedule(run.plantCalendar,run.tickSeconds);
}

/**
 * Deterministic conveyor-design calculations based on the SimuLine / CAT
 * engineering worksheet.  All linear rates below use millimetres per second
 * so the result can be consumed directly by the event simulation.
 */
function calculateConveyorEngineering(input = {}) {
  const values = normaliseInput(input);
  const calculated = calculate(values);
  const audit = createAudit(values, calculated);

  return { input: values, calculated, audit };
}

function normaliseInput(input) {
  return {
    targetOverspeedPercent: numberOrUndefined(input.targetOverspeedPercent),
    targetPopulationPercent: numberOrUndefined(input.targetPopulationPercent),
    manualLbaMm: numberOrUndefined(input.manualLbaMm),
    installedLengthMm: numberOrUndefined(input.installedLengthMm),
    primeReserveMm: numberOrUndefined(input.primeReserveMm),
    packageLengthMm: numberOrUndefined(input.packageLengthMm),
    upstreamDischargePitchMm: numberOrUndefined(input.upstreamDischargePitchMm),
    upstreamNominalSpeedBpm: numberOrUndefined(input.upstreamNominalSpeedBpm),
    downstreamHighSpeedBpm: numberOrUndefined(input.downstreamHighSpeedBpm),
    downstreamInfeedPitchMm: numberOrUndefined(input.downstreamInfeedPitchMm),
    conveyorSpeedFactorPercent: numberOrUndefined(input.conveyorSpeedFactorPercent),
    codingSpeedFactorPercent: nonNegativeOrDefault(input.codingSpeedFactorPercent, 0),
    accumulationSpeedFactorPercent: nonNegativeOrDefault(input.accumulationSpeedFactorPercent, 0),
    infeedOverspeedPercent: nonNegativeOrDefault(input.infeedOverspeedPercent, 5),
    dischargeRunoutLengthMm: nonNegativeOrDefault(input.dischargeRunoutLengthMm, 0),
    rejectRunoutLengthMm: nonNegativeOrDefault(input.rejectRunoutLengthMm, 0),
    blockedTimeDelaySeconds: nonNegativeOrDefault(input.blockedTimeDelaySeconds, 0),
    clearTimeDelaySeconds: nonNegativeOrDefault(input.clearTimeDelaySeconds, 0),
    insuranceFactorUnits: nonNegativeOrDefault(input.insuranceFactorUnits, 0),
    backupSensorPositionMm: numberOrUndefined(input.backupSensorPositionMm),
    upstreamStopResponseSeconds: nonNegativeOrDefault(input.upstreamStopResponseSeconds, 0),
    bottlesDischargedAtStop: nonNegativeOrDefault(input.bottlesDischargedAtStop, 0),
    downstreamRampUpSeconds: nonNegativeOrDefault(input.downstreamRampUpSeconds, 0),
    upstreamStartupTimeSeconds: nonNegativeOrDefault(input.upstreamStartupTimeSeconds, 0)
  };
}

function calculate(values) {
  const upstreamDischargeVelocityMmPerSecond = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.upstreamDischargePitchMm,
    60
  );
  const machineOutputRateMmPerSecond = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.packageLengthMm,
    60
  );
  const dischargeZoneSpeedMmPerSecond = isFiniteNumber(upstreamDischargeVelocityMmPerSecond) &&
    isFiniteNumber(values.conveyorSpeedFactorPercent)
    ? upstreamDischargeVelocityMmPerSecond * (1 + values.conveyorSpeedFactorPercent / 100)
    : undefined;
  const codingZoneSpeedMmPerSecond = multiplyIfFinite(dischargeZoneSpeedMmPerSecond, 1 + values.codingSpeedFactorPercent / 100);
  const infeedVelocity=multiplyAndDivide(values.downstreamHighSpeedBpm,values.downstreamInfeedPitchMm,60);
  const conveyorSpeedMmPerSecond = values.targetPopulationPercent !== undefined
    ? safeDivide(machineOutputRateMmPerSecond, values.targetPopulationPercent, 100)
    : values.targetOverspeedPercent !== undefined ? multiplyIfFinite(infeedVelocity,1+values.targetOverspeedPercent/100)
    : multiplyIfFinite(codingZoneSpeedMmPerSecond, 1 + values.accumulationSpeedFactorPercent / 100);
  const dischargePopulationPercent = safeDivide(machineOutputRateMmPerSecond, dischargeZoneSpeedMmPerSecond, 100);
  const codingPopulationPercent = safeDivide(machineOutputRateMmPerSecond, codingZoneSpeedMmPerSecond, 100);
  const populationPercent = safeDivide(machineOutputRateMmPerSecond, conveyorSpeedMmPerSecond, 100);
  const effectiveProductPitchMm = safeDivide(values.packageLengthMm, populationPercent, 100);
  const productGapMm = isFiniteNumber(effectiveProductPitchMm) && isFiniteNumber(values.packageLengthMm)
    ? effectiveProductPitchMm - values.packageLengthMm
    : undefined;
  // A photoeye normally sees short occupied and clear intervals as packages
  // pass.  These are design values, not the continuous Back-up condition
  // produced by a queue reaching the sensor.
  const packagePassSensorSeconds = safeDivide(values.packageLengthMm, conveyorSpeedMmPerSecond);
  const sensorClearGapSeconds = safeDivide(productGapMm, conveyorSpeedMmPerSecond);
  const sensorCycleSeconds = safeDivide(effectiveProductPitchMm, conveyorSpeedMmPerSecond);
  const downstreamConsumptionRateMmPerSecond = multiplyAndDivide(
    values.downstreamHighSpeedBpm,
    values.packageLengthMm,
    60
  );
  const packagesDuringBlockedDelay = multiplyAndDivide(
    values.upstreamNominalSpeedBpm,
    values.blockedTimeDelaySeconds,
    60
  );
  const totalOverflowPackages = sumIfFinite(
    packagesDuringBlockedDelay,
    values.bottlesDischargedAtStop,
    values.insuranceFactorUnits
  );
  const overflowProductLengthMm = multiplyIfFinite(totalOverflowPackages, effectiveProductPitchMm);
  const overflowLengthMm = sumIfFinite(
    values.dischargeRunoutLengthMm,
    values.rejectRunoutLengthMm,
    overflowProductLengthMm
  );
  const calculatedUsefulAccumulationLengthMm = subtractIfFinite(
    values.installedLengthMm,
    values.primeReserveMm,
    overflowLengthMm
  );
  const usefulAccumulationLengthMm = values.manualLbaMm ?? calculatedUsefulAccumulationLengthMm;
  const primeSensorPositionMm = subtractIfFinite(values.installedLengthMm, values.primeReserveMm);
  const actualBackupSensorPositionMm = values.manualLbaMm !== undefined
    ? subtractIfFinite(primeSensorPositionMm, values.manualLbaMm)
    : firstDefined(values.backupSensorPositionMm, overflowLengthMm);
  const conveyorCapacityUnits = safeFloorDivide(values.installedLengthMm, effectiveProductPitchMm);
  const primeTravelSeconds = safeDivide(primeSensorPositionMm, conveyorSpeedMmPerSecond);
  const totalTravelSeconds = safeDivide(values.installedLengthMm, conveyorSpeedMmPerSecond);
  const overflowTransitSeconds = safeDivide(overflowLengthMm, conveyorSpeedMmPerSecond);
  const recoveryToBackupSeconds = sumIfFinite(
    values.clearTimeDelaySeconds,
    values.upstreamStartupTimeSeconds,
    overflowTransitSeconds
  );
  const queueReductionOneMm = multiplyIfFinite(downstreamConsumptionRateMmPerSecond, recoveryToBackupSeconds);
  const remainingAccumulationMm = subtractIfFinite(usefulAccumulationLengthMm, queueReductionOneMm);
  const timeToQueueSeconds = isFiniteNumber(remainingAccumulationMm) && remainingAccumulationMm > 0
    ? safeDivide(remainingAccumulationMm, sumIfFinite(conveyorSpeedMmPerSecond, downstreamConsumptionRateMmPerSecond))
    : 0;
  const queueReductionTwoMm = multiplyIfFinite(downstreamConsumptionRateMmPerSecond, timeToQueueSeconds);
  const recoveryLengthMm = subtractIfFinite(usefulAccumulationLengthMm, queueReductionOneMm, queueReductionTwoMm);
  const antiStarveSeconds = multiplyAndDivide(usefulAccumulationLengthMm, populationPercent, 100 * downstreamConsumptionRateMmPerSecond);
  const antiBlockSeconds = isFiniteNumber(usefulAccumulationLengthMm) && isFiniteNumber(populationPercent)
    ? safeDivide(usefulAccumulationLengthMm * (1 - populationPercent / 100), machineOutputRateMmPerSecond)
    : undefined;
  const recommendedInfeedConveyorSpeedMmPerSecond = multiplyAndDivide(
    values.downstreamHighSpeedBpm,
    values.downstreamInfeedPitchMm,
    60 / (1 + values.infeedOverspeedPercent / 100)
  );
  const recommendedConveyorSpeedFactorPercent = isFiniteNumber(recommendedInfeedConveyorSpeedMmPerSecond) &&
    isFiniteNumber(upstreamDischargeVelocityMmPerSecond) && upstreamDischargeVelocityMmPerSecond > 0
    ? (recommendedInfeedConveyorSpeedMmPerSecond / upstreamDischargeVelocityMmPerSecond - 1) * 100
    : undefined;

  // Linear ramp-up integral: reserve half the full-rate consumption over the ramp.
  const minimumRampAccumulationLengthMm = multiplyAndDivide(downstreamConsumptionRateMmPerSecond, values.downstreamRampUpSeconds, 2);
  const minimumInstalledLengthMm = sumIfFinite(overflowLengthMm, values.primeReserveMm, minimumRampAccumulationLengthMm);
  const downstreamInfeedRateMmPerSecond = multiplyAndDivide(values.downstreamHighSpeedBpm, values.downstreamInfeedPitchMm, 60);
  return compact({
    dischargeZoneSpeedMmPerSecond,
    codingZoneSpeedMmPerSecond,
    dischargePopulationPercent,
    codingPopulationPercent,
    minimumRampAccumulationLengthMm,
    minimumInstalledLengthMm,
    downstreamInfeedRateMmPerSecond,
    actualInfeedOverspeedPercent: isFiniteNumber(conveyorSpeedMmPerSecond)&&downstreamInfeedRateMmPerSecond>0?(conveyorSpeedMmPerSecond/downstreamInfeedRateMmPerSecond-1)*100:undefined,
    upstreamDischargeVelocityMmPerSecond,
    machineOutputRateMmPerSecond,
    conveyorSpeedMmPerSecond,
    populationPercent,
    effectiveProductPitchMm,
    productGapMm,
    packagePassSensorSeconds,
    sensorClearGapSeconds,
    sensorCycleSeconds,
    downstreamConsumptionRateMmPerSecond,
    packagesDuringBlockedDelay,
    totalOverflowPackages,
    overflowProductLengthMm,
    overflowLengthMm,
    usefulAccumulationLengthMm,
    calculatedUsefulAccumulationLengthMm,
    primeSensorPositionMm,
    recommendedBackupSensorPositionMm: overflowLengthMm,
    actualBackupSensorPositionMm,
    conveyorCapacityUnits,
    primeTravelSeconds,
    totalTravelSeconds,
    overflowTransitSeconds,
    recoveryToBackupSeconds,
    queueReductionOneMm,
    timeToQueueSeconds,
    queueReductionTwoMm,
    recoveryLengthMm,
    antiStarveSeconds,
    antiBlockSeconds,
    recommendedInfeedConveyorSpeedMmPerSecond,
    recommendedConveyorSpeedFactorPercent
  });
}

function createAudit(values, calculated) {
  const inputFields = [
    values.installedLengthMm,
    values.primeReserveMm,
    values.packageLengthMm,
    values.upstreamDischargePitchMm,
    values.upstreamNominalSpeedBpm,
    values.conveyorSpeedFactorPercent
  ];
  const inputsReady = inputFields.every((value) => isFiniteNumber(value) && value >= 0) &&
    values.installedLengthMm > 0 && values.packageLengthMm > 0 &&
    values.upstreamDischargePitchMm > 0 && values.upstreamNominalSpeedBpm > 0;
  const installedLengthValid = isFiniteNumber(values.installedLengthMm) &&
    isFiniteNumber(values.primeReserveMm) && isFiniteNumber(calculated.overflowLengthMm) &&
    values.installedLengthMm > values.primeReserveMm + calculated.overflowLengthMm;
  const recoveryEvaluated = isFiniteNumber(calculated.recoveryLengthMm);
  const backupPositionEvaluated = isFiniteNumber(calculated.actualBackupSensorPositionMm) &&
    isFiniteNumber(calculated.recommendedBackupSensorPositionMm);
  const sensorTimingEvaluated = isFiniteNumber(calculated.packagePassSensorSeconds) &&
    isFiniteNumber(calculated.sensorClearGapSeconds);
  const blockedDebounceAdequate = sensorTimingEvaluated &&
    values.blockedTimeDelaySeconds > calculated.packagePassSensorSeconds;
  const clearDebounceAdequate = sensorTimingEvaluated &&
    values.clearTimeDelaySeconds > calculated.sensorClearGapSeconds;

  const goals = [
    goal('POPULATION', !isFiniteNumber(calculated.populationPercent) ? 'NOT_EVALUATED' : calculated.populationPercent > 100 || calculated.populationPercent <= 0 ? 'FAIL' : calculated.populationPercent > 50 ? 'WARNING' : 'PASS',
      !isFiniteNumber(calculated.populationPercent) ? 'Population needs valid flow and belt-speed inputs.' : calculated.populationPercent > 100 || calculated.populationPercent <= 0 ? 'Population must be greater than 0 and no more than 100%.' : calculated.populationPercent > 50 ? 'Design occupancy above 50%: consider a target of 50% or less and verify the required belt speed and infeed capacity. This is a design recommendation, not a universal safety limit.' : 'Design occupancy is within the suggested 50% target.'),
    goal('MANUAL_LBA', values.manualLbaMm === undefined ? 'PASS' : values.manualLbaMm > 0 && values.manualLbaMm <= calculated.calculatedUsefulAccumulationLengthMm ? 'PASS' : 'FAIL',
      'Manual LBA must be positive and fit within installed length after Prime and required overflow reserves. It sets Back-up to Prime position minus LBA.'),
    goal(
      'INPUT_INTEGRITY',
      inputsReady ? 'PASS' : 'NOT_EVALUATED',
      inputsReady
        ? 'Required SimuLine inputs are physically usable.'
        : 'Installed length, Prime reserve, package length, upstream discharge pitch, upstream BPM, and conveyor speed factor are required.'
    ),
    goal(
      'SMOOTH_RECOVERY',
      !recoveryEvaluated ? 'NOT_EVALUATED' : calculated.recoveryLengthMm > 0 ? 'PASS' : 'WARNING',
      !recoveryEvaluated
        ? 'Recovery length cannot be evaluated until downstream high speed and infeed pitch are available.'
        : calculated.recoveryLengthMm > 0
          ? 'Recovery length is positive; the modeled restart has physical margin.'
          : 'Recovery length is zero or negative; this configuration can create unstable or stuttering restarts.'
    ),
    goal(
      'INSTALLED_LENGTH',
      !isFiniteNumber(calculated.overflowLengthMm) ? 'NOT_EVALUATED' : installedLengthValid ? 'PASS' : 'FAIL',
      !isFiniteNumber(calculated.overflowLengthMm)
        ? 'Overflow length cannot be evaluated until the upstream flow inputs are complete.'
        : installedLengthValid
          ? 'Installed length exceeds Prime reserve plus required overflow length.'
          : 'Installed length is insufficient for the Prime reserve and required overflow length.'
    ),
    goal(
      'BACKUP_POSITION',
      !backupPositionEvaluated ? 'NOT_EVALUATED' : calculated.actualBackupSensorPositionMm >= calculated.recommendedBackupSensorPositionMm ? 'PASS' : 'WARNING',
      !backupPositionEvaluated
        ? 'Back-up position is not available.'
        : calculated.actualBackupSensorPositionMm >= calculated.recommendedBackupSensorPositionMm
          ? 'Back-up position leaves the calculated overflow margin.'
          : 'Back-up is too close to the upstream machine for the calculated residual flow.'
    ),
    goal(
      'SENSOR_DEBOUNCE',
      !sensorTimingEvaluated ? 'NOT_EVALUATED' : blockedDebounceAdequate && clearDebounceAdequate ? 'PASS' : 'WARNING',
      !sensorTimingEvaluated
        ? 'Sensor pulse timing cannot be evaluated until package length, pitch, and conveyor speed are available.'
        : blockedDebounceAdequate && clearDebounceAdequate
          ? 'Back-up blocked and clear delays exceed the normal package pulse and gap at the configured belt speed.'
          : 'At least one Back-up delay is no longer than a normal package pulse or gap; the control can chatter or react to normal product spacing.'
    )
  ];

  return {
    status: aggregateAuditStatus(goals),
    goals
  };
}

function goal(id, status, message) {
  return { id, status, message };
}

function aggregateAuditStatus(goals) {
  if (goals.some((item) => item.status === 'FAIL')) return 'FAIL';
  if (goals.some((item) => item.status === 'WARNING')) return 'WARNING';
  if (goals.some((item) => item.status === 'NOT_EVALUATED')) return 'NOT_EVALUATED';
  return 'PASS';
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function numberOrUndefined(value) {
  return isFiniteNumber(value) ? value : undefined;
}

function nonNegativeOrDefault(value, fallback) {
  return isFiniteNumber(value) && value >= 0 ? value : fallback;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function multiplyAndDivide(left, right, divisor) {
  return isFiniteNumber(left) && isFiniteNumber(right) && isFiniteNumber(divisor) && divisor !== 0
    ? left * right / divisor
    : undefined;
}

function multiplyIfFinite(left, right) {
  return isFiniteNumber(left) && isFiniteNumber(right) ? left * right : undefined;
}

function safeDivide(numerator, denominator, multiplier = 1) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && denominator > 0
    ? numerator / denominator * multiplier
    : undefined;
}

function safeFloorDivide(numerator, denominator) {
  return isFiniteNumber(numerator) && isFiniteNumber(denominator) && denominator > 0
    ? Math.floor(numerator / denominator)
    : undefined;
}

function sumIfFinite(...values) {
  return values.every(isFiniteNumber) ? values.reduce((total, value) => total + value, 0) : undefined;
}

function subtractIfFinite(first, ...rest) {
  return isFiniteNumber(first) && rest.every(isFiniteNumber)
    ? rest.reduce((total, value) => total - value, first)
    : undefined;
}



function resolveAccumulationZoneDefinition(allEquipment, ownerIndex) {
  const equipment = Array.isArray(allEquipment) ? allEquipment : [];
  const owner = equipment[ownerIndex];
  if (!owner) {
    return { definition: undefined, origin: 'NONE', sources: {}, assumptions: [] };
  }

  if (isConveyorEquipment(owner)) {
    return resolveConveyorZone(equipment, owner, ownerIndex);
  }

  const next = equipment[ownerIndex + 1];
  if (isConveyorEquipment(next)) {
    return {
      definition: {
        kind: 'INTERNAL_HANDOFF',
        id: owner.id + '--handoff--' + next.id,
        name: owner.name + ' handoff to ' + next.name,
        upstreamControlEquipmentId: owner.id,
        downstreamControlEquipmentId: next.id
      },
      origin: 'INTERNAL_HANDOFF',
      sources: {},
      assumptions: ['Internal handoff: no abstract buffer is modeled between a machine and its following conveyor.']
    };
  }

  return { definition: undefined, origin: 'NONE', sources: {}, assumptions: [] };
}

function isConveyorEquipment(equipment) {
  return Boolean(equipment && (equipment.type === 'CONVEYOR' || equipment.processData?.role === 'CONVEYOR'));
}

function hasFormatAccumulationData(equipment) {
  return Boolean(equipment?.processData?.accumulation &&
    typeof equipment.processData.accumulation === 'object' &&
    !Array.isArray(equipment.processData.accumulation));
}

function resolveConveyorZone(equipment, owner, ownerIndex) {
  const format = owner.processData?.accumulation || {};
  const upstreamControl = findNearestNonConveyor(equipment, ownerIndex - 1, -1);
  const downstreamControl = findNearestNonConveyor(equipment, ownerIndex + 1, 1);
  const resolved = hasFlowPilotInputs(owner, format)
    ? resolveFlowPilotConveyor(owner, format, upstreamControl, downstreamControl)
    : resolveDirectPhysicalConveyor(owner, format, upstreamControl, downstreamControl);
  if (format.speedMode === 'MANUAL' && format.targetPopulationPercent === undefined && format.targetOverspeedPercent === undefined) {
    resolved.definition.conveyorSpeedMmPerSecond = format.conveyorSpeedMmPerSecond;
    resolved.sources.conveyorSpeedMmPerSecond = 'processData.accumulation.conveyorSpeedMmPerSecond';
    for (const key of ['packagePassSensorSeconds', 'sensorClearGapSeconds', 'sensorCycleSeconds']) delete resolved.definition[key];
    resolved.assumptions.push('Manual belt speed overrides the engineering speed calculation.');
  }
  const definition = resolved.definition;
  if (format.movingGapMm !== undefined && (format.productSpacingOverride===true || format.targetPopulationPercent === undefined && format.targetOverspeedPercent === undefined)) {
    definition.productPitchMm = definition.productLengthMm + format.movingGapMm;
    definition.gapMm = format.movingGapMm;
    resolved.sources.productPitchMm = 'product length + processData.accumulation.movingGapMm';
    for (const key of ['packagePassSensorSeconds', 'sensorClearGapSeconds', 'sensorCycleSeconds']) delete definition[key];
  }
  definition.accumulatedPitchMm = format.accumulatedPitchMm ??
    (definition.productLengthMm !== undefined ? definition.productLengthMm + (format.accumulatedGapMm ?? 0) : definition.productPitchMm);
  resolved.sources.accumulatedPitchMm = format.accumulatedPitchMm !== undefined ? 'processData.accumulation.accumulatedPitchMm' : 'product length + accumulated gap (default 0 mm)';
  if (definition.engineering) {
    // Runtime geometry may override worksheet speed/spacing. Preserve the
    // worksheet audit separately rather than presenting it as the active model.
    definition.engineering.runtimeGeometry = {
      speedMode: format.speedMode || 'AUTO',
      conveyorSpeedMmPerSecond: definition.conveyorSpeedMmPerSecond,
      movingPitchMm: definition.productPitchMm,
      accumulatedPitchMm: definition.accumulatedPitchMm,
      transferCapacityPerSecond: definition.conveyorSpeedMmPerSecond / definition.productPitchMm,
      capacityUnits: Math.floor(definition.usableLengthMm / definition.accumulatedPitchMm)
    };
  }
  return resolved;
}

function resolveFlowPilotConveyor(owner, format, upstreamControl, downstreamControl) {
  const sources = {};
  const packageLength = selectValue([
    sourceValue(owner.processData?.upstream?.packageLengthMm, 'processData.upstream.packageLengthMm'),
    sourceValue(upstreamControl?.processData?.upstream?.packageLengthMm, 'upstream processData.upstream.packageLengthMm')
  ]);
  const dischargePitch = selectValue([
    sourceValue(owner.processData?.upstream?.dischargePitchMm, 'processData.upstream.dischargePitchMm'),
    sourceValue(upstreamControl?.processData?.upstream?.dischargePitchMm, 'upstream processData.upstream.dischargePitchMm')
  ]);
  const conveyorSpeedFactor = selectValue([
    sourceValue(format.conveyorSpeedFactorPercent, 'processData.accumulation.conveyorSpeedFactorPercent'),
    sourceValue(owner.processData?.speedAndSensors?.conveyorSpeedFactorVsDischargeVelocityPercent, 'processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent')
  ]);
  const installedLength = sourceValue(owner.processData?.geometry?.lactMm, 'processData.geometry.lactMm');
  const primeReserve = sourceValue(owner.processData?.geometry?.lpPrimeMm, 'processData.geometry.lpPrimeMm');
  const downstreamHighSpeed = selectValue([
    sourceValue(downstreamControl?.processData?.productInputRatePerSecond===undefined?undefined:downstreamControl.processData.productInputRatePerSecond*60, 'product downstream input rate'),
    sourceValue(format.useNominalDesignSpeed ? rateBpm(downstreamControl) : undefined, 'downstream nominalRatePerSecond'),
    sourceValue(downstreamControl?.processData?.equipment?.maximumSpeedBpm, 'downstream processData.equipment.maximumSpeedBpm'),
    sourceValue(rateBpm(downstreamControl), 'downstream nominalRatePerSecond')
  ]);
  const downstreamInfeedPitch = selectValue([
    sourceValue(downstreamControl?.processData?.productInputRatePerSecond===undefined?undefined:owner.processData?.downstream?.infeedPitchMm, 'product conveyor infeed pitch'),
    sourceValue(format.useNominalDesignSpeed ? owner.processData?.downstream?.infeedPitchMm : undefined, 'processData.downstream.infeedPitchMm'),
    sourceValue(downstreamControl?.processData?.downstream?.infeedPitchMm, 'downstream processData.downstream.infeedPitchMm'),
    sourceValue(owner.processData?.downstream?.infeedPitchMm, 'processData.downstream.infeedPitchMm')
  ]);
  const upstreamStopResponse = sourceValue(format.upstreamStopResponseSeconds, 'processData.accumulation.upstreamStopResponseSeconds');
  const bottlesDischargedAtStop = selectValue([
    sourceValue(format.bottlesDischargedAtStop, 'processData.accumulation.bottlesDischargedAtStop'),
    sourceValue(upstreamControl?.processData?.upstream?.bottlesDischargedAtStop, 'upstream processData.upstream.bottlesDischargedAtStop')
  ]);
  const downstreamRampUp = selectValue([
    sourceValue(format.downstreamRampUpSeconds, 'processData.accumulation.downstreamRampUpSeconds'),
    sourceValue(downstreamControl?.processData?.downstream?.rampUpTimeSeconds, 'downstream processData.downstream.rampUpTimeSeconds')
  ]);
  const calculation = calculateConveyorEngineering({
    targetPopulationPercent: format.targetPopulationPercent,
    targetOverspeedPercent: format.targetOverspeedPercent,
    manualLbaMm: format.manualLbaMm,
    installedLengthMm: installedLength.value,
    primeReserveMm: primeReserve.value,
    packageLengthMm: packageLength.value,
    upstreamDischargePitchMm: dischargePitch.value,
    upstreamNominalSpeedBpm: rateBpm(upstreamControl),
    downstreamHighSpeedBpm: downstreamHighSpeed.value,
    downstreamInfeedPitchMm: downstreamInfeedPitch.value,
    conveyorSpeedFactorPercent: conveyorSpeedFactor.value,
    codingSpeedFactorPercent: owner.processData?.speedAndSensors?.codingConveyorSpeedFactorVsPreviousConveyorPercent,
    accumulationSpeedFactorPercent: owner.processData?.speedAndSensors?.conveyorSpeedFactorVsPreviousConveyorPercent,
    infeedOverspeedPercent: owner.processData?.speedAndSensors?.overspeedVsInfeedScrewPercent,
    dischargeRunoutLengthMm: owner.processData?.geometry?.actualDischargeMm ?? format.dischargeRunoutLengthMm,
    rejectRunoutLengthMm: owner.processData?.geometry?.actualCodingMm ?? format.rejectRunoutLengthMm,
    blockedTimeDelaySeconds: format.blockedTimeDelaySeconds,
    clearTimeDelaySeconds: format.clearTimeDelaySeconds,
    insuranceFactorUnits: format.insuranceFactorUnits,
    backupSensorPositionMm: format.backupSensorPositionMm,
    upstreamStopResponseSeconds: upstreamStopResponse.value,
    bottlesDischargedAtStop: bottlesDischargedAtStop.value,
    downstreamRampUpSeconds: downstreamRampUp.value,
    upstreamStartupTimeSeconds: owner.processData?.upstream?.startupTimeSeconds ?? upstreamControl?.processData?.upstream?.startupTimeSeconds
  });
  const derived = calculation.calculated;
  const definition = {
    kind: 'FLOWPILOT_ENGINEERING',
    id: format.id || owner.id + '--physical-zone',
    name: format.name || (owner.name || owner.id) + ' accumulation',
    upstreamControlEquipmentId: upstreamControl?.id,
    downstreamControlEquipmentId: downstreamControl?.id,
    engineering: calculation,
    upstreamRestartDelaySeconds: calculation.input.upstreamStartupTimeSeconds
  };

  assignIfDefined(definition, 'usableLengthMm', calculation.input.installedLengthMm, sources, installedLength.source);
  assignIfDefined(definition, 'productLengthMm', packageLength.value, sources, packageLength.source);
  assignIfDefined(definition, 'gapMm', derived.productGapMm, sources, 'calculated: effective pitch - package length');
  assignIfDefined(definition, 'productPitchMm', derived.effectiveProductPitchMm, sources, 'calculated: package length / population');
  assignIfDefined(definition, 'conveyorSpeedMmPerSecond', derived.conveyorSpeedMmPerSecond, sources, format.targetOverspeedPercent!==undefined?'calculated: downstream infeed velocity × (1 + target overspeed)':format.targetPopulationPercent!==undefined?'calculated: packed material flow / target population':'calculated: discharge velocity × (1 + speed factor)');
  assignIfDefined(definition, 'packagePassSensorSeconds', derived.packagePassSensorSeconds, sources,
    'calculated: package length / conveyor speed');
  assignIfDefined(definition, 'sensorClearGapSeconds', derived.sensorClearGapSeconds, sources,
    'calculated: product gap / conveyor speed');
  assignIfDefined(definition, 'sensorCycleSeconds', derived.sensorCycleSeconds, sources,
    'calculated: product pitch / conveyor speed');
  assignIfDefined(definition, 'primeSensorPositionMm', derived.primeSensorPositionMm, sources, 'calculated: L_act - L_p');
  assignIfDefined(definition, 'backupSensorPositionMm', derived.actualBackupSensorPositionMm, sources,
    format.manualLbaMm !== undefined ? 'calculated: Prime position minus manual LBA' : isDefined(format.backupSensorPositionMm) ? 'processData.accumulation.backupSensorPositionMm' : 'calculated: required overflow length L_bu');
  assignIfDefined(definition, 'backupRestartPositionMm', derived.actualBackupSensorPositionMm, sources,
    'same Back-up position; Clear Time Delay provides the restart debounce');
  assignIfDefined(definition, 'blockedTimeDelaySeconds', calculation.input.blockedTimeDelaySeconds, sources,
    'processData.accumulation.blockedTimeDelaySeconds');
  assignIfDefined(definition, 'clearTimeDelaySeconds', calculation.input.clearTimeDelaySeconds, sources,
    'processData.accumulation.clearTimeDelaySeconds');
  assignIfDefined(definition, 'upstreamStopResponseSeconds', calculation.input.upstreamStopResponseSeconds, sources,
    upstreamStopResponse.source);
  assignIfDefined(definition, 'bottlesDischargedAtStop', calculation.input.bottlesDischargedAtStop, sources,
    bottlesDischargedAtStop.source);
  assignIfDefined(definition, 'downstreamRampUpSeconds', calculation.input.downstreamRampUpSeconds, sources,
    downstreamRampUp.source);

  return {
    definition,
    origin: 'FLOWPILOT_ENGINEERING',
    sources,
    assumptions: [
      'SimuLine geometry is active by default: L_act, L_p, package pitch, speed factor, and sensor delays are converted to the physical zone.',
      'Positions are measured from upstream discharge toward downstream infeed.',
      'Prime is L_act - L_p. If no installed Back-up position is supplied, L_bu is used as the calculated recommendation.'
    ]
  };
}

function resolveDirectPhysicalConveyor(owner, format, upstreamControl, downstreamControl) {
  const sources = {};
  const usableLength = selectValue([
    sourceValue(format.usableLengthMm, 'processData.accumulation.usableLengthMm')
  ]);
  const productLength = selectValue([
    sourceValue(format.productLengthMm, 'processData.accumulation.productLengthMm'),
    sourceValue(owner.processData?.upstream?.packageLengthMm, 'processData.upstream.packageLengthMm')
  ]);
  const gap = selectValue([
    sourceValue(format.gapMm, 'processData.accumulation.gapMm')
  ]);
  const explicitPitch = selectValue([
    sourceValue(format.productPitchMm, 'processData.accumulation.productPitchMm')
  ]);
  const pitch = selectValue([
    explicitPitch,
    sourceValue(
      sumNumericValues(productLength.value, gap.value),
      productLength.source && gap.source ? productLength.source + ' + ' + gap.source : undefined
    )
  ]);
  const conveyorSpeed = selectValue([
    sourceValue(format.conveyorSpeedMmPerSecond, 'processData.accumulation.conveyorSpeedMmPerSecond')
  ]);
  const primeSensor = selectValue([
    sourceValue(format.primeSensorPositionMm, 'processData.accumulation.primeSensorPositionMm')
  ]);
  const backupSensor = selectValue([
    sourceValue(format.backupSensorPositionMm, 'processData.accumulation.backupSensorPositionMm')
  ]);
  const backupRestart = selectValue([
    sourceValue(format.backupRestartPositionMm, 'processData.accumulation.backupRestartPositionMm')
  ]);
  const upstreamStopResponse = sourceValue(format.upstreamStopResponseSeconds, 'processData.accumulation.upstreamStopResponseSeconds');
  const bottlesDischargedAtStop = selectValue([
    sourceValue(format.bottlesDischargedAtStop, 'processData.accumulation.bottlesDischargedAtStop'),
    sourceValue(
      upstreamControl?.processData?.upstream?.bottlesDischargedAtStop,
      'upstream processData.upstream.bottlesDischargedAtStop'
    )
  ]);
  const downstreamRampUp = selectValue([
    sourceValue(format.downstreamRampUpSeconds, 'processData.accumulation.downstreamRampUpSeconds'),
    sourceValue(
      downstreamControl?.processData?.downstream?.rampUpTimeSeconds,
      'downstream processData.downstream.rampUpTimeSeconds'
    )
  ]);

  const definition = {
    kind: 'FORMAT_GEOMETRY',
    id: format.id || owner.id + '--physical-zone',
    name: format.name || (owner.name || owner.id) + ' accumulation',
    upstreamControlEquipmentId: upstreamControl?.id,
    downstreamControlEquipmentId: downstreamControl?.id
  };
  assignIfDefined(definition, 'usableLengthMm', usableLength.value, sources, usableLength.source);
  assignIfDefined(definition, 'productLengthMm', productLength.value, sources, productLength.source);
  assignIfDefined(definition, 'gapMm', gap.value, sources, gap.source);
  assignIfDefined(definition, 'productPitchMm', pitch.value, sources, pitch.source);
  assignIfDefined(definition, 'conveyorSpeedMmPerSecond', conveyorSpeed.value, sources, conveyorSpeed.source);
  assignIfDefined(definition, 'primeSensorPositionMm', primeSensor.value, sources, primeSensor.source);
  assignIfDefined(definition, 'backupSensorPositionMm', backupSensor.value, sources, backupSensor.source);
  assignIfDefined(definition, 'backupRestartPositionMm', backupRestart.value, sources, backupRestart.source);
  assignIfDefined(definition, 'blockedTimeDelaySeconds', format.blockedTimeDelaySeconds, sources, 'processData.accumulation.blockedTimeDelaySeconds');
  assignIfDefined(definition, 'clearTimeDelaySeconds', format.clearTimeDelaySeconds, sources, 'processData.accumulation.clearTimeDelaySeconds');
  assignIfDefined(definition, 'upstreamStopResponseSeconds', upstreamStopResponse.value, sources, upstreamStopResponse.source);
  assignIfDefined(definition, 'bottlesDischargedAtStop', bottlesDischargedAtStop.value, sources, bottlesDischargedAtStop.source);
  assignIfDefined(definition, 'downstreamRampUpSeconds', downstreamRampUp.value, sources, downstreamRampUp.source);

  return {
    definition,
    origin: 'FORMAT_GEOMETRY',
    sources,
    assumptions: [
      'This conveyor uses direct named physical geometry.',
      'Prime and Back-up positions are explicit; SimuLine L_act and L_p are not available on this Case.',
      'The upstream and downstream controlled equipment are inferred from the line sequence.'
    ]
  };
}

function hasFlowPilotInputs(owner, format) {
  return [
    owner.processData?.geometry?.lactMm,
    owner.processData?.geometry?.lpPrimeMm,
    format.conveyorSpeedFactorPercent,
    owner.processData?.speedAndSensors?.conveyorSpeedFactorVsDischargeVelocityPercent
  ].some(isDefined);
}

function findNearestNonConveyor(equipment, startIndex, direction) {
  for (let index = startIndex; index >= 0 && index < equipment.length; index += direction) {
    const candidate = equipment[index];
    if (candidate && !isConveyorEquipment(candidate)) return candidate;
  }
  return undefined;
}

function rateBpm(equipment) {
  return isFiniteNumber(equipment?.nominalRatePerSecond) ? equipment.nominalRatePerSecond * 60 : undefined;
}

function selectValue(candidates) {
  for (const candidate of candidates) {
    if (candidate && isDefined(candidate.value)) return candidate;
  }
  return { value: undefined, source: undefined };
}

function sourceValue(value, source) {
  return { value, source };
}

function sumNumericValues(left, right) {
  return isFiniteNumber(left) && isFiniteNumber(right) ? left + right : undefined;
}

function assignIfDefined(target, key, value, sources, source) {
  if (!isDefined(value)) return;
  target[key] = value;
  if (sources && source) sources[key] = source;
}

function isDefined(value) {
  return value !== undefined && value !== null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}



function validateSimulationInput(input) {
  const details = [];
  try { const resolvedProducts=validateProductSetup(input);if(resolvedProducts.length){for(const resolved of resolvedProducts)validateCase({...input.case,equipment:resolved.equipment},details);}else validateCase(input?.case, details); } catch(error) { details.push(invalid('run.productCatalog',error.message)); }
  validateRun(input?.run, details);
  try { if(input?.run?.tickSeconds>0)resolvePlannedStops(input.run);if(input?.run?.eventsEnabled!==false&&(input?.run?.plannedStops?.length||input?.run?.plantCalendar?.enabled&&input.run.plantCalendar.mode==='SCHEDULED')&&input.run.engineId==='DES_SIMPY_EXPERIMENTAL')throw new Error('Scheduled plant stops currently require the ST engine.'); } catch(error){details.push(invalid('run.plantCalendar',error.message));}
  if(input?.run?.eventsEnabled!==false)validateCommands(input?.run?.commands, input?.case?.equipment, details);

  return details.length === 0
    ? { ok: true }
    : {
        ok: false,
        error: {
          code: 'INVALID_SIMULATION_INPUT',
          message: 'The simulation input does not satisfy the required physical-line contract.',
          details
        }
      };
}

function validateCase(caseModel, details) {
  if (!caseModel || typeof caseModel !== 'object') {
    details.push(required('case'));
    return;
  }
  if (!Array.isArray(caseModel.equipment) || caseModel.equipment.length < 3) {
    details.push(invalid('case.equipment', 'must contain at least a machine, a conveyor, and a machine'));
    return;
  }

  const ids = new Set();
  caseModel.equipment.forEach((equipment, index) => {
    const path = 'case.equipment[' + index + ']';
    if (!equipment || typeof equipment !== 'object') {
      details.push(invalid(path, 'must be an object'));
      return;
    }
    if (!nonEmptyString(equipment.id)) details.push(required(path + '.id'));
    if (ids.has(equipment.id)) details.push(invalid(path + '.id', 'must be unique'));
    ids.add(equipment.id);
    if (!nonEmptyString(equipment.type)) details.push(required(path + '.type'));
    if(equipment.unitOfFlow!==undefined&&(typeof equipment.unitOfFlow!=='string'||equipment.unitOfFlow.trim().length>40))details.push(invalid(path+'.unitOfFlow','must be text of at most 40 characters'));
    if (!positiveNumber(equipment.nominalRatePerSecond)) {
      details.push(invalid(path + '.nominalRatePerSecond', 'must be a number greater than zero'));
    }
    if (!['AUTO', 'MANUAL', 'PAUSE', 'STOP'].includes(equipment.initialMode)) {
      details.push(invalid(path + '.initialMode', 'must be AUTO, MANUAL, PAUSE, or STOP'));
    }
    if (equipment.bufferAfterCapacity !== undefined) {
      details.push(invalid(path + '.bufferAfterCapacity', 'is no longer supported; configure the physical conveyor geometry instead'));
    }
    if (equipment.accumulationZone !== undefined) {
      details.push(invalid(path + '.accumulationZone', 'is no longer supported; configure processData.accumulation on the conveyor instead'));
    }
    validateNoiseProfile(equipment.noiseProfile, path, details);
    validateStartProfile(equipment, path, details);
  });

  validateAlternatingTopology(caseModel.equipment, details);
  caseModel.equipment.forEach((equipment, index) => {
    const path = 'case.equipment[' + index + ']';
    if (!equipment || typeof equipment !== 'object') return;
    if (isConveyorEquipment(equipment)) {
      validateConveyorGeometry(caseModel.equipment, index, path, details);
    } else if (equipment.processData?.accumulation !== undefined) {
      details.push(invalid(path + '.processData.accumulation', 'belongs only on a CONVEYOR'));
    }
  });
}

function validateAlternatingTopology(equipment, details) {
  const first = equipment[0];
  const last = equipment[equipment.length - 1];
  if (isConveyorEquipment(first)) details.push(invalid('case.equipment[0]', 'a line must start with a machine, not a conveyor'));
  if (isConveyorEquipment(last)) details.push(invalid('case.equipment[' + (equipment.length - 1) + ']', 'a line must end with a machine, not a conveyor'));

  equipment.forEach((item, index) => {
    if (!item) return;
    const path = 'case.equipment[' + index + ']';
    const previous = equipment[index - 1];
    const next = equipment[index + 1];
    if (isConveyorEquipment(item)) {
      if (!previous || isConveyorEquipment(previous) || !next || isConveyorEquipment(next)) {
        details.push(invalid(path, 'must sit between two non-conveyor machines'));
      }
    } else if (next && !isConveyorEquipment(next)) {
      details.push(invalid(path, 'must be followed by a CONVEYOR; direct machine-to-machine accumulation is not modeled'));
    }
  });
}

function validateConveyorGeometry(allEquipment, index, path, details) {
  const accumulation = allEquipment[index].processData?.accumulation;
  if (!accumulation || typeof accumulation !== 'object' || Array.isArray(accumulation)) {
    details.push(required(path + '.processData.accumulation'));
    return;
  }

  if (accumulation.speedMode !== undefined && !['AUTO', 'MANUAL'].includes(accumulation.speedMode)) details.push(invalid(path + '.processData.accumulation.speedMode', 'must be AUTO or MANUAL'));
  validateOptionalNonNegative(accumulation.movingGapMm, path + '.processData.accumulation.movingGapMm', details);
  validateOptionalNonNegative(accumulation.accumulatedGapMm, path + '.processData.accumulation.accumulatedGapMm', details);
  if (accumulation.targetPopulationPercent !== undefined && !(positiveNumber(accumulation.targetPopulationPercent) && accumulation.targetPopulationPercent <= 100)) details.push(invalid(path + '.processData.accumulation.targetPopulationPercent', 'must be greater than 0 and at most 100%'));
  if(accumulation.targetOverspeedPercent!==undefined&&!(Number.isFinite(accumulation.targetOverspeedPercent)&&accumulation.targetOverspeedPercent>=0&&accumulation.targetOverspeedPercent<=1000))details.push(invalid(path+'.processData.accumulation.targetOverspeedPercent','must be between 0 and 1000%'));
  if(accumulation.targetOverspeedPercent!==undefined&&accumulation.targetPopulationPercent!==undefined)details.push(invalid(path+'.processData.accumulation','choose either target Population or target Overspeed, not both'));
  const resolved = resolveAccumulationZoneDefinition(allEquipment, index);
  if (accumulation.manualLbaMm !== undefined && !(positiveNumber(accumulation.manualLbaMm) && accumulation.manualLbaMm <= resolved.definition?.engineering?.calculated?.calculatedUsefulAccumulationLengthMm)) details.push(invalid(path + '.processData.accumulation.manualLbaMm', 'must be positive and fit after Prime and required overflow reserves'));
  validatePhysicalZone(resolved.definition, path + '.processData.accumulation', details);
}

function validatePhysicalZone(zone, path, details) {
  if (!zone || !['FORMAT_GEOMETRY', 'FLOWPILOT_ENGINEERING'].includes(zone.kind)) {
    details.push(invalid(path, 'could not resolve a physical conveyor zone'));
    return;
  }

  if (!positiveNumber(zone.usableLengthMm)) {
    details.push(invalid(path + '.usableLengthMm', 'must be a number greater than zero'));
  }
  if (zone.productPitchMm !== undefined && !positiveNumber(zone.productPitchMm)) {
    details.push(invalid(path + '.productPitchMm', 'must be a number greater than zero'));
  }
  if (zone.productLengthMm !== undefined && !positiveNumber(zone.productLengthMm)) {
    details.push(invalid(path + '.productLengthMm', 'must be a number greater than zero'));
  }
  if (zone.gapMm !== undefined && !nonNegativeNumber(zone.gapMm)) {
    details.push(invalid(path + '.gapMm', 'must be a number greater than or equal to zero'));
  }

  if(zone.engineering?.runtimeGeometry?.speedMode!=='MANUAL'&&zone.engineering?.calculated?.dischargePopulationPercent>100+1e-9){
    details.push(invalid(path+'.gapMm','discharge pitch and discharge factor must leave non-overlapping package spacing in the discharge zone'));
  }
  const hasExplicitPitch = positiveNumber(zone.productPitchMm);
  const hasLengthAndGap = positiveNumber(zone.productLengthMm) && nonNegativeNumber(zone.gapMm);
  if (!hasExplicitPitch && !hasLengthAndGap) {
    details.push(invalid(path, 'requires effective product pitch, or product length plus gap'));
  }

  if (zone.accumulatedPitchMm !== undefined && (!positiveNumber(zone.accumulatedPitchMm) || zone.accumulatedPitchMm < (zone.productLengthMm || 0) || zone.accumulatedPitchMm > (zone.productPitchMm ?? zone.productLengthMm + zone.gapMm))) {
    details.push(invalid(path + '.accumulatedPitchMm', 'must be between product length and moving pitch'));
  }
  const pitch = hasExplicitPitch ? zone.productPitchMm : hasLengthAndGap ? zone.productLengthMm + zone.gapMm : null;
  if (positiveNumber(zone.usableLengthMm) && positiveNumber(pitch) && Math.floor(zone.usableLengthMm / pitch) < 1) {
    details.push(invalid(path, 'usableLengthMm must hold at least one product pitch'));
  }

  if (!positiveNumber(zone.conveyorSpeedMmPerSecond)) {
    details.push(invalid(path + '.conveyorSpeedMmPerSecond', 'must be a number greater than zero'));
  }
  validateRequiredSensor(zone.primeSensorPositionMm, path + '.primeSensorPositionMm', zone.usableLengthMm, details);
  validateRequiredSensor(zone.backupSensorPositionMm, path + '.backupSensorPositionMm', zone.usableLengthMm, details);
  validateRequiredSensor(zone.backupRestartPositionMm, path + '.backupRestartPositionMm', zone.usableLengthMm, details);

  if (nonNegativeNumber(zone.backupRestartPositionMm) && nonNegativeNumber(zone.backupSensorPositionMm) &&
      zone.backupRestartPositionMm < zone.backupSensorPositionMm) {
    details.push(invalid(path + '.backupRestartPositionMm', 'must be at or downstream of backupSensorPositionMm'));
  }
  if (nonNegativeNumber(zone.backupSensorPositionMm) && nonNegativeNumber(zone.primeSensorPositionMm) &&
      zone.backupSensorPositionMm > zone.primeSensorPositionMm) {
    details.push(invalid(path + '.backupSensorPositionMm', 'must be upstream of the Prime sensor'));
  }

  validateRequiredNonNegative(zone.upstreamStopResponseSeconds, path + '.upstreamStopResponseSeconds', details);
  validateRequiredNonNegative(zone.bottlesDischargedAtStop, path + '.bottlesDischargedAtStop', details);
  validateRequiredNonNegative(zone.downstreamRampUpSeconds, path + '.downstreamRampUpSeconds', details);
  validateOptionalNonNegative(zone.blockedTimeDelaySeconds, path + '.blockedTimeDelaySeconds', details);
  validateOptionalNonNegative(zone.clearTimeDelaySeconds, path + '.clearTimeDelaySeconds', details);
  if (!nonEmptyString(zone.upstreamControlEquipmentId)) details.push(required(path + '.upstreamControlEquipmentId'));
  if (!nonEmptyString(zone.downstreamControlEquipmentId)) details.push(required(path + '.downstreamControlEquipmentId'));
}

function validateRequiredSensor(value, path, usableLengthMm, details) {
  if (!nonNegativeNumber(value)) {
    details.push(required(path));
  } else if (positiveNumber(usableLengthMm) && value > usableLengthMm) {
    details.push(invalid(path, 'must be within usableLengthMm'));
  }
}

function validateRequiredNonNegative(value, path, details) {
  if (!nonNegativeNumber(value)) details.push(required(path));
}

function validateStartProfile(equipment, path, details) {
  validateOptionalNonNegative(equipment.startupDelaySeconds, path + '.startupDelaySeconds', details);
  validateOptionalNonNegative(equipment.restartRampUpSeconds, path + '.restartRampUpSeconds', details);
  ['conveyorSpeedFactorVsDischargeVelocityPercent','codingConveyorSpeedFactorVsPreviousConveyorPercent','conveyorSpeedFactorVsPreviousConveyorPercent','overspeedVsInfeedScrewPercent'].forEach(key=>validateOptionalNonNegative(equipment.processData?.speedAndSensors?.[key],path+'.processData.speedAndSensors.'+key,details));
  ['actualDischargeMm','actualCodingMm'].forEach(key=>validateOptionalNonNegative(equipment.processData?.geometry?.[key],path+'.processData.geometry.'+key,details));
  validateOptionalNonNegative(equipment.processData?.upstream?.startupTimeSeconds, path + '.processData.upstream.startupTimeSeconds', details);
  validateOptionalNonNegative(equipment.processData?.downstream?.rampUpTimeSeconds, path + '.processData.downstream.rampUpTimeSeconds', details);
}

function validateOptionalNonNegative(value, path, details) {
  if (value !== undefined && value !== null && !nonNegativeNumber(value)) {
    details.push(invalid(path, 'must be a number greater than or equal to zero'));
  }
}

function validateRun(run, details) {
  if (!run || typeof run !== 'object') {
    details.push(required('run'));
    return;
  }
  if (run.eventsEnabled !== undefined && typeof run.eventsEnabled !== 'boolean') details.push(invalid('run.eventsEnabled','must be a boolean'));
  if(run.calculationMode!==undefined&&!['LIVE','FAST','SUMMARY'].includes(run.calculationMode))details.push(invalid('run.calculationMode','unsupported mode'));
  if (run.reliabilityEnabled !== undefined && typeof run.reliabilityEnabled !== 'boolean') details.push(invalid('run.reliabilityEnabled', 'must be a boolean'));
  if (!positiveNumber(run.durationSeconds)) details.push(invalid('run.durationSeconds', 'must be a number greater than zero'));
  if (!positiveNumber(run.tickSeconds)) details.push(invalid('run.tickSeconds', 'must be a number greater than zero'));
  if (!Number.isInteger(run.seed)) details.push(invalid('run.seed', 'must be an integer'));
  if (run.sampleEverySeconds !== undefined && !positiveNumber(run.sampleEverySeconds)) {
    details.push(invalid('run.sampleEverySeconds', 'must be a number greater than zero'));
  }
}

function validateCommands(commands, equipment, details) {
  if (commands === undefined) return;
  if (!Array.isArray(commands)) {
    details.push(invalid('run.commands', 'must be an array'));
    return;
  }
  const equipmentIds = new Set(Array.isArray(equipment) ? equipment.map((item) => item?.id) : []);
  commands.forEach((command, index) => {
    const path = 'run.commands[' + index + ']';
    if (!command || typeof command !== 'object') {
      details.push(invalid(path, 'must be an object'));
      return;
    }
    if (!nonNegativeNumber(command.atVirtualSecond)) {
      details.push(invalid(path + '.atVirtualSecond', 'must be a number greater than or equal to zero'));
    }
    if (!equipmentIds.has(command.equipmentId)) {
      details.push(invalid(path + '.equipmentId', 'must reference an equipment unit in case.equipment'));
    }
    if (!['RUN', 'PAUSE', 'STOP', 'MANUAL', 'AUTO', 'EMERGENCY_STOP', 'RESET'].includes(command.action)) {
      details.push(invalid(path + '.action', 'is not supported'));
    }
  });
}

function validateNoiseProfile(noiseProfile, equipmentPath, details) {
  if (noiseProfile === undefined) return;
  if (!noiseProfile || typeof noiseProfile !== 'object' || Array.isArray(noiseProfile)) {
    details.push(invalid(equipmentPath + '.noiseProfile', 'must be an object'));
    return;
  }
  if (noiseProfile.microStop !== undefined) validateMicroStop(noiseProfile.microStop, equipmentPath, details);
  if (noiseProfile.reliability !== undefined) validateReliability(noiseProfile.reliability, equipmentPath, details);
}

function validateMicroStop(microStop, equipmentPath, details) {
  const path = equipmentPath + '.noiseProfile.microStop';
  if (!microStop || typeof microStop !== 'object' || Array.isArray(microStop)) {
    details.push(invalid(path, 'must be an object'));
    return;
  }
  if (microStop.probabilityPerMinute !== undefined && !nonNegativeNumber(microStop.probabilityPerMinute)) {
    details.push(invalid(path + '.probabilityPerMinute', 'must be a number greater than or equal to zero'));
  }
  if (microStop.minDurationSeconds !== undefined && !nonNegativeNumber(microStop.minDurationSeconds)) {
    details.push(invalid(path + '.minDurationSeconds', 'must be a number greater than or equal to zero'));
  }
  if (microStop.maxDurationSeconds !== undefined && !nonNegativeNumber(microStop.maxDurationSeconds)) {
    details.push(invalid(path + '.maxDurationSeconds', 'must be a number greater than or equal to zero'));
  }
  if (nonNegativeNumber(microStop.minDurationSeconds) && nonNegativeNumber(microStop.maxDurationSeconds) &&
      microStop.minDurationSeconds > microStop.maxDurationSeconds) {
    details.push(invalid(path + '.maxDurationSeconds', 'must be greater than or equal to minDurationSeconds'));
  }
}

function validateReliability(reliability, equipmentPath, details) {
  const path = equipmentPath + '.noiseProfile.reliability';
  if (!reliability || typeof reliability !== 'object' || Array.isArray(reliability)) {
    details.push(invalid(path, 'must be an object'));
    return;
  }
  if (!positiveNumber(reliability.mtbfMinutes)) {
    details.push(invalid(path + '.mtbfMinutes', 'must be a number greater than zero'));
  }
  if (!positiveNumber(reliability.mttrMinutes)) {
    details.push(invalid(path + '.mttrMinutes', 'must be a number greater than zero'));
  }
}

function required(path) { return { path, reason: 'is required' }; }
function invalid(path, reason) { return { path, reason }; }
function positiveNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function nonNegativeNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function nonEmptyString(value) { return typeof value === 'string' && value.length > 0; }


/** Design targets and observed flow. Recovery is an explicit planning estimate. */
function analyzeLinePerformance(equipment, result) {
  const machines = (equipment || []).filter(item => item.type !== 'CONVEYOR' && item.processData?.role !== 'CONVEYOR');
  const duration = Number(result?.durationSeconds) || 0;
  const referenceId = machines.find(item => item.type === 'PACEMAKER' || item.processData?.role === 'PACEMAKER' || item.characteristics?.isPacemaker)?.id ||
    machines.find(item => item.id === result?.summary?.lineOeePacemakerEquipmentId)?.id ||
    machines.find(item => item.type === 'FILLER')?.id || machines[0]?.id;
  const reference = machines.find(item => item.id === referenceId);
  const baselineBpm = Number(reference?.nominalRatePerSecond) * 60;
  const points = machines.map(item => {
    const configuredBpm = Number(item.nominalRatePerSecond) * 60;
    // The V-Graph shows configured machine speeds. Average production flow
    // is reported separately and must not flatten speeds to the pacemaker.
    const normalBpm = configuredBpm;
    const recovery = estimateRecoveryTarget(equipment || [], item, referenceId, normalBpm);
    const configuredMaximum = item.processData?.equipment?.maximumSpeedBpm;
    const maximumBpm = configuredMaximum === null || configuredMaximum === undefined || configuredMaximum === ''
      ? null : Number(configuredMaximum);
    const validMaximum = Number.isFinite(maximumBpm) && maximumBpm >= normalBpm && normalBpm > 0;
    const metrics = result?.equipmentMetrics?.[item.id];
    const output = Number(metrics?.outputCount);
    const stopped = Number(metrics?.stoppedSeconds);
    // Availability excludes line interactions; starvation and blocking therefore
    // reduce the operational-efficiency component of effective throughput.
    const availableSeconds = duration > 0 && Number.isFinite(stopped)
      ? Math.max(0, duration - stopped) : 0;
    const availability = duration > 0 && Number.isFinite(stopped) ? availableSeconds / duration : null;
    // Availability-only capacity estimate. Buffer recovery requires the actual
    // deviation from desired inventory and a recovery time, neither supplied here.
    // The pacemaker is the reference, not a machine to overspeed for recovery.
    const capacityEstimateBpm = item.id !== referenceId && baselineBpm > 0 && configuredBpm > 0 && availability > 0
      ? Math.max(configuredBpm, baselineBpm / availability) : null;
    const runtimeEfficiency = availableSeconds > 0 && Number.isFinite(output) && configuredBpm > 0
      ? output / (availableSeconds * configuredBpm / 60) : null;
    const observedBpm = duration > 0 && Number.isFinite(output) ? output * 60 / duration : null;
    return {
      id: item.id, name: item.name, isPacemaker: item.id === referenceId,
      normalBpm, configuredBpm, maximumBpm: validMaximum ? maximumBpm : null,
      ...recovery,
      recommendedPercent: recovery.recommendedBpm !== null && baselineBpm > 0 ? recovery.recommendedBpm / baselineBpm * 100 : null,
      recommendationExceedsMaximum: recovery.recommendedBpm !== null && validMaximum ? recovery.recommendedBpm > maximumBpm + 1e-9 : null,
      speedHeadroomPercent: validMaximum ? (maximumBpm / normalBpm - 1) * 100 : null,
      normalPercent: baselineBpm > 0 ? normalBpm / baselineBpm * 100 : null,
      maximumPercent: validMaximum && baselineBpm > 0 ? maximumBpm / baselineBpm * 100 : null,
      capacityEstimateBpm,
      capacityEstimateExceedsMaximum: capacityEstimateBpm !== null && validMaximum ? capacityEstimateBpm > maximumBpm + 1e-9 : null,
      availability, runtimeEfficiency, observedBpm,
      computedBpm: availability !== null && runtimeEfficiency !== null
        ? configuredBpm * availability * runtimeEfficiency : null,
      hasDynamicEvidence: observedBpm !== null
    };
  });
  const outletCount = Number(result?.summary?.outputCount);
  return {
    points, referenceId,
    unitOfFlow: result?.unitOfFlow || 'units',
    outletBpm: duration > 0 && Number.isFinite(outletCount) ? outletCount * 60 / duration : null,
    outputCount: Number.isFinite(outletCount) ? outletCount : null,
    durationSeconds: duration,
    hasSpeedHeadroom: points.some(point => point.speedHeadroomPercent > 0),
    hasCompleteMaxima: points.length > 0 && points.every(point => point.maximumBpm !== null),
    // The engine uses nominal speed for processing; maximum is design evidence,
    // not a simulated recovery-speed controller or a V-Graph certification.
    simulatesOverspeed: false
  };
}

function estimateRecoveryTarget(equipment, item, referenceId, normalBpm) {
  const empty = {recommendedBpm:null,recoveryUnits:null,recoveryTimeSeconds:null,recoveryBasis:'MISSING_DATA'};
  if (!(normalBpm > 0)) return empty;
  if (item.id === referenceId) return {...empty,recommendedBpm:normalBpm,recoveryUnits:0,recoveryBasis:'PACEMAKER'};
  const index = equipment.indexOf(item), referenceIndex = equipment.findIndex(e => e.id === referenceId);
  const towardReference = referenceIndex > index ? 1 : -1;
  const conveyorIndex = index + towardReference;
  const conveyor = equipment[conveyorIndex];
  if (!conveyor || conveyor.type !== 'CONVEYOR' && conveyor.processData?.role !== 'CONVEYOR')
    return {...empty,recommendedBpm:normalBpm,recoveryUnits:0,recoveryBasis:'NO_ACCUMULATION'};
  const definition = resolveAccumulationZoneDefinition(equipment, conveyorIndex).definition;
  const pitch = Number(definition?.accumulatedPitchMm);
  const usefulLength = definition?.engineering?.calculated?.usefulAccumulationLengthMm ?? definition?.usableLengthMm;
  if (!(pitch > 0) || !Number.isFinite(usefulLength) || usefulLength < 0) return empty;
  const bufferUnits = Math.floor(usefulLength / pitch);
  const reliability = item.noiseProfile?.reliability;
  // Disabled failures do not create an inferred outage, even if old MTTR values
  // are retained in processData. Missing data is not a zero-loss assumption.
  const mttr = Number(reliability?.mttrMinutes);
  const recoverySeconds = Number(item.processData?.equipment?.recoveryTimeSeconds ?? Number(reliability?.mtbfMinutes) * 60);
  if (!reliability || !Number.isFinite(mttr) || !(mttr > 0) || !Number.isFinite(recoverySeconds) || !(recoverySeconds > 0)) return empty;
  const recoveryUnits = Math.min(normalBpm * mttr, bufferUnits);
  return {
    recommendedBpm:normalBpm + recoveryUnits * 60 / recoverySeconds,
    recoveryUnits,recoveryTimeSeconds:recoverySeconds,
    recoveryBasis:item.processData?.equipment?.recoveryTimeSeconds != null ? 'EXPLICIT_RECOVERY_TIME' : 'MTBF_RECOVERY_WINDOW',
    bufferUnits,bufferCoversMeanStop:bufferUnits >= normalBpm * mttr
  };
}


// Capacity accounting and observed equipment time are distinct: time losses
// overlap across machines and must never be summed as causal global OEE loss.
function diagnoseLineEfficiency(equipment,result){
  let models=equipment||[];
  if(result?.inputSignature){try{const p=JSON.parse(result.inputSignature);if(Array.isArray(p.equipment))models=p.equipment;}catch(_){}}
  const line=analyzeLinePerformance(models,result),reference=line.points.find(p=>p.isPacemaker),machines=line.points.filter(p=>p.configuredBpm>0);
  const referenceBpm=reference?.configuredBpm,minimumBpm=machines.length?Math.min(...machines.map(p=>p.configuredBpm)):null;
  const ceiling=referenceBpm>0&&minimumBpm>0?Math.min(100,100*minimumBpm/referenceBpm):null;
  const mean=result?.batch?.statistics?.lineOeePercent?.mean,achieved=Number.isFinite(mean)?mean:result?.summary?.lineOeePercent;
  const valid=result?.engineId!=='DES_SIMPY_EXPERIMENTAL'&&Number.isFinite(ceiling)&&Number.isFinite(achieved)&&achieved>=0&&achieved<=ceiling+.01;
  const duration=result?.durationSeconds,read=(id,key)=>result?.batch?.equipmentStatistics?.[id]?.[key]?.mean??result?.equipmentMetrics?.[id]?.[key];
  const keys=['plannedStopSeconds','failureSeconds','microStopSeconds','pausedSeconds','emergencyStopSeconds','starvedSeconds','blockedSeconds','waitingForPrimeSeconds','backupStopSeconds'];
  return {referenceId:line.referenceId,referenceName:reference?.name,referenceBpm,minimumBpm,capacityCeilingPercent:ceiling,
    limitingEquipment:machines.filter(p=>Math.abs(p.configuredBpm-minimumBpm)<1e-7).map(p=>({id:p.id,name:p.name,bpm:p.configuredBpm,maximumBpm:p.maximumBpm})),
    achievedPercent:Number.isFinite(achieved)?achieved:null,capacityGapPp:Number.isFinite(ceiling)?100-ceiling:null,residualLossPp:valid?Math.max(0,ceiling-achieved):null,
    accountingAvailable:valid,rounds:result?.batch?.rounds||1,
    equipmentTime:machines.map(p=>({id:p.id,name:p.name,percent:Object.fromEntries(keys.map(key=>{const value=read(p.id,key);return [key,duration>0&&Number.isFinite(value)?100*value/duration:null];}))})),
    interpretation:'Nominal machine-speed ceiling; excludes transport constraints, stops and startup. Residual loss is not separated causally. Equipment-time percentages overlap and are not additive global OEE contributions.'};
}


// Scenario policy is separate from the unchanged simulation mathematics.
const SCENARIO_POLICY = Object.freeze({microstopLimitMinutes:4,maxChanges:64});
const SCENARIO_DEFINITIONS = Object.freeze({
  ZERO:{scope:'Optimize installed assets and work practices without capital investment.',reliability:'Supported operational improvements; additional maintenance is OPEX, not capital.',costBasis:'Intervention scope; no assumed monetary threshold or required efficiency gain.'},
  MEDIUM:{scope:'Local component rehabilitation, monitoring or equipment retrofit.',reliability:'Documented retrofit MTBF/MTTR targets, with installation scope and target source.',costBasis:'Localized investment; costs must be supplied, not inferred from OEE.'},
  HIGH:{scope:'Complete equipment replacement or major line/transport redesign.',reliability:'Replacement can improve reliability without changing speed; use supplier or measured targets.',costBasis:'Major investment scope; a small validated gain is a limited-benefit project, not proof of value.'}
});
const SCENARIO_INTERVENTIONS = Object.freeze({
  OPERATIONAL:{tier:'ZERO',costClass:'NONE',label:'Existing resources / work practices'},
  MAINTENANCE:{tier:'ZERO',costClass:'OPEX',label:'Additional maintenance / repair resources'},
  RETROFIT:{tier:'MEDIUM',costClass:'CAPEX',label:'Local retrofit / rehabilitation'},
  REPLACEMENT:{tier:'HIGH',costClass:'CAPEX',label:'Complete equipment replacement'}
});
function scenarioCategoryAllows(change,tier){
  if(change.analysisOnly)return false;
  if(change.replacementMaximumBpm!==undefined)return tier==='HIGH'&&change.path==='nominalRatePerSecond'&&change.interventionType==='REPLACEMENT'&&change.external===true;
  if(change.path.startsWith('noiseProfile.reliability.')){
    const intervention=SCENARIO_INTERVENTIONS[change.interventionType];
    return !!intervention&&intervention.tier===tier;
  }
  return tier==='HIGH'||tier==='MEDIUM'&&change.path!=='processData.geometry.lactMm'||tier==='ZERO'&&!change.external&&change.path!=='processData.geometry.lactMm';
}
// Explicit exploratory levels are diagnostics, never implementation targets.
function reliabilitySensitivityCandidates(simulation,{mtbfMultiplier=2,mttrMultiplier=.5}={}){
  if(simulation.dynamicConfig?.reliabilityEnabled===false)return [];
  if(!(mtbfMultiplier>1&&mtbfMultiplier<=10&&mttrMultiplier>0&&mttrMultiplier<1))throw Error('SCENARIO_INVALID_SENSITIVITY_LEVEL');
  const diagnosis=diagnoseScenarioLosses(simulation);
  return (simulation.equipment||[]).filter(e=>e.type!=='CONVEYOR'&&e.noiseProfile?.reliability?.mtbfMinutes>0&&e.noiseProfile?.reliability?.mttrMinutes>0).flatMap(e=>{
    const changes=['mtbfMinutes','mttrMinutes'].map((key,i)=>({...scenarioChange(e,'noiseProfile.reliability.'+key,Math.max(SCENARIO_FIELDS['noiseProfile.reliability.'+key][0],Math.min(SCENARIO_FIELDS['noiseProfile.reliability.'+key][1],e.noiseProfile.reliability[key]*(i?mttrMultiplier:mtbfMultiplier)))),external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Exploratory sensitivity level; not an achievable intervention target.'}));
    const observed=diagnosis.equipment.find(r=>r.equipmentId===e.id);
    return ['MTBF','MTTR','JOINT'].map((kind,i)=>({equipmentId:e.id,equipmentName:e.name,kind,changes:i===2?changes:[changes[i]],ownStopPercent:observed?.ownStopPercent??null,availabilityBefore:e.noiseProfile.reliability.mtbfMinutes/(e.noiseProfile.reliability.mtbfMinutes+e.noiseProfile.reliability.mttrMinutes)}));
  }).sort((a,b)=>(b.ownStopPercent??0)-(a.ownStopPercent??0));
}
const SCENARIO_FIELDS = Object.freeze({
  'nominalRatePerSecond':[0.001,1000000,'units/s'],
  'noiseProfile.reliability.mtbfMinutes':[0.001,1000000,'min'],
  'noiseProfile.reliability.mttrMinutes':[0.001,1000000,'min'],
  'processData.accumulation.conveyorSpeedMmPerSecond':[0.001,1000000,'mm/s'],
  'processData.accumulation.conveyorSpeedFactorPercent':[0,1000,'%'],
  'processData.accumulation.blockedTimeDelaySeconds':[0,3600,'s'],
  'processData.accumulation.clearTimeDelaySeconds':[0,3600,'s'],
  'processData.accumulation.backupSensorPositionMm':[0,1000000,'mm'],
  'processData.geometry.lactMm':[1,1000000,'mm'],
  'processData.geometry.lpPrimeMm':[0,1000000,'mm'],
  'processData.accumulation.downstreamRampUpSeconds':[0,3600,'s'],
  'processData.upstream.startupTimeSeconds':[0,3600,'s']
});
function scenarioCopy(value){return JSON.parse(JSON.stringify(value));}
function scenarioGet(e,path){return path.split('.').reduce((value,key)=>value?.[key],e);}
function scenarioSet(e,path,value){const parts=path.split('.'),key=parts.pop();let node=e;parts.forEach(p=>{node[p]=node[p]||{};node=node[p];});node[key]=value;}
function stableScenarioValue(value){
  if(Array.isArray(value))return value.map(stableScenarioValue);
  if(value&&typeof value==='object')return Object.keys(value).sort().reduce((result,key)=>{
    if(value[key]!==undefined)result[key]=stableScenarioValue(value[key]);
    return result;
  },{});
  return value;
}
function scenarioSignature(simulation){
  // CaseService normalizes each equipment record on write. Hash only the
  // persisted input fields and sort nested keys so JSON editor formatting and
  // key insertion order cannot invalidate a proposal with identical inputs.
  const equipment=(simulation.equipment||[]).map(unit=>({
    id:unit.id,type:unit.type,name:typeof unit.name==='string'?unit.name.trim():unit.name,
    nominalRatePerSecond:Number(unit.nominalRatePerSecond),initialMode:unit.initialMode,
    characteristics:unit.characteristics&&typeof unit.characteristics==='object'?unit.characteristics:{},
    noiseProfile:unit.noiseProfile&&typeof unit.noiseProfile==='object'?unit.noiseProfile:{},
    processData:unit.processData&&typeof unit.processData==='object'?unit.processData:{}
  }));
  const config=simulation.dynamicConfig&&typeof simulation.dynamicConfig==='object'&&!Array.isArray(simulation.dynamicConfig)?{...simulation.dynamicConfig}:{};
  delete config.chartWindow;
  const text=JSON.stringify(stableScenarioValue(["SCENARIO_STREAMS_V4",simulation.id,equipment,config]));
  let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16)+':'+text.length;
}
function scenarioAudit(simulation){
  return (simulation.equipment||[]).flatMap((e,index)=>{
    if(e.type!=='CONVEYOR')return [];
    const zone=resolveAccumulationZoneDefinition(simulation.equipment,index).definition;
    return [{equipmentId:e.id,equipmentName:e.name,engineering:zone?.engineering||null,upstreamId:zone?.upstreamControlEquipmentId,downstreamId:zone?.downstreamControlEquipmentId}];
  });
}
// Catalog lists model-supported inputs even when the planner has no proposal.
// Targets start at the baseline: the user supplies bounds; no gains are invented.
function scenarioVariableCatalog(simulation){
  const referenceId=analyzeLinePerformance(simulation.equipment,simulation.results).referenceId;
  return (simulation.equipment||[]).flatMap(e=>Object.keys(SCENARIO_FIELDS).filter(path=>
    e.type==='CONVEYOR'?path.startsWith('processData.'):path==='nominalRatePerSecond'||path.startsWith('noiseProfile.reliability.')||path==='processData.upstream.startupTimeSeconds'
  ).map(path=>{
    const before=scenarioGet(e,path)??null,external=path.startsWith('noiseProfile.reliability.');
    let disabledReason=Number.isFinite(before)?null:'Set a numeric baseline in Equipment first.';
    if(external&&!(before>0))disabledReason='Set a positive reliability baseline in Equipment first.';
    if(path==='nominalRatePerSecond'){
      if(e.id===referenceId)disabledReason='Reference machine speed is fixed by the current scenario policy.';
      else if(!(Number(e.processData?.equipment?.maximumSpeedBpm)>0))disabledReason='Set the installed maximum speed in Equipment first.';
    }
    if(e.type==='CONVEYOR'&&path.endsWith('conveyorSpeedMmPerSecond')&&e.processData?.accumulation?.speedMode!=='MANUAL')disabledReason='Select manual conveyor speed in Equipment first.';
    if(e.type==='CONVEYOR'&&path.endsWith('conveyorSpeedFactorPercent')&&e.processData?.accumulation?.speedMode==='MANUAL')disabledReason='Manual speed mode uses conveyor speed instead of its automatic factor.';
    return {equipmentId:e.id,path,before,after:before,unit:SCENARIO_FIELDS[path][2],external,disabledReason,catalogOnly:true};
  }));
}
function applyScenarioChanges(simulation,changes){
  if(!Array.isArray(changes)||!changes.length||changes.length>SCENARIO_POLICY.maxChanges)throw new Error('SCENARIO_INVALID_CHANGES');
  const copy=scenarioCopy(simulation),seen=new Set();
  changes.forEach(change=>{
    const rule=Object.hasOwn(SCENARIO_FIELDS,change.path)?SCENARIO_FIELDS[change.path]:null;
    const unit=copy.equipment.find(e=>e.id===change.equipmentId),key=change.equipmentId+':'+change.path;
    if(!unit||!rule||seen.has(key)||typeof change.after!=='number'||!Number.isFinite(change.after)||change.after<rule[0]||change.after>rule[1])throw new Error('SCENARIO_INVALID_FIELD');
    if(!Object.hasOwn(change,'before')||(scenarioGet(unit,change.path)??null)!==change.before)throw new Error('SCENARIO_STALE');
    if((change.path.includes('accumulation')||change.path.includes('geometry'))&&unit.type!=='CONVEYOR')throw new Error('SCENARIO_INVALID_FIELD');
    if(change.path==='nominalRatePerSecond'){
      let maximum=Number(unit.processData?.equipment?.maximumSpeedBpm)/60;
      if(change.replacementMaximumBpm!==undefined){
        if(!(maximum>0)||change.external!==true||change.interventionType!=='REPLACEMENT'||typeof change.justification!=='string'||!change.justification.trim()||!Number.isFinite(change.replacementMaximumBpm)||change.replacementMaximumBpm<=maximum*60||change.replacementMaximumBpm>SCENARIO_FIELDS.nominalRatePerSecond[1]*60||change.after<change.before)throw Error('SCENARIO_REPLACEMENT_EVIDENCE_REQUIRED');
        maximum=change.replacementMaximumBpm/60;
      }
      if(unit.type==='CONVEYOR'||unit.id===analyzeLinePerformance(simulation.equipment,simulation.results).referenceId||!(maximum>0)||change.after>maximum)throw new Error('SCENARIO_INSTALLED_SPEED_LIMIT');
    }
    if(change.path.startsWith('noiseProfile.reliability.')){
      if(unit.type==='CONVEYOR'||!(change.before>0)||change.external!==true||typeof change.justification!=='string'||!change.justification.trim()||(!SCENARIO_INTERVENTIONS[change.interventionType]&&!(change.analysisOnly===true&&change.interventionType==='SENSITIVITY')))throw new Error('SCENARIO_EXTERNAL_EVIDENCE_REQUIRED');
      if(change.path.endsWith('mtbfMinutes')?change.after<change.before:change.after>change.before)throw new Error('SCENARIO_RELIABILITY_DIRECTION');
    }
    if(change.replacementMaximumBpm!==undefined){if(change.path!=='nominalRatePerSecond')throw Error('SCENARIO_INVALID_FIELD');scenarioSet(unit,'processData.equipment.maximumSpeedBpm',change.replacementMaximumBpm);}
    seen.add(key);scenarioSet(unit,change.path,change.after);
  });
  if(changes.every(c=>c.before===c.after))throw new Error('SCENARIO_NO_CHANGE');
  const check=validateSimulationInput({case:{id:'scenario-preview',equipment:copy.equipment},run:Object.assign({durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:1,commands:[]},copy.dynamicConfig)});
  if(!check.ok)throw new Error('SCENARIO_INVALID_PHYSICS');
  copy.scenarioWarnings=[];
  const before=scenarioAudit(simulation),after=scenarioAudit(copy);
  after.forEach((item,index)=>{
    (item.engineering?.audit?.goals||[]).forEach(goal=>{
      const previous=before[index]?.engineering?.audit?.goals?.find(g=>g.id===goal.id);
      if(previous?.status==='PASS'&&goal.status!=='PASS')copy.scenarioWarnings.push({equipmentId:item.equipmentId,rule:goal.id,before:previous.status,after:goal.status});
    });
  });
  copy.results=null;return copy;
}
function scenarioChange(e,path,after){return {equipmentId:e.id,path,before:scenarioGet(e,path)??null,after,unit:SCENARIO_FIELDS[path][2]};}
function scenarioGoal(engineering,id){return engineering?.audit?.goals?.find(g=>g.id===id)?.status;}
function scenarioRecoveryPlan(engineering,requiredSeconds=0){
  const input=engineering?.input;if(!input||!(input.installedLengthMm>0))return null;
  function evaluate(length){
    const first=calculateConveyorEngineering({...input,installedLengthMm:length}),backup=Math.ceil(first.calculated.recommendedBackupSensorPositionMm);
    if(!Number.isFinite(backup))return null;
    const check=calculateConveyorEngineering({...input,installedLengthMm:length,backupSensorPositionMm:backup});
    const passes=['INSTALLED_LENGTH','SMOOTH_RECOVERY','BACKUP_POSITION'].every(id=>scenarioGoal(check,id)==='PASS');
    return {length,backup,check,passes:passes&&(!requiredSeconds||check.calculated.antiStarveSeconds>=requiredSeconds)};
  }
  let low=Math.ceil(input.installedLengthMm),high=low,plan=evaluate(high),limit=Math.min(1000000,Math.max(high+50000,high*5));
  while(plan&&!plan.passes&&high<limit){low=high;high=Math.min(limit,high+Math.max(100,Math.ceil(high*.2)));plan=evaluate(high);}
  if(!plan?.passes)return null;
  while(high-low>1){const mid=Math.floor((low+high)/2),trial=evaluate(mid);if(trial?.passes){high=mid;plan=trial;}else low=mid;}
  return evaluate(high);
}
// Losses describe observed states, not proven causal attribution.
function diagnoseScenarioLosses(simulation){
  const result=simulation.results,empty={status:'NO_COMPATIBLE_RESULTS',equipment:[],referenceId:null};
  if(!result?.summary||!(result.durationSeconds>0)||result.replicationStatus?.state!=='COMPLETE')return empty;
  let provenance;try{provenance=JSON.parse(result.inputSignature);}catch(_){return empty;}
  const equal=(a,b)=>JSON.stringify(stableScenarioValue(a))===JSON.stringify(stableScenarioValue(b));
  const run={durationSeconds:300,tickSeconds:.25,sampleEverySeconds:5,seed:1,commands:[],rounds:1,engineId:'ST_CURRENT',...simulation.dynamicConfig};
  if(run.reliabilityEnabled!==false)delete run.reliabilityEnabled;
  if(run.durationMode==='SHIFTS')run.durationSeconds=(run.shiftHours||8)*(run.shiftCount||1)*3600;
  if(provenance.version!=='ST_CURRENT:0.13.0/DES:0.4.0/cache:2'||!equal(provenance.equipment,simulation.equipment)||!equal(provenance.run,run)||provenance.unitOfFlow!==(simulation.unitOfFlow||result.unitOfFlow||'units'))return empty;
  const referenceId=analyzeLinePerformance(simulation.equipment,result).referenceId;
  const rows=(simulation.equipment||[]).filter(e=>e.type!=='CONVEYOR').map(e=>{
    const stats=result.batch?.equipmentStatistics?.[e.id],metrics=result.equipmentMetrics?.[e.id];
    const read=key=>{const value=stats?.[key]?.mean??metrics?.[key];return Number.isFinite(value)&&value>=0?value:null;};
    const failureSeconds=read('failureSeconds'),microStopSeconds=read('microStopSeconds'),starvedSeconds=read('starvedSeconds'),blockedSeconds=read('blockedSeconds');
    const causes=[['FAILURE',failureSeconds],['MICROSTOP',microStopSeconds],['STARVATION',starvedSeconds],['BLOCKING',blockedSeconds]].filter(x=>x[1]!==null).sort((a,b)=>b[1]-a[1]);
    return {equipmentId:e.id,name:e.name,isReference:e.id===referenceId,failureSeconds,microStopSeconds,starvedSeconds,blockedSeconds,waitingForPrimeSeconds:read('waitingForPrimeSeconds'),dominantLoss:causes[0]?.[1]>0?causes[0][0]:'NONE',ownStopPercent:failureSeconds===null&&microStopSeconds===null?null:100*((failureSeconds||0)+(microStopSeconds||0))/result.durationSeconds};
  });
  return {status:rows.some(r=>r.failureSeconds!==null||r.starvedSeconds!==null||r.blockedSeconds!==null)?'OBSERVED':'MISSING_METRICS',referenceId,durationSeconds:result.durationSeconds,rounds:result.batch?.rounds||1,equipment:rows,interpretation:'Observed losses and possible propagation paths; inactivity alone does not establish a line bottleneck.'};
}
function scenarioLossEvidence(simulation,diagnosis,equipment,kind){
  if(diagnosis.status!=='OBSERVED')return {priorityBonus:0};
  const index=simulation.equipment.findIndex(e=>e.id===equipment.id),referenceIndex=simulation.equipment.findIndex(e=>e.id===diagnosis.referenceId);
  const ids=equipment.type==='CONVEYOR'?[simulation.equipment[index-1]?.id,simulation.equipment[index+1]?.id]:[equipment.id];
  const local=diagnosis.equipment.filter(r=>ids.includes(r.equipmentId)),reference=diagnosis.equipment.find(r=>r.isReference);
  const seconds=local.reduce((sum,r)=>sum+(r.failureSeconds||0)+(r.microStopSeconds||0)+(r.starvedSeconds||0)+(r.blockedSeconds||0),0);
  const direction=index<referenceIndex?'UPSTREAM':index>referenceIndex?'DOWNSTREAM':'REFERENCE';
  const referenceLoss=direction==='UPSTREAM'?reference?.starvedSeconds:direction==='DOWNSTREAM'?reference?.blockedSeconds:0;
  const bonus=Math.min(30,seconds/diagnosis.durationSeconds*20+(referenceLoss||0)/diagnosis.durationSeconds*20);
  return {priorityBonus:bonus,observedLosses:local,referenceInteraction:{direction,seconds:referenceLoss||0},interpretation:'Diagnostic priority, not a demonstrated causal gain.'};
}
// Opportunity screening does not create undocumented implementation targets.
function scenarioProposalNeeds(simulation){
  const line=analyzeLinePerformance(simulation.equipment,null),reference=line.points.find(p=>p.isPacemaker),options=(simulation.whatIf?.externalOptions||[]).filter(o=>{try{if(!o.changes?.length||!o.changes.every(c=>scenarioCategoryAllows(c,o.tier)))return false;applyScenarioChanges(simulation,o.changes);return true;}catch(_){return false;}}).flatMap(o=>o.changes),needs=[];
  for(const point of line.points){
    const equipment=simulation.equipment.find(e=>e.id===point.id),r=equipment.noiseProfile?.reliability;
    const hasCapacity=options.some(c=>c.equipmentId===point.id&&c.replacementMaximumBpm!==undefined);
    if(!point.isPacemaker&&point.configuredBpm<reference.configuredBpm-1e-6&&(!point.maximumBpm||point.maximumBpm<reference.configuredBpm)&&!hasCapacity)needs.push({kind:'CAPACITY_TARGET_REQUIRED',equipmentId:point.id,name:point.name,configuredBpm:point.configuredBpm,installedMaximumBpm:point.maximumBpm,referenceBpm:reference.configuredBpm,requiredInput:'Documented replacement operating speed, new maximum capacity and source. No target is inferred from the reference.'});
    if(simulation.dynamicConfig?.reliabilityEnabled!==false&&r?.mtbfMinutes>0&&r?.mttrMinutes>0){
      const availability=r.mtbfMinutes/(r.mtbfMinutes+r.mttrMinutes),effective=point.configuredBpm*availability;
      const hasReliability=options.some(c=>c.equipmentId===point.id&&c.path.startsWith('noiseProfile.reliability.'));
      if(effective<reference.configuredBpm-1e-6&&!hasReliability)needs.push({kind:'RELIABILITY_TARGET_REQUIRED',equipmentId:point.id,name:point.name,availabilityPercent:100*availability,availabilityOnlyBpm:effective,referenceBpm:reference.configuredBpm,requiredInput:'Evaluate sensitivity, then supply an achievable MTBF/MTTR target, intervention type and source. Availability-only capacity is screening, not simulated throughput.'});
    }
  }
  return needs.sort((a,b)=>(a.availabilityOnlyBpm??a.configuredBpm)-(b.availabilityOnlyBpm??b.configuredBpm));
}
function planScenarios(simulation){
  const audit=scenarioAudit(simulation),diagnosis=diagnoseScenarioLosses(simulation);
  const capacityDiagnosis=diagnoseLineEfficiency(simulation.equipment,diagnosis.status==='OBSERVED'?simulation.results:null);
  const result=diagnosis.status==='OBSERVED'?simulation.results:null;
  const candidates=[],checks=[];
  function add(kind,tier,equipment,changes,evidence,priority,basis){
    changes=changes.filter(c=>c.before!==c.after);if(!changes.length)return;
    let disabledReason=null;try{applyScenarioChanges(simulation,changes);}catch(error){disabledReason=error.message;}
    const losses=scenarioLossEvidence(simulation,diagnosis,equipment,kind);evidence={...evidence,...losses};priority+=losses.priorityBonus;if(diagnosis.status==='OBSERVED')basis='HYBRID';
    candidates.push({id:kind+':'+equipment.id,kind,tier,titleKey:'scenario.'+kind.toLowerCase(),equipmentId:equipment.id,equipmentName:equipment.name,changes,evidence,priority,basis,canApply:!disabledReason,disabledReason,sourceSimulationId:simulation.id,sourceSignature:scenarioSignature(simulation)});
  }
  audit.forEach(item=>{
    const e=simulation.equipment.find(x=>x.id===item.equipmentId),engineering=item.engineering;
    if(!engineering){checks.push({equipmentId:e.id,rule:'GEOMETRY',status:'NOT_EVALUATED'});return;}
    const input=engineering.input,c=engineering.calculated;
    checks.push(...engineering.audit.goals.map(g=>({equipmentId:e.id,rule:g.id,status:g.status})));
    const speed=c.recommendedConveyorSpeedFactorPercent;
    if(e.processData?.accumulation?.speedMode==='MANUAL'&&Number.isFinite(c.recommendedInfeedConveyorSpeedMmPerSecond))add('SPEED_BALANCE','ZERO',e,[scenarioChange(e,'processData.accumulation.conveyorSpeedMmPerSecond',c.recommendedInfeedConveyorSpeedMmPerSecond)],{recommendedSpeedMmPerSecond:c.recommendedInfeedConveyorSpeedMmPerSecond},64,'STATIC');
    if(e.processData?.accumulation?.speedMode!=='MANUAL'&&Number.isFinite(speed)&&speed>=0&&Math.abs(speed-input.conveyorSpeedFactorPercent)>=.25){
      add('SPEED_BALANCE','ZERO',e,[scenarioChange(e,'processData.accumulation.conveyorSpeedFactorPercent',Number(speed.toFixed(2)))],{recommendedSpeedMmPerSecond:c.recommendedInfeedConveyorSpeedMmPerSecond},64,'STATIC');
    }
    if(scenarioGoal(engineering,'SENSOR_DEBOUNCE')==='WARNING'&&Number.isFinite(c.packagePassSensorSeconds)&&Number.isFinite(c.sensorClearGapSeconds)){
      const greater=v=>Math.ceil((v+.01)*100)/100;
      add('SENSOR_DEBOUNCE','ZERO',e,[scenarioChange(e,'processData.accumulation.blockedTimeDelaySeconds',Math.max(input.blockedTimeDelaySeconds,greater(c.packagePassSensorSeconds))),scenarioChange(e,'processData.accumulation.clearTimeDelaySeconds',Math.max(input.clearTimeDelaySeconds,greater(c.sensorClearGapSeconds)))],{pulseSeconds:c.packagePassSensorSeconds,gapSeconds:c.sensorClearGapSeconds},82,'STATIC');
    }
    // Search existing sensor locations on every supported conveyor, even when
    // worksheet targets pass. These are hypotheses, not promised gains.
    const zone=resolveAccumulationZoneDefinition(simulation.equipment,simulation.equipment.indexOf(e)).definition;
    if(zone?.usableLengthMm>0){
      let backup=Math.min(c.recommendedBackupSensorPositionMm,zone.primeSensorPositionMm,zone.backupRestartPositionMm??Infinity);
      if(backup===e.processData?.accumulation?.backupSensorPositionMm)backup=Math.min(zone.primeSensorPositionMm,zone.backupRestartPositionMm??Infinity)*.5;
      if(Number.isFinite(backup)&&backup>=0)add('SENSOR_POSITION','ZERO',e,[scenarioChange(e,'processData.accumulation.backupSensorPositionMm',Number(backup.toFixed(2)))],{installedLengthMm:zone.usableLengthMm},75,'STATIC');
    }
    if(zone?.usableLengthMm>0&&e.processData?.geometry?.lpPrimeMm>0){
      add('SENSOR_WINDOW','ZERO',e,[scenarioChange(e,'processData.geometry.lpPrimeMm',e.processData.geometry.lpPrimeMm*.5)],{installedLengthMm:zone.usableLengthMm},72,'STATIC');
    }
    const upstream=simulation.equipment.find(x=>x.id===item.upstreamId),mttr=simulation.dynamicConfig?.reliabilityEnabled===false?null:upstream?.noiseProfile?.reliability?.mttrMinutes;
    const microstop=mttr>0&&mttr<=SCENARIO_POLICY.microstopLimitMinutes;
    const coverage=microstop&&Number.isFinite(c.antiStarveSeconds)?c.antiStarveSeconds/(mttr*60):null;
    checks.push({equipmentId:e.id,rule:'ACCUMULATION_1_TO_2_MTTR',status:coverage===null?'NOT_EVALUATED':coverage>=1&&coverage<=2?'PASS':'REVIEW',coverage,referenceEquipmentId:upstream?.id});
    const recoveryFailed=['INSTALLED_LENGTH','SMOOTH_RECOVERY','BACKUP_POSITION'].some(id=>['FAIL','WARNING'].includes(scenarioGoal(engineering,id)));
    const observedDownstream=diagnosis.equipment.find(r=>r.equipmentId===item.downstreamId);
    const observedStarvation=diagnosis.status==='OBSERVED'&&(observedDownstream?.starvedSeconds||0)>diagnosis.durationSeconds*.01;
    if(recoveryFailed||(coverage!==null&&coverage<1)||observedStarvation){
      const plan=scenarioRecoveryPlan(engineering,microstop?mttr*60:0);
      if(plan){
        const losses=result?.accumulationZoneMetrics&&Object.values(result.accumulationZoneMetrics).find(x=>x.ownerEquipmentId===e.id);
        add('BUFFER_RECOVERY','HIGH',e,[scenarioChange(e,'processData.accumulation.backupSensorPositionMm',plan.backup),scenarioChange(e,'processData.geometry.lactMm',plan.length)],{recoveryLengthMm:c.recoveryLengthMm,requiredOverflowMm:c.overflowLengthMm,addedLengthMm:plan.length-input.installedLengthMm,coverage,overflowUnits:losses?.overflowUnits??null},96+(losses?.overflowUnits>0?5:0),losses?'HYBRID':'STATIC');
      }
    }
    // The supplied design brief requires data not present in the current import contract.
    checks.push({equipmentId:e.id,rule:'TURN_TRAP_AND_FILLED_DIAMETER',status:'NOT_EVALUATED'});
  });
  (simulation.equipment||[]).filter(e=>e.type!=='CONVEYOR').forEach(e=>{
    const r=e.noiseProfile?.reliability;if(!(r?.mtbfMinutes>0&&r?.mttrMinutes>0))return;
    if(r.mttrMinutes>SCENARIO_POLICY.microstopLimitMinutes)checks.push({equipmentId:e.id,rule:'MAJOR_FAILURE_OUTSIDE_MICROSTOP_BUFFER_TARGET',status:'REVIEW'});
  });
  analyzeLinePerformance(simulation.equipment,result).points.forEach(point=>{
    if(point.isPacemaker||!(point.maximumBpm>0)||!(point.recommendedBpm>0))return;
    const equipment=simulation.equipment.find(e=>e.id===point.id),target=Math.min(point.maximumBpm,point.recommendedBpm)/60;
    add('V_CURVE','ZERO',equipment,[scenarioChange(equipment,'nominalRatePerSecond',target)],{maximumBpm:point.maximumBpm,recommendedBpm:point.recommendedBpm},70,'STATIC');
  });
  checks.push({rule:'PACEMAKER_DESIRED_STATE_AND_V_GRAPH',status:'NOT_EVALUATED'});
  (simulation.whatIf?.externalOptions||[]).forEach(option=>{
    if(simulation.dynamicConfig?.reliabilityEnabled===false&&option.changes?.some(c=>c.path.startsWith('noiseProfile.reliability.')))return;
    if(!['ZERO','MEDIUM','HIGH'].includes(option.tier)||!option.changes?.length||!option.changes.every(c=>scenarioCategoryAllows(c,option.tier)))return;
    const equipment=simulation.equipment.find(e=>e.id===option.changes[0].equipmentId);if(!equipment)return;
    add(option.changes.some(c=>c.replacementMaximumBpm!==undefined)?'CAPACITY_REPLACEMENT':'RELIABILITY_INTERVENTION',option.tier,equipment,option.changes,{targetSource:'USER_DOCUMENTED',interventionType:option.changes[0].interventionType,costClass:SCENARIO_INTERVENTIONS[option.changes[0].interventionType]?.costClass,interpretation:'Supported intervention hypothesis; dynamic benefit and shifted constraints require evaluation.'},option.changes.some(c=>c.replacementMaximumBpm!==undefined)&&capacityDiagnosis.limitingEquipment.some(e=>e.id===equipment.id)?120:90,'STATIC');
  });
  const projects=['ZERO','MEDIUM','HIGH'].map(tier=>{
    const choices=candidates.filter(p=>p.tier===tier).sort((a,b)=>Number(b.canApply)-Number(a.canApply)||b.priority-a.priority);
    return choices[0]||{tier,canApply:false,titleKey:'scenario.no_proposal',basis:'STATIC',changes:[],evidence:{},disabledReason:'SCENARIO_INSUFFICIENT_EVIDENCE'};
  });
  return {proposalNeeds:scenarioProposalNeeds(simulation),capacityDiagnosis,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,reliabilityOpportunities:reliabilitySensitivityCandidates(simulation),projects,checks,candidates,diagnosis,hasDynamicEvidence:diagnosis.status==='OBSERVED'};
}



return {plan:planScenarios,efficiency:diagnoseLineEfficiency,diagnose:diagnoseScenarioLosses,apply:applyScenarioChanges,signature:scenarioSignature,audit:scenarioAudit,fields:SCENARIO_FIELDS,catalog:scenarioVariableCatalog,definitions:SCENARIO_DEFINITIONS,interventions:SCENARIO_INTERVENTIONS,categoryAllows:scenarioCategoryAllows,reliabilitySensitivity:reliabilitySensitivityCandidates};
})();
