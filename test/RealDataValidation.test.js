import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const source=fs.readFileSync('apps-script/RealData.html','utf8').replace(/<\/?script>/g,'');
function setup(){const w=new JSDOM(fs.readFileSync('apps-script/RealDataPanel.html','utf8'),{runScripts:'outside-only'}).window;w.eval(source);return w;}
function fixture(){return {
 record:{id:'r',name:'Example',durationSeconds:86400,downtimeSeconds:512*60,rateLossSeconds:153*60,reportedEfficiencyPercent:77,aem:{productionAvailableSeconds:86400},validation:{line:'G',reportedOeePercent:53.8,rateLossBasis:'GROSS'}},
 simulation:{id:'s',equipment:[],dynamicConfig:{}},
 result:{durationSeconds:86400,unitOfFlow:'bottles',summary:{outputCount:100,lineOeePercent:65.27,lineRunSeconds:60000,lineEffectiveRuntimeSeconds:86400*.6527,lineRateLossSeconds:86400*.0099,lineRateRecoverySeconds:100,lineNetRateBalanceSeconds:86400*.0099-100,lineRateLossBasis:'FINAL_OUTPUT_GROSS_SHORTFALL_AND_RECOVERY_PER_FORMAT_REFERENCE'}}
};}
const field=(data,column)=>data.validation.rows.find(r=>r.column===column).value;
test('validation reproduces spreadsheet formulas with OEE Opera separate from AU and exports explanations',()=>{
 const w=setup();try{
  const f=fixture(),d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});
  assert.equal(field(d,'G'),775);assert.equal(field(d,'H'),53.8);assert.equal(field(d,'I'),10.625);assert.equal(field(d,'J'),65.27);assert.equal(field(d,'K'),.99);
  assert(Math.abs(field(d,'L')-9.635)<1e-10);assert(Math.abs(field(d,'M')-55.635)<1e-10);assert(Math.abs(field(d,'N')-1.835)<1e-10);
  assert.equal(d.observation.reportedEfficiencyPercent,77);assert.equal(d.rows.length,15);
  assert(w.STRealData.reportHtml(d).includes('OEE ajustado por diferencia de rate loss'));
  assert(w.STRealData.reportHtml(d).includes('M = J − L = J + K − I'));
 }finally{w.close();}
});
test('both simulated percentages use production available time and preserve period and reference guards',()=>{
 const w=setup();try{
  const f=fixture();f.record.aem.productionAvailableSeconds=720*60;f.record.downtimeSeconds=200*60;
  f.simulation.dynamicConfig.plantCalendar={enabled:true,mode:'SCHEDULED',totalMinutes:1440};
  f.result.plantCalendar={completePeriod:true,observedStopSeconds:720*60};f.result.summary.lineEffectiveRuntimeSeconds=300*60;f.result.summary.lineRateLossSeconds=7.2*60;
  let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'J'),100*300/720);assert(Math.abs(field(d,'K')-1)<1e-10);
  f.record.durationSeconds=43200;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert(Number.isFinite(field(d,'M')));assert.equal(d.validation.comparable,false);
  f.record.durationSeconds=86400;f.record.referenceSpeedBpm=220;f.result.summary.lineOeePacemakerRatePerSecond=5;
  d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert(Number.isFinite(field(d,'M')));assert.equal(d.validation.comparable,false);
 }finally{w.close();}
});
test('net selection, means, selected rounds, incomplete measurements and zero loss stay explicit',()=>{
 const w=setup();try{
  const f=fixture();f.record.validation.rateLossBasis='NET';
  let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert(Math.abs(field(d,'K')-100*f.result.summary.lineNetRateBalanceSeconds/86400)<1e-10);
  f.record.validation.rateLossBasis='UNCONFIRMED';d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert(d.validation.warnings.some(x=>x.includes('provisional')));
  f.result.batch={representativeRound:2,rows:[{round:1,summary:{...f.result.summary,lineEffectiveRuntimeSeconds:86400*.6,lineRateLossSeconds:0}},{round:2,summary:{...f.result.summary,lineEffectiveRuntimeSeconds:86400*.7,lineRateLossSeconds:864}}]};
  d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'J'),65);assert.equal(field(d,'K'),.5);
  d=w.STRealData.compare(f.record,f.simulation,f.result,'2',{}, {simple:true});assert(Math.abs(field(d,'J')-70)<1e-10);assert.equal(field(d,'K'),1);
  delete f.result.batch.rows[1].summary.lineRateLossSeconds;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),null);assert.equal(field(d,'M'),null);
  delete f.result.batch;delete f.result.summary.lineRateLossBasis;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),.99);delete f.result.summary.lineRateRecoverySeconds;d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),null);
  assert.throws(()=>w.STRealData.normalize({...f.record,validation:{reportedOeePercent:101}}));
  assert.throws(()=>w.STRealData.normalize({...f.record,validation:{rateLossBasis:'OTHER'}}));
 }finally{w.close();}
});
test('new Real Data section edits and persists independent OEE without changing AU or simulation',()=>{
 const w=setup();try{
  const f=fixture(),before=JSON.stringify(f.result),owner={id:'case',metadata:{realData:{records:[w.STRealData.normalize(f.record)]}}};
  w.STRealData.init({activeCase:owner},{changed(){}});w.STRealData.render(owner,{...f.simulation,results:f.result});
  const section=w.document.getElementById('real-data-validation');assert(section);assert.equal(section.querySelectorAll('tbody tr').length,14);
  const input=section.querySelector('#real-validation-reportedOeePercent');input.value='54';input.dispatchEvent(new w.Event('change'));
  assert.equal(owner.metadata.realData.records[0].validation.reportedOeePercent,54);assert.equal(owner.metadata.realData.records[0].reportedEfficiencyPercent,77);assert.equal(JSON.stringify(f.result),before);
  assert(w.document.getElementById('real-data-validation').textContent.includes('Diferencia residual'));
 }finally{w.close();}
});

