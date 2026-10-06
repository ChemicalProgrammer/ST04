import { simulateLineAsync } from './LineSimulationEngine.js';

export function summarizeReplications(values) {
  const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n;
  const standardDeviation=n>1?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1)):null;
  return {n,mean,standardDeviation,min:Math.min(...values),max:Math.max(...values)};
}
export async function simulateBatch(input, options={}) {
  const count=input.run.rounds||1;
  if(!Number.isInteger(count)||count<1||count>100)throw new Error('INVALID_BATCH_ROUNDS');
  if(options.firstResult&&(options.firstResult.seed!==(input.run.seed>>>0)||options.firstResult.durationSeconds!==input.run.durationSeconds))throw new Error('BATCH_FIRST_RESULT_MISMATCH');
  const baseSeed=input.run.seed>>>0,rows=new Array(count),replays=[];let representative,failed=false;
  const fractions=new Array(count).fill(0);
  async function calculate(index){
    if(failed||options.cancelled?.())throw new Error('BATCH_CANCELLED');
    const run={...input.run,seed:(baseSeed+index)>>>0};
    const summaryOnly=options.summaryOnly===true||(index>0&&options.laterSummaryOnly===true);
    if(index>0&&!summaryOnly)run.sampleEverySeconds=Math.max(run.sampleEverySeconds||run.tickSeconds,Math.ceil(run.durationSeconds/120/run.tickSeconds)*run.tickSeconds);
    const runner=options.runRound&&(index>0||summaryOnly||options.workerFirstRound)?options.runRound:simulateLineAsync;
    const caseModel=runner===options.runRound?{id:input.case.id,unitOfFlow:input.case.unitOfFlow,equipment:input.case.equipment}:input.case;
    const response=index===0&&options.firstResult?{ok:true,result:options.firstResult}:await runner({case:caseModel,run},{detail:index===0&&!summaryOnly,summaryOnly,cancelled:()=>failed||options.cancelled?.(),progress:f=>{
      fractions[index]=Math.max(fractions[index],f);
      options.progress?.(fractions.reduce((sum,value)=>sum+value,0)/count,options.runRound?fractions.filter(value=>value===1).length:index+1,count);
    }});
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
    if(!response.ok){failed=true;return response;}
    const result=response.result;
    rows[index]={round:index+1,seed:run.seed,summary:result.summary,equipmentMetrics:result.equipmentMetrics,shifts:result.shifts};
    if(index===0){representative=result;options.onFirstRound?.(result);}
    else if(!summaryOnly)replays[index-1]={round:index+1,seed:run.seed,samples:result.samples,accumulationZoneMetrics:result.accumulationZoneMetrics,detailCoverage:result.detailCoverage};
    return response;
  }
  let validationFailure;
  const firstJob=calculate(0).then(response=>{if(!response.ok)validationFailure=response;}).catch(error=>{failed=true;throw error;});
  let next=1;
  const concurrency=options.runRound?Math.max(1,Math.min(4,options.concurrency||2,count-1)):1;
  const jobs=Array.from({length:concurrency},async()=>{
    while(next<count&&!failed){const index=next++;try{const response=await calculate(index);if(!response.ok){validationFailure=response;break;}}catch(error){failed=true;throw error;}}
  });
  const settled=await Promise.allSettled([firstJob,...jobs]);
  if(validationFailure)return validationFailure;
  const rejected=settled.find(item=>item.status==='rejected'&&item.reason.message==='SIMULATION_WORKER_UNAVAILABLE')||settled.find(item=>item.status==='rejected');if(rejected)throw rejected.reason;
  if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
  const statistics={};
  for(const key of Object.keys(rows[0].summary)) {
    if(typeof rows[0].summary[key]==='number')statistics[key]=summarizeReplications(rows.map(r=>r.summary[key]));
  }
  statistics.throughputPerMinute=summarizeReplications(rows.map(r=>r.summary.outputCount/input.run.durationSeconds*60));
  const equipmentStatistics={};
  for(const [id,metrics] of Object.entries(rows[0].equipmentMetrics)) {
    equipmentStatistics[id]={};
    for(const key of Object.keys(metrics))if(typeof metrics[key]==='number')equipmentStatistics[id][key]=summarizeReplications(rows.map(r=>r.equipmentMetrics[id][key]));
  }
  const batch={schema:'st-replications-v1',rounds:count,baseSeed,representativeRound:1,durationSeconds:input.run.durationSeconds,shiftSeconds:input.run.shiftSeconds||null,statistics,equipmentStatistics,rows,replays};
  return {ok:true,result:{...representative,batch}};
}
