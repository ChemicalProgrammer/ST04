import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {JSDOM} from 'jsdom';
const source=fs.readFileSync('apps-script/RealData.html','utf8').replace(/<\/?script>/g,'');
const c={window:{}};vm.createContext(c);vm.runInContext(source,c);const api=c.window.STRealData;
function fixture(){
 const record={id:'r',name:'Manually entered',durationSeconds:600,reportedEfficiencyPercent:60,reportedUpdtPercent:20,reportedProductionCases:60,reportedProductionUnits:720,production:720,productionUnit:'BOTTLES',shiftProduction:[20,20,20],runTimeSeconds:480,rateLossSeconds:120,downtimeSeconds:120,aem:{businessExternalDowntimeSeconds:0,plantAvailableSeconds:600,plantDecisionDowntimeSeconds:0,productionAvailableSeconds:600},equipment:[{equipmentId:'in',downtimeSeconds:150,stopClass:'UNKNOWN',exposureSeconds:600}]};
 const simulation={id:'s',equipment:[{id:'in',name:'Filler'},{id:'out',name:'Packer'}],sourceImport:{metadata:{bottlesPerCase:12}},dynamicConfig:{}};
 const rows=[{round:1,seed:1,summary:{outputCount:600,lineOeePercent:50},equipmentMetrics:{in:{runningSeconds:400},out:{runningSeconds:480}},shifts:[{outputCount:200},{outputCount:200},{outputCount:200}]},{round:2,seed:2,summary:{outputCount:900,lineOeePercent:75},equipmentMetrics:{in:{runningSeconds:500},out:{runningSeconds:540}},shifts:[{outputCount:300},{outputCount:300},{outputCount:300}]}];
 const result={durationSeconds:600,unitOfFlow:'bottles',summary:{outputCount:9999,lineOeePercent:99},batch:{representativeRound:2,rows}};
 return {record,simulation,result};
}
const row=(data,name)=>data.rows.find(r=>r.metric===name);
test('simple manual observations compare immediately without removed selectors or extra inputs',()=>{
 const {record,simulation,result}=fixture(),d=api.compare(record,simulation,result,'average',{}, {simple:true});
 assert.equal(d.rows.length,15);assert(d.rows.every(r=>r.comparable));assert.equal(row(d,'Total Production Day (Units)').simulated,750);assert.equal(row(d,'Total Production Day (Units)').delta,30);assert.equal(row(d,'Total Production Day (Cases)').delta,2.5);assert.equal(row(d,'AU').delta,2.5);assert.equal(row(d,'UPDT').delta,-5);assert.equal(row(d,'Run Time').simulated,8.5);assert.equal(row(d,'Downtime').simulated,1.5);assert.equal(row(d,'Rate Loss').simulated,2.25);assert.equal(row(d,'Shift 1').simulated,250/12);
 assert.equal(d.equipmentRows.length,2);assert.equal(d.equipmentRows[0].simulated,2.5);assert.equal(d.equipmentRows[0].delta,0);assert.equal(d.equipmentRows[1].simulated,1.5);assert.equal(d.equipmentRows[1].real,null);
 assert(!d.warnings.some(w=>w.includes('Confirm the line-time basis')));assert(!api.reportHtml(d).includes('>Basis<'));
});
test('missing detail blocks only affected rows; no fabricated shifts or equipment downtime',()=>{
 const {record,simulation,result}=fixture();delete result.batch.rows[1].equipmentMetrics.out.runningSeconds;delete result.batch.rows[1].shifts;
 const d=api.compare(record,simulation,result,'average',{}, {simple:true});assert.equal(row(d,'Total Production Day (Units)').delta,30);assert.equal(row(d,'AU').delta,2.5);assert.equal(row(d,'Run Time').simulated,null);assert.equal(row(d,'Shift 1').simulated,null);assert.equal(d.equipmentRows[0].delta,0);assert.equal(d.equipmentRows[1].simulated,null);
});
test('period and stale guards remain effective; selected round and means use the correct detail',()=>{
 const {record,simulation,result}=fixture();let d=api.compare({...record,durationSeconds:1200},simulation,result,'average',{}, {simple:true});assert.equal(row(d,'Total Production Day (Units)').delta,null);
 d=api.compare(record,simulation,result,'representative',{}, {simple:true});assert.equal(row(d,'Total Production Day (Units)').simulated,900);assert.equal(d.equipmentRows[0].simulated,100/60);
 c.window.SimulatorEngine=c.SimulatorEngine={inputSignature:()=> 'new'};d=api.compare(record,simulation,{...result,inputSignature:'old'},'average',{unitOfFlow:'bottles'},{simple:true});assert(d.stale);assert(d.rows.every(r=>!r.comparable));delete c.window.SimulatorEngine;delete c.SimulatorEngine;
});
test('simple UI refreshes differences on edits, removes Basis and always renders equipment downtime rows',()=>{
 const dom=new JSDOM('<!doctype html>'+fs.readFileSync('apps-script/RealDataPanel.html','utf8'),{runScripts:'outside-only'}),w=dom.window,d=w.document;
 try{
  w.eval(source);const f=fixture(),sim={...f.simulation,results:f.result},record=w.STRealData.normalize(f.record),owner={id:'case',metadata:{realData:{schema:'st-real-data-v1',records:[record]}}},state={activeCase:owner};w.STRealData.init(state,{changed(){}});w.STRealData.render(owner,sim);
  const find=label=>[...d.querySelectorAll('#real-data-comparison tbody tr')].find(r=>r.cells[0].textContent===label);
  assert.equal(find('Total Production Day (Units)').cells[4].textContent,'30');assert.equal(d.querySelectorAll('#real-data-downtime-comparison tbody tr').length,2);assert(![...d.querySelectorAll('#real-data-comparison th,#real-data-downtime-comparison th')].some(e=>e.textContent==='Basis'));
  const input=d.querySelector('[data-real-field=reportedProductionUnits]');input.value='740';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(find('Total Production Day (Units)').cells[4].textContent,'10');
  const downtime=d.querySelector('[data-equipment-id=in]');downtime.value='2';downtime.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelector('#real-data-downtime-comparison tbody tr').cells[4].textContent,'0.5');assert.equal(owner.metadata.realData.records[0].equipment[0].downtimeSeconds,120);
  assert(!d.getElementById('real-data-comparison').textContent.includes('Not comparable'));
 }finally{w.close();}
});

test('native base units are matched, while incompatible shift boundaries are not guessed',()=>{
 const f=fixture();f.result.unitOfFlow='units';let data=api.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(row(data,'Total Production Day (Units)').delta,30);
 f.result.batch.rows.forEach(r=>r.shifts.push({outputCount:1}));data=api.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(row(data,'Shift 1').simulated,null);assert.equal(row(data,'Total Production Day (Units)').delta,30);
});

test('a full aggregate calendar with no exclusions does not block the matching physical run',()=>{
 const f=fixture();f.simulation.dynamicConfig.plantCalendar={enabled:true,mode:'AGGREGATE',totalMinutes:10,externalMinutes:0};const d=api.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(row(d,'Total Production Day (Units)').delta,30);assert.equal(row(d,'Downtime').delta,-0.5);
});
