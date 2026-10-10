import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function setup(basic){
 const dom=new JSDOM('<select id="case-compare-a"><option value="a" selected>A</option></select><select id="case-compare-b"><option value="b" selected>B</option></select><div id="case-comparison-content"></div>',{runScripts:'outside-only'}),w=dom.window;
 const text={'results.global_oee':'Global OEE','results.throughput':'Throughput','results.outcome_comparison':'Outcome comparison','results.pp':' pp','results.metric':'Metric','results.proposed':'Proposed','view.baseline':'Baseline'};
 w.__ST_TEXT__=w.__ST_HTML_TEXT__=key=>text[key]||key;w.STBasicMode={isBasic:()=>basic,unitLabel:value=>value};w.STReports={bindComparison(){}};
 for(const file of ['Results.html','WhatIf.html','Comparison.html'])w.eval(fs.readFileSync('apps-script/'+file,'utf8').match(/<script>([\s\S]*)<\/script>/)[1]);
 function simulation(id,oee,throughput){return {id,name:id.toUpperCase(),equipment:[],dynamicConfig:{},results:{unitOfFlow:'bottles',seed:42,durationSeconds:60,replay:{},summary:{lineOeePercent:1,outputCount:2,totalStarvedSeconds:0,totalBlockedSeconds:0,totalFailureSeconds:0},batch:{rounds:3,rows:[{seed:42},{seed:43},{seed:44}],statistics:{lineOeePercent:{mean:oee},throughputPerMinute:{mean:throughput},outputCount:{mean:throughput}}}}};}
 const a=simulation('a',30,100),b=simulation('b',60,200),state={activeCase:{simulations:[a,b]}};
 return {dom,w,a,b,render:()=>w.STComparison(state,Number.isFinite).render()};
}
test('Comparison starts with OEE and throughput cards using saved round means in both modes',()=>{
 for(const basic of [false,true]){const h=setup(basic);try{h.render();const target=h.w.document.getElementById('case-comparison-content');assert(target.firstElementChild.classList.contains('comparison-outcomes'));const cards=target.querySelectorAll('.comparison-kpi');assert.equal(cards.length,2);assert.equal(cards[0].querySelector('h4').textContent,'Global OEE');assert.deepEqual(Array.from(cards[0].querySelectorAll('strong')).map(e=>e.textContent),['30%','60%']);assert.match(cards[0].querySelector('.comparison-kpi-delta').textContent,/\+30 pp/);assert.match(cards[1].textContent,/100 bottles\/min/);assert.match(cards[1].textContent,/200 bottles\/min/);assert.match(cards[0].textContent,/3 round/);const row=target.querySelector('tbody tr');assert.match(row.textContent,/30%.*60%/);}finally{h.dom.window.close();}}
});
test('missing saved outcomes show configuration context without invented KPIs; unlike flow units have no throughput delta',()=>{
 const h=setup(false);try{h.b.results.unitOfFlow='cases';h.render();assert.match(h.w.document.querySelectorAll('.comparison-kpi-delta')[1].textContent,/—/);h.b.results=null;h.render();assert.equal(h.w.document.querySelector('.comparison-kpi'),null);assert(h.w.document.querySelector('.comparison-context'));}finally{h.dom.window.close();}
});

test('OEE comparison includes global and machine rows in Basic and Advance using equipment round means',()=>{
 for(const basic of [true,false]){const h=setup(basic);try{
  h.a.equipment=h.b.equipment=[{id:'machine',name:'Filler',type:'FILLER'},{id:'belt',name:'Conveyor',type:'CONVEYOR'}];
  h.a.results.equipmentMetrics={machine:{oeePercent:11}};h.b.results.equipmentMetrics={machine:{oeePercent:12}};
  h.a.results.batch.equipmentStatistics={machine:{oeePercent:{mean:40}}};h.b.results.batch.equipmentStatistics={machine:{oeePercent:{mean:70}}};h.render();
  const rows=h.w.document.querySelectorAll('.comparison-equipment-oee tbody tr');assert.equal(rows.length,2);assert.match(rows[0].textContent,/Global OEE.*30%.*60%.*\+30/);assert.match(rows[1].textContent,/Filler.*40%.*70%.*\+30/);
 }finally{h.dom.window.close();}}
});

test('changed inputs exclude runtime outputs and provenance while retaining precise saved input differences',()=>{
 for(const basic of [true,false]){const h=setup(basic);try{
  const equipment={id:'machine',name:'Filler',type:'FILLER',initialMode:'AUTO',nominalRatePerSecond:2,processData:{equipment:{maximumSpeedBpm:200}},noiseProfile:{reliability:{mtbfMinutes:50,mttrMinutes:2}},characteristics:{criticalMachine:true}};
  h.a.equipment=[structuredClone(equipment)];h.b.equipment=[{...structuredClone(equipment),actualRatePerSecond:123,outputCount:800,blockedSeconds:20,stateSeconds:{RUNNING:40},updatedAt:'later'}];
  h.b.scenario={changes:[{after:50}]};h.b.results.summary.outputCount=999;
  h.render();let section=Array.from(h.w.document.querySelectorAll('section.comparison-section')).find(e=>e.querySelector('h3')?.textContent.startsWith('comparison.changed_inputs'));
  assert.equal(section.querySelector('table'),null);assert.match(section.querySelector('h3').textContent,/changed_inputs0/);
  h.b.equipment[0].nominalRatePerSecond=2.000001;h.b.equipment[0].processData.equipment.maximumSpeedBpm=220;h.render();
  section=Array.from(h.w.document.querySelectorAll('section.comparison-section')).find(e=>e.querySelector('h3')?.textContent.startsWith('comparison.changed_inputs'));assert.equal(section.querySelectorAll('tbody tr').length,2);assert(!section.textContent.includes('outputCount'));assert(!section.textContent.includes('actualRatePerSecond'));
  h.b.equipment=[];h.render();section=Array.from(h.w.document.querySelectorAll('section.comparison-section')).find(e=>e.querySelector('h3')?.textContent.startsWith('comparison.changed_inputs'));assert.equal(section.querySelectorAll('tbody tr').length,1);assert.match(section.textContent,/Removed equipment/);
 }finally{h.dom.window.close();}}
});

