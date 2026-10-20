import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime={window:{}};vm.createContext(runtime);vm.runInContext(fs.readFileSync(new URL('../apps-script/RealData.html',import.meta.url),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,''),runtime);
const api=runtime.window.STRealData;
const observation=(edit={})=>({name:'Observed day',date:'2026-10-19',source:'Production report',status:'MEASURED',durationSeconds:86400,production:150480,productionUnit:'BOTTLES',referenceSpeedBpm:300,...edit});
const equipment=[{id:'filler',name:'Filler',noiseProfile:{reliability:{mtbfMinutes:100,mttrMinutes:5}}}];
const simulation={id:'sim',name:'Baseline',equipment,dynamicConfig:{}};
const result={durationSeconds:86400,unitOfFlow:'bottles',engineId:'ST_CURRENT',seed:1,summary:{outputCount:999999,lineOeePercent:99},batch:{representativeRound:2,rows:[{round:1,seed:1,summary:{outputCount:100000,lineOeePercent:100000/432000*100},equipmentMetrics:{filler:{failureCount:3,failureSeconds:1200}}},{round:2,seed:2,summary:{outputCount:140000,lineOeePercent:140000/432000*100},equipmentMetrics:{filler:{failureCount:5,failureSeconds:2400}}}]}};
const find=(d,name)=>d.rows.find(r=>r.metric===name);
test('real comparisons use every saved round, not the top-level first-round summary',()=>{
 const d=api.compare(observation(),simulation,result,'average');
 assert.equal(d.run.output,120000);assert.equal(d.run.statistics.n,2);assert.equal(find(d,'Production').simulated,120000);assert.equal(find(d,'Production').delta,-30480);assert.equal(d.run.statistics.standardDeviation,Math.sqrt(800000000));
 const r=api.compare(observation(),simulation,result,'representative');assert.equal(r.run.output,140000);assert.equal(r.run.seed,2);assert.equal(r.run.view,'Round 2');
});
test('cases normalize explicitly, common-reference efficiency uses the same denominator',()=>{
 const d=api.compare(observation({production:12540,productionUnit:'CASES',bottlesPerCase:12}),simulation,result,'average');
 assert.equal(find(d,'Production').real,150480);assert.equal(find(d,'Efficiency at common reference').real,150480/432000*100);assert.equal(find(d,'Efficiency at common reference').simulated,120000/432000*100);
 const missing=api.compare(observation({production:12540,productionUnit:'CASES'}),simulation,result,'average');assert.equal(find(missing,'Production').delta,null);
});
test('different durations suppress production deltas while rate comparisons retain explicit periods',()=>{
 const d=api.compare(observation({durationSeconds:43200}),simulation,result,'average');
 assert.equal(find(d,'Production').delta,null);assert.equal(find(d,'Efficiency at common reference').delta,null);assert.equal(find(d,'Average throughput').comparable,true);assert(d.warnings.some(w=>w.includes('durations differ')));
});
test('zero and unknown values are distinct; line downtime and reported AU are never matched to equipment aggregates',()=>{
 const d=api.compare(observation({production:0,reportedEfficiencyPercent:44.09,downtimeSeconds:636*60}),simulation,result,'average');
 assert.equal(find(d,'Production').delta,120000);assert.equal(find(d,'Production').relativePercent,null);assert.equal(find(d,'Line downtime').simulated,null);assert.equal(find(d,'Reported AU / efficiency').simulated,null);
 const unknown=api.compare(observation({production:null}),simulation,result,'average');assert.equal(find(unknown,'Production').real,null);assert.equal(find(unknown,'Production').delta,null);
});
test('equipment failure comparison requires the same exposure and failure definition',()=>{
 const base={equipmentId:'filler',failureCount:4,failureSeconds:1800,exposureSeconds:86400,mtbfMinutes:100,mttrMinutes:5};
 for(const stopClass of ['MINOR','UNKNOWN','ALL']){const d=api.compare(observation({equipment:[{...base,stopClass}]}),simulation,result,'average');assert.equal(d.equipmentRows[0].delta,null);}
 const d=api.compare(observation({equipment:[{...base,stopClass:'FAILURES'}]}),simulation,result,'average');assert.equal(d.equipmentRows[0].delta,0);assert.equal(d.equipmentRows[1].delta,0);assert.equal(d.equipmentRows[2].comparable,false);
 const mismatch=api.compare(observation({equipment:[{...base,stopClass:'FAILURES',exposureSeconds:7200}]}),simulation,result,'average');assert.equal(mismatch.equipmentRows[0].delta,null);
});
test('archived Caso C imports its source values without inferring unconfirmed speed or equipment identity',()=>{
 const [r]=api.importRecords({titulo:'Caso C',fecha_produccion:null,procedencia:'Photos',tiempos_dia:{unidad:'min','Total Time':1440,Downtime:636,'Run Time':804,'AU / Effective Runtime':684,UPDT:756,'Rate Loss Minutes':119},produccion_formato:{datos_marcados_confirmados_en_tabla:{botellas_por_caja:12},derivados:{botellas_por_dia:{valor:150480}}},valores_graficas:[{concepto:'AU%',valor:44.09}]});
 assert.equal(r.production,150480);assert.equal(r.durationSeconds,86400);assert.equal(r.downtimeSeconds,38160);assert.equal(r.date,'');assert.equal(r.referenceSpeedBpm,null);assert.equal(r.equipment.length,0);assert.equal(r.reportedEfficiencyPercent,44.09);
 const d=api.compare(r,simulation,result,'average');assert(d.warnings.some(w=>w.includes('differs from rate loss')));
});
test('malformed observations fail before import and HTML reports escape user content',()=>{
 for(const edit of [{production:-1},{durationSeconds:0},{production:'150480'},{bottlesPerCase:12.5},{status:'VALIDATED'},{qualityPercent:101}])assert.throws(()=>api.normalize(observation(edit)));
 assert.throws(()=>api.importRecords({schema:'wrong',records:[]}));
 const d=api.compare(observation({name:'<script>alert(1)</script>',source:'<img onerror=alert(1)>'}),simulation,result,'average');const html=api.reportHtml(d);assert(!html.includes('<script>'));assert(!html.includes('<img onerror'));assert(html.includes('&lt;script&gt;'));assert(html.includes('sample')||html.includes('standardDeviation'));
});
test('stale signatures disable deltas; provisional and interrupted batches are not valid comparisons',()=>{
 runtime.SimulatorEngine=runtime.window.SimulatorEngine={inputSignature:()=> 'current'};
 const d=api.compare(observation(),simulation,{...result,inputSignature:'saved'},'average',{unitOfFlow:'bottles'});assert.equal(find(d,'Production').delta,null);assert(d.warnings.some(w=>w.includes('do not match')));
 assert.equal(api.snapshot({...result,provisional:true},'average'),null);assert.equal(api.snapshot({...result,replicationStatus:{state:'INTERRUPTED'}},'average'),null);
 delete runtime.window.SimulatorEngine;delete runtime.SimulatorEngine;
});
test('legacy statistics-only batches retain means instead of the first-round summary',()=>{
 const legacy={...result,batch:{statistics:{outputCount:{n:5,mean:120000,standardDeviation:10000,min:110000,max:130000},lineOeePercent:{n:5,mean:27.7777777778}},equipmentStatistics:{filler:{failureCount:{mean:4},failureSeconds:{mean:1800}}}}};
 const d=api.compare(observation(),simulation,legacy,'average');assert.equal(find(d,'Production').simulated,120000);assert.equal(d.run.statistics.n,5);assert.equal(d.run.equipment.filler.failureCount,4);
});
test('complete templates include every supported field, live equipment IDs and importable blank observations',()=>{
 const models=[{id:'filler',name:'Filler',type:'FILLER'},{id:'transfer',name:'Transfer conveyor',type:'CONVEYOR'}];
 const payload=api.template(models),r=payload.records[0];assert.deepEqual(Object.keys(r).sort(),Object.keys(payload._guide.recordFields).sort());assert.equal(r.sourceSnapshot,'');
 for(const key of ['downtimeSeconds','runTimeSeconds','effectiveRuntimeSeconds','updtSeconds','rateLossSeconds'])assert.equal(r[key],null);
 assert.equal(r.equipment.length,2);assert.equal(r.equipment[1].equipmentId,'transfer');assert.equal(r.equipment[1].exposureSeconds,null);
 assert.deepEqual(Object.keys(r.equipment[0]).sort(),Object.keys(payload._guide.equipmentFields).sort());
 const imported=api.importRecords(JSON.parse(JSON.stringify(payload)));assert.equal(imported.length,1);assert.equal(imported[0].equipment.length,2);assert.equal(imported[0].equipment[0].failureCount,null);assert.equal(imported[0].equipment[0].notes,'');assert.equal(imported[0].production,null);
 const edited=JSON.parse(JSON.stringify(payload));edited.records[0].equipment[0].notes='A sensor was replaced';edited.records[0].equipment[0].failureCount=0;assert.equal(api.importRecords(edited)[0].equipment[0].notes,'A sensor was replaced');assert.equal(api.importRecords(edited)[0].equipment[0].failureCount,0);
 assert.equal(api.importRecords(api.template([]))[0].equipment[0].equipmentId,'replace-with-equipment-id');
});
test('equipment notes and IDs validate without silently accepting duplicate measurements',()=>{
 const row={equipmentId:'filler',notes:'Observed by operator'};
 assert.throws(()=>api.normalize(observation({equipment:[row,row]})),/unique/);assert.throws(()=>api.normalize(observation({equipment:[{equipmentId:''}]})),/equipmentId/);assert.throws(()=>api.normalize(observation({equipment:[{...row,notes:123}]})),/notes/);
});
test('line times use final output and common reference, average every round, and require confirmed definitions',()=>{
 const timed=structuredClone(result);
 timed.batch.rows[0].equipmentMetrics.filler.runningSeconds=60000;
 timed.batch.rows[1].equipmentMetrics.filler.runningSeconds=72000;
 const real=observation({referenceSpeedBpm:220,runTimeSeconds:66000,downtimeSeconds:20400,effectiveRuntimeSeconds:150480/220*60,updtSeconds:86400-150480/220*60,rateLossSeconds:66000-150480/220*60});
 const pending=api.compare(real,simulation,timed,'average');
 assert.equal(find(pending,'Line run time').simulated,1100);
 assert.equal(find(pending,'Line downtime').simulated,340);
 assert.equal(find(pending,'Effective runtime').simulated,120000/220);
 assert.equal(find(pending,'Line downtime').delta,null);
 const matched=api.compare({...real,lineTimeBasis:'OUTPUT_FLOW'},simulation,timed,'average');
 assert.equal(find(matched,'Line run time').delta,0);
 assert.equal(find(matched,'Effective runtime').comparable,true);
 assert.equal(find(matched,'UPDT').simulated,1440-120000/220);
 assert.equal(find(matched,'Rate loss equivalent').simulated,1100-120000/220);
 const one=api.compare({...real,lineTimeBasis:'OUTPUT_FLOW'},simulation,timed,'representative');
 assert.equal(find(one,'Line run time').simulated,1200);
 const old=api.compare({...real,lineTimeBasis:'OUTPUT_FLOW'},simulation,result,'average');
 assert.equal(find(old,'Line downtime').simulated,null);
 assert.equal(find(old,'Effective runtime').comparable,true);
 const invalid=api.compare({...real,lineTimeBasis:'OUTPUT_FLOW',referenceSpeedBpm:1},simulation,timed,'average');
 assert.equal(find(invalid,'Effective runtime').comparable,false);
 const mismatch=api.compare({...real,lineTimeBasis:'OUTPUT_FLOW',durationSeconds:43200},simulation,timed,'average');
 assert.equal(find(mismatch,'Line downtime').comparable,false);
});
