import { resolveAccumulationZoneDefinition, isConveyorEquipment } from './FormatGeometryAdapter.js';
import { validateSimulationInput } from './SimulationValidation.js';

export const CURRENT_ENGINE_ID = 'ST_CURRENT';
export const SIMPY_ENGINE_ID = 'DES_SIMPY_EXPERIMENTAL';
export const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';

// This adapter deliberately records the physical model changes. A library switch
// cannot make discrete products equivalent to ST's spatial fluid conveyors.
export function adaptSimPyInput(input) {
  const validation = validateSimulationInput(input);
  if (!validation.ok) throw Object.assign(new Error((validation.error?.message || 'Invalid simulation input')+' '+(validation.error?.details||[]).map(d=>d.path+': '+(d.reason||d.message||'invalid value')).join('; ')), {code:'INVALID_DES_INPUT',details:validation.error?.details});
  const equipment=input.case.equipment, machines=[], conveyors=[], ignored=[];
  const shift=input.run.shiftSeconds;
  if(shift!==undefined&&(!Number.isFinite(shift)||shift<=0||Math.ceil(input.run.durationSeconds/shift)>1000))throw new Error('SimPy supports at most 1,000 finite positive shifts.');
  if(equipment.length<3 || equipment.length%2!==1 || equipment.some((e,i)=>isConveyorEquipment(e)!==(i%2===1)))
    throw new Error('SimPy supports alternating machine–conveyor serial lines with at least two machines.');
  for(let i=0;i<equipment.length;i++) {
    const model=equipment[i];
    if(isConveyorEquipment(model)) {
      if(Object.keys(model.noiseProfile||{}).some(key=>!['reliability','microStop'].includes(key)))throw new Error('Unsupported conveyor noise profile: '+model.name);
      const {definition:d}=resolveAccumulationZoneDefinition(equipment,i);
      if(!d)throw new Error('Unresolved conveyor geometry: '+model.name);
      conveyors.push({id:model.id,name:model.name,lengthMm:d.usableLengthMm,speedMmPerSecond:d.conveyorSpeedMmPerSecond,
        movingPitchMm:d.productPitchMm??d.productLengthMm+d.gapMm,accumulatedPitchMm:d.accumulatedPitchMm??d.productLengthMm??d.productPitchMm,productLengthMm:d.productLengthMm??d.accumulatedPitchMm??d.productPitchMm,initialMode:model.initialMode??'AUTO',
        ...(d.primeSensorPositionMm!=null?{primeSensorPositionMm:d.primeSensorPositionMm}:{}),...(d.backupSensorPositionMm!=null?{backupSensorPositionMm:d.backupSensorPositionMm}:{}),
        ...(d.backupRestartPositionMm!=null?{backupRestartPositionMm:d.backupRestartPositionMm}:{}),...(d.upstreamRestartDelaySeconds!=null?{upstreamRestartDelaySeconds:d.upstreamRestartDelaySeconds}:{}),...(d.downstreamRampUpSeconds!=null?{downstreamRampUpSeconds:d.downstreamRampUpSeconds}:{}),
        blockedTimeDelaySeconds:d.blockedTimeDelaySeconds??0,clearTimeDelaySeconds:d.clearTimeDelaySeconds??0,upstreamStopResponseSeconds:d.upstreamStopResponseSeconds??0,
        bottlesDischargedAtStop:d.bottlesDischargedAtStop??0,...(model.noiseProfile?.reliability?{reliability:model.noiseProfile.reliability}:{}),...(model.noiseProfile?.microStop?{microStop:model.noiseProfile.microStop}:{})});
    } else {
      if(Object.keys(model.noiseProfile||{}).some(key=>!['reliability','microStop'].includes(key)))throw new Error('SimPy does not support this machine noise profile: '+model.name);
      machines.push({id:model.id,name:model.name,rateBpm:model.nominalRatePerSecond*60,initialMode:model.initialMode??'AUTO',
        critical:Boolean(model.characteristics?.isPacemaker||model.processData?.role==='PACEMAKER'||model.type==='PACEMAKER'),
        startupSeconds:model.startupDelaySeconds??model.processData?.upstream?.startupTimeSeconds??0,
        rampUpSeconds:model.restartRampUpSeconds??model.processData?.downstream?.rampUpTimeSeconds??0,
        ...(model.noiseProfile?.microStop?{microStop:model.noiseProfile.microStop}:{}),
        ...(model.noiseProfile?.reliability?{reliability:model.noiseProfile.reliability}:{})});
    }
  }
  const ids=new Set(equipment.map(m=>m.id));
  const commands=(input.run.commands||[]).map(c=>{
    if(!ids.has(c.equipmentId))throw new Error('Unknown equipment control: '+c.equipmentId);
    return {atSecond:c.atVirtualSecond,equipmentId:c.equipmentId,action:c.action};
  });
  return {schema:'st-des/1',caseId:input.case.id,unitOfFlow:input.case.unitOfFlow||'units',machines,conveyors,
    run:{durationSeconds:input.run.durationSeconds,seed:input.run.seed,
      sampleEverySeconds:Math.max(input.run.sampleEverySeconds||5,input.run.durationSeconds/(9998-(shift?Math.ceil(input.run.durationSeconds/shift):0))),
      ...(input.run.shiftSeconds?{shiftSeconds:input.run.shiftSeconds}:{}),commands},
    metadata:{adaptedFrom:'ST',allowSimplifications:true,conveyorModel:'SPATIAL_FINITE_PRODUCTS',ignoredFeatures:ignored,stochasticSchedulesPaired:false,
      scope:'Experimental spatial product model: sensors, packed queues, belt downtime, ramps and residual discharge; no validated OEE, batches or rejects.'}};
}

