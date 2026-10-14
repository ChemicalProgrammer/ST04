import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function fixture(){return JSON.parse(fs.readFileSync('test/fixtures/demo-b-case.json','utf8'));}
test('Demo B preserves photo inputs, missing values and the pitch warning with a fixed test run',()=>{
 const record=fixture();assert.equal(record.name,'Demo B');assert.equal(record.equipment.length,13);assert.equal(record.equipment[0].characteristics.isPacemaker,true);assert.equal(record.equipment[4].nominalRatePerSecond,3);
 assert.equal(record.equipment[11].processData.geometry.lactMm,135870);assert.equal(record.equipment[3].processData.upstream.dischargePitchMm,88.9);assert(record.metadata.importWarnings.some(w=>w.cell==='L13'));
 assert.equal(record.equipment[1].noiseProfile.reliability,undefined);assert.equal(record.simulations[0].dynamicConfig.seed,20261013);assert.equal(record.simulations[0].results,null);
});

test('Demo B test fixture matches the real sheet importer and is absent from the deployed demo flow',()=>{
 const record=fixture(),ctx=vm.createContext({});vm.runInContext(fs.readFileSync('apps-script/SheetImportService.gs','utf8'),ctx);
 const imported=JSON.parse(JSON.stringify(ctx.parseEquipmentSheet_(['','','',5.5,12,'2026-08-02',''],record.metadata.sourceRows,[])));
 assert.deepEqual(imported.equipment,record.equipment);assert.equal(imported.errors.length,0);
 assert(!fs.existsSync('apps-script/DemoBCaseFactory.gs'));
 assert(!fs.readFileSync('apps-script/ClientCases.html','utf8').includes('photo inputs'));
 assert(!fs.readFileSync('apps-script/Main.gs','utf8').includes('createDemoBCaseRequest_'));
});
