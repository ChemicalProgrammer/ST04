import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const read=f=>fs.readFileSync('apps-script/'+f,'utf8');
function setup(){
 const dom=new JSDOM(read('ReportStyles.html')+read('ReportTemplates.html')+read('ReportResultsTemplate.html')+read('ReportWhatifTemplate.html')+read('ReportConfigurationTemplate.html')+'<button id="export-results-pdf"></button><button id="export-whatif-pdf"></button>',{runScripts:'outside-only',url:'https://st.test'}),w=dom.window;
 w.eval(read('TextResources.gs'));w.__ST_TEXT__=key=>w.ST_TEXT_RESOURCES[key]||key;
 for(const file of ['SimulationEngine.html','WhatIf.html','Reports.html'])w.eval(read(file).replace(/^<script>|<\/script>\s*$/g,''));
 w.eval(read('PublicDemoCaseFactory.gs'));const c=w.createPublicDemoCaseRequest_();c.name='Synthetic line';
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
  delete w.STThemeResources.palettes.violet;w.STThemeResources.palettes.custom={light:{accent:'#123456',soft:'#eeeeee',onAccent:'#ffffff'},dark:{accent:'#aabbcc',soft:'#112233',onAccent:'#000000'}};
  w.eval(read('UiPreferences.html').replace(/^<script>|<\/script>\s*$/g,''));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert(!w.document.querySelector('[data-accent="violet"]'));w.document.querySelector('[data-accent="custom"]').click();assert.equal(w.document.documentElement.style.getPropertyValue('--accent'),'#123456');w.STPreferences.setTheme('dark');assert.equal(w.document.documentElement.style.getPropertyValue('--accent'),'#aabbcc');
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
