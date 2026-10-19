import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as catalog from '../src/simulation/FormatCatalog.js';
import {applyProductProfile,validateProductSetup} from '../src/simulation/ProductProfiles.js';
import {validateSimulationInput} from '../src/simulation/SimulationValidation.js';
import {simulateLine} from '../src/simulation/LineSimulationEngine.js';
import {packingSheetFixture} from './fixtures/sheet-packing-case.js';
const c={window:{SimulatorEngine:catalog}};vm.createContext(c);
for(const name of ['TextResources.gs','ApiResponse.gs','CaseService.gs','SheetImportService.gs','SheetImportMerge.html'])vm.runInContext(fs.readFileSync('apps-script/'+name,'utf8').replace(/<\/?script>/g,''),c);
c.STSheetImportMerge=c.window.STSheetImportMerge;
const merge=c.window.STSheetImportMerge,packing=c.window.STSheetPackingImport,plain=x=>JSON.parse(JSON.stringify(x));
function preview(){const f=packingSheetFixture();return plain({...c.parseEquipmentSheet_(f.metadata,f.rows,[], 'plant-sheet-v2'),source:{spreadsheetId:'packing-sheet',sheetId:0,sheetName:'Line'}});}
function prepare(data=preview(),snapshot={equipment:[],metadata:{},sourceImport:{}}){const plan=merge.create(data,snapshot.equipment,snapshot.sourceImport),base=merge.build(data,plan,snapshot.equipment,snapshot.sourceImport),draft=packing.create(base,snapshot);draft.sourceRateBasis='BOTTLES';return {data,snapshot,plan,base,draft,apply:()=>packing.apply(base,draft,snapshot,plan)};}
test('packing proposal resolves selected line units, dimensions and native speeds without changing installation or source',()=>{
 const h=prepare(),before=plain(h.data),result=h.apply();assert.deepEqual(plain(result.errors),[]);assert(h.draft.enabled);assert.equal(result.initialFormatId,h.draft.formatId);
 assert.deepEqual(plain(result.equipment.map(e=>e.processData.flowUnits)),[{input:'BOTTLES',output:'BOTTLES'},{input:'BOTTLES',output:'BOTTLES'},{input:'BOTTLES',output:'CASES'},{input:'CASES',output:'CASES'},{input:'CASES',output:'CASES'}]);
 const product=result.formatCatalog.products[0],format=result.formatCatalog.formats[0];assert.equal(product.bottle.lengthMm,60);assert.equal(product.volumeMl,700);assert.equal(format.case.lengthMm,310);assert.equal(format.bottlesPerCase,12);assert.equal(format.productId,product.id);
 assert.equal(result.equipment[2].nominalRatePerSecond,25/60);assert.equal(result.equipment[4].processData.equipment.maximumSpeedBpm,25);assert.equal(format.equipment[result.equipment[2].id].ratePerMinute,undefined);assert.equal(product.equipment[result.equipment[1].id].movingGapMm,20);assert.equal(format.equipment[result.equipment[3].id].movingGapMm,0);
 assert.deepEqual(plain(result.equipment[3].processData.geometry),plain(h.base.equipment[3].processData.geometry));assert.equal(result.equipment[3].processData.accumulation.conveyorSpeedMmPerSecond,h.base.equipment[3].processData.accumulation.conveyorSpeedMmPerSecond);assert.deepEqual(plain(result.equipment[2].noiseProfile),plain(h.base.equipment[2].noiseProfile));assert.deepEqual(h.data,before);assert.equal(h.snapshot.equipment.length,0);
 const resolved=catalog.resolvePackingFormats(plain(result.formatCatalog)),run={durationSeconds:60,tickSeconds:.1,sampleIntervalSeconds:1,seed:1,initialFormatId:result.initialFormatId,initialProductId:result.initialFormatId,productCatalog:resolved};
 assert.equal(validateProductSetup({case:{equipment:plain(result.equipment)},run}).length,1);const validation=validateSimulationInput({case:{equipment:plain(result.equipment)},run});assert(validation.ok,JSON.stringify(validation));
 const simulation=simulateLine({case:{id:'packing-test',equipment:plain(result.equipment)},run});assert(simulation.ok,JSON.stringify(simulation.error));assert(simulation.result.summary.outputCount>0);assert.equal(simulation.result.products.rows[0].outputUnit,'CASES');
 const profiled=applyProductProfile(plain(result.equipment),resolved[0]);assert.equal(profiled[3].processData.upstream.packageLengthMm,310);assert.equal(profiled[3].processData.accumulation.conveyorSpeedMmPerSecond,result.equipment[3].processData.accumulation.conveyorSpeedMmPerSecond);
});
test('missing pack count, ambiguous or excluded packer and invalid gaps require review; disabling preserves ordinary import',()=>{
 const data=preview();delete data.metadata.bottlesPerCase;let h=prepare(data);assert(h.apply().errors.some(e=>e.includes('bottles per case')));h.draft.bottlesPerCase=12;assert.equal(h.apply().errors.length,0);
 h.draft.enabled=false;assert.strictEqual(h.apply(),h.base);
 h=prepare();h.plan.records[2].target='skip';h.base=merge.build(h.data,h.plan,[],{});assert(packing.apply(h.base,h.draft,h.snapshot,h.plan).errors.some(e=>e.includes('Choose a Case Packer')));
 const multiple=preview();multiple.equipment[4].name='Second Case Packer';multiple.equipment[4].type='CASE_PACKER';h=prepare(multiple);assert.equal(h.draft.enabled,false);assert.equal(h.draft.packerId,'');h.draft.enabled=true;assert(h.apply().errors.some(e=>e.includes('Choose a Case Packer')));
 h=prepare();h.draft.bottleLengthMm=81;assert(h.apply().errors.some(e=>e.includes('negative')));
});
test('native output speeds remain native; inconsistent package lengths are not invented',()=>{
 const h=prepare();h.draft.sourceRateBasis='NATIVE';const result=h.apply();assert.equal(result.equipment[2].nominalRatePerSecond,5);assert.equal(result.equipment[4].processData.equipment.maximumSpeedBpm,300);
 const data=preview(),second=plain(data.equipment[1]);second.id='another-belt';second.name='Other bottle belt';second.characteristics.sourceSheetRow=15;second.processData.upstream.packageLengthMm=65;data.equipment.splice(2,0,second);const inconsistent=prepare(data);assert.equal(inconsistent.draft.bottleLengthMm,undefined);const out=inconsistent.apply();assert.equal(out.formatCatalog.products[0].bottle.lengthMm,undefined);assert(out.packingWarnings.some(w=>w.includes('no common bottles length')));
});
test('reload preserves native rates, target changes reset translation and no duplicate catalog is proposed by default',()=>{
 const first=prepare().apply(),snapshot={equipment:plain(first.equipment),metadata:{formatCatalog:plain(first.formatCatalog)},sourceImport:plain(first.sourceImport),initialFormatId:first.initialFormatId};
 let h=prepare(preview(),snapshot);assert.equal(h.draft.enabled,false);assert.equal(h.plan.records[2].selected.nominalSpeed,false);assert.equal(h.plan.records[4].selected.maxSpeed,false);assert.equal(h.apply().equipment[2].nominalRatePerSecond,25/60);
 const changed=preview();changed.equipment[2].nominalRatePerSecond=6;changed.equipment[2].processData.equipment.maximumSpeedBpm=360;h=prepare(changed,snapshot);const reload=h.apply();assert.equal(applyProductProfile(plain(reload.equipment),catalog.resolvePackingFormats(plain(snapshot.metadata.formatCatalog))[0])[2].nominalRatePerSecond,.5);assert.equal(reload.equipment[2].nominalRatePerSecond,.5);assert.equal(reload.equipment[2].processData.equipment.maximumSpeedBpm,30);
 h.draft.enabled=true;const additional=h.apply();assert.equal(additional.equipment[2].nominalRatePerSecond,.5);assert.equal(additional.formatCatalog.formats.length,2);assert.deepEqual(plain(additional.formatCatalog.formats[0]),snapshot.metadata.formatCatalog.formats[0]);
 h.plan.records[2].target='new';merge.defaults(h.data,h.plan.records[2],snapshot.equipment);assert.equal(h.plan.records[2].rateDivisor,undefined);
});
test('initial format applies product bottles upstream and case profiles downstream; inventory starts empty',()=>{
 const result=prepare().apply(),format=catalog.resolvePackingFormats(plain(result.formatCatalog))[0],equipment=applyProductProfile(plain(result.equipment),format);assert.equal(equipment[1].processData.upstream.packageLengthMm,60);assert.equal(equipment[3].processData.upstream.packageLengthMm,310);assert.equal(equipment[2].processData.productInputRatePerSecond,5);
 assert.equal(equipment[1].initialInventory,undefined);assert.equal(equipment[3].initialInventory,undefined);
});

test('a new worksheet requires an explicit speed-basis choice before applying packing',()=>{
 const h=prepare(),unreviewed=packing.create(h.base,h.snapshot);assert.equal(unreviewed.sourceRateBasis,'');assert(packing.apply(h.base,unreviewed,h.snapshot,h.plan).errors.some(e=>e.includes('speed basis')));
});
