import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/TextResources.gs','utf8'),context);vm.runInContext(fs.readFileSync('apps-script/SheetImportMerge.html','utf8').replace(/<\/?script>/g,''),context);const merge=context.window.STSheetImportMerge;
const copy=x=>JSON.parse(JSON.stringify(x));
function equipment(id,name,mtbf=100){return {id,name,type:'FILLER',nominalRatePerSecond:2,initialMode:'AUTO',characteristics:{custom:'keep'},processData:{role:'MACHINE',equipment:{mtbfMinutes:mtbf,mttrMinutes:5,maximumSpeedBpm:120}},noiseProfile:{reliability:{mtbfMinutes:mtbf,mttrMinutes:5},microStop:{probabilityPerMinute:.01,minDurationSeconds:1,maxDurationSeconds:2}}};}
function preview(units){return {equipment:units,source:{spreadsheetId:'sheet-id',sheetId:0,sheetName:'Line'},metadata:{site:'Plant'},sourceRows:[],errors:[],warnings:[],notes:[]};}
function deselect(plan){plan.records.forEach(r=>Object.keys(r.selected).forEach(k=>r.selected[k]=false));Object.keys(plan.metadata).forEach(k=>plan.metadata[k]=false);}
test('selective MTBF update preserves IDs, order, other fields and custom noise',()=>{
 const current=[equipment('a','Filler'),equipment('b','Packer')],data=preview([equipment('sheet-row-10','Filler',200)]),plan=merge.create(data,current,{});deselect(plan);plan.records[0].selected.mtbf=true;
 const before=copy(current),out=merge.build(data,plan,current,{});assert.equal(out.errors.length,0);assert.equal(out.updated,1);assert.equal(out.added,0);assert.equal(out.equipment[0].id,'a');assert.equal(out.equipment[0].noiseProfile.reliability.mtbfMinutes,200);assert.equal(out.equipment[0].noiseProfile.reliability.mttrMinutes,5);assert.deepEqual(copy(out.equipment[0].noiseProfile.microStop),current[0].noiseProfile.microStop);assert.deepEqual(copy(out.equipment[1]),current[1]);assert.deepEqual(current,before);
});
test('empty simulation imports all equipment in Sheet order; manual skips and field selection work',()=>{
 const data=preview([equipment('row-1','A'),equipment('row-2','B')]),plan=merge.create(data,[],{});let out=merge.build(data,plan,[],{});assert.equal(out.added,2);assert.equal(out.equipment[0].name,'A');assert.equal(out.equipment[1].name,'B');
 plan.records[0].target='skip';out=merge.build(data,plan,[],{});assert.equal(out.added,1);assert.equal(out.equipment[0].name,'B');plan.records[1].selected.name=false;out=merge.build(data,plan,[],{});assert(out.errors.length>0);
});
test('reimport matches previous source names after local rename and row movement',()=>{
 const current=[equipment('stable-id','Local renamed')],previous={bindings:[{equipmentId:'stable-id',sourceKey:'sheet-id:0',sourceName:'Original',row:10}]};
 const data=preview([equipment('sheet-row-99','Original',250)]);data.equipment[0].characteristics.sourceSheetRow=99;
 const plan=merge.create(data,current,previous);assert.equal(plan.records[0].target,'stable-id');deselect(plan);plan.records[0].selected.mtbf=true;
 const out=merge.build(data,plan,current,previous);assert.equal(out.equipment[0].name,'Local renamed');assert.equal(out.equipment[0].noiseProfile.reliability.mtbfMinutes,250);assert.equal(out.sourceImport.bindings[0].row,99);
});
test('duplicate names and conflicting row targets require explicit resolution',()=>{
 const current=[equipment('a','Same'),equipment('b','Same')],data=preview([equipment('sheet-row-10','Same')]);let plan=merge.create(data,current,{});assert.equal(plan.records[0].target,'skip');
 const two=preview([equipment('sheet-row-10','First'),equipment('sheet-row-11','Second')]);plan=merge.create(two,current,{});plan.records.forEach(r=>r.target='a');assert(merge.build(two,plan,current,{}).errors.some(e=>e.includes('Two Sheet rows')));
});
test('NA defaults preserve known values; clearing reliability requires a valid pair',()=>{
 const current=[equipment('a','Filler')],missing=equipment('source','Filler');missing.noiseProfile={};missing.processData.equipment.mtbfMinutes=null;missing.processData.equipment.mttrMinutes=null;
 const data=preview([missing]),plan=merge.create(data,current,{});assert.equal(plan.records[0].selected.mtbf,false);assert.equal(plan.records[0].selected.mttr,false);deselect(plan);plan.records[0].selected.mtbf=true;assert(merge.build(data,plan,current,{}).errors.length>0);plan.records[0].selected.mttr=true;const out=merge.build(data,plan,current,{});assert.equal(out.errors.length,0);assert.equal(out.equipment[0].noiseProfile.reliability,undefined);assert(out.equipment[0].noiseProfile.microStop);
});
test('NA critical flags are not silently imported as N',()=>{
 const current=[equipment('a','Filler')];current[0].characteristics.criticalMachine=true;
 const data=preview([equipment('source','Filler')]);data.sourceRows=[{row:10,values:{critical:null}}];const plan=merge.create(data,current,{});assert.equal(plan.records[0].selected.critical,false);
});
test('metadata-only changes preserve equipment; no selection is a no-op',()=>{
 const current=[equipment('a','Filler')],data=preview([equipment('source','Filler')]),previous={metadata:{site:'Old',by:'Author'}};
 const plan=merge.create(data,current,previous);deselect(plan);let out=merge.build(data,plan,current,previous);assert.equal(out.hasChanges,false);plan.metadata.site=true;out=merge.build(data,plan,current,previous);assert.equal(out.equipmentChanged,false);assert.equal(out.sourceImport.metadata.by,'Author');assert.equal(out.sourceImport.metadata.site,'Plant');
});
test('invalid cells can be excluded while valid fields update; IDs never collide',()=>{
 const current=[equipment('source','Filler')],data=preview([equipment('source','New',200)]);data.errors=[{cell:'D10:E10',message:'Invalid reliability'}];const plan=merge.create(data,current,{});assert.equal(plan.records[0].target,'skip');plan.records[0].target='source';merge.defaults(data,plan.records[0],current);const out=merge.build(data,plan,current,{});assert.equal(out.errors.length,0);assert.equal(out.equipment[0].name,'New');assert.equal(out.equipment[0].noiseProfile.reliability.mtbfMinutes,100);
 data.errors=[];const add=merge.create(data,current,{});const result=merge.build(data,add,current,{});assert.equal(result.equipment.length,2);assert.notEqual(result.equipment[0].id,result.equipment[1].id);
});

test('automatically skipped source errors explain the exact field rather than claiming a match',()=>{
 const data=preview([equipment('sheet-row-10','Machine')]);
 data.errors=[{cell:'F10',message:'Machine maximum speed must be greater than zero.'}];
 const plan=merge.create(data,[],{});
 assert.equal(plan.records[0].target,'skip');
 assert.match(plan.records[0].reason,/F10: Machine maximum speed/);
 assert(!plan.records[0].reason.includes('Matched'));
});
