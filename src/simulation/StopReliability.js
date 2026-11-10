// Category frequencies share the same operating exposure. Exponential clocks
// superpose to a total rate, with event categories sampled by their rate share.
export function stopReliabilityProfile(model) {
  if (!model.noiseProfile?.reliability) return null;
  const split=model.processData?.equipment?.stopInputs;
  if (!split) return {...model.noiseProfile.reliability,stopClasses:null};
  const stopClasses=['minor','major'].filter(kind=>split[kind].mtbfMinutes>0)
    .map(kind=>({stopClass:kind.toUpperCase(),...split[kind],rate:1/split[kind].mtbfMinutes}));
  const total=stopClasses.reduce((sum,profile)=>sum+profile.rate,0);
  if (!total) return null;
  return {mtbfMinutes:1/total,mttrMinutes:stopClasses.reduce((sum,profile)=>sum+profile.rate*profile.mttrMinutes,0)/total,stopClasses};
}

export function selectReliabilityStop(profile,random) {
  if (!profile.stopClasses) return {stopClass:'GENERAL',mttrMinutes:profile.mttrMinutes};
  if (profile.stopClasses.length===1) return profile.stopClasses[0];
  const total=profile.stopClasses.reduce((sum,item)=>sum+item.rate,0);
  const threshold=random.next()*total;
  let cumulative=0;
  for (const category of profile.stopClasses) {
    cumulative+=category.rate;
    if (threshold<cumulative) return category;
  }
  return profile.stopClasses.at(-1);
}
