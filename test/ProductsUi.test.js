import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
function setup(){
 const dom=new JSDOM('<button id="focus">Open</button><section id="simulation-products"></section><section id="results-products"></section>',{runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 let active=0,changed=0,locked=false;w.STDialog={beginActivity(dialog){assert(dialog.open);active++;return ()=>active--;}};
 w.eval(fs.readFileSync('apps-script/Icons.html','utf8').replace(/<\/?script>/g,''));
 w.SimulatorEngine={validateSimulationInput(){return {ok:true};},resolveProductConveyor(){return {gapMm:20};}};
 w.eval(fs.readFileSync('apps-script/Products.html','utf8').replace(/<\/?script>/g,''));
 const equipment=[{id:'source',name:'Source',type:'FILLER',nominalRatePerSecond:5},{id:'belt',name:'Belt',type:'CONVEYOR',nominalRatePerSecond:5,processData:{upstream:{packageLengthMm:60,dischargePitchMm:80},accumulation:{speedMode:'MANUAL',conveyorSpeedMmPerSecond:500}}},{id:'sink',name:'Sink',type:'CUSTOM',nominalRatePerSecond:5}];
 const sim={id:'sim',name:'Simulation A',dynamicConfig:{},equipment},state={activeCase:{id:'case',metadata:{},equipment,simulations:[sim]},activeSimulationId:'sim'};w.STProducts.init(state,{simulation:()=>sim,locked:()=>locked,capture:()=>true,changed(){changed++;}});w.STProducts.render();
 return {w,state,sim,dom,get active(){return active;},get changed(){return changed;},lock(v){locked=v;}};
}
function inputFor(w,text){return Array.from(w.document.querySelectorAll('label')).find(e=>e.firstChild?.textContent===text)?.querySelector('input');}
function enter(w,input,value){input.value=String(value);input.dispatchEvent(new w.Event('input',{bubbles:true}));}
test('product dialog stages edits, cancels cleanly and uses a local activity bar on save',async()=>{
 const s=setup(),w=s.w;await w.STProducts.open();assert(w.document.querySelector('.dialog-heading'));assert(w.document.querySelector('.dialog-actions'));w.document.querySelector('.products-dialog .product-selector-row button').click();assert(w.document.querySelector('.product-settings-table'));
 enter(w,inputFor(w,'Name'),'Bottle format');w.document.querySelector('.dialog-actions button').click();assert.equal(s.state.activeCase.metadata.products,undefined);
 await w.STProducts.open();w.document.querySelector('.products-dialog .product-selector-row button').click();enter(w,inputFor(w,'Name'),'Bottle format');const button=Array.from(w.document.querySelectorAll('.dialog-actions button')).find(b=>b.textContent==='Save products');button.click();assert.equal(s.active,1);await new Promise(r=>setTimeout(r,15));assert.equal(s.active,0);assert.equal(s.state.activeCase.metadata.products.length,1);assert.equal(s.state.activeCase.metadata.products[0].name,'Bottle format');assert.equal(s.state.activeCase.metadata.products[0].equipment.belt.speedMmPerSecond,500);assert.equal(s.state.activeCase.metadata.products[0].equipment.belt.movingGapMm,20);assert.equal(s.sim.dynamicConfig.initialProductId,undefined);assert.equal(s.changed,1);
});
test('initial product and changeover destination persist by ID; locked controls cannot edit',()=>{
 const s=setup(),w=s.w;s.state.activeCase.metadata.products=[{id:'a',name:'A',bottlesPerCase:12,bottleLengthMm:60,equipment:{}},{id:'b',name:'B',bottlesPerCase:12,bottleLengthMm:60,equipment:{}}];s.state.uiView='products';w.document.getElementById('simulation-products').id='products-workspace';w.STProducts.render();const select=w.document.getElementById('product-selector');select.value='a';select.dispatchEvent(new w.Event('change'));const initial=w.document.getElementById('product-use-initial');assert(initial);initial.checked=true;initial.dispatchEvent(new w.Event('change'));assert.equal(s.sim.dynamicConfig.initialProductId,undefined);
 const event={category:'changeoverMinutes'},row=w.document.createElement('tr');w.STProducts.destinationCell(row,event,()=>{});row.querySelector('select').value='b';row.querySelector('select').dispatchEvent(new w.Event('change'));assert.equal(event.targetProductId,'b');s.lock(true);w.STProducts.render(true);assert(w.document.getElementById('product-selector').disabled);
});
test('results distinguish full cases, continuous partial equivalents and clear-out inventory',()=>{
 const s=setup(),target=s.w.document.getElementById('results-products');s.w.STProducts.results(target,{products:{rows:[{name:'A',outputUnit:'CASES',outputNative:10.5,completeCases:10,partialCaseEquivalent:.5,outputBottleEquivalents:126,clearoutBottleEquivalents:8}]}});assert.equal(target.querySelector('h3').textContent,'Production by product');assert.equal(target.querySelectorAll('tbody tr').length,1);assert.match(target.textContent,/126/);assert.match(target.textContent,/not production/);
});

test('Products has an inline editor in its own section and does not open a configuration dialog',async()=>{
 const s=setup(),w=s.w;s.state.uiView='products';w.document.getElementById('simulation-products').id='products-workspace';w.STProducts.render(true);
 const editor=w.document.querySelector('#products-workspace .products-editor');assert(editor);assert.equal(w.document.querySelector('dialog'),null);assert(editor.querySelector('.dialog-heading').hidden);
 editor.querySelector('.product-selector-row button').click();const name=inputFor(w,'Name');enter(w,name,'Inline format');w.STProducts.render();assert.equal(inputFor(w,'Name'),name);assert.equal(name.value,'Inline format');
 Array.from(editor.querySelectorAll('.dialog-actions button')).find(b=>b.textContent==='Save products').click();await new Promise(r=>setTimeout(r,15));assert.equal(s.state.activeCase.metadata.products[0].name,'Inline format');assert.equal(w.document.querySelector('dialog'),null);
 const web=fs.readFileSync('apps-script/WebApp.html','utf8');assert.match(web,/id="products-panel"/);assert.doesNotMatch(web,/id="simulation-products"/);assert.match(fs.readFileSync('apps-script/BasicMode.html','utf8'),/\['products','Products','box','products'\]/);
});

test('product selection, general information and equipment inputs use compact tables with accessible icon actions',()=>{
 const s=setup(),w=s.w;s.state.uiView='products';w.document.getElementById('simulation-products').id='products-workspace';w.STProducts.render(true);
 const add=w.document.querySelector('[aria-label="Add product"]');assert(add.querySelector('svg'));add.click();
 assert.deepEqual(Array.from(w.document.querySelectorAll('.product-subsection h3'),e=>e.textContent),['Product selection','General information','Equipment inputs']);
 assert.equal(w.document.querySelectorAll('.product-settings-table').length,2);assert.equal(w.document.querySelectorAll('.product-machine-grid').length,0);assert(w.document.querySelector('[aria-label="Delete current product"] svg'));
 assert.deepEqual(Array.from(w.document.querySelectorAll('.product-settings-table tbody tr'),r=>r.dataset.equipmentId),['source','sink','belt']);
 const name=inputFor(w,'Name');enter(w,name,'Updated product');assert.equal(w.document.getElementById('product-selector').selectedOptions[0].textContent,'Updated product');
});
test('deleting a draft product is reversible and initial-product selection is saved with the catalog',async()=>{
 const s=setup(),w=s.w;await w.STProducts.open();w.document.querySelector('[aria-label="Add product"]').click();const id=w.document.getElementById('product-selector').value;
 const initial=w.document.getElementById('product-use-initial');initial.checked=true;initial.dispatchEvent(new w.Event('change'));
 Array.from(w.document.querySelectorAll('.dialog-actions button')).find(b=>b.textContent==='Save products').click();await new Promise(r=>setTimeout(r,15));assert.equal(s.sim.dynamicConfig.initialProductId,id);assert.equal(w.STProducts.runFields().productCatalog.length,1);
 await w.STProducts.open();w.document.querySelector('[aria-label="Delete current product"]').click();assert.equal(w.document.querySelectorAll('#product-selector option').length,1);assert.equal(s.state.activeCase.metadata.products.length,1);w.document.querySelector('.dialog-actions button').click();assert.equal(s.state.activeCase.metadata.products.length,1);assert.equal(s.sim.dynamicConfig.initialProductId,id);
 await w.STProducts.open();w.document.querySelector('[aria-label="Delete current product"]').click();Array.from(w.document.querySelectorAll('.dialog-actions button')).find(b=>b.textContent==='Save products').click();await new Promise(r=>setTimeout(r,15));assert.equal(s.state.activeCase.metadata.products.length,0);assert.equal(s.sim.dynamicConfig.initialProductId,undefined);
});
test('product deletion reports references in other simulations and unsaved active changeovers',async()=>{
 const s=setup(),w=s.w;s.state.activeCase.metadata.products=[{id:'a',name:'A',bottlesPerCase:12,bottleLengthMm:60,equipment:{}}];s.state.activeCase.simulations.push({id:'other',name:'Simulation B',dynamicConfig:{initialProductId:'a'},equipment:[]});
 await w.STProducts.open();w.document.querySelector('[aria-label="Delete current product"]').click();assert.match(w.document.querySelector('.product-error').textContent,/Simulation B initial product/);assert.equal(w.document.getElementById('product-selector').value,'a');w.document.querySelector('.dialog-actions button').click();
 s.state.activeCase.simulations.pop();s.state.run={plannedStops:[{targetProductId:'a'}]};await w.STProducts.open();w.document.querySelector('[aria-label="Delete current product"]').click();assert.match(w.document.querySelector('.product-error').textContent,/Simulation A changeover/);
});
test('equipment additions and removals reconcile all products by stable ID while preserving other simulation profiles and snapshots',()=>{
 const s=setup(),w=s.w,p={id:'a',name:'A',equipment:{source:{ratePerMinute:777},removed:{ratePerMinute:90},shared:{ratePerMinute:55}}},q={id:'b',name:'B',equipment:{source:{ratePerMinute:888}}};s.state.activeCase.metadata.products=[p,q];
 const historical={id:'other',equipment:[{id:'shared'}],dynamicConfig:{productCatalog:[{id:'a',equipment:{removed:{ratePerMinute:123}}}]},results:{summary:{outputCount:100}}};s.state.activeCase.simulations.push(historical);const before=JSON.stringify(historical);
 s.state.activeCase.equipment.push({id:'new',name:'New machine',type:'CUSTOM',nominalRatePerSecond:2});assert.equal(w.STProducts.reconcile(),true);
 assert.equal(p.equipment.source.ratePerMinute,777);assert.equal(q.equipment.source.ratePerMinute,888);assert.equal(p.equipment.new.ratePerMinute,120);assert.equal(q.equipment.new.ratePerMinute,120);assert.equal(p.equipment.removed,undefined);assert.equal(p.equipment.shared.ratePerMinute,55);assert.equal(JSON.stringify(historical),before);
 s.state.activeCase.equipment=s.state.activeCase.equipment.filter(e=>e.id!=='belt');w.STProducts.reconcile();assert.equal(p.equipment.belt,undefined);assert.equal(q.equipment.belt,undefined);
 s.state.activeCase.equipment.reverse();s.state.activeCase.equipment[0].name='Renamed machine';s.state.uiView='products';w.document.getElementById('simulation-products').id='products-workspace';w.STProducts.render(true);assert.deepEqual(Array.from(w.document.querySelectorAll('.product-settings-table tbody tr[data-equipment-id]'),r=>r.dataset.equipmentId),s.state.activeCase.equipment.map(e=>e.id));assert.match(w.document.querySelector('.product-settings-table').textContent,/Renamed machine/);
});
