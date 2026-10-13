// Two-level pilot: at most four factors, with explicit feasible bounds.
export function createScenarioDOE(factors) {
  if(!Array.isArray(factors)||factors.length<1||factors.length>4)throw Error('DOE_SELECT_ONE_TO_FOUR_FACTORS');
  const seen=new Set();
  for(const f of factors){
    const key=f.equipmentId+':'+f.path;
    if(seen.has(key)||!Number.isFinite(f.low)||!Number.isFinite(f.high)||f.low>=f.high||!Number.isFinite(f.before))throw Error('DOE_INVALID_FACTOR');
    if(f.path.startsWith('noiseProfile.reliability.')){
      if(f.external!==true||!(f.before>0))throw Error('DOE_EXTERNAL_EVIDENCE_REQUIRED');
      if(f.path.endsWith('mtbfMinutes')?f.low<f.before:f.high>f.before)throw Error('DOE_RELIABILITY_DIRECTION');
    }else if(f.external)throw Error('DOE_INVALID_FACTOR');
    seen.add(key);
  }
  return {type:'FULL_FACTORIAL_TWO_LEVEL',factors:JSON.parse(JSON.stringify(factors)),designPoints:Array.from({length:2**factors.length},(_,index)=>{
    const levels=factors.map((_,i)=>(index>>i)&1?1:-1);
    return {index,levels,changes:factors.map((f,i)=>({equipmentId:f.equipmentId,path:f.path,before:f.before,after:levels[i]===1?f.high:f.low,unit:f.unit,...(f.external?{external:true,justification:f.justification,interventionType:f.interventionType,originTier:f.originTier}:{})})).filter(c=>c.before!==c.after)};
  })};
}
export function analyzeScenarioDOE(design,observations) {
  const expected=design.designPoints.length;
  if(observations.length!==expected||new Set(observations.map(o=>o.index)).size!==expected||design.designPoints.some(p=>!observations.some(o=>o.index===p.index))||observations.some(o=>!Number.isFinite(o.oee)||!Number.isFinite(o.throughput)))return {complete:false,effects:[],reason:'INCOMPLETE_OR_INFEASIBLE_DESIGN'};
  const terms=design.factors.map((_,i)=>[i]);
  for(let i=0;i<design.factors.length;i++)for(let j=i+1;j<design.factors.length;j++)terms.push([i,j]);
  return {complete:true,interpretation:'Descriptive high-minus-low contrasts of replicated means; not significance tests or a global optimum.',effects:terms.map(indices=>{
    const effect={factors:indices,type:indices.length===1?'MAIN':'TWO_FACTOR_INTERACTION'};
    for(const metric of ['oee','throughput'])effect[metric]=observations.reduce((sum,o)=>sum+o[metric]*indices.reduce((sign,i)=>sign*design.designPoints[o.index].levels[i],1),0)/(expected/2);
    return effect;
  })};
}

// Randomized complete blocks: each seed is shared by all factorial treatments.
// Fit all treatment means and seed blocks so omitted higher interactions do not inflate error.
export function analyzeScenarioANOVA(design,observations) {
  if(!analyzeScenarioDOE(design,observations).complete)return {complete:false,reason:'INCOMPLETE_OR_INFEASIBLE_DESIGN'};
  const ordered=design.designPoints.map(point=>observations.find(row=>row.index===point.index));
  const n=ordered.length,r=ordered[0].roundMetrics?.length;
  if(!(r>=3)||ordered.some(row=>row.roundMetrics?.length!==r||row.roundMetrics.some((value,j)=>value.seed!==ordered[0].roundMetrics[j].seed||!Number.isFinite(value.oee)||!Number.isFinite(value.throughput)))||new Set(ordered[0].roundMetrics.map(row=>row.seed)).size!==r)return {complete:false,reason:'MATCHED_REPLICATIONS_REQUIRED'};
  const terms=[];
  for(let mask=1;mask<n;mask++)terms.push(design.factors.map((_,i)=>i).filter(i=>mask&(1<<i)));
  const metrics={};
  for(const metric of ['oee','throughput']) {
    const values=ordered.map(row=>row.roundMetrics.map(value=>value[metric]));
    const means=values.map(row=>row.reduce((sum,value)=>sum+value,0)/r);
    const grand=means.reduce((sum,value)=>sum+value,0)/n;
    const blocks=Array.from({length:r},(_,j)=>values.reduce((sum,row)=>sum+row[j],0)/n);
    const residualSS=values.reduce((sum,row,i)=>sum+row.reduce((s,value,j)=>s+(value-means[i]-blocks[j]+grand)**2,0),0);
    const residualDf=(n-1)*(r-1),mse=residualSS/residualDf;
    metrics[metric]={residualSS,residualDf,residualMeanSquare:mse,seedBlockSS:n*blocks.reduce((sum,value)=>sum+(value-grand)**2,0),seedBlockDf:r-1,effects:terms.map(indices=>{
      const effect=means.reduce((sum,value,i)=>sum+value*indices.reduce((sign,j)=>sign*design.designPoints[i].levels[j],1),0)/(n/2);
      const sumSquares=n*r*effect*effect/4;
      const f=mse>1e-20?sumSquares/mse:null;
      const pValue=f===null?null:scenarioFSurvival(f,1,residualDf);
      return {factors:indices,effect,sumSquares,df:1,f,pValue,significant:pValue===null?null:pValue<.05};
    })};
  }
  return {complete:true,model:'FULL_FACTORIAL_WITH_SEED_BLOCKS',alpha:.05,interpretation:'Exploratory unadjusted p-values; assumes independent seed blocks and homogeneous residual variance. Statistical significance is not practical benefit or plant validation.',metrics};
}

export function scenarioFSurvival(f,df1,df2) {
  if(!(f>=0&&df1>0&&df2>0))return null;
  if(f===0)return 1;if(!Number.isFinite(f))return 0;
  const x=df2/(df2+df1*f),a=df2/2,b=df1/2;
  function logGamma(z){const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z--;let v=.9999999999998099;for(let i=0;i<c.length;i++)v+=c[i]/(z+i+1);const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(v);}
  function fraction(a,b,x){const tiny=1e-300;let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;for(let m=1;m<=200;m++){let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<1e-12)break;}return h;}
  const front=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
  const result=x<(a+1)/(a+b+2)?front*fraction(a,b,x)/a:1-front*fraction(b,a,1-x)/b;
  return Math.max(0,Math.min(1,result));
}


