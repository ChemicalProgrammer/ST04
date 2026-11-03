import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function setup(){const w=new JSDOM(fs.readFileSync('apps-script/RealDataPanel.html','utf8'),{runScripts:'outside-only'}).window;for(const name of ['AemComparison','RealDataModel','RealData'])w.eval(fs.readFileSync('apps-script/'+name+'.html','utf8').replace(/<\/?script>/g,''));return w;}
const row=(d,label)=>d.aemComparison.rows.find(r=>r.label===label);
function fixture(){return {record:{id:'r',name:'AEM example',date:'2026-11-02',durationSeconds:1440*60,downtimeSeconds:512*60,rateLossSeconds:153*60,referenceSpeedBpm:220,aem:{businessExternalDowntimeSeconds:0,plantAvailableSeconds:1440*60,plantDecisionDowntimeSeconds:0,productionAvailableSeconds:1440*60,goodOutputUnits:775*220,scrapSeconds:0,reworkSeconds:0},equipment:[{equipmentId:'a',operatingSeconds:6000,failureCount:5,failureSeconds:600,mtbfMinutes:20,mttrMinutes:2}]},sim:{id:'s',dynamicConfig:{},equipment:[{id:'a',name:'Filler <x>',noiseProfile:{reliability:{mtbfMinutes:100,mttrMinutes:5}}}]},result:{durationSeconds:86400,unitOfFlow:'bottles',summary:{outputCount:775*220,lineOeePercent:775/1440*100,lineRunSeconds:928*60,lineEffectiveRuntimeSeconds:775*60,lineRateLossSeconds:153*60,lineRateRecoverySeconds:0,lineNetRateBalanceSeconds:153*60,lineOeePacemakerRatePerSecond:220/60,lineRateLossBasis:'MEASURED'},equipmentMetrics:{a:{runningSeconds:12000,failureCount:4,failureSeconds:1200}}}};}
test('AEM computes time hierarchy and all percentages using the correct denominators',()=>{
 const w=setup();try{
  const f=fixture(),d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  assert.equal(row(d,'Runtime AEM (T4)').real,928);assert.equal(row(d,'Effective Runtime AEM (T5)').real,775);
  assert.equal(row(d,'Rate Loss despejado / balance neto').real,153);
  assert.equal(row(d,'Asset Utilization (AU)').real,775/1440*100);
  assert.equal(row(d,'Operating Efficiency (OE)').real,775/1440*100);
  assert.equal(row(d,'Runtime Efficiency (RTE)').real,775/928*100);
  assert.equal(row(d,'UPDT').real,512/1440*100);
  const r=d.aemComparison.reliability;
  assert.equal(r.find(r=>r.label==='MTBF medido / reportado').real,20);
  assert.equal(r.find(r=>r.label==='MTTR medido / reportado').real,2);
  assert.equal(r.find(r=>r.label==='Disponibilidad interna medida').real,20/22*100);
  assert.equal(r.find(r=>r.label==='Disponibilidad interna medida').simulated,50/55*100);
  assert.equal(r.find(r=>r.label==='Disponibilidad por MTBF/MTTR reportados / configurados').simulated,100/105*100);
 }finally{w.close();}
});
test('quality units convert at standard rate, known zero stays zero, and missing losses are not assumed zero',()=>{
 const w=setup();try{
  const f=fixture();delete f.record.aem.scrapSeconds;delete f.record.aem.reworkSeconds;f.record.aem.scrapUnits=220;f.record.aem.reworkUnits=440;
  let d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  assert.equal(row(d,'Scrap (tiempo equivalente)').real,1);assert.equal(row(d,'Rework (tiempo equivalente)').real,2);
  assert.equal(row(d,'Rate Loss despejado / balance neto').real,150);
  assert(d.aemComparison.warnings.some(w=>w.includes('no coincide')));
  delete f.record.aem.goodOutputUnits;delete f.record.aem.scrapUnits;delete f.record.aem.reworkUnits;
  d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  assert.equal(row(d,'Effective Runtime AEM (T5)').real,null);assert.equal(row(d,'Scrap (tiempo equivalente)').real,null);
  assert.equal(row(d,'Scrap (tiempo equivalente)').simulated,0);
  f.record.aem.scrapSeconds=0;f.record.aem.reworkSeconds=0;
  d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});assert.equal(row(d,'Effective Runtime AEM (T5)').real,775);
 }finally{w.close();}
});
test('AEM UI updates on input, persists extra fields and export includes equations without changing saved simulation',()=>{
 const w=setup();try{
  const f=fixture(),before=JSON.stringify(f.result),owner={id:'case',metadata:{realData:{records:[w.STRealData.normalize(f.record)]}}};
  w.STRealData.init({activeCase:owner},{changed(){}});w.STRealData.render(owner,{...f.sim,results:f.result});
  w.document.querySelector('[data-explorer-select="group:production"]').click();const input=w.document.querySelector('[data-aem-field="aem.goodOutputUnits"]');input.focus();input.value=String(700*220);input.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.document.activeElement,input);assert.equal(owner.metadata.realData.records[0].aem.goodOutputUnits,700*220);
  const section=w.document.getElementById('real-data-comparison');assert(section.textContent.includes('Runtime Efficiency (RTE)'));
  assert([...section.querySelectorAll('tbody tr')].find(r=>r.cells[0].textContent==='Effective Runtime').cells[2].textContent==='700');
  assert(section.querySelector('th[title]').getAttribute('aria-description'));
  const d=w.STRealData.compare(owner.metadata.realData.records[0],f.sim,f.result,'average',{}, {simple:true});
  const report=w.STRealData.reportHtml(d);assert(report.includes('Comparación de parámetros'));assert(report.includes('RTE = 100'));assert(report.includes('Filler &lt;x&gt;'));assert.equal(JSON.stringify(f.result),before);
  const template=w.STRealData.template(f.sim.equipment);assert.equal(template.records[0].aem.scrapUnits,null);assert.equal(template.records[0].equipment[0].operatingSeconds,null);
 }finally{w.close();}
});
test('zero failures do not invent reliability and mixed formats do not use a single average standard rate',()=>{
 const w=setup();try{
  const f=fixture();f.sim.equipment.push({id:'belt',name:'Belt',type:'CONVEYOR'});f.result.equipmentMetrics.a.failureCount=0;f.result.products={rows:[{bottlesPerCase:12}]};
  const d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  assert.equal(d.aemComparison.reliability.find(r=>r.label==='MTBF medido / reportado').simulated,null);
  assert(!d.aemComparison.reliability.some(r=>r.equipmentId==='belt'));f.sim.equipment[1].noiseProfile={reliability:{enabled:true,mtbfMinutes:100,mttrMinutes:2}};const exception=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});assert(exception.aemComparison.reliability.some(r=>r.equipmentId==='belt'));
  assert.equal(row(d,'Standard Rate').simulated,null);assert(d.aemComparison.warnings.some(w=>w.includes('formatos')));
 }finally{w.close();}
});

