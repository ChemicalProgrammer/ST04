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
    const response=index===0&&options.firstResult?{ok:true,result:options.firstResult}:await runner({case:caseModel,run},{detail:index===0&&!summaryOnly,summaryOnly,onPartial:index===0&&!summaryOnly?options.onFirstProgress:undefined,cancelled:()=>failed||options.cancelled?.(),progress:f=>{
      fractions[index]=Math.max(fractions[index],f);
      options.progress?.(fractions.reduce((sum,value)=>sum+value,0)/count,options.runRound?fractions.filter(value=>value===1).length:index+1,count);
    }});
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
    if(!response.ok){failed=true;return response;}
    if(options.firstResult&&index===0){fractions[index]=1;options.progress?.(1/count,1,count);}
    const result=response.result;
    rows[index]={round:index+1,seed:run.seed,summary:result.summary,equipmentMetrics:result.equipmentMetrics,shifts:result.shifts,products:result.products,plantCalendar:result.plantCalendar};
    if(index===0){representative=result;options.onFirstRound?.(result);}
    else if(!summaryOnly)replays[index-1]={round:index+1,seed:run.seed,samples:result.samples,accumulationZoneMetrics:result.accumulationZoneMetrics,detailCoverage:result.detailCoverage};
    return response;
  }
  let validationFailure;
  let next=0;
  const concurrency=options.runRound?Math.max(1,Math.min(8,options.concurrency||2,count)):1;
  const jobs=Array.from({length:concurrency},async()=>{
    while(next<count&&!failed){const index=next++;try{const response=await calculate(index);if(!response.ok){validationFailure=response;break;}}catch(error){failed=true;throw error;}}
  });
  const settled=await Promise.allSettled(jobs);
  if(validationFailure)return validationFailure;
  const rejected=settled.find(item=>item.status==='rejected'&&item.reason.message==='SIMULATION_WORKER_UNAVAILABLE')||settled.find(item=>item.status==='rejected');if(rejected)throw rejected.reason;
  if(options.cancelled?.())throw new Error('BATCH_CANCELLED');
  const statistics={};
  for(const key of Object.keys(rows[0].summary)) {
    if(typeof rows[0].summary[key]==='number'&&rows.every(r=>Number.isFinite(r.summary[key])))statistics[key]=summarizeReplications(rows.map(r=>r.summary[key]));
  }
  statistics.throughputPerMinute=summarizeReplications(rows.map(r=>r.summary.outputCount/input.run.durationSeconds*60));
  const equipmentStatistics={};
  for(const [id,metrics] of Object.entries(rows[0].equipmentMetrics)) {
    equipmentStatistics[id]={};
    for(const key of Object.keys(metrics))if(typeof metrics[key]==='number')equipmentStatistics[id][key]=summarizeReplications(rows.map(r=>r.equipmentMetrics[id][key]));
  }
  const batch={schema:'st-replications-v1',rounds:count,baseSeed,representativeRound:closestRound(rows,statistics.outputCount?.mean,statistics.lineOeePercent?.mean),durationSeconds:input.run.durationSeconds,shiftSeconds:input.run.shiftSeconds||null,statistics,equipmentStatistics,rows,replays};
  if(!options.summaryOnly&&batch.representativeRound>1&&!replays[batch.representativeRound-2]){
    const row=rows[batch.representativeRound-1],runner=options.runRound||simulateLineAsync;
    options.onRepresentative?.(row.round);
    const response=await runner({case:input.case,run:{...input.run,seed:row.seed}},{detail:true,summaryOnly:false,cancelled:options.cancelled});
    if(options.cancelled?.())throw new Error('BATCH_CANCELLED');if(!response.ok)return response;
    batch.representativeReplay={...response.result,round:row.round};
  }
  return {ok:true,result:{...representative,batch}};
}


// Ties use OEE, then round number, so parallel completion order cannot affect selection.
export function closestRound(rows,productionMean,oeeMean){
  return rows.slice().sort((a,b)=>Math.abs(a.summary.outputCount-productionMean)-Math.abs(b.summary.outputCount-productionMean)||Math.abs(a.summary.lineOeePercent-oeeMean)-Math.abs(b.summary.lineOeePercent-oeeMean)||a.round-b.round)[0]?.round||1;
}
export function averageRoundValues(values){
  const sample=values.find(v=>v!==undefined&&v!==null);
  if(typeof sample==='number')return values.reduce((sum,v)=>sum+(Number.isFinite(v)?v:0),0)/values.length;
  if(!sample||typeof sample!=='object'||Array.isArray(sample))return sample;
  return Object.fromEntries([...new Set(values.flatMap(v=>Object.keys(v||{})))].map(key=>[key,averageRoundValues(values.map(v=>v?.[key]))]));
}
export function replicationView(result,selection='average'){
  const batch=result?.batch,rows=batch?.rows;if(!rows?.length)return result;
  if(selection!=='average'){
    const index=selection==='representative'?(batch.representativeRound||1)-1:Number(selection)-1,row=rows[index];if(!row)return result;
    let signature=result.inputSignature;try{const p=JSON.parse(signature);p.run.seed=row.seed;p.run.rounds=1;signature=JSON.stringify(p);}catch(_){}
    const replay=index===0?result:batch.replays?.[index-1]||(batch.representativeReplay?.round===row.round?batch.representativeReplay:null);
    return {...result,...row,batch:undefined,inputSignature:signature,products:row.products,plantCalendar:row.plantCalendar,samples:replay?.samples||[],accumulationZoneMetrics:replay?.accumulationZoneMetrics||{},resultView:{mode:'round',round:row.round}};
  }
  const view={...result,summary:averageRoundValues(rows.map(r=>r.summary)),equipmentMetrics:averageRoundValues(rows.map(r=>r.equipmentMetrics)),plantCalendar:averageRoundValues(rows.map(r=>r.plantCalendar)),resultView:{mode:'average',rounds:rows.length}};
  for(const key of ['lineRunSeconds','lineEffectiveRuntimeSeconds','lineRateLossSeconds']){
    const values=rows.map(r=>r.summary[key]);
    view.summary[key]=values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0)/values.length:null;
  }
  const productRows=rows.flatMap(r=>r.products?.rows||[]),key=r=>JSON.stringify([r.formatId||r.productId,r.outputUnit]);
  if(productRows.length&&rows.every(r=>r.products)){
    const keys=[...new Set(productRows.map(key))];view.products={...result.products,timeline:undefined,rows:keys.map(k=>({...averageRoundValues(rows.map(r=>r.products.rows.find(p=>key(p)===k))),bottlesPerCase:productRows.find(r=>key(r)===k).bottlesPerCase})),clearoutBottleEquivalents:averageRoundValues(rows.map(r=>r.products.clearoutBottleEquivalents))};
  }else if(result.products)view.products=undefined;
  return view;
}
