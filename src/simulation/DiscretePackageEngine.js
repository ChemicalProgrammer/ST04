// Compute individual completion times inside a tick. The caller owns line
// topology, machine availability, sensors and material accounting.
export function planDiscretePackages(equipment, zone, start, tick, requested, available, space, residual) {
  const canProcess=available>=1&&(space>=1||residual!==undefined);
  const previous=canProcess?(equipment.packageRemainder||0):0;
  const service=canProcess?previous+requested:0;
  const completed=Math.floor(service+1e-8);
  const count=Math.max(0,Math.floor(Math.min(completed,available,residual??space)+1e-8));
  if(!zone?.physicalModelEnabled){
    equipment.packageRemainder=Math.max(0,service-completed);
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
    zone.transit.push({
      units:1,initialUnits:1,entryDurationSeconds:0,arrivedFraction:0,
      backupAtVirtualSecond:zone.hasBackupSensor?entry+zone.backupSensorPositionMm/zone.conveyorSpeedMmPerSecond:null,
      primeAtVirtualSecond:zone.hasPrimeSensor?entry+zone.primeTravelSeconds:null,
      arrivesAtVirtualSecond:entry+zone.travelSeconds
    });
  }
}