export function normalizeSimPyResult(raw, input, payload) {
  const duration=input.run.durationSeconds, machineById=new Map(raw.equipment.map(m=>[m.id,m])), zoneById=new Map(raw.zones.map(z=>[z.id,z]));
  const beltById=new Map(payload.conveyors.map(b=>[b.id,b]));
  function machineMetrics(m) {
    return {...m,pausedSeconds:m.stateSeconds.PAUSED,stoppedSeconds:m.stateSeconds.STOPPED,
      microStopSeconds:m.microStopSeconds,startupSeconds:m.startupSeconds,processingCapacityPercent:m.productiveCapacityPercent,productiveEquivalentSeconds:m.outputCount/(input.case.equipment.find(e=>e.id===m.id).nominalRatePerSecond),
      // Unvalidated fields stay unavailable; never manufacture OEE or sensor losses.
      oeePercent:null,waitingForPrimeSeconds:m.waitingForPrimeSeconds??null,backupStopSeconds:m.backupStopSeconds??null,emergencyStopSeconds:null,
      partialStarvationLossSeconds:null,partialBlockingLossSeconds:null};
  }
  const equipmentMetrics=Object.fromEntries(input.case.equipment.map(e=>[e.id,machineById.has(e.id)?machineMetrics(machineById.get(e.id)):
    {outputCount:raw.samples.at(-1).zones.find(z=>z.id===e.id).releasedUnits,oeePercent:null,stateSeconds:zoneById.get(e.id).stateSeconds||{},failureSeconds:zoneById.get(e.id).stateSeconds?.FAILED??0,microStopSeconds:zoneById.get(e.id).stateSeconds?.MICRO_STOP??0,processingCapacityPercent:null}]));
  function zoneFrame(z) {
    const totals=zoneById.get(z.id),belt=beltById.get(z.id),index=payload.conveyors.findIndex(b=>b.id===z.id);
    return {id:z.id,name:belt.name,ownerEquipmentId:z.id,upstreamControlEquipmentId:payload.machines[index].id,
      downstreamControlEquipmentId:payload.machines[index+1].id,physicalModelEnabled:true,modelOrigin:'DES_SIMPY_SPATIAL',
      inventoryUnits:z.inventoryUnits,waitingUnits:z.readyUnits,inTransitUnits:z.movingUnits,capacityUnits:totals.capacityUnits,
      fillPercent:z.inventoryUnits/totals.capacityUnits*100,prime:z.prime||{configured:false},backup:z.backup||{configured:false},positionsMm:z.positionsMm,queueTailPositionMm:z.queueTailPositionMm,overflowUnits:z.overflowUnits??0,
      state:z.state||'RUNNING',formatAssumptions:['DES spatial products: leading-edge positions, packed collisions and sustained photoeye debounce.'],
      geometry:{usableLengthMm:belt.lengthMm,productPitchMm:belt.movingPitchMm,accumulatedPitchMm:belt.accumulatedPitchMm,
        conveyorSpeedMmPerSecond:belt.speedMmPerSecond,travelSeconds:totals.travelSeconds,capacityFormula:'floor(length / packed pitch)'}};
  }
  const samples=raw.samples.map((frame,index)=>{
    const previous=raw.samples[index-1],dt=previous?frame.virtualSecond-previous.virtualSecond:0;
    return {virtualSecond:frame.virtualSecond,outputCount:frame.outputCount,buffers:frame.zones.map(z=>z.inventoryUnits),
      accumulationZones:frame.zones.map(zoneFrame),equipment:input.case.equipment.map(e=>{
        const m=frame.equipment.find(m=>m.id===e.id),prior=previous?.equipment.find(m=>m.id===e.id),z=frame.zones.find(z=>z.id===e.id),priorZone=previous?.zones.find(z=>z.id===e.id);
        const output=m?m.outputCount:z.releasedUnits,priorOutput=m?prior?.outputCount:priorZone?.releasedUnits;
        return {id:e.id,mode:m?.mode||e.initialMode,availabilityState:m?.state||z?.state||'RUNNING',outputCount:output,processedUnits:output,
          actualRatePerSecond:dt>0?(output-priorOutput)/dt:0,oeePercent:null,
          microStopSeconds:m?.stateSeconds.MICRO_STOP??z?.stateSeconds?.MICRO_STOP??null,startupSeconds:m?.stateSeconds.STARTING??null,starvedSeconds:m?.stateSeconds.STARVED??null,blockedSeconds:m?.stateSeconds.BLOCKED??null,failureSeconds:m?.stateSeconds.FAILED??z?.stateSeconds?.FAILED??null,
          waitingForPrimeSeconds:m?.stateSeconds.WAITING_PRIME??null,backupStopSeconds:m?.stateSeconds.BACKUP_STOP??null,emergencyStopSeconds:null,partialStarvationLossSeconds:null,partialBlockingLossSeconds:null};
      })};
  });
  const total=field=>raw.equipment.reduce((sum,m)=>sum+(m[field]??0),0);
  const beltLoss=state=>raw.zones.reduce((sum,z)=>sum+(z.stateSeconds?.[state]??0),0);
  const summary={...raw.summary,averageOutputRatePerSecond:raw.summary.outputCount/duration,
    totalMicroStopSeconds:total('microStopSeconds')+beltLoss('MICRO_STOP'),totalStartupSeconds:total('startupSeconds'),totalBlockedSeconds:total('blockedSeconds'),totalStarvedSeconds:total('starvedSeconds'),totalFailureSeconds:total('failureSeconds')+beltLoss('FAILED'),
    totalOverflowUnits:raw.summary.overflowUnits??0,totalEmergencyStopSeconds:null,totalBackupStopSeconds:total('backupStopSeconds'),totalWaitingForPrimeSeconds:total('waitingForPrimeSeconds'),
    totalPartialStarvationLossSeconds:null,totalPartialBlockingLossSeconds:null,
    lineOeePacemakerEquipmentId:null,lineOeePacemakerRatePerSecond:null,lineOeeReference:'NOT_VALIDATED_DES',qualityAssumption:'NO_REJECT_MODEL_ASSUMES_100_PERCENT'};
  const shifts=[];let previousFrame=raw.samples[0];const shiftSeconds=input.run.shiftSeconds||duration;
  for(let end=Math.min(shiftSeconds,duration);;end=Math.min(end+shiftSeconds,duration)) {
    const frame=raw.samples.find(f=>Math.abs(f.virtualSecond-end)<1e-7);
    if(!frame)throw new Error('Missing exact DES shift boundary');
    const elapsed=end-previousFrame.virtualSecond,output=frame.outputCount-previousFrame.outputCount;
    const loss=state=>frame.equipment.reduce((sum,m,i)=>sum+m.stateSeconds[state]-previousFrame.equipment[i].stateSeconds[state],0);
    shifts.push({shift:shifts.length+1,durationSeconds:elapsed,outputCount:output,throughputPerMinute:output/elapsed*60,
      lineOeePercent:null,starvedSeconds:loss('STARVED'),blockedSeconds:loss('BLOCKED'),failureSeconds:loss('FAILED')});
    previousFrame=frame;if(end===duration)break;
  }
  return {caseId:input.case.id,unitOfFlow:payload.unitOfFlow,engineId:SIMPY_ENGINE_ID,engineVersion:raw.engine.version,
    engine:{...raw.engine,runtime:'Pyodide 0.27.7 / browser Web Worker'},seed:input.run.seed,durationSeconds:duration,
    summary,equipmentMetrics,accumulationZoneMetrics:Object.fromEntries(raw.zones.map(z=>[z.id,{...z,modelOrigin:'DES_SIMPY_SPATIAL'}])),
    shifts,samples,events:raw.events.map(e=>({...e,atVirtualSecond:e.atSecond??e.atVirtualSecond})),
    detailCoverage:raw.detailCoverage,diagnostics:raw.diagnostics,limitations:raw.limitations};
}

