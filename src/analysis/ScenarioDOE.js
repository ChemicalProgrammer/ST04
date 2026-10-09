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
    return {index,levels,changes:factors.map((f,i)=>({equipmentId:f.equipmentId,path:f.path,before:f.before,after:levels[i]===1?f.high:f.low,unit:f.unit,...(f.external?{external:true,justification:f.justification}:{})})).filter(c=>c.before!==c.after)};
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

