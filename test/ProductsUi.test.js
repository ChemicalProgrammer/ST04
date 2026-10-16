import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const read=name=>fs.readFileSync('apps-script/'+name,'utf8').replace(/<\/?script>/g,'');
function setup({inline=false,legacy=false}={}){
 const dom=new JSDOM('<h2 id="products-title">Formats</h2><section id="products-workspace"></section><section id="results-products"></section>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.eval(read('Icons.html'));w.eval(read('SimulationEngine.html'));w.SimulatorEngine.validateSimulationInput=()=>({ok:true});w.SimulatorEngine.resolveProductConveyor=()=>({gapMm:20});
 let active=0,changed=0,locked=false;w.STDialog={beginActivity(dialog){assert(dialog.open);active++;return ()=>active--;}};
 const equipment=[{id:'source',name:'Source',type:'FILLER',nominalRatePerSecond:5},{id:'belt',name:'Belt',type:'CONVEYOR',nominalRatePerSecond:5,processData:{upstream:{packageLengthMm:60,dischargePitchMm:80},accumulation:{speedMode:'MANUAL',conveyorSpeedMmPerSecond:500}}},{id:'sink',name:'Sink',type:'CUSTOM',nominalRatePerSecond:5}],sim={id:'sim',name:'Simulation A',dynamicConfig:{},equipment};
 const metadata=legacy?{products:[{id:'old',name:'Existing format',bottlesPerCase:12,bottleLengthMm:60,caseLengthMm:300,equipment:{source:{ratePerMinute:777}}}]}:{};
 const state={uiView:inline?'products':undefined,activeSimulationId:'sim',activeCase:{id:'case',metadata,equipment,simulations:[sim]}};
 w.eval(read('Products.html'));w.STProducts.init(state,{simulation:()=>sim,locked:()=>locked,capture:()=>true,changed(){changed++;}});if(inline)w.STProducts.render(true);
 return {w,state,sim,dom,get active(){return active;},get changed(){return changed;},lock(v){locked=v;}};
}
const tick=()=>new Promise(r=>setTimeout(r,15));
function click(w,label){const b=w.document.querySelector('[aria-label="'+label+'"]');assert(b,label);b.click();}
function tab(w,name){w.document.querySelector('[data-format-tab="'+name+'"]').click();}
function input(w,label,value){const e=w.document.querySelector('[aria-label="'+label+'"]');assert(e,label);e.value=String(value);e.dispatchEvent(new w.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return e;}
function save(w){Array.from(w.document.querySelectorAll('.dialog-actions button')).find(b=>b.textContent==='Save formats').click();}
function checkInitial(w){const e=w.document.getElementById('format-use-initial');e.checked=true;e.dispatchEvent(new w.Event('change'));}
function seed(w){click(w,'Add product');input(w,'Product name','Product A');input(w,'Product 1 · Bottle length (mm)',60);tab(w,'boxes');click(w,'Add box');input(w,'Box name','Box A');input(w,'Box 1 · Box length (mm)',300);tab(w,'formats');click(w,'Add packing format');}

test('Formats uses the existing tab classes, compact catalog tables and shared native selects',()=>{
 const s=setup({inline:true}),w=s.w;assert.equal(w.document.querySelectorAll('.settings-tabs [role=tab]').length,3);assert.deepEqual(Array.from(w.document.querySelectorAll('[role=tab]'),b=>b.textContent),['Products','Boxes','Packing formats']);assert.equal(w.document.querySelector('dialog'),null);
 seed(w);assert.equal(w.document.querySelectorAll('.product-settings-table').length,2);assert.equal(w.document.querySelectorAll('.product-settings-table select').length,0);assert.equal(w.document.querySelectorAll('.product-general-grid select').length,2);assert.equal(w.document.querySelector('.product-general-grid select').getAttribute('style'),null);
 const text=fs.readFileSync('apps-script/BasicMode.html','utf8');assert.match(text,/\['products','Formats','box','products'\]/);assert.match(fs.readFileSync('apps-script/ProductStyles.html','utf8'),/repeat\(4,minmax\(0,1fr\)\)/);
});
test('one product can be linked to two boxes through independent formats with staged changes',async()=>{
 const s=setup(),w=s.w;await w.STProducts.open();seed(w);const first=w.document.querySelector('[aria-label="Packing format"]').value;input(w,'Format name','A / Box A');input(w,'Bottles per case',12);
 tab(w,'boxes');click(w,'Add box');input(w,'Box name','Box B');input(w,'Box 2 · Box length (mm)',400);tab(w,'formats');click(w,'Add packing format');input(w,'Format name','A / Box B');const choices=w.document.querySelector('[aria-label="Box"]').options;input(w,'Box',choices[choices.length-1].value);input(w,'Bottles per case',24);checkInitial(w);const second=w.document.querySelector('[aria-label="Packing format"]').value;
 assert.equal(s.state.activeCase.metadata.formatCatalog,undefined);save(w);assert.equal(s.active,1);await tick();assert.equal(s.active,0);const c=s.state.activeCase.metadata.formatCatalog;assert.equal(c.products.length,1);assert.equal(c.boxes.length,2);assert.equal(c.formats.length,2);assert.equal(c.formats[0].productId,c.formats[1].productId);assert.notEqual(c.formats[0].boxId,c.formats[1].boxId);assert.equal(c.formats[1].bottlesPerCase,24);assert.equal(s.sim.dynamicConfig.initialFormatId,second);assert.equal(s.sim.dynamicConfig.initialProductId,second);assert.notEqual(first,second);
 const fields=w.STProducts.runFields();assert.equal(fields.productCatalog[0].caseLengthMm,300);assert.equal(fields.productCatalog[1].caseLengthMm,400);assert.equal(fields.productCatalog[0].bottlesPerCase,12);assert.equal(fields.productCatalog[1].bottlesPerCase,24);
});
test('discard restores every tab and migration preserves legacy IDs and old run snapshots',async()=>{
 const s=setup({legacy:true}),w=s.w;s.sim.dynamicConfig.initialProductId='old';s.sim.results={summary:{outputCount:100}};const snapshot=JSON.stringify(s.sim.results),before=JSON.stringify(s.state.activeCase.metadata);
 await w.STProducts.open();tab(w,'boxes');input(w,'Box name','Changed box');w.document.querySelector('.dialog-actions button').click();assert.equal(JSON.stringify(s.state.activeCase.metadata),before);
 await w.STProducts.open();save(w);await tick();assert.equal(s.state.activeCase.metadata.products,undefined);assert.equal(s.state.activeCase.metadata.formatCatalog.formats[0].id,'old');assert.equal(s.sim.dynamicConfig.initialFormatId,'old');assert.equal(JSON.stringify(s.sim.results),snapshot);assert.equal(w.STProducts.currentFormat().bottlesPerCase,12);
});
test('referenced products, boxes and formats report their dependencies before deletion',async()=>{
 const s=setup({legacy:true}),w=s.w;s.state.activeCase.simulations.push({id:'other',name:'Simulation B',dynamicConfig:{initialFormatId:'old'},equipment:[]});await w.STProducts.open();click(w,'Delete product Existing format');assert.match(w.document.querySelector('.product-error').textContent,/Existing format/);tab(w,'boxes');click(w,'Delete box Existing format box');assert.match(w.document.querySelector('.product-error').textContent,/used by/);tab(w,'formats');click(w,'Delete packing format');assert.match(w.document.querySelector('.product-error').textContent,/Simulation B initial format/);
});
test('changeovers select a packing format and write compatible canonical and legacy IDs',()=>{
 const s=setup({legacy:true}),w=s.w,event={category:'changeoverMinutes'},row=w.document.createElement('tr');w.STProducts.destinationCell(row,event,()=>{});const select=row.querySelector('select');assert.equal(select.getAttribute('aria-label'),'Destination packing format');select.value='old';select.dispatchEvent(new w.Event('change'));assert.equal(event.targetFormatId,'old');assert.equal(event.targetProductId,'old');
});
test('reconciliation follows equipment IDs while retaining profiles used by other simulations',()=>{
 const s=setup({legacy:true}),w=s.w;s.state.activeCase.metadata.formatCatalog=w.SimulatorEngine.normalizeFormatCatalog(s.state.activeCase.metadata);delete s.state.activeCase.metadata.products;const c=s.state.activeCase.metadata.formatCatalog;c.formats[0].equipment.shared={ratePerMinute:55};c.formats[0].equipment.removed={ratePerMinute:88};s.state.activeCase.simulations.push({id:'other',equipment:[{id:'shared'}]});s.state.activeCase.equipment.push({id:'new',name:'New',type:'CUSTOM',nominalRatePerSecond:2});w.STProducts.reconcile();assert.equal(c.formats[0].equipment.source.ratePerMinute,777);assert.equal(c.formats[0].equipment.new.ratePerMinute,120);assert.equal(c.formats[0].equipment.shared.ratePerMinute,55);assert.equal(c.formats[0].equipment.removed,undefined);
});
test('keyboard navigation preserves drafts and permits changing shared source records across tabs',()=>{
 const s=setup({inline:true}),w=s.w;click(w,'Add product');input(w,'Product name','Retained');const tabButton=w.document.querySelector('[data-format-tab=products]');tabButton.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(w.document.activeElement.textContent,'Boxes');tab(w,'products');assert.equal(w.document.querySelector('[aria-label="Product name"]').value,'Retained');w.STProducts.render();assert.equal(w.document.querySelector('[aria-label="Product name"]').value,'Retained');
});
test('format applicability is staged separately from products and boxes',async()=>{
 const s=setup(),w=s.w;await w.STProducts.open();seed(w);const checkbox=w.document.querySelector('tr[data-equipment-id=belt] input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));assert(w.document.querySelector('tr[data-equipment-id=belt]').classList.contains('product-row-inactive'));save(w);await tick();assert.equal(s.state.activeCase.metadata.formatCatalog.formats[0].equipment.belt.applies,false);assert.equal(s.state.activeCase.metadata.formatCatalog.products[0].equipment,undefined);assert.equal(s.state.activeCase.metadata.formatCatalog.boxes[0].bottlesPerCase,undefined);
});
