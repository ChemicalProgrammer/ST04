export const SCENARIO_SEARCH_PROFILES = Object.freeze({
  LIGHT: {explorationSeconds:300,confirmationSeconds:600,maxCandidates:16,maxSearchMs:120000,maxWithoutImprovement:8,maxFactors:2,passes:1,finalists:2},
  MEDIUM: {explorationSeconds:600,confirmationSeconds:1200,maxCandidates:28,maxSearchMs:300000,maxWithoutImprovement:10,maxFactors:3,passes:2,finalists:3},
  HIGH: {explorationSeconds:900,confirmationSeconds:1800,maxCandidates:40,maxSearchMs:600000,maxWithoutImprovement:12,maxFactors:4,passes:3,finalists:3}
});
export function scenarioSearchProfile(level) { return SCENARIO_SEARCH_PROFILES[level]||SCENARIO_SEARCH_PROFILES.MEDIUM; }
export function scenarioSearchRun(run,level,confirmation=false,rounds=3) {
  const profile=scenarioSearchProfile(level);
  // Independent What-If horizons; replay configuration and scheduled commands stay intact.
  const copy={...run,durationMode:'FIXED',durationSeconds:confirmation?profile.confirmationSeconds:profile.explorationSeconds,rounds};
  delete copy.shiftSeconds;delete copy.shiftHours;delete copy.shiftCount;
  return copy;
}
export function scenarioConfirmationNeedsMore(base,candidate) {
  const a=base?.roundMetrics,b=candidate?.roundMetrics;
  if(!a||!b||a.length!==3||b.length!==3)return false;
  const differences=b.map((row,i)=>row.throughput-a[i].throughput);
  const mean=differences.reduce((sum,value)=>sum+value,0)/3;
  const sd=Math.sqrt(differences.reduce((sum,value)=>sum+(value-mean)**2,0)/2);
  // Paired 95% t interval, df=2. Extra rounds are confirmation, never winner selection.
  return mean-4.3026527299*sd/Math.sqrt(3)<=Math.max(.001,Math.abs(base.throughput)*.001);
}