// A module worker owns Python and SimPy. Cancelling terminates it immediately,
// including synchronous Python execution, without SharedArrayBuffer/COOP/COEP.
export function simPyWorkerMain() {
  let pyodide;
  self.onmessage=async event=>{
    const task=event.data;
    try {
      if(!pyodide) {
        self.postMessage({type:'loading',id:task.id});
        const {loadPyodide}=await import(task.indexURL+'pyodide.mjs');
        pyodide=await loadPyodide({indexURL:task.indexURL});
        for(const [name,source] of Object.entries(task.files)) {
          const destination='/home/pyodide/'+name;
          pyodide.FS.mkdirTree(destination.slice(0,destination.lastIndexOf('/')));
          pyodide.FS.writeFile(destination,source,{encoding:'utf8'});
        }
        pyodide.runPython('import sys\nsys.path.insert(0, "/home/pyodide")\nimport simpy\nassert simpy.__version__ == "4.1.2"\nfrom st_simpy_engine import simulate_line');
      }
      self.postMessage({type:'ready',id:task.id});
      pyodide.globals.set('_st_input',JSON.stringify(task.payload));
      pyodide.globals.set('_st_progress',value=>self.postMessage({type:'progress',id:task.id,value}));
      try {
        const json=pyodide.runPython('import json\njson.dumps(simulate_line(json.loads(_st_input), progress=_st_progress), allow_nan=False)');
        self.postMessage({type:'result',id:task.id,response:JSON.parse(json)});
      } finally {pyodide.globals.delete('_st_input');pyodide.globals.delete('_st_progress');}
    } catch(error) {self.postMessage({type:'error',id:task.id,message:error.message});}
  };
}

