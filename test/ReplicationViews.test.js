import test from 'node:test';
import assert from 'node:assert/strict';
import {closestRound,replicationView,simulateBatch} from '../src/simulation/SimulationBatch.js';
const products=(id,output)=>({model:'CONTINUOUS_EQUIVALENT_FLOW',rows:[{formatId:id,productId:id,name:id,bottlesPerCase:12,outputUnit:'CASES',durationSeconds:60,outputNative:output/12,outputBottleEquivalents:output,completeCases:Math.floor(output/12),partialCaseEquivalent:output/12%1,idealBottleOutput:600,clearoutBottleEquivalents:0}],clearoutBottleEquivalents:0});
test('round views preserve real runs, average absent formats as zero and match global output',()=>{
 const rows=[100,200,600].map((n,i)=>({round:i+1,seed:i+5,summary:{outputCount:n,lineOeePercent:n/10},equipmentMetrics:{a:{outputCount:n,failureSeconds:i*10}},products:products(i===2?'B':'A',n),plantCalendar:{observedStopSeconds:i*3}}));
 const result={...rows[0],durationSeconds:60,inputSignature:JSON.stringify({run:{seed:5,rounds:3}}),products:rows[0].products,batch:{rounds:3,rows,representativeRound:2,statistics:{outputCount:{mean:300}}}};
 const before=JSON.stringify(result),avg=replicationView(result);assert.equal(avg.summary.outputCount,300);assert.equal(avg.equipmentMetrics.a.failureSeconds,10);assert.equal(avg.plantCalendar.observedStopSeconds,3);assert.equal(avg.products.rows.length,2);assert(avg.products.rows.every(r=>r.bottlesPerCase===12));assert.equal(avg.products.rows.reduce((n,r)=>n+r.outputBottleEquivalents,0),300);assert.equal(avg.products.rows[0].outputBottleEquivalents,100);assert.equal(avg.products.rows[1].outputBottleEquivalents,200);assert.equal(closestRound(rows,300,30),2);
 const rep=replicationView(result,'representative');assert.equal(rep.seed,6);assert.equal(rep.summary.outputCount,200);assert.equal(rep.batch,undefined);assert.equal(rep.products.rows[0].outputBottleEquivalents,200);assert.equal(JSON.parse(rep.inputSignature).run.seed,6);assert.equal(JSON.parse(rep.inputSignature).run.rounds,1);assert.equal(JSON.stringify(result),before);
});
test('representative tie uses OEE then round order rather than completion order',()=>{
 const row=(round,output,oee)=>({round,summary:{outputCount:output,lineOeePercent:oee}});
 assert.equal(closestRound([row(3,110,60),row(2,90,51),row(1,90,51)],100,50),1);
});
test('older results do not invent per-format averages from one available round',()=>{
 const r={products:products('a',100),summary:{outputCount:100},batch:{rows:[{summary:{outputCount:100}},{summary:{outputCount:200}}]}};assert.equal(replicationView(r).products,undefined);
});
test('batch keeps per-round format and calendar totals and selects the nearest production',async()=>{
 const input={case:{id:'test',equipment:[]},run:{durationSeconds:60,seed:5,rounds:3}};
 const response=await simulateBatch(input,{workerFirstRound:true,runRound:async input=>{const n=[100,200,600][input.run.seed-5];return {ok:true,result:{seed:input.run.seed,durationSeconds:60,summary:{outputCount:n,lineOeePercent:n/10},equipmentMetrics:{},products:products('a',n),plantCalendar:{observedStopSeconds:3},samples:[]}};}});
 assert(response.ok);assert.equal(response.result.batch.representativeRound,2);assert.equal(response.result.batch.rows[2].products.rows[0].outputBottleEquivalents,600);assert.equal(replicationView(response.result).summary.outputCount,300);
});

test('summary-only background rounds recover only the selected representative replay',async()=>{
 const calls=[],input={case:{id:'test',equipment:[]},run:{durationSeconds:60,seed:5,rounds:3}};
 const response=await simulateBatch(input,{workerFirstRound:true,laterSummaryOnly:true,runRound:async(input,options)=>{calls.push([input.run.seed,options.summaryOnly]);const n=[100,200,600][input.run.seed-5];return {ok:true,result:{seed:input.run.seed,summary:{outputCount:n,lineOeePercent:n/10},equipmentMetrics:{},samples:options.summaryOnly?[]:[{virtualSecond:0},{virtualSecond:60}]}};}});
 assert.deepEqual(calls,[[5,false],[6,true],[7,true],[6,false]]);assert.equal(response.result.batch.representativeReplay.round,2);assert.equal(replicationView(response.result,'representative').samples.length,2);
});
