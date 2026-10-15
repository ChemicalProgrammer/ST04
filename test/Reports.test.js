import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=f=>fs.readFileSync('apps-script/'+f,'utf8');
function setup(){
 const dom=new JSDOM(read('ReportStyles.html')+read('ReportTemplates.html')+read('ReportResultsTemplate.html')+read('ReportWhatifTemplate.html')+read('ReportConfigurationTemplate.html')+read('ReportComparisonTemplate.html')+['export-results-pdf','export-whatif-json','export-whatif-pdf','export-comparison-json','export-comparison-html','export-comparison-pdf'].map(id=>'<button id="'+id+'"></button>').join(''),{runScripts:'outside-only',url:'https://st.test'}),w=dom.window;
 w.eval(read('TextResources.gs'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const file of ['SimulationEngine.html','WhatIf.html','Comparison.html','Markdown.html','PlantCalendar.html','Reports.html'])w.eval(read(file).replace(/^<script>|<\/script>\s*$/g,''));
 w.eval(read('DemoCaseFactory.gs'));const c=w.createDemoCaseRequest_();c.name='Synthetic line';
 const sim={id:'a',name:'Simulation A',equipment:c.equipment,dynamicConfig:{seed:17,commands:[]}};
 const result={seed:17,durationSeconds:60,unitOfFlow:'bottles',summary:{outputCount:120,lineOeePercent:80},equipmentMetrics:{},samples:[{privateRaw:'raw-not-for-export'}],events:[{privateEvent:'events-not-for-export'}]};
 return {dom,w,c,sim,result};
}
test('compact AI export excludes replay, preserves aggregates and enforces its stated budget with explicit coverage',()=>{
 const h=setup();try{
  const text=h.w.STReports.analysis(h.result,h.c,h.sim),data=JSON.parse(text);
  assert(text.length<=64000);assert.equal(data.throughputPerMinute,120);assert.equal(data.simulation.seed,17);assert.equal(data.coverage.includedEquipment,13);assert(!text.includes('raw-not-for-export'));assert(!text.includes('events-not-for-export'));
  h.sim.equipment=Array.from({length:600},(_,i)=>({id:'machine-'+i,name:'M'.repeat(150),type:'CUSTOM',nominalRatePerSecond:5,processData:{description:'x'.repeat(10000)}}));
  const large=h.w.STReports.analysis(h.result,h.c,h.sim),bounded=JSON.parse(large);assert(large.length<=64000);assert(bounded.coverage.omittedEquipment>0);assert.equal(bounded.coverage.totalEquipment,600);assert.equal(bounded.coverage.omittedEquipment+bounded.coverage.includedEquipment,600);
 }finally{h.dom.window.close();}
});
test('standalone HTML reports escape input, explain before/after edits and omit evidence-free placeholders',()=>{
 const h=setup();try{
  h.c.name='<img src=x onerror=alert(1)>';const html=h.w.STReports.resultsHtml(h.result,h.c,h.sim),doc=new JSDOM(html);
  assert.equal(doc.window.document.querySelectorAll('script,img').length,0);assert(doc.window.document.body.textContent.includes(h.c.name));assert(html.includes('@page'));assert(html.includes('120'));
  const plan=h.w.STScenarios.plan(h.sim),report=h.w.STReports.whatIfHtml(h.sim,plan);assert(report.includes('Current'));assert(report.includes('Proposed'));assert(report.includes('In Line Setup'));assert(!report.includes('No supported scenario'));
  assert(h.w.STWhatIf.visibleProjects(plan).every(p=>p.changes.length));doc.window.close();
 }finally{h.dom.window.close();}
});
test('PDF export writes the same standalone report into a printable window and handles blocked popups',()=>{
 const h=setup();try{
  let written='',printed=false,notice='';h.w.open=()=>({document:{open(){},write(text){written=text;},close(){}},focus(){},setTimeout(fn){fn();},print(){printed=true;}});
  h.w.STReports.bindResults(h.result,h.c,h.sim);h.w.document.getElementById('export-results-pdf').click();assert(printed);assert(written.includes('Simulation results'));
  printed=false;const plan=h.w.STScenarios.plan(h.sim);h.w.STReports.bindWhatIf(h.sim,plan,h.w.STWhatIf.visibleProjects(plan));h.w.document.getElementById('export-whatif-pdf').click();assert(printed);assert(written.includes('What-If proposals'));
  h.w.open=()=>null;h.w.STDialog={open:options=>{notice=options.message;}};h.w.document.getElementById('export-results-pdf').click();assert.match(notice,/Save as PDF/);
 }finally{h.dom.window.close();}
});
test('theme dictionary alone controls palette entries, fallback and both modes',()=>{
 const dom=new JSDOM('<div id="accent-palette"></div>',{runScripts:'outside-only',url:'https://st.test'}),w=dom.window;
 try{
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.STIcons={svg:()=>''};w.eval(read('ThemeResources.html').replace(/^<script>|<\/script>\s*$/g,''));
  delete w.STThemeResources.palettes['amparo-blue'];w.STThemeResources.palettes.custom={light:{accent:'#123456',soft:'#eeeeee',onAccent:'#ffffff'},dark:{accent:'#aabbcc',soft:'#112233',onAccent:'#000000'}};
  w.eval(read('UiPreferences.html').replace(/^<script>|<\/script>\s*$/g,''));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.STPreferences.setTheme('light');
  assert(!w.document.querySelector('[data-accent="amparo-blue"]'));w.document.querySelector('[data-accent="custom"]').click();assert.equal(w.document.documentElement.style.getPropertyValue('--accent'),'#123456');w.STPreferences.setTheme('dark');assert.equal(w.document.documentElement.style.getPropertyValue('--accent'),'#aabbcc');
 }finally{w.close();}
});

test('configuration exports retain all selected inputs and exclude other runs and results',()=>{
 const h=setup();try{
  h.sim.results=h.result;h.sim.dynamicConfig.commands=[{equipmentId:'a',action:'STOP',atSeconds:15}];
  h.sim.equipment[0].characteristics={custom:[1,2,3]};h.c.simulations=[h.sim,{id:'unselected'}];
  const data=h.w.STReports.configuration(h.c,h.sim),json=JSON.stringify(data);
  assert.equal(data.simulation.equipment.length,13);assert.equal(data.simulation.dynamicConfig.commands.length,1);
  assert(json.includes('[1,2,3]'));assert(!json.includes('unselected'));assert(!json.includes('raw-not-for-export'));
  h.sim.equipment[0].name='<script>unsafe</script>';const html=h.w.STReports.configurationHtml(data),doc=new JSDOM(html);
  assert.equal(doc.window.document.querySelectorAll('script').length,0);
  assert.deepEqual(JSON.parse(doc.window.document.querySelector('pre').textContent),JSON.parse(JSON.stringify(data)));doc.window.close();
 }finally{h.dom.window.close();}
});

test('report layouts inherit dark theme and primary accent and can be edited independently',()=>{
 const h=setup();try{
  h.w.document.documentElement.dataset.theme='dark';h.w.document.documentElement.style.setProperty('--accent','#abcdef');h.w.document.documentElement.style.setProperty('--page','#121212');
  h.w.document.getElementById('report-configuration-template').content.querySelector('article').setAttribute('data-custom-layout','yes');
  const html=h.w.STReports.configurationHtml(h.w.STReports.configuration(h.c,h.sim));
  assert(html.includes('--report-accent:#abcdef'));assert(html.includes('--report-page:#121212'));assert(html.includes('color-scheme:dark'));assert(html.includes('data-custom-layout="yes"'));
  assert(!h.w.STReports.resultsHtml(h.result,h.c,h.sim).includes('data-custom-layout'));
 }finally{h.dom.window.close();}
});

test('comparison export includes both selected runs and all replication summaries but excludes replay',()=>{
 const h=setup();try{
  const left={...h.sim,results:{...h.result,batch:{rounds:2,statistics:{outputCount:{mean:122,standardDeviation:2,min:120,max:124}},rows:[{seed:17,summary:{outputCount:120},shifts:[{outputCount:120}]},{seed:18,summary:{outputCount:124},shifts:[{outputCount:124}]}]},replay:{samples:[{secret:'replay-only'}],events:[]}}};
  const right={...left,id:'b',name:'Proposed <script>alert(1)</script>',equipment:h.sim.equipment.map((e,i)=>i?e:{...e,nominalRatePerSecond:99}),results:{...left.results,summary:{outputCount:140,lineOeePercent:91},batch:{...left.results.batch,statistics:{outputCount:{mean:142,standardDeviation:2,min:140,max:144}}}}};
  const data=h.w.STReports.comparisonData({...h.c,simulations:[left,right,{id:'third',name:'Other'}]},left,right),json=JSON.stringify(data);
  assert.equal(data.schema,'st-comparison-v1');assert.equal(data.comparability,'PAIRED_INPUTS');assert.equal(data.baseline.results.batch.rows.length,2);assert.equal(data.proposed.results.batch.statistics.outputCount.mean,142);
  assert.equal(data.proposed.equipment[0].nominalRatePerSecond,99);assert(!json.includes('replay-only'));assert(!json.includes('privateEvent'));assert(!json.includes('Other'));
  const html=h.w.STReports.comparisonHtml(data),doc=new JSDOM(html);
  assert.equal(doc.window.document.querySelectorAll('script').length,0);assert(doc.window.document.body.textContent.includes(right.name));assert(doc.window.document.body.textContent.includes('Speed (BPM)'));
  assert(doc.window.document.body.textContent.includes('142'));assert(html.includes('@page'));doc.window.close();
  h.w.STReports.bindComparison(h.c,left,left);assert(h.w.document.getElementById('export-comparison-json').disabled);
  h.w.STReports.bindComparison(h.c,left,right);assert(!h.w.document.getElementById('export-comparison-json').disabled);
  let printed='';h.w.open=()=>({document:{open(){},write(s){printed=s;},close(){}},focus(){},setTimeout(fn){fn();},print(){}});
  h.w.document.getElementById('export-comparison-pdf').click();assert(printed.includes('142'));
 }finally{h.dom.window.close();}
});

test('What-If JSON follows visible proposals and includes baseline evidence and engineering checks',()=>{
 const h=setup();try{
  h.sim.results={...h.result,batch:{rounds:2,statistics:{outputCount:{mean:123}},rows:[{seed:17},{seed:18}]}};
  const plan=h.w.STScenarios.plan(h.sim),data=h.w.STReports.whatIfData(h.sim,plan),json=JSON.stringify(data);
  assert.equal(data.schema,'st-what-if-v1');assert.equal(data.baseline.summary.outputCount,120);
  assert.equal(data.baseline.batch.rounds,2);assert.equal(data.projects.length,h.w.STWhatIf.visibleProjects(plan).length);assert.equal(data.checks.length,plan.checks.length);
  assert(data.limitations.some(s=>s.includes('round 1')));assert(!json.includes('privateRaw'));assert(!json.includes('privateEvent'));
  h.w.STReports.bindWhatIf(h.sim,plan,data.projects);assert(!h.w.document.getElementById('export-whatif-json').disabled);
 }finally{h.dom.window.close();}
});

test('scenario targets round display only and Basic exports the independent result with changed variables',()=>{
 const h=setup();try{
  const change={equipmentId:h.sim.equipment[0].id,path:'nominalRatePerSecond',before:12,after:14.123456789};
  const entry={title:'Best evaluated scenario',status:'REPRODUCED',unitOfFlow:'bottles',evaluatedChanges:[change],baseline:{oee:60,throughput:100},candidate:{oee:99,throughput:180},independentCheck:{baseline:{oee:61,throughput:101},candidate:{oee:72.123456789,throughput:120},rounds:3,passed:true}};
  h.w.STScenarioExplorer={evaluations:()=>[entry]};
  const info=h.w.STWhatIf.changeInfo(change,h.sim.equipment);assert.equal(info.before,'12 units/s');assert.equal(info.after,'14.12 units/s');assert.equal(change.after,14.123456789);
  h.w.document.documentElement.dataset.uiMode='basic';const plan=h.w.STScenarios.plan(h.sim),doc=new JSDOM(h.w.STReports.whatIfHtml(h.sim,plan)),text=doc.window.document.body.textContent;
  assert(text.includes('Best evaluated scenario'));assert(text.includes('72.1235'));assert(text.includes('14.12 units/s'));assert(!text.includes('14.123456789'));assert(!text.includes('Evaluation setting'));assert.equal(doc.window.document.querySelector('[data-report=checks]'),null);doc.window.close();
  const json=h.w.STReports.whatIfData(h.sim,plan);assert.equal(json.evaluations[0].evaluatedChanges[0].after,14.123456789);assert.equal(json.evaluations[0].independentCheck.candidate.oee,72.123456789);
  h.w.STScenarioExplorer={evaluations:()=>[{title:entry.title,status:'NOT_EVALUATED',lastResult:entry}]};const prior=h.w.STReports.whatIfHtml(h.sim,plan);assert(prior.includes('Previous evaluation'));assert(prior.includes('14.12 units/s'));
 }finally{h.dom.window.close();}
});

test('What-If exports incomplete DOE evidence as incomplete without inventing effects',()=>{
 const h=setup();try{
  h.w.STScenarioExplorer={evaluations:()=>[{title:'Interrupted DOE <test>',tier:'ZERO',status:'ERROR',updatedAt:'2026-10-04',run:{seed:17,rounds:3},unitOfFlow:'units',doe:{type:'FULL_FACTORIAL_TWO_LEVEL',factors:[],fixedChanges:[],observations:[],roundsPerCombination:3}}]};
  const plan=h.w.STScenarios.plan(h.sim),html=h.w.STReports.whatIfHtml(h.sim,plan);
  assert.match(html,/Incomplete design/);assert.match(html,/Interrupted DOE &lt;test&gt;/);assert.equal(h.w.STReports.whatIfData(h.sim,plan).evaluations[0].status,'ERROR');
 }finally{h.dom.window.close();}
});

test('Basic PDF uses simplified inputs and mean result KPIs; Advance retains technical detail and JSON',()=>{
 const h=setup();try{
  h.sim.equipment[0].characteristics={...h.sim.equipment[0].characteristics,privateTechnical:'internal-only'};
  h.sim.dynamicConfig.durationSeconds=60;h.result.summary.totalStarvedSeconds=123;
  h.result.batch={rounds:2,statistics:{outputCount:{mean:110},throughputPerMinute:{mean:110},lineOeePercent:{mean:75}},rows:[{round:1,seed:17,shifts:[{shift:1,outputCount:120}]}]};
  h.w.document.documentElement.dataset.uiMode='basic';
  let doc=new JSDOM(h.w.STReports.configurationHtml(h.w.STReports.configuration(h.c,h.sim)));
  assert.equal(doc.window.document.documentElement.dataset.uiMode,'basic');assert.equal(doc.window.document.querySelector('pre'),null);assert(!doc.window.document.body.textContent.includes('internal-only'));assert(doc.window.document.body.textContent.includes('Speed (BPM)'));assert(!doc.window.document.body.textContent.includes('blowmolder-1'));doc.window.close();
  doc=new JSDOM(h.w.STReports.resultsHtml(h.result,h.c,h.sim));let text=doc.window.document.body.textContent;
  assert(text.includes('75'));assert(text.includes('110'));assert(text.includes('Mean of 2 rounds'));assert(!text.includes('total Starved Seconds'));assert.equal(doc.window.document.querySelector('[data-report=equipment]').textContent,'');assert.equal(doc.window.document.querySelector('[data-report=batch]').textContent,'');doc.window.close();
  let written,printed=false;h.w.open=()=>({document:{open(){},write(html){written=html;},close(){}},focus(){},setTimeout(fn){fn();},print(){printed=true;}});h.w.STReports.bindResults(h.result,h.c,h.sim);h.w.document.getElementById('export-results-pdf').click();assert(printed);assert.equal(new JSDOM(written).window.document.documentElement.dataset.uiMode,'basic');
  h.w.document.documentElement.dataset.uiMode='advance';doc=new JSDOM(h.w.STReports.configurationHtml(h.w.STReports.configuration(h.c,h.sim)));assert(doc.window.document.querySelector('pre'));assert(doc.window.document.body.textContent.includes('internal-only'));doc.window.close();
  doc=new JSDOM(h.w.STReports.resultsHtml(h.result,h.c,h.sim));assert(doc.window.document.body.textContent.includes('total Starved Seconds'));assert(doc.window.document.querySelector('[data-report=batch]').textContent.length>0);doc.window.close();
 }finally{h.dom.window.close();}
});

test('Basic What-If and comparison documents omit technical checks, raw configuration and internal identifiers',()=>{
 const h=setup();try{
  h.w.document.documentElement.dataset.uiMode='basic';
  const plan=h.w.STScenarios.plan(h.sim);let doc=new JSDOM(h.w.STReports.whatIfHtml(h.sim,plan));assert.equal(doc.window.document.querySelector('[data-report=checks]'),null);assert(!doc.window.document.body.textContent.includes('Calculated hypothesis evaluations'));doc.window.close();
  const left={...h.sim,results:h.result},right={...h.sim,id:'b',name:'Simulation B',results:{...h.result,summary:{outputCount:130,lineOeePercent:82}}};
  doc=new JSDOM(h.w.STReports.comparisonHtml(h.w.STReports.comparisonData(h.c,left,right)));assert(doc.window.document.body.textContent.includes('130'));assert.equal(doc.window.document.querySelector('[data-report=equipment]'),null);assert.equal(doc.window.document.querySelector('[data-report=batch]'),null);assert(!doc.window.document.body.textContent.includes('blowmolder-1'));doc.window.close();
 }finally{h.dom.window.close();}
});



test('chat exports contain only conversation messages and safely render the PDF transcript',()=>{
 const h=setup();try{
  const messages=[{role:'user',text:'Pregunta ágil <script>unsafe</script>',createdAt:'2026-10-13T06:00:00Z',scope:'GENERAL',apiKey:'PRIVATE_KEY'}, {role:'model',text:'**Respuesta**\n\n- Un cambio\n- Otra opción',scope:'CASE',context:{secret:'CASE_CONTEXT'},proposals:[{sourceSignature:'FULL_INPUTS'}]}];
  const data=h.w.STReports.chatHistory(messages),json=JSON.stringify(data),text=h.w.STReports.chatText(data);
  assert.equal(data.messages.length,2);assert(!/PRIVATE_KEY|CASE_CONTEXT|FULL_INPUTS/.test(json));assert(text.indexOf('You')<text.indexOf('Gemini'));assert(text.includes('Pregunta ágil'));assert(text.includes('Otra opción'));
  const doc=new JSDOM(h.w.STReports.chatHtml(data));assert.equal(doc.window.document.querySelectorAll('article').length,2);assert.equal(doc.window.document.querySelectorAll('script').length,0);assert(doc.window.document.body.textContent.includes('<script>unsafe</script>'));assert.equal(doc.window.document.querySelector('strong').textContent,'Respuesta');doc.window.close();
  let written='',printed=false;h.w.open=()=>({document:{open(){},write(html){written=html;},close(){}},focus(){},setTimeout(fn){fn();},print(){printed=true;}});
  h.w.STReports.exportChat(data,'pdf');assert(printed);assert(written.includes('Gemini chat history'));assert(!written.includes('FULL_INPUTS'));
 }finally{h.dom.window.close();}
});

test('loss exports retain matched percentages and reject stale diagnostic inputs',()=>{
 const h=setup();try{
  h.result.inputSignature=h.w.SimulatorEngine.inputSignature({case:{equipment:h.sim.equipment,unitOfFlow:'bottles'},run:{durationSeconds:60,seed:17,rounds:1}});
  const input=JSON.parse(h.result.inputSignature),key='RESULTS_LOSS_V1:'+h.w.SimulatorEngine.inputSignature({case:{equipment:input.equipment,unitOfFlow:input.unitOfFlow},run:{...input.run,durationSeconds:60,rounds:1}});
  h.sim.whatIf={lossDiagnostic:{key,status:'COMPLETE',baselineOee:80,failureFreeOee:85.123456789}};
  const loss=h.w.STReports.lossBreakdown(h.result,h.sim);assert.equal(loss.status,'COMPLETE');assert(Math.abs(loss.conditionalReliabilityLoss-5.123456789)<1e-9);assert(Math.abs(loss.baselineOee+loss.conditionalReliabilityLoss+loss.nominalMachineSpeedGap+loss.remainingLossWithoutFailures-100)<1e-9);
  const json=JSON.parse(h.w.STReports.analysis(h.result,h.c,h.sim));assert.equal(json.lossBreakdown.conditionalReliabilityLoss,loss.conditionalReliabilityLoss);
  for(const mode of ['basic','advance']){h.w.document.documentElement.dataset.uiMode=mode;const html=h.w.STReports.resultsHtml(h.result,h.c,h.sim);assert(html.includes('Conditional MTBF / MTTR loss'));assert(html.includes('5.1235%'));assert(html.includes('report-kpi'));}
  h.sim.whatIf.lossDiagnostic.key='STALE';assert.equal(h.w.STReports.lossBreakdown(h.result,h.sim).conditionalReliabilityLoss,null);
 }finally{h.dom.window.close();}
});
test('scenario PDF and JSON include retained sensor targets, reliability scope and ANOVA',()=>{
 const h=setup();try{
  const c={equipmentId:h.sim.equipment[1].id,path:'processData.accumulation.backupSensorPositionMm',before:100,after:123.456789,unit:'mm'};
  const anova={complete:true,interpretation:'Exploratory unadjusted p-values',metrics:{oee:{effects:[{factors:[0],effect:2,f:12,pValue:.00001234,significant:true}]}}};
  const e={title:'Conditional experiment',status:'REPRODUCED',evaluatedChanges:[c],doe:{factors:[],observations:[],fixedChanges:[],anova},reliabilityTargetSearch:{ranking:[{name:'Sleever',deltaThroughput:3}],selectedChanges:[]}};
  h.w.STScenarioExplorer={evaluations:()=>[e]};h.sim.results=h.result;h.sim.whatIf={searchDepth:'HIGH',reliabilitySettings:{scope:'MANUAL',equipmentIds:['sleever']}};
  const plan=h.w.STScenarios.plan(h.sim),data=h.w.STReports.whatIfData(h.sim,plan);assert.equal(data.evaluations[0].doe.anova.metrics.oee.effects[0].pValue,.00001234);assert.equal(data.scenarioConfiguration.reliabilitySettings.scope,'MANUAL');
  for(const mode of ['basic','advance']){h.w.document.documentElement.dataset.uiMode=mode;const doc=new JSDOM(h.w.STReports.whatIfHtml(h.sim,plan));const text=doc.window.document.body.textContent;assert(text.includes('ANOVA'));assert(text.includes('<0.0001'));assert(text.includes('Sleever'));assert(text.includes('123.46 mm'));assert.equal(doc.window.document.querySelectorAll('script').length,0);doc.window.close();}
 }finally{h.dom.window.close();}
});

test('Results report retains enabled plant calendar projections without actual comparison',()=>{const h=setup();try{h.sim.dynamicConfig.plantCalendar={enabled:true,totalMinutes:43200,externalMinutes:1441,changeoverMinutes:5393,effectiveMinutes:21307};h.result.summary.qualityAssumption='NO_REJECT_MODEL_ASSUMES_100_PERCENT';const html=h.w.STReports.resultsHtml(h.result,h.c,h.sim);assert.match(html,/Plant calendar/);assert.match(html,/Projected effective runtime/);assert.match(html,/69.67/);assert.doesNotMatch(html,/Actual \/ calendar/);}finally{h.dom.window.close();}});

test('selective case export isolates selected runs, evidence and results without mutating the case',()=>{
 const h=setup();try{
  const record={name:'Case',activeSimulationId:'a',equipment:[{id:'root'}],simulations:[{id:'a',equipment:[{id:'ea'}],dynamicConfig:{seed:1},results:{summary:{outputCount:2},replay:{private:1}},whatIf:{evaluations:[{title:'Low'},{title:'High'}]}},{id:'b',equipment:[{id:'eb'}],dynamicConfig:{seed:2,plantCalendar:{totalMinutes:42}},run:{seed:2},geminiHistory:[{text:'chat'}],results:{summary:{outputCount:3},replay:{private:2},view:{},batch:{rows:[{}],replays:[{}],statistics:{outputCount:{mean:3}}}},whatIf:{searchDepth:'HIGH',evaluations:[{title:'Low'},{title:'High'}],measurements:[{private:true}],lossDiagnostic:{private:true}}}]};
  const before=JSON.stringify(record),choices=h.w.STReports.caseExportSelection(record,'REVIEW');choices[0].included=false;choices[1].scenarioIndexes=[1];choices[1].analysis=false;
  const copy=h.w.STReports.selectedCaseExport(record,choices);assert.equal(copy.simulations.length,1);assert.equal(copy.activeSimulationId,'b');assert.equal(copy.equipment[0].id,'eb');assert.equal(copy.simulations[0].whatIf.evaluations[0].title,'High');assert.equal(copy.simulations[0].whatIf.evaluations.length,1);assert.equal(copy.simulations[0].results.replay.private,undefined);assert.equal(copy.simulations[0].results.replay.samples.length,1);assert.equal(copy.simulations[0].results.detailCoverage.recordingMode,'SUMMARY');assert.equal(copy.simulations[0].results.batch.rows,undefined);assert.equal(copy.simulations[0].results.batch.statistics.outputCount.mean,3);assert.equal(copy.simulations[0].geminiHistory,undefined);assert.equal(copy.simulations[0].whatIf.measurements,undefined);assert.equal(JSON.stringify(record),before);
  choices[1].results='NONE';const inputs=h.w.STReports.selectedCaseExport(record,choices).simulations[0];assert.equal(inputs.results,undefined);assert.equal(inputs.run,undefined);assert.equal(inputs.dynamicConfig.plantCalendar.totalMinutes,42);assert.equal(inputs.whatIf.evaluations.length,1);assert.equal(inputs.whatIf.searchDepth,'HIGH');assert.throws(()=>h.w.STReports.selectedCaseExport(record,[]),/at least one/);
 }finally{h.dom.window.close();}
});

test('export dialog supports presets, empty selection and local progress lifecycle',async()=>{
 const h=setup();try{
  const w=h.w;w.STIcons={svg:()=>'<svg></svg>'};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};let started=0,ended=0;w.STDialog={beginActivity(){started++;let done=false;return ()=>{if(!done){done=true;ended++;}};}};
  const record={activeSimulationId:'a',simulations:[{id:'a',name:'A',equipment:[],results:{summary:{}},whatIf:{evaluations:[{title:'High',status:'COMPLETE'}]}},{id:'b',name:'B',equipment:[]}]};
  const pending=w.STReports.requestCaseExport(record),dialog=w.document.querySelector('.case-export-dialog');await new Promise(r=>setTimeout(r,120));assert.match(dialog.querySelector('.case-export-preview').textContent,/2 simulation/);
  const includes=dialog.querySelectorAll('legend input');for(const input of includes){input.checked=false;input.onchange();}await new Promise(r=>setTimeout(r,120));assert.match(dialog.querySelector('.case-export-preview').textContent,/at least one/);assert(dialog.querySelector('.dialog-actions button:last-child').disabled);
  [...dialog.querySelectorAll('.case-export-presets button')].find(b=>b.textContent==='Current simulation').click();await new Promise(r=>setTimeout(r,120));assert.match(dialog.querySelector('.case-export-preview').textContent,/1 simulation/);assert.equal(dialog.querySelectorAll('legend input:checked').length,1);
  dialog.querySelector('.dialog-heading button').click();assert.equal(await pending,false);assert.equal(started,ended);assert.equal(w.document.querySelector('.case-export-dialog'),null);
 }finally{h.dom.window.close();}
});

test('product results survive summary export and appear in printable reports without a uniform-unit loss claim',()=>{
 const h=setup();try{
  h.result.products={rows:[{name:'Format A',outputUnit:'CASES',outputNative:10.5,completeCases:10,partialCaseEquivalent:.5,outputBottleEquivalents:126,clearoutBottleEquivalents:4}]};
  const html=h.w.STReports.resultsHtml(h.result,h.c,h.sim);assert(html.includes('Production by product'));assert(html.includes('Format A'));assert(html.includes('clear-out is removed inventory'));
  const record={activeSimulationId:'a',equipment:h.c.equipment,metadata:{products:[{id:'format-a',name:'Format A'}]},simulations:[{...h.sim,results:{...h.result,replay:{samples:[{virtualSecond:60,outputCount:126}]}}}]};
  const choices=h.w.STReports.caseExportSelection(record,'REVIEW'),copy=h.w.STReports.selectedCaseExport(record,choices);
  assert.equal(copy.simulations[0].results.products.rows[0].outputBottleEquivalents,126);assert.equal(copy.simulations[0].results.replay.products.rows[0].completeCases,10);assert.equal(copy.metadata.products[0].id,'format-a');
 }finally{h.dom.window.close();}
});
