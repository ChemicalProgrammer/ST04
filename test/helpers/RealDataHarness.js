import fs from 'node:fs';import {JSDOM} from 'jsdom';
export function setup(){
 const w=new JSDOM(fs.readFileSync('apps-script/RealDataPanel.html','utf8'),{runScripts:'outside-only'}).window;
 for(const name of ['AemComparison','RealDataModel','RealData'])w.eval(fs.readFileSync('apps-script/'+name+'.html','utf8').replace(/^<script>|<\/script>\s*$/g,''));
 return w;
}
export function fixture(){
 const record={id:'real',name:'Día de planta',date:'2026-11-02',source:'DB',status:'MEASURED',durationSeconds:86400,downtimeSeconds:512*60,rateLossSeconds:153*60,referenceSpeedBpm:220,bottlesPerCase:12,reportedProductionUnits:170500,reportedProductionCases:170500/12,reportedEfficiencyPercent:53.8,reportedUpdtPercent:512/1440*100,validation:{line:'G',rateLossBasis:'GROSS'},aem:{businessExternalDowntimeSeconds:0,plantAvailableSeconds:86400,plantDecisionDowntimeSeconds:0,productionAvailableSeconds:86400,goodOutputUnits:170500,scrapSeconds:0,reworkSeconds:0},equipment:[{equipmentId:'f',failureSeconds:15*60,failureCount:3,operatingSeconds:6000,stopClass:'FAILURES',exposureSeconds:86400},{equipmentId:'l',failureSeconds:5*60,failureCount:2,operatingSeconds:6000,stopClass:'FAILURES',exposureSeconds:86400}]};
 const simulation={id:'sim',name:'Caso guardado',dynamicConfig:{},equipment:[{id:'f',name:'Filler <one>',type:'FILLER',noiseProfile:{reliability:{mtbfMinutes:100,mttrMinutes:5}}},{id:'belt',name:'Conveyor',type:'CONVEYOR'},{id:'l',name:'Labeller',type:'LABELLER',noiseProfile:{reliability:{mtbfMinutes:20,mttrMinutes:2}}}]};
 const effective=86400*.6527,run=950*60,loss=86400*.0099;
 const result={durationSeconds:86400,unitOfFlow:'bottles',summary:{outputCount:effective*220/60,lineOeePercent:65.27,lineRunSeconds:run,lineEffectiveRuntimeSeconds:effective,lineRateLossSeconds:loss,lineRateRecoverySeconds:loss-(run-effective),lineNetRateBalanceSeconds:run-effective,lineRateLossBasis:'MEASURED',lineOeePacemakerRatePerSecond:220/60},equipmentMetrics:{f:{runningSeconds:30000,failureCount:5,failureSeconds:1200},l:{runningSeconds:40000,failureCount:10,failureSeconds:600},belt:{runningSeconds:30000,failureCount:0,failureSeconds:0}}};
 return {record,simulation,result};
}
export function mount(w,f=fixture()){
 const owner={id:'case',unitOfFlow:'bottles',metadata:{realData:{schema:'st-real-data-v1',records:[w.STRealData.normalize(f.record)]}}};
 let changes=0;w.STRealData.init({activeCase:owner},{changed(){changes++;}});w.STRealData.render(owner,{...f.simulation,results:f.result});
 return {owner,changes:()=>changes};
}
export const row=(d,id)=>d.rows.find(r=>r.id===id);
export const calibration=(d,id)=>d.calibration.rows.find(r=>r.id===id).value;
