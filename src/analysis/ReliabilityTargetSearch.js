// Exploratory inverse design: target values are model hypotheses, not evidence
// that a maintenance action or replacement can achieve them.
export async function searchReliabilityTargets(simulation,{measure,run,cancelled=()=>false,progress=()=>{},maximumMachines=12,maximumTargets=3,recoveryFraction=.9}={}){
  if(simulation.dynamicConfig?.reliabilityEnabled===false)return {status:'FAILURES_DISABLED',analysisOnly:true,candidateSets:[]};
  const copy=value=>JSON.parse(JSON.stringify(value));
  simulation=copy({id:simulation.id,unitOfFlow:simulation.unitOfFlow,equipment:simulation.equipment,dynamicConfig:simulation.dynamicConfig,results:simulation.results?{summary:simulation.results.summary,durationSeconds:simulation.results.durationSeconds}:undefined});
  const machines=(simulation.equipment||[]).filter(e=>e.type!=='CONVEYOR'&&e.noiseProfile?.reliability?.mtbfMinutes>0&&e.noiseProfile?.reliability?.mttrMinutes>0).slice().sort((a,b)=>a.id<b.id?-1:1);
  if(!machines.length)return {status:'NO_ELIGIBLE_RELIABILITY',analysisOnly:true,candidateSets:[],selectedChanges:[],coverage:{screened:0,total:0},calculations:0};
  const selected=machines.slice(0,maximumMachines),observations=[],targetTests=[],candidateSets=[];
  let calculations=0;async function evaluate(model,changes,label,measurementRun=run){if(cancelled())throw Error('BATCH_CANCELLED');progress({label,calculations});const value=await measure(model,changes,measurementRun);if(cancelled())throw Error('BATCH_CANCELLED');calculations++;if(!Number.isFinite(value?.throughput)||!Number.isFinite(value?.oee))throw Error('INVALID_RELIABILITY_METRICS');return value;}
  const baseline=await evaluate(simulation,[],'Reliability baseline'),without=copy(simulation);without.dynamicConfig={...without.dynamicConfig,reliabilityEnabled:false};
  const failureFree=await evaluate(without,[],'All MTBF / MTTR failures disabled',{...run,reliabilityEnabled:false});
  for(const equipment of selected){const model=copy(simulation);delete model.equipment.find(e=>e.id===equipment.id).noiseProfile.reliability;
    const candidate=await evaluate(model,[],'Disable failures: '+equipment.name);
    observations.push({equipmentId:equipment.id,name:equipment.name,candidate,deltaThroughput:candidate.throughput-baseline.throughput,deltaOeePp:candidate.oee-baseline.oee});
  }
  const threshold=Math.max(.001,Math.abs(baseline.throughput)*.001),ranking=observations.slice().sort((a,b)=>b.deltaThroughput-a.deltaThroughput||(a.equipmentId<b.equipmentId?-1:1));
  let relevant=ranking.filter(o=>o.deltaThroughput>threshold&&o.candidate.oee>=baseline.oee-1e-9).slice(0,maximumTargets);
  if(!relevant.length&&failureFree.throughput>baseline.throughput+threshold)relevant=ranking.slice(0,maximumTargets);
  // Four bounded grades per mechanism; no zero repair time or infinite MTBF.
  const grades=[{mtbf:1.25,mttr:.8},{mtbf:1.5,mttr:2/3},{mtbf:2,mttr:.5},{mtbf:4,mttr:.25}];
  const choices=[];
  for(const row of relevant){const equipment=machines.find(e=>e.id===row.equipmentId),r=equipment.noiseProfile.reliability,tests=[];
    for(const mechanism of ['MTBF','MTTR','JOINT'])for(const grade of grades){
      const values={mtbfMinutes:Math.min(1000000,r.mtbfMinutes*grade.mtbf),mttrMinutes:Math.max(.001,r.mttrMinutes*grade.mttr)};
      const fields=mechanism==='MTBF'?['mtbfMinutes']:mechanism==='MTTR'?['mttrMinutes']:['mtbfMinutes','mttrMinutes'];
      const changes=fields.map(field=>({equipmentId:equipment.id,path:'noiseProfile.reliability.'+field,before:r[field],after:values[field],unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Automatically explored model target; achievable intervention and CAPEX classification have not been established.'})).filter(c=>c.before!==c.after);
      if(!changes.length)continue;
      const candidate=await evaluate(simulation,changes,equipment.name+' · '+mechanism+' · '+grade.mtbf+' / '+grade.mttr);
      const item={equipmentId:equipment.id,name:equipment.name,mechanism,grade,changes,candidate,deltaThroughput:candidate.throughput-baseline.throughput,deltaOeePp:candidate.oee-baseline.oee,effort:changes.reduce((sum,c)=>sum+Math.abs(Math.log(c.after/c.before)),0)};
      targetTests.push(item);if(item.deltaThroughput>threshold&&candidate.oee>=baseline.oee-1e-9)tests.push(item);
    }
    const safe=tests.filter(t=>!(t.candidate.warnings||[]).length),pool=safe.length?safe:tests;
    const maximum=pool.length?Math.max(...pool.map(t=>t.deltaThroughput)):0;
    const choice=pool.filter(t=>t.deltaThroughput>=maximum*recoveryFraction).sort((a,b)=>a.effort-b.effort||a.changes.length-b.changes.length||b.deltaThroughput-a.deltaThroughput)[0];
    if(choice){choices.push(choice);candidateSets.push({kind:'ISOLATED_TARGET',changes:choice.changes,candidate:choice.candidate});}
  }
  // Explicit joint packages survive screening even when isolated attribution is
  // non-additive. Later ordinary search/DOE refine flow around these targets.
  for(let count=2;count<=choices.length;count++){const changes=choices.slice(0,count).flatMap(c=>c.changes),candidate=await evaluate(simulation,changes,'Joint reliability targets · '+count+' machines');candidateSets.push({kind:'JOINT_TARGETS',changes,candidate});}
  if(relevant.length>1)for(const grade of [grades[2],grades[3]]){
    const changes=relevant.flatMap(row=>{const r=machines.find(e=>e.id===row.equipmentId).noiseProfile.reliability;return ['mtbfMinutes','mttrMinutes'].map(field=>({equipmentId:row.equipmentId,path:'noiseProfile.reliability.'+field,before:r[field],after:field==='mtbfMinutes'?Math.min(1000000,r[field]*grade.mtbf):Math.max(.001,r[field]*grade.mttr),unit:'min',external:true,analysisOnly:true,interventionType:'SENSITIVITY',justification:'Joint exploratory model target; attainable intervention and investment classification remain unknown.'}));});
    const candidate=await evaluate(simulation,changes,'Joint mechanism exploration · '+relevant.length+' machines · grade '+grade.mtbf);
    candidateSets.push({kind:'JOINT_MECHANISM_TARGETS',changes,candidate});
  }
  const admissible=candidateSets.filter(c=>c.candidate.throughput>baseline.throughput+threshold&&c.candidate.oee>=baseline.oee-1e-9).sort((a,b)=>Number(!!a.candidate.warnings?.length)-Number(!!b.candidate.warnings?.length)||b.candidate.throughput-a.candidate.throughput);
  return {status:admissible.length?(admissible[0].candidate.warnings?.length?'TARGETS_REQUIRE_ENGINEERING_REVIEW':'EXPLORATORY_TARGETS_FOUND'):'NO_TARGET_GAIN',analysisOnly:true,classification:'UNASSIGNED',run,baseline,failureFree,conditionalReliabilityGain:{throughput:failureFree.throughput-baseline.throughput,oeePp:failureFree.oee-baseline.oee},coverage:{screened:selected.length,total:machines.length},ranking,targetTests,candidateSets,selectedChanges:admissible[0]?.changes||[],recoveryFraction,calculations,interpretation:'Conditional failure-removal gains overlap and are not additive causal OEE shares. Bounded model targets use the least parameter change recovering 90% of the best isolated tested gain, then test joint packages. Screening is preliminary; full-horizon independent confirmation is required. Intervention feasibility, cost and CAPEX classification remain unassigned.'};
}
