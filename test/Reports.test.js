import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=f=>fs.readFileSync('apps-script/'+f,'utf8');
function setup(){
 const dom=new JSDOM(read('ReportStyles.html')+read('ReportTemplates.html')+read('ReportResultsTemplate.html')+read('ReportWhatifTemplate.html')+read('ReportConfigurationTemplate.html')+read('ReportComparisonTemplate.html')+['export-results-pdf','export-whatif-json','export-whatif-pdf','export-comparison-json','export-comparison-html','export-comparison-pdf'].map(id=>'<button id="'+id+'"></button>').join(''),{runScripts:'outside-only',url:'https://st.test'}),w=dom.window;
 w.eval(read('TextResources.gs'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const file of ['SimulationEngine.html','WhatIf.html','Reports.html'])w.eval(read(file).replace(/^<script>|<\/script>\s*$/g,''));
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
  assert.equal(doc.window.document.querySelectorAll('script').length,0);assert(doc.window.document.body.textContent.includes(right.name));assert(doc.window.document.body.textContent.includes('nominalRatePerSecond'));
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