test('missing real downtime affects G but does not block independent rate loss adjustment',()=>{
 const w=setup();try{
  const f=fixture();delete f.record.downtimeSeconds;
  const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});
  assert.equal(field(d,'G'),null);assert(d.validation.rows.find(r=>r.column==='G').reason.includes('Unplanned Downtime'));
  assert.equal(field(d,'H'),53.8);assert(Math.abs(field(d,'M')-55.635)<1e-10);assert(Math.abs(field(d,'N')-1.835)<1e-10);
  assert.equal(d.validation.rows.find(r=>r.column==='M').reason,'');
 }finally{w.close();}
});
test('compact aggregates recover measured counters without relying on first-round metadata',()=>{
 const w=setup();try{
  const f=fixture();const summary={...f.result.summary};delete summary.lineRateLossBasis;
  f.result.batch={statistics:Object.fromEntries(Object.entries(summary).filter(([,v])=>typeof v==='number').map(([key,mean])=>[key,{mean}]))};
  f.result.summary={outputCount:100};
  let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),.99);assert.equal(field(d,'J'),65.27);
  f.result.batch.statistics.lineNetRateBalanceSeconds.mean=0;
  d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),null);
 }finally{w.close();}
});
test('available OEE reconstructs J when measured equivalent runtime is absent but never invents gross loss',()=>{
 const w=setup();try{
  const f=fixture();delete f.result.summary.lineEffectiveRuntimeSeconds;
  let d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'J'),65.27);
  delete f.result.summary.lineRateLossSeconds;
  d=w.STRealData.compare(f.record,f.simulation,f.result,'average',{}, {simple:true});assert.equal(field(d,'K'),null);assert.equal(field(d,'M'),null);assert(d.validation.rows.find(r=>r.column==='K').reason.includes('vuelve a simular'));
 }finally{w.close();}
});
test('recalculate refreshes edited real data and explains remaining gaps without rerunning or mutating simulation',()=>{
 const w=setup();try{
  const f=fixture();delete f.record.downtimeSeconds;
  const saved=JSON.stringify(f.result),owner={id:'case',metadata:{realData:{records:[w.STRealData.normalize(f.record)]}}};
  w.STRealData.init({activeCase:owner},{changed(){}});w.STRealData.render(owner,{...f.simulation,results:f.result});
  const find=c=>[...w.document.querySelectorAll('#real-data-validation tbody tr')].find(row=>row.cells[0].textContent===c);
  assert(find('G').textContent.includes('No calculado:'));assert(find('G').textContent.includes('Unplanned Downtime'));
  const input=w.document.querySelector('[data-real-field=rateLossSeconds]');input.value='200';input.dispatchEvent(new w.Event('input'));
  assert.equal(find('F').cells[2].textContent,'200');
  w.document.getElementById('real-data-validation-recalculate').click();
  assert(w.document.getElementById('real-data-status').textContent.includes('recalculada'));assert(find('M').cells[2].textContent!=='—');assert.equal(JSON.stringify(f.result),saved);
  const duration=w.document.querySelector('[data-real-field=durationSeconds]');duration.value='720';duration.dispatchEvent(new w.Event('input'));
  w.document.getElementById('real-data-validation-recalculate').click();
  assert.notEqual(find('M').cells[2].textContent,'—');assert(w.document.getElementById('real-data-validation').textContent.includes('no coincide'));
 }finally{w.close();}
});

