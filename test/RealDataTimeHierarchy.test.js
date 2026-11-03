import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setup,fixture,mount} from './helpers/RealDataHarness.js';
const clean=v=>JSON.parse(JSON.stringify(v));
test('registration nests the entire time hierarchy and recalculates without losing focus or collapse state',()=>{
 const w=setup();try{const f=fixture(),saved=JSON.stringify(f.result),{owner}=mount(w,f);
 const node=id=>w.document.querySelector('[data-time-node="'+id+'"]'),value=id=>w.document.querySelector('[data-time-value="'+id+'"]');
 assert(node('total').querySelector(':scope > summary [data-real-field="durationSeconds"]'));
 const childIds=id=>[...node(id).querySelector(':scope > .real-data-time-children').children].filter(e=>e.dataset.timeNode).map(e=>e.dataset.timeNode);
 assert.deepEqual(childIds('total'),['external','plant']);assert.deepEqual(childIds('plant'),['decision','production']);assert.deepEqual(childIds('production'),['unplanned','runtime']);assert.deepEqual(childIds('runtime'),['losses','effective']);
 node('external').open=false;const input=w.document.querySelector('[data-real-field="timeBreakdown.external.productionDayLossesSeconds"]');input.focus();input.value='82';input.dispatchEvent(new w.Event('input'));
 assert.equal(value('external').textContent,'— min');assert.equal(value('plant').textContent,'— min');assert.equal(node('external').open,false);assert.equal(w.document.activeElement,input);
 for(const key of ['nonProductionDaysSeconds','outsideSourcesSeconds','holidaysSeconds']){const e=w.document.querySelector('[data-real-field="timeBreakdown.external.'+key+'"]');e.value='0';e.dispatchEvent(new w.Event('input'));}
 assert.equal(value('external').textContent,'82 min');assert.equal(value('plant').textContent.replaceAll(',',''),'1358 min');assert.equal(value('production').textContent.replaceAll(',',''),'1358 min');
 const stored=owner.metadata.realData.records[0];assert.equal(stored.timeBreakdown.external.productionDayLossesSeconds,82*60);assert.equal(stored.aem.businessExternalDowntimeSeconds,0);
 const compared=w.STRealData.compare(stored,f.simulation,f.result,'average',{});assert.equal(compared.rows.find(r=>r.id==='Plant Available Time (T2)').real,1358);assert.equal(compared.rows.find(r=>r.id==='Business / External Downtime').real,82);assert.equal(compared.observation.aem.businessExternalDowntimeSeconds,0);
 assert.equal(JSON.stringify(f.result),saved);
 }finally{w.close();}
});
test('branch totals distinguish unknown and zero, persist through JSON import and preserve historical aggregate records',()=>{
 const w=setup();try{const f=fixture(),record=w.STRealData.normalize(f.record),before=JSON.stringify(record);let h=w.STRealDataModel.timeHierarchy(record);
 assert.equal(h.values.external,0);assert.equal(h.values.unplanned,512*60);assert.equal(h.values.runtime,928*60);assert.equal(h.values.effective,775*60);assert.equal(JSON.stringify(record),before);
 record.timeBreakdown.decision.enabled=true;record.timeBreakdown.decision.plannedMaintenanceSeconds=100*60;h=w.STRealDataModel.timeHierarchy(record);assert.equal(h.values.decision,null);assert.equal(h.values.production,null);
 for(const [key] of w.STRealDataModel.timeCategories.decision.fields)record.timeBreakdown.decision[key]=0;
 record.timeBreakdown.decision.plannedMaintenanceSeconds=100*60;
 const restored=w.STRealData.normalize(clean(record));assert.equal(restored.timeHierarchyEnabled,true);h=w.STRealDataModel.timeHierarchy(restored);assert.equal(h.values.decision,100*60);assert.equal(h.values.production,1340*60);assert.equal(h.values.effective,675*60);
 const compare=w.STRealData.compare(restored,f.simulation,f.result,'average',{});assert.equal(compare.rows.find(r=>r.id==='Production Available Time (T3)').real,1340);
 const imported=w.STRealData.importRecords({schema:'st-real-data-v1',records:[clean(restored)]});assert.equal(imported[0].timeBreakdown.decision.plannedMaintenanceSeconds,100*60);
 const report=new JSDOM(w.STRealData.reportHtml(compare));assert(report.window.document.body.textContent.includes('Planned Maintenance (min)'));report.window.close();
 const template=w.STRealData.template(f.simulation.equipment);assert(template.records[0].timeBreakdown.unplanned);assert.equal(template.records[0].timeBreakdown.unplanned.unscheduledMaintenanceSeconds,null);
 }finally{w.close();}
});
test('explicit zero action updates only its branch and invalid balances remain visible',()=>{
 const w=setup();try{const f=fixture(),{owner}=mount(w,f),branch=w.document.querySelector('[data-time-node="unplanned"]');branch.querySelector('button').click();
 assert.equal(w.document.querySelector('[data-time-value="unplanned"]').textContent,'0 min');const r=owner.metadata.realData.records[0];assert.equal(r.timeBreakdown.unplanned.enabled,true);assert.equal(r.timeBreakdown.external.enabled,false);assert.equal(r.downtimeSeconds,512*60);
 r.timeBreakdown.unplanned.unscheduledMaintenanceSeconds=1500*60;
 const h=w.STRealDataModel.timeHierarchy(r);assert.equal(h.values.runtime,-60*60);assert(h.warnings.some(v=>v.includes('Runtime')));
 r.aem.scrapSeconds=null;r.aem.scrapUnits=220;r.aem.reworkSeconds=null;r.aem.reworkUnits=null;
 const quality=w.STRealDataModel.timeHierarchy(r);assert.equal(quality.values.scrap,60);assert.equal(quality.values.losses,null);assert.equal(quality.values.effective,null);
 }finally{w.close();}
});
