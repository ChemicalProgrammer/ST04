import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioDOE,analyzeScenarioDOE} from '../src/analysis/ScenarioDOE.js';
const factor=i=>({equipmentId:'conveyor-'+i,path:'speed',before:10,low:10,high:20,unit:'m/min'});
test('DOE enumerates all 16 unique four-factor combinations without changing inputs',()=>{
 const factors=[0,1,2,3].map(factor),snapshot=JSON.stringify(factors),design=createScenarioDOE(factors);
 assert.equal(design.designPoints.length,16);assert.equal(new Set(design.designPoints.map(p=>p.levels.join(','))).size,16);
 assert.equal(design.designPoints[0].changes.length,0);assert.equal(design.designPoints[15].changes.length,4);assert.equal(JSON.stringify(factors),snapshot);
 assert.throws(()=>createScenarioDOE([...factors,factor(4)]),/ONE_TO_FOUR/);
 assert.throws(()=>createScenarioDOE([{...factor(0),low:20,high:10}]),/INVALID_FACTOR/);
 assert.throws(()=>createScenarioDOE([{...factor(0),before:null}]),/INVALID_FACTOR/);
 assert.throws(()=>createScenarioDOE([{...factor(0),external:true}]),/INVALID_FACTOR/);
 assert.throws(()=>createScenarioDOE([factor(0),factor(0)]),/INVALID_FACTOR/);
});
test('DOE recovers main and pair interaction contrasts and refuses incomplete designs',()=>{
 const design=createScenarioDOE([factor(0),factor(1)]);
 const observations=design.designPoints.map(p=>({index:p.index,throughput:100+3*p.levels[0]+7*p.levels[0]*p.levels[1],oee:50+2*p.levels[1]}));
 const analysis=analyzeScenarioDOE(design,observations);assert(analysis.complete);
 assert.equal(analysis.effects[0].throughput,6);assert.equal(analysis.effects[1].oee,4);assert.equal(analysis.effects[2].throughput,14);
 assert.equal(analyzeScenarioDOE(design,observations.slice(1)).complete,false);
 assert.equal(analyzeScenarioDOE(design,observations.map((o,i)=>i===0?{...o,throughput:null}:o)).complete,false);
});

test('reliability DOE preserves intervention evidence at every level and rejects unjustified or adverse targets',()=>{
 const f={equipmentId:'filler',path:'noiseProfile.reliability.mtbfMinutes',before:30,low:30,high:60,external:true,justification:'Replace worn drive; target from supplier reliability data.',unit:'min'};
 const design=createScenarioDOE([f]);assert.equal(design.designPoints[0].changes.length,0);assert.equal(design.designPoints[1].changes[0].external,true);assert.equal(design.designPoints[1].changes[0].justification,f.justification);
 assert.throws(()=>createScenarioDOE([{...f,justification:''}]),/EVIDENCE_REQUIRED/);
 assert.throws(()=>createScenarioDOE([{...f,low:20}]),/RELIABILITY_DIRECTION/);
 assert.throws(()=>createScenarioDOE([{...f,external:false}]),/EVIDENCE_REQUIRED/);
 const repair={...f,path:'noiseProfile.reliability.mttrMinutes',before:3,low:1,high:3};assert.equal(createScenarioDOE([repair]).designPoints[0].changes[0].after,1);
 assert.throws(()=>createScenarioDOE([{...repair,high:4}]),/RELIABILITY_DIRECTION/);
});
