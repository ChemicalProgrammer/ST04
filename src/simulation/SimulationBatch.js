import { simulateLineAsync } from './LineSimulationEngine.js';

export function summarizeReplications(values) {
  const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n;
  const standardDeviation=n>1?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1)):null;
  return {n,mean,standardDeviation,min:Math.min(...values),max:Math.max(...values)};
}
export async function simulateBatch(input, options={}) {
  const count=input.run.rounds||1;
  if(!Number.isInteger(count)||count<1||count>50)throw new Error('INVALID_BATCH_ROUNDS');
  const baseSeed=input.run.seed>>>0,rows=[];let representative;
  for(let index=0;index<count;index++) {
    const run={...input.run,seed:(baseSeed+index)>>>0};
    run.sampleEverySeconds=index===0?Math.max(run.sampleEverySeconds||run.tickSeconds,Math.ceil(run.durationSeconds/120/run.tickSeconds)*run.tickSeconds):run.durationSeconds;
    const response=await simulateLineAsync({case:input.case,run},{detail:index===0,cancelled:options.cancelled,progress:f=>options.progress?.((index+f)/count,index+1,count)});
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
    if(!response.ok)return response;
    const result=response.result;
    rows.push({round:index+1,seed:run.seed,summary:result.summary,equipmentMetrics:result.equipmentMetrics,shifts:result.shifts});
    if(index===0)representative=result;
  }
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
  representative.batch={schema:'st-replications-v1',rounds:count,baseSeed,representativeRound:1,durationSeconds:input.run.durationSeconds,shiftSeconds:input.run.shiftSeconds||null,statistics,equipmentStatistics,rows};
  return {ok:true,result:representative};
}
