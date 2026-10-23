import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
test('template download uses live IDs, imports all equipment and edits conveyor / unmatched downtime without extra form fields',async()=>{
 const dom=new JSDOM('<!doctype html>'+fs.readFileSync(new URL('../apps-script/RealDataPanel.html',import.meta.url),'utf8'),{runScripts:'outside-only'});const w=dom.window,d=w.document;
 try{
  w.eval(fs.readFileSync(new URL('../apps-script/RealData.html',import.meta.url),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,''));
  const equipment=[{id:'filler',name:'Filler',type:'FILLER'},{id:'transfer',name:'Transfer conveyor',type:'CONVEYOR'}],sim={id:'s',name:'Baseline',equipment},c={id:'c',name:'Test case',metadata:{}},state={activeCase:c};let edits=0,blob;
  w.URL.createObjectURL=value=>{blob=value;return 'blob:template';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  w.STRealData.init(state,{changed:()=>edits++});w.STRealData.render(c,sim);d.getElementById('real-data-template').click();
  const text=await new Promise(resolve=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob);});const payload=JSON.parse(text);
  assert.equal(payload.records[0].equipment[1].equipmentId,'transfer');assert.equal(payload.records[0].downtimeSeconds,null);assert(payload._guide.equipmentFields.notes);
  payload.records[0].equipment.push({equipmentId:'old-machine',name:'Old machine',notes:'Not in current line'});
  const file=d.getElementById('real-data-file');Object.defineProperty(file,'files',{value:[{size:text.length,text:async()=>JSON.stringify(payload)}]});await file.onchange();assert.equal(c.metadata.realData.records[0].equipment.length,3);
  const downtime=d.querySelector('[data-equipment-id=transfer][data-real-equipment-field=downtimeSeconds]');assert(downtime);downtime.value='12';downtime.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(c.metadata.realData.records[0].equipment[1].downtimeSeconds,720);assert(d.querySelector('[data-equipment-id=old-machine][data-real-equipment-field=downtimeSeconds]'));assert(edits>=2);
  assert.equal(d.querySelectorAll('#real-data-fields input').length,15);assert.equal(d.querySelectorAll('#real-data-fields select,#real-data-fields textarea').length,0);
  const labels=[...d.querySelectorAll('#real-data-fields label')].map(e=>e.textContent);
  assert.deepEqual(labels,['AU (%)','UPDT (%)','Shift 1 (Cases)','Shift 2 (Cases)','Shift 3 (Cases)','Total Production Day (Cases)','Total Production Day (Units)','Total Time (min)','Business External Time (min)','Plant Available Time (min)','Plant Decision Time (min)','Production Available Time (min)','Downtime (min)','Run Time (min)','Rate Loss (min)']);
  assert.equal(d.getElementById('real-data-bottlesPerCase'),null);assert.equal(d.getElementById('real-data-time-unit'),null);assert.deepEqual([...d.querySelectorAll('#real-data-equipment thead th')].map(e=>e.textContent),['Equipment','Downtime (min)']);
  const change=(key,value)=>{const input=d.querySelector('[data-real-field="'+key+'"]');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
  change('reportedProductionCases','14198');change('reportedProductionUnits','170376');change('shiftProduction.0','6720');change('runTimeSeconds','928');change('rateLossSeconds','153');
  const saved=c.metadata.realData.records[0];assert.equal(saved.production,170376);assert.equal(saved.productionUnit,'BOTTLES');assert.equal(saved.shiftProduction[0],6720);assert.equal(saved.effectiveRuntimeSeconds,775*60);assert.equal(saved.equipment.find(e=>e.equipmentId==='old-machine').notes,'Not in current line');
  change('reportedProductionUnits','');assert.equal(c.metadata.realData.records[0].production,14198);assert.equal(c.metadata.realData.records[0].productionUnit,'CASES');

 }finally{dom.window.close();}
});