export function createSimPyBrowserEngine(host, files) {
  let worker=null,url=null,nextId=0,serial=Promise.resolve(),abortActive=null;
  function dispose() {worker?.terminate();worker=null;if(url)host.URL.revokeObjectURL(url);url=null;}
  function calculate(input,options) {
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
    const payload=adaptSimPyInput(input);
    if(!host.Worker||!host.Blob||!host.URL?.createObjectURL)throw new Error('SimPy requires browser Web Workers. Choose the current engine in Settings.');
    if(!worker) {
      url=host.URL.createObjectURL(new host.Blob(['('+simPyWorkerMain.toString()+')();'],{type:'text/javascript'}));
      try {worker=new host.Worker(url,{type:'module'});}catch(error){dispose();throw error;}
    }
    return new Promise((resolve,reject)=>{
      const id=++nextId,activeWorker=worker;
      let completed=false,lastProgress=0;
      const timer=host.setTimeout(()=>finish(new Error('SimPy timed out. Check access to cdn.jsdelivr.net or shorten the run.')),300000);
      const monitor=host.setInterval(()=>{if(options.cancelled?.())finish(new Error('BATCH_CANCELLED'));},50);
      function finish(error,response) {
        if(completed)return;completed=true;host.clearTimeout(timer);host.clearInterval(monitor);abortActive=null;
        activeWorker.onmessage=null;activeWorker.onerror=null;activeWorker.onmessageerror=null;
        if(error){dispose();reject(error);return;}
        if(options.cancelled?.()){dispose();reject(new Error('BATCH_CANCELLED'));return;}
        try {
          if(response.ok) {
            const result=normalizeSimPyResult(response.result,input,payload);
            if(options.summaryOnly){result.samples=[];result.events=[];}
            resolve({ok:true,result});
          }else resolve(response);
        }catch(error){reject(error);}
      }
      abortActive=()=>finish(new Error('BATCH_CANCELLED'));
      activeWorker.onerror=event=>{event.preventDefault?.();finish(new Error('SimPy could not load Python in this browser. Check HTTPS access to cdn.jsdelivr.net. '+(event.message||'')));};
      activeWorker.onmessageerror=()=>finish(new Error('Invalid SimPy worker response'));
      activeWorker.onmessage=event=>{
        const message=event.data;if(message.id!==id||completed)return;
        if(message.type==='progress'){lastProgress=Math.max(lastProgress,Math.min(1,message.value));options.progress?.(lastProgress);}
        if(message.type==='loading')host.dispatchEvent?.(new host.CustomEvent('st-simpy-status',{detail:{message:'Loading Python runtime…'}}));
        if(message.type==='ready')host.dispatchEvent?.(new host.CustomEvent('st-simpy-status',{detail:{message:'Calculating with SimPy 4.1.2…'}}));
        if(message.type==='result')finish(null,message.response);
        if(message.type==='error')finish(new Error(message.message));
      };
      activeWorker.postMessage({id,payload,files,indexURL:PYODIDE_INDEX_URL});
    });
  }
  host.addEventListener?.('pagehide',()=>{abortActive?.();dispose();});
  return {run(input,options={}) {
    const job=serial.then(()=>calculate(input,options));serial=job.catch(()=>{});return job;
  },close(){abortActive?.();dispose();}};
}
