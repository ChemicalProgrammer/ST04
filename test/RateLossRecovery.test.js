import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch,replicationView} from '../src/simulation/SimulationBatch.js';
function input(edit={}){
 const unit=(id,rate)=>({id,name:id,type:'CUSTOM',nominalRatePerSecond:rate,initialMode:'AUTO',processData:{}});
 const source={...unit('source',10),type:'FILLER',processData:{upstream:{startupTimeSeconds:2},downstream:{rampUpTimeSeconds:4}}};
 return {case:{id:'ramps',unitOfFlow:'bottles',equipment:[source,{...unit('belt',1000),type:'CONVEYOR',processData:{role:'CONVEYOR',accumulation:{usableLengthMm:100000,productLengthMm:1,productPitchMm:1,gapMm:0,conveyorSpeedMmPerSecond:1000000,primeSensorPositionMm:99999,backupSensorPositionMm:0,backupRestartPositionMm:100,upstreamStopResponseSeconds:0,bottlesDischargedAtStop:0,downstreamRampUpSeconds:0}}},unit('sink',100)]},run:{durationSeconds:20,tickSeconds:1,sampleEverySeconds:1,seed:10,reliabilityEnabled:false,...edit}};
}
function run(i){const response=simulateLine(i);assert(response.ok,JSON.stringify(response.error));return response.result;}


test('buffered final output retains gross loss, recovery and a negative net balance',()=>{
 const i=input();i.case.equipment.at(-1).initialMode='STOP';i.run.commands=[{equipmentId:'sink',atVirtualSecond:10,action:'RUN'}];
 const r=run(i),s=r.summary;
 assert.equal(s.outputCount,135);assert.equal(s.lineRateLossStatus,'ABOVE_REFERENCE_OUTPUT');
 assert.equal(s.lineRateLossSeconds,0);assert.equal(s.lineRateRecoverySeconds,3.5);
 assert.equal(s.lineNetRateBalanceSeconds,-3.5);
 assert.equal(s.lineRunSeconds-s.lineEffectiveRuntimeSeconds,s.lineRateLossSeconds-s.lineRateRecoverySeconds);
});
test('per-tick shortfall is not erased by above-reference recovery in a later tick',()=>{
 const source=fs.readFileSync('src/simulation/LineSimulationEngine.js','utf8'),start=source.indexOf('function moveFlow('),end=source.indexOf('\nfunction addFlowToZone(',start);
 const move=Function(source.slice(start,end)+';return moveFlow;')();
 const r={product:null,equipment:[{}],outputCount:0,lineReferenceRate:10,lineRunSeconds:0,lineEffectiveRuntimeSeconds:0,lineRateShortfallSeconds:0,lineRateRecoverySeconds:0,lineRateReferenceValid:true,run:{tickSeconds:1}};
 move(r,0,5,false);move(r,0,15,false);
 assert.equal(r.lineRateShortfallSeconds,.5);assert.equal(r.lineRateRecoverySeconds,.5);assert.equal(r.lineRunSeconds-r.lineEffectiveRuntimeSeconds,0);
});
test('a full stop contributes neither positive-flow shortfall nor recovery',()=>{
 const i=input();i.case.equipment.at(-1).initialMode='STOP';const s=run(i).summary;
 assert.equal(s.lineRateLossSeconds,0);assert.equal(s.lineRateRecoverySeconds,0);assert.equal(s.lineNetRateBalanceSeconds,0);
});
test('three-round statistics and selected views retain recovery without null-to-zero substitution',async()=>{
 const i=input();i.case.equipment.at(-1).initialMode='STOP';i.run.commands=[{equipmentId:'sink',atVirtualSecond:10,action:'RUN'}];i.run.rounds=3;
 const response=await simulateBatch(i,{summaryOnly:true});assert(response.ok);const r=response.result;
 assert.equal(r.batch.statistics.lineRateRecoverySeconds.mean,3.5);assert.equal(replicationView(r).summary.lineRateRecoverySeconds,3.5);assert.equal(replicationView(r,'2').summary.lineNetRateBalanceSeconds,-3.5);
 r.batch.rows[0].summary.lineRateRecoverySeconds=0;r.batch.rows[0].summary.lineRateLossStatus='AVAILABLE';assert.equal(replicationView(r).summary.lineRateLossStatus,'ABOVE_REFERENCE_OUTPUT');
 r.batch.rows[1].summary.lineRateRecoverySeconds=null;assert.equal(replicationView(r).summary.lineRateRecoverySeconds,null);
});
test('Real Data withholds only ambiguous Rate Loss delta; observed input never drives production',()=>{
 const w={};Function('window',fs.readFileSync('apps-script/RealData.html','utf8').replace(/^<script>|<\/script>\s*$/g,''))(w);
 const i=input();i.case.equipment.at(-1).initialMode='STOP';i.run.commands=[{equipmentId:'sink',atVirtualSecond:10,action:'RUN'}];const r=run(i);
 const actual={durationSeconds:20,production:135,productionUnit:'BOTTLES',reportedProductionUnits:135,rateLossSeconds:10,runTimeSeconds:15,aem:{plantAvailableSeconds:20,productionAvailableSeconds:20}},sim={id:'s',equipment:i.case.equipment,dynamicConfig:{}};
 const d=w.STRealData.compare(actual,sim,r,'average',{}, {simple:true});
 assert.equal(d.rows.length,15);assert.equal(d.rows.find(x=>x.metric==='Rate Loss').simulated,0);assert.equal(d.rows.find(x=>x.metric==='Rate Loss').delta,null);
 assert.equal(d.rows.find(x=>x.metric==='Total Production Day (Units)').delta,0);
 assert(d.warnings.some(x=>x.includes('gross shortfall')));assert.equal(d.observation.rateLossSeconds,10);
});
