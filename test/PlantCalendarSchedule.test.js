import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {plantCalendarSchedule} from '../src/simulation/PlantCalendarSchedule.js';
import {simulateLine,simulateLineAsync} from '../src/simulation/LineSimulationEngine.js';
import {simulateBatch} from '../src/simulation/SimulationBatch.js';
import {scenarioSearchRun} from '../src/analysis/ScenarioSearch.js';
const calendar={enabled:true,mode:'SCHEDULED',totalMinutes:2,cleaningMinutes:1/3,distribution:'TIMED',restartPolicy:'RESTART',plans:{cleaningMinutes:{count:1,firstStartMinutes:.5}}};
function input(policy='RESTART'){
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/DemoCaseFactory.gs','utf8'),context);const c=JSON.parse(JSON.stringify(context.createDemoCaseRequest_()));
 c.id='scheduled';c.equipment.forEach(e=>{delete e.noiseProfile;e.initialMode='AUTO';e.startupDelaySeconds=5;e.restartRampUpSeconds=5;});
 return {case:c,run:{durationSeconds:120,tickSeconds:.25,sampleEverySeconds:1,seed:7,reliabilityEnabled:false,plantCalendar:{...calendar,restartPolicy:policy}}};
}
test('schedule divides category totals, interleaves events and excludes accounting adjustments',()=>{const result=plantCalendarSchedule({...calendar,totalMinutes:20,externalMinutes:2,coReportingErrorMinutes:1,distribution:'EVEN',cleaningMinutes:2,breakMinutes:1,plans:{cleaningMinutes:{count:4},breakMinutes:{count:2}}});assert.equal(result.horizonSeconds,1020);assert.equal(result.events.length,6);assert.equal(result.plannedStopSeconds,180);assert(result.events.every((e,i)=>!i||e.startSeconds>=result.events[i-1].endSeconds));});
test('schedule rejects overlapping events, events outside calendar and invalid counts',()=>{assert.throws(()=>plantCalendarSchedule({...calendar,breakMinutes:1,plans:{...calendar.plans,breakMinutes:{count:1,firstStartMinutes:.5}}}),/overlap/);assert.throws(()=>plantCalendarSchedule({...calendar,plans:{cleaningMinutes:{count:0}}}),/events/);assert.throws(()=>plantCalendarSchedule({...calendar,plans:{cleaningMinutes:{count:1,firstStartMinutes:2}}}),/beyond/);assert.equal(plantCalendarSchedule({...calendar,enabled:false}).events.length,0);});
test('physical line stops freeze material, count line time once and restart with extra startup loss',()=>{const restart=simulateLine(input()).result,resume=simulateLine(input('RESUME')).result,off=input();off.run.plantCalendar.enabled=false;const base=simulateLine(off).result;
 assert.equal(restart.plantCalendar.observedStopSeconds,20);assert.equal(restart.plantCalendar.completePeriod,true);assert.equal(restart.events.filter(e=>e.type==='PLANT_STOP_STARTED').length,1);assert(restart.events.some(e=>e.reason==='PLANT_CALENDAR_RESTART'));
 assert(restart.summary.outputCount<resume.summary.outputCount);assert(resume.summary.outputCount<base.summary.outputCount);
 const during=restart.samples.filter(s=>s.virtualSecond>=31&&s.virtualSecond<=49);assert(during.length>5);assert(during.every(s=>s.outputCount===during[0].outputCount));
 assert(Object.values(restart.equipmentMetrics).every(e=>e.plannedStopSeconds===20));
 assert.equal(restart.summary.materialBalance.residualUnits,0);
 const zones=during.map(s=>JSON.stringify(s.buffers));assert(zones.every(z=>z===zones[0]));
});
test('calendar stop does not override a manual STOP command when the window ends',()=>{const i=input();i.run.commands=[{atVirtualSecond:40,equipmentId:i.case.equipment.at(-1).id,action:'STOP'}];const r=simulateLine(i).result;assert(r.samples.filter(s=>s.virtualSecond>=51).every(s=>s.outputCount===r.samples.find(s=>s.virtualSecond===51).outputCount));});
test('async, batch and bounded search retain scheduled windows without rescaling them',async()=>{const i=input();const r=await simulateLineAsync(i,{detail:true,yieldBetweenChunks:false});assert.equal(r.result.plantCalendar.observedStopSeconds,20);const batch=await simulateBatch({...i,run:{...i.run,rounds:2}},{parallel:false});assert.equal(batch.result.plantCalendar.observedStopSeconds,20);assert(batch.result.batch.rows.every(row=>row.summary.lineOeePercent===r.result.summary.lineOeePercent));const partial=simulateLine({...i,run:{...i.run,durationSeconds:40}}).result;assert.equal(partial.plantCalendar.completePeriod,false);assert.equal(partial.plantCalendar.observedStopSeconds,10);assert.equal(scenarioSearchRun(i.run,'LIGHT').plantCalendar,i.run.plantCalendar);});
test('unsupported experimental engine returns a clear validation error',()=>{const i=input();i.run.engineId='DES_SIMPY_EXPERIMENTAL';const response=simulateLine(i);assert.equal(response.ok,false);assert.match(JSON.stringify(response.error),/require the ST engine/);});

test('a stop at time zero is visible in the first frame and cannot extend production beyond the calendar',()=>{const i=input();i.run.plantCalendar.plans.cleaningMinutes={count:1,firstStartMinutes:0};const r=simulateLine(i).result;assert(r.samples[0].equipment.every(e=>e.availabilityState==='PLANNED_STOP'));assert.equal(r.plantCalendar.observedStopSeconds,20);i.run.durationSeconds=180;assert.equal(simulateLine(i).result.plantCalendar.completePeriod,false);});
