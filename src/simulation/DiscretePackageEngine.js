// Compute individual completion times inside a tick. The caller owns line
// topology, machine availability, sensors and material accounting.
export function planDiscretePackages(equipment, zone, start, tick, requested, available, space, residual) {
  // A conveyor has transport headway, not an additional machine processing cycle.
  // Requiring both a service credit and a headway loses capacity whenever the entry queue clears.
  if(zone?.physicalModelEnabled&&(equipment.type==='CONVEYOR'||equipment.processData?.role==='CONVEYOR')){
    const entries=[],headway=zone.productPitchMm/zone.conveyorSpeedMmPerSecond,end=start+tick;
    const count=Math.floor(Math.min(available,space)+1e-8);
    let entry=Math.max(start,(zone.lastPackageEntry??-Infinity)+headway);
    for(let index=0;index<count&&entry<=end+1e-8;index++,entry+=headway)entries.push(Math.min(entry,end));
    return {count:entries.length,entries};
  }
  const canProcess=(equipment.residence?.inventory??available)>=1;
  const previous=canProcess?(equipment.packageRemainder||0):0;
  const service=canProcess?previous+requested:0;
  const completed=Math.floor(service+1e-8);
  const count=Math.max(0,Math.floor(Math.min(completed,available,residual??space)+1e-8));
  if(!zone?.physicalModelEnabled){
    equipment.packageRemainder=Math.max(0,Math.min(1,service-count));
    return {count};
  }
  const headway=zone.productPitchMm/zone.conveyorSpeedMmPerSecond;
  const end=start+tick;
  const entries=[];
  let previousEntry=zone.lastPackageEntry??-Infinity;
  for(let index=0;index<count;index++){
    const completion=start+tick*Math.max(0,index+1-previous)/requested;
    const entry=Math.max(completion,previousEntry+headway);
    if(entry>end+1e-8)break;
    entries.push(Math.min(entry,end));
    previousEntry=entry;
  }
  equipment.packageRemainder=Math.max(0,Math.min(1,service-(count===completed?entries.length:completed)));
  return {count:entries.length,entries};
}

export function addDiscretePackets(zone,entries){
  for(const entry of entries){
    zone.lastPackageEntry=entry;
    const packet={x:zone.productLengthMm/2,
      units:1,initialUnits:1,entryDurationSeconds:0,arrivedFraction:0,
      backupAtVirtualSecond:zone.hasBackupSensor?entry+zone.backupSensorPositionMm/zone.conveyorSpeedMmPerSecond:null,
      primeAtVirtualSecond:zone.hasPrimeSensor?entry+zone.primeTravelSeconds:null,
      arrivesAtVirtualSecond:entry+zone.travelSeconds
    };
    zone.transit.push(packet);
    zone.discreteItems?.push(packet);
  }
}

// Shared by numerical transport and the live 2D view. Positions are package centers.
export function advancePackagePositions(items,length,productLength,packedPitch,speed,seconds){
  let limit=length-productLength/2;
  for(const item of items){
    item.x=Math.min(limit,item.x+speed*seconds);
    limit=item.x-packedPitch;
  }
}