test('hierarchy reconciles every level and flags independent real-time differences without hiding arithmetic',()=>{
 const w=setup();try{
  const f=fixture();let d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  let rows=w.STAemComparison.hierarchy(d.aemComparison),get=id=>rows.find(r=>r.id===id);
  assert.equal(get('runtime').real,928);assert.equal(get('losses').real,153);assert.equal(get('effective').real,775);
  assert(rows.filter(r=>r.children).every(r=>r.realResidual===0&&r.simulatedResidual===0));
  f.record.aem.goodOutputUnits=700*220;d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});
  rows=w.STAemComparison.hierarchy(d.aemComparison);assert.equal(get('runtime').realResidual,75);
  assert.equal(get('runtime').realResidual,75);
  delete f.record.aem.scrapSeconds;delete f.record.aem.reworkSeconds;
  d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});rows=w.STAemComparison.hierarchy(d.aemComparison);assert.equal(get('losses').real,null);assert.equal(get('runtime').realResidual,null);
  f.result.summary.lineEffectiveRuntimeSeconds=f.result.summary.lineRunSeconds+60;
  d=w.STRealData.compare(f.record,f.sim,f.result,'average',{}, {simple:true});rows=w.STAemComparison.hierarchy(d.aemComparison);assert.equal(get('rate').simulated,-1);
 }finally{w.close();}
});
