import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);
for(const file of ['TextResources.gs','SheetImportMerge.html','SheetImportCorrections.html']){
 vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8').replace(/<\/?script>/g,''),context);
}
const merge=context.window.STSheetImportMerge,corrections=context.window.STSheetCorrections;
function conveyor(){return {id:'sheet-row-13',name:'Conveyor PU-FIL',type:'CONVEYOR',nominalRatePerSecond:3,initialMode:'AUTO',characteristics:{sourceSheetRow:13},processData:{upstream:{packageLengthMm:110,dischargePitchMm:88.9},accumulation:{conveyorSpeedFactorPercent:0},speedAndSensors:{conveyorSpeedFactorVsDischargeVelocityPercent:0}}};}
test('correction is a non-mutating minimum-speed proposal for the reported measurements',()=>{
 const unit=conveyor(),original=JSON.stringify(unit),proposal=corrections.suggest(unit);
 assert(Math.abs(proposal.gap+21.1)<1e-9);assert.equal(proposal.proposed,23.74);assert.equal(JSON.stringify(unit),original);
 unit.processData.accumulation.conveyorSpeedFactorPercent=proposal.proposed;
 assert.equal(corrections.suggest(unit),null);
 unit.processData.accumulation.conveyorSpeedFactorPercent=null;unit.processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent=null;
 assert.equal(corrections.suggest(unit),null);
});
test('only an accepted and selected adjustment enters the import; raw source values stay intact',()=>{
 const unit=conveyor(),preview={equipment:[unit],metadata:{},source:{spreadsheetId:'test',sheetId:0},sourceRows:[{row:13,values:{conveyorSpeedFactorVsDischargeVelocityPercent:0}}],warnings:[],notes:[],errors:[]};
 const original=JSON.stringify(preview),plan=merge.create(preview,[],{}),record=plan.records[0];
 let result=merge.build(preview,plan,[],{});
 assert.equal(result.equipment[0].processData.accumulation.conveyorSpeedFactorPercent,0);
 record.adjustments={speedFactor:{sourceValue:0,value:23.74,reason:'NON_NEGATIVE_PRODUCT_GAP',acceptedAt:'test'}};
 result=merge.build(preview,plan,[],{});
 assert.equal(result.equipment[0].processData.accumulation.conveyorSpeedFactorPercent,23.74);
 assert.equal(result.equipment[0].processData.speedAndSensors.conveyorSpeedFactorVsDischargeVelocityPercent,23.74);
 assert.equal(result.sourceImport.rows[0].values.conveyorSpeedFactorVsDischargeVelocityPercent,0);
 assert.equal(result.sourceImport.lastApplied.equipment[0].fields.find(f=>f.field==='speedFactor').adjustment.sourceValue,0);
 record.selected.speedFactor=false;result=merge.build(preview,plan,[],{});
 assert(!result.sourceImport.lastApplied.equipment[0].fields.some(f=>f.adjustment));
 record.selected.speedFactor=true;delete record.adjustments.speedFactor;
 assert.equal(merge.build(preview,plan,[],{}).equipment[0].processData.accumulation.conveyorSpeedFactorPercent,0);
 assert.equal(JSON.stringify(preview),original);
});