test('visible operands always produce L M N even with stale results or different periods; edits calculate on input without blur',()=>{
 const w=setup();try{
  const f=fixture();f.record.validation={line:'G',rateLossBasis:'NET'};f.record.date='2026-11-02';
  f.result.summary.lineNetRateBalanceSeconds=-.0003*86400;
  f.result.inputSignature='saved';w.SimulatorEngine={inputSignature:()=> 'changed'};
  const owner={id:'case',unitOfFlow:'bottles',metadata:{realData:{records:[w.STRealData.normalize(f.record)]}}};
  const before=JSON.stringify(f.result);w.STRealData.init({activeCase:owner},{changed(){}});w.STRealData.render(owner,{...f.simulation,results:f.result});
  const find=c=>[...w.document.querySelectorAll('#real-data-validation tbody tr')].find(row=>row.cells[0].textContent===c);
  const d=w.STRealData.compare(f.record,f.simulation,f.result,'average',owner,{simple:true});
  assert(d.stale);assert.equal(d.validation.comparable,false);
  assert(Math.abs(field(d,'L')-10.655)<1e-10);assert(Math.abs(field(d,'M')-54.615)<1e-10);
  assert(Math.abs(field(d,'N')-(54.615-775/1440*100))<1e-10);
  const row=d.rows.find(r=>r.metric==='AU');assert.equal(row.comparable,false);assert(Number.isFinite(row.delta));const auUi=[...w.document.querySelectorAll('#real-data-comparison tbody tr')].find(r=>r.cells[0].textContent==='AU');assert.notEqual(auUi.cells[4].textContent,'—');assert.notEqual(auUi.cells[5].textContent,'—');
  const oee=w.document.getElementById('real-validation-reportedOeePercent');oee.focus();oee.value='53.5';oee.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(find('H').cells[2].textContent,'53.5');assert.equal(w.document.activeElement,oee);assert.equal(w.document.getElementById('real-validation-reportedOeePercent'),oee);
  assert(Math.abs(Number(find('N').cells[2].textContent)-1.115)<=.0051);assert.equal(oee.value,'53.5');
  oee.value='0';oee.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(find('H').cells[2].textContent,'0');
  assert.equal(JSON.stringify(f.result),before);
 }finally{w.close();}
});
