import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {diagnoseScenarioLosses,planScenarios} from '../src/analysis/ScenarioPlanner.js';
function demo(){const context=vm.createContext({Utilities:{base64Decode:s=>Buffer.from(s,'base64'),newBlob:b=>b,ungzip:b=>({getDataAsString:()=>gunzipSync(b).toString('utf8')})}});for(const file of ['DemoCaseFactory.gs','DemoResults.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),context);return JSON.parse(JSON.stringify(context.createDemoCaseRequest_().simulations[0]));}
test('diagnosis uses replication means and separates reference interactions from own stops',()=>{
 const sim=demo();sim.results.batch.equipmentStatistics['filler-1'].starvedSeconds.mean=600;
 sim.results.batch.equipmentStatistics['blowmolder-1'].failureSeconds.mean=300;
 const d=diagnoseScenarioLosses(sim);assert.equal(d.status,'OBSERVED');assert.equal(d.referenceId,'filler-1');
 assert.equal(d.equipment.find(r=>r.isReference).starvedSeconds,600);
 assert.equal(d.equipment.find(r=>r.equipmentId==='blowmolder-1').failureSeconds,300);
 assert(d.equipment.every(r=>r.equipmentId.startsWith('conveyor-')===false));
 const plan=planScenarios(sim);assert.equal(plan.hasDynamicEvidence,true);
 assert(plan.candidates.some(p=>p.evidence.priorityBonus>0));
 assert(plan.candidates.some(p=>p.evidence.referenceInteraction?.direction==='UPSTREAM'));
 assert.equal(planScenarios({...sim,results:null}).hasDynamicEvidence,false);
});
test('changed equipment, run or incomplete results cannot drive diagnostic priorities',()=>{
 for(const mutate of [s=>s.equipment[0].nominalRatePerSecond+=1,s=>s.dynamicConfig.seed++,s=>s.results.replicationStatus.state='PENDING']){
  const sim=demo();mutate(sim);assert.equal(diagnoseScenarioLosses(sim).status,'NO_COMPATIBLE_RESULTS');
  const plan=planScenarios(sim);assert.equal(plan.hasDynamicEvidence,false);assert(plan.candidates.every(p=>p.evidence.priorityBonus===0));
 }
});
