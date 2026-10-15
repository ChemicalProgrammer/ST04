// Calendar exclusions are mutually exclusive line stops; reporting adjustments
// stay outside the physical schedule. Event timing is independent of the RNG.
export const PLANT_STOP_FIELDS = ['changeoverMinutes','cleaningMinutes','autonomousMaintenanceMinutes','plannedMaintenanceMinutes','breakMinutes','trainingMinutes','experimentationMinutes'];
export function plantCalendarSchedule(calendar, tickSeconds=.25) {
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
