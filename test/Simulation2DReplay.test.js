import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { readClientSource } from '../scripts/render-apps-script.mjs';

function script(name) {
  return readFileSync(new URL('../apps-script/'+name+'.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
}

test('independent 2D counts own failures once and accumulates starvation and ramp time', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'), {window});
  const machine={kind:'machine',rate:8,batch:1,startDelay:0,rampSeconds:0};
  const belt={kind:'belt',length:500,speed:100,packageLength:30,pitch:45,packedGap:0,prime:420,backup:120,
    blockDelay:.4,clearDelay:.1,responseDelay:.8,residual:0};
  const definitions=[machine,belt,{...machine,rate:.7,primeRampSeconds:2,failures:[{rate:.6,repairSeconds:1}]}];
  const model=window.STSimulation2DEngine.create(definitions,7);
  let transitions=0;
  for(let i=0;i<12000;i++){
    const repairing=model.line[2].failureRemaining>0;
    model.step(1/120);
    if(!repairing&&model.line[2].state==='Failed')transitions++;
  }
  const [upstream,conveyor,downstream]=model.line;
  assert(transitions>0);
  assert.equal(downstream.failureCount,transitions);
  assert(downstream.durations.failure>0);
  assert(downstream.durations.starving>0);
  assert(downstream.durations.acceleration>1);
  assert(upstream.durations.deceleration>0);
  assert.equal(conveyor.produced,downstream.produced+downstream.input);
  assert(conveyor.durations.empty>0&&conveyor.durations.flowing>0&&conveyor.durations.accumulating>0);
  assert(Math.abs(Object.values(conveyor.durations).reduce((sum,seconds)=>sum+seconds,0)-model.time)<1e-8);
  const restored=window.STSimulation2DEngine.create(definitions,7,model.snapshot());
  assert.equal(restored.line[2].failureCount,transitions);
  assert.equal(restored.line[2].durations.starving,downstream.durations.starving);
});

test('2D keeps a draining packed queue and its back-up stop active across product gaps', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'), {window});
  const machine={kind:'machine',rate:1,batch:1,startDelay:0,rampSeconds:0};
  const model=window.STSimulation2DEngine.create([
    {...machine,id:'upstream'},
    {kind:'belt',length:200,speed:20,packageLength:20,pitch:50,packedGap:10,
      prime:null,backup:146,blockDelay:.25,clearDelay:.25,responseDelay:0,residual:0},
    {...machine,id:'downstream'}
  ]);
  const [upstream,belt]=model.line;
  belt.items=[190,160,130].map(x=>({x}));
  model.step(.25);
  assert.equal(belt.backupBeam,false);
  assert.equal(belt.backupBlocked,true);
  assert.equal(upstream.state,'Back-up stop');
  assert.equal(belt.produced,1);
  assert.equal(belt.items[0].x,160);
  assert.equal(belt.state,'Accumulating');
  model.step(.25);
  assert.equal(belt.backupBeam,false);
  assert.equal(belt.state,'Accumulating');
  assert.equal(upstream.state,'Back-up stop');
  assert.equal(belt.durations.accumulating,.5);

  belt.items=[175,115].map(x=>({x}));
  model.step(.25);
  assert.equal(belt.state,'Flowing');
  assert.equal(belt.backupBlocked,false);
  assert.equal(upstream.state,'Running');
});

test('2D waits for the packed outlet-to-Prime reserve on initial start and manual restart', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'),{window});
  const machine={kind:'machine',rate:1,batch:1,startDelay:.25,rampSeconds:0};
  const model=window.STSimulation2DEngine.create([
    {...machine,id:'upstream'},
    {kind:'belt',length:200,speed:20,packageLength:20,pitch:40,packedGap:0,
      prime:140,backup:null,responseDelay:0,residual:0},
    {...machine,id:'downstream'}
  ]);
  const [,belt,downstream]=model.line;
  belt.items=[{x:135}];
  model.step(.25);
  assert.equal(belt.primeBeam,true);
  assert.equal(downstream.state,'Waiting for Prime');
  assert.equal(downstream.started,0);
  belt.items=[190,170].map(x=>({x}));
  model.step(.25);
  assert.equal(downstream.started,0);
  belt.items.push({x:150});
  model.step(.25);
  assert.equal(downstream.state,'Starting');
  model.step(.25);
  assert(downstream.remaining>0);

  model.control('downstream','STOP');
  belt.items=[{x:190}];
  model.control('downstream','MANUAL');
  model.step(.25);
  assert.equal(downstream.state,'Waiting for Prime');
  assert.equal(downstream.produced,0);
});

test('2D extracts only the representative seed, even without recorded playback', () => {
  const code=readClientSource();
  const context=vm.createContext({});
  const start=code.indexOf('    function representativeRoundFor2D(');
  assert(start>=0);
  vm.runInContext(code.slice(start,code.indexOf('\n    function ',start+10)),context);
  const results={seed:17,batch:{representativeRound:2,rows:[{seed:17},{
    seed:0,durationSeconds:5,summary:{outputCount:15}
  }]}};
  const source=context.representativeRoundFor2D(results);
  assert.equal(source.round,2);
  assert.equal(source.seed,0);
  assert.deepEqual(Object.keys(source),['round','seed']);
  delete results.batch.rows[1].seed;
  assert.equal(context.representativeRoundFor2D(results),null);
  assert.equal(context.representativeRoundFor2D({seed:17,replay:{seed:18}}).seed,18);
});

test('2D uses the representative seed to calculate new production and preserves its other run', () => {
  const markup=readFileSync(new URL('../apps-script/WebApp.html',import.meta.url),'utf8');
  const panel=markup.match(/<section id="simulation2d-panel"[\s\S]*?<\/section>/)[0];
  const analysisComponent=readFileSync(new URL('../apps-script/ConveyorAnalysis.html',import.meta.url),'utf8');
  const eventHome=markup.match(/<div id="simulation-event-home">[\s\S]*?<\/section>\s*<\/div>/)[0];
  const dom=new JSDOM(panel+eventHome+analysisComponent,{runScripts:'outside-only'});
  try{
    const {window}=dom,el=id=>window.document.getElementById('simulation2d-'+id);
    const viewportText=new WeakMap(),previewFills=new WeakMap();
    Object.defineProperties(window.HTMLCanvasElement.prototype,{clientWidth:{get(){return 420;}},clientHeight:{get(){return 300;}}});
    window.HTMLCanvasElement.prototype.getContext=function(){
      const target=this;const ctx=new Proxy({measureText:text=>({width:text.length*5}),clearRect(){viewportText.set(target,[]);previewFills.set(target,[]);},fillText(text,x,y){const rows=viewportText.get(target)||[];rows.push([text,x,y]);viewportText.set(target,rows);},fill(){const colors=previewFills.get(target)||[];colors.push(this.fillStyle);previewFills.set(target,colors);},fillRect(){const colors=previewFills.get(target)||[];colors.push(this.fillStyle);previewFills.set(target,colors);}},{get:(o,k)=>o[k]??(()=>{})});return ctx;
    };
    const labels=[],bottles=[];
    let lastFrameOrigin,scale,dash,start;
    let matrix=[1,1,0,0];const matrices=[];
    const segments=[],boxes=[];
    el('panel').classList.remove('hidden');
    Object.defineProperties(el('canvas'),{clientWidth:{value:1100},clientHeight:{value:550}});
    el('canvas').getContext=()=>new Proxy({
      measureText(text){return {width:text.length*(this.font?.includes('6.75px')?2.8125:5)};},
      fillText(text,x,y){labels.push([text,this.font,x,y,this.textAlign]);},
      quadraticCurveTo:x=>bottles.push((matrix[0]*x+matrix[2])/(scale||1)),
      translate(x,y){matrix[2]+=matrix[0]*x;matrix[3]+=matrix[1]*y;},
      scale(x,y){matrix[0]*=x;matrix[1]*=y;},
      save(){matrices.push([...matrix]);},restore(){matrix=matrices.pop()||matrix;},
      rect:x=>bottles.push(x),
      setTransform(factor){scale=factor;matrix=[factor,factor,0,0];},
      roundRect(x,y,width,height){boxes.push({x,y,width,height});},
      setLineDash(pattern){dash=pattern.length>0;},
      moveTo(x,y){start=[x,y];},
      lineTo(x,y){if(start)segments.push({start,end:[x,y],dash});start=[x,y];},
      clearRect(){lastFrameOrigin=labels.length;segments.length=0;boxes.length=0;dash=false;}
    },{get:(target,key)=>target[key]??(()=>{})});
    let animate;
    window.requestAnimationFrame=callback=>{animate=callback;return 1;};
    window.cancelAnimationFrame=()=>{animate=null;};
    const geometry={usableLengthMm:2000,productLengthMm:30,productPitchMm:60,accumulatedPitchMm:30,conveyorSpeedMmPerSecond:120};
    window.SimulatorEngine={resolveProductConveyor:()=>geometry};
    window.eval(script('Icons'));
    window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    window.eval(script('Simulation2DEngine'));
    window.eval(script('Simulation2DMachines'));
    const art=window.STSimulation2DMachines.draw,drawn=[];
    window.STSimulation2DMachines.draw=(context,type,...args)=>{
      const rendered=art(context,type,...args);
      if(rendered)drawn.push({type,bottom:args[1]+args[3]*.84,seconds:args.at(-1)});
      return rendered;
    };
    window.eval(script('EquipmentEfficiency'));
    window.eval(script('ConveyorAnalysis'));
    window.eval(script('Simulation2D'));
    const source={round:2,seed:78,durationSeconds:10,summary:{outputCount:99999}};
    const createdSeeds=[];
    let createdDefinitions;
    const engine=window.STSimulation2DEngine;
    window.STSimulation2DEngine={create(definitions,seed,checkpoint,schedule){
      createdSeeds.push(seed);
      createdDefinitions=definitions;
      return engine.create(definitions,seed,checkpoint,schedule);
    }};
    const records=[];
    const equipment=[
      {id:'upstream',type:'FILLER',nominalRatePerSecond:10,processData:{equipment:{internalCapacityBottles:1,maximumSpeedBpm:599,stopInputs:{minor:{mtbfMinutes:.001,mttrMinutes:.002}}}}},
      {id:'belt',type:'CONVEYOR',processData:{upstream:{packageWidthMm:22}}},
      {id:'m',nominalRatePerSecond:4,processData:{equipment:{internalCapacityBottles:8,residenceTimeSeconds:999}}}
    ];
    window.STSimulation2D.load(['case','simulation'],equipment,null,{seed:7,durationSeconds:25},null,record=>records.push(record),source);
    el('play').click();
    animate(1000);animate(2000);
    el('pause').click();
    assert.equal(el('time').textContent,'1 s');
    assert.equal(el('pause').getAttribute('aria-pressed'),'true');
    const priorSnapshot=JSON.stringify(records.at(-1).checkpoint);
    const beforeAppearance=records.length;
    el('appearance').click();
    let dialog=window.document.getElementById('simulation2d-appearance-dialog');
    assert(dialog.open);assert(dialog.querySelector('.dialog-heading'));assert(dialog.querySelector('.dialog-body'));assert(dialog.querySelector('.dialog-actions'));
    assert.equal(el('machine-style').closest('dialog'),dialog);
    assert.equal(dialog.querySelectorAll('[data-bottle-style]').length,9);
    assert([...dialog.querySelectorAll('.simulation2d-color-popup')].every(popup=>popup.hidden));
    assert.equal(dialog.querySelector('select[aria-label="Cap shape"]'),null);
    const labelTrigger=dialog.querySelector('.simulation2d-color-trigger[aria-label="Label color"]');labelTrigger.click();
    const labelPicker=window.document.getElementById(labelTrigger.getAttribute('aria-controls'));
    assert.equal(labelPicker.hidden,false);assert.equal(labelPicker.parentElement,dialog,'popup floats outside the scrolling body');
    const liquidTrigger=dialog.querySelector('.simulation2d-color-trigger[aria-label="Liquid color"]');liquidTrigger.click();
    assert(labelPicker.hidden,'opening another palette closes the previous one');
    const liquidPopup=window.document.getElementById(liquidTrigger.getAttribute('aria-controls'));
    liquidPopup.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(liquidPopup.hidden);assert(dialog.open,'Escape closes the palette first');labelTrigger.click();
    labelPicker.querySelector('[aria-label="Pink"]').click();assert.equal(labelPicker.hidden,true);
    assert([...dialog.querySelectorAll('.simulation2d-bottle-gallery canvas')].every(preview=>previewFills.get(preview)?.includes('#f4a0c4')),'every gallery sample includes the colored label');
    const labelShape=dialog.querySelector('select[aria-label="Label shape"]');labelShape.value='sleeve';labelShape.dispatchEvent(new window.Event('change'));
    dialog.querySelector('[data-bottle-style="oval-jug"]').click();
    assert([...dialog.querySelectorAll('.simulation2d-bottle-gallery canvas')].every(preview=>previewFills.get(preview)?.includes('#f4a0c4')));

    assert.equal(dialog.querySelectorAll('[aria-label="Liquid color palette"] button').length,14);
    dialog.querySelector('[data-bottle-style="softener"]').click();
    Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Cancel').click();
    assert.equal(records.length,beforeAppearance,'Cancel leaves saved appearance unchanged');
    el('appearance').click();dialog=window.document.getElementById('simulation2d-appearance-dialog');
    dialog.querySelector('[data-bottle-style="softener"]').click();dialog.querySelector('[aria-label="Violet"]').click();
    assert([...dialog.querySelectorAll('.simulation2d-bottle-gallery canvas')].every(preview=>previewFills.get(preview)?.includes('#7c3aed')),'all filled gallery samples update live');
    Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Apply').click();
    assert.equal(records.at(-1).appearance.bottle,'softener');assert.equal(records.at(-1).appearance.liquid,'#7c3aed');
    assert.equal(JSON.stringify(records.at(-1).checkpoint),priorSnapshot,'appearance does not change physical state');
    el('appearance').click();dialog=window.document.getElementById('simulation2d-appearance-dialog');
    assert.equal(dialog.querySelector('[data-bottle-style="softener"]').getAttribute('aria-pressed'),'true');
    dialog.querySelector('[data-bottle-style="classic"]').click();Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Apply').click();
    const saved=records.length;
    const style=el('machine-style');
    assert.equal(style.value,'blocks');
    assert.equal(drawn.length,0);
    style.value='animated';style.dispatchEvent(new window.Event('change'));
    assert.equal(drawn.at(-1).type,'FILLER');
    assert(drawn.at(-1).seconds>0);
    const animatedControl=el('machine-controls').querySelector('[aria-label="upstream controls"]');
    const animatedCardTop=labels.slice(lastFrameOrigin).find(([text])=>text==='upstream')[3]-21*.75*.75;
    assert(Math.abs(parseFloat(animatedControl.style.top)-(drawn.at(-1).bottom+animatedCardTop)/2*scale)<1e-8);
    const count=drawn.length;
    style.value='blocks';style.dispatchEvent(new window.Event('change'));
    assert.equal(drawn.length,count);
    assert.equal(el('time').textContent,'1 s');
    assert.equal(records.length,saved);
    assert(records.at(-1).checkpoint.line[0].failureCount>0,'split MTBF/MTTR work without a general pair');
    const frame=labels.slice(lastFrameOrigin);
    const machine=frame.findIndex(([text,font])=>text==='upstream'&&font==='600 6.75px system-ui');
    const states=frame.findIndex(([text])=>text==='States');
    const efficiency=frame.findIndex(([text])=>text==='Equipment efficiency');
    assert(machine>=0&&machine<states&&states<efficiency);
    assert(frame[machine][2]<frame[states][2]&&frame[states][2]<frame[efficiency][2]);
    const failures=frame.slice(machine,states).findIndex(([text])=>text==='Own failures');
    assert(failures>=0);
    assert.equal(frame[machine+failures+1][0],String(records.at(-1).checkpoint.line[0].failureCount));
    assert(frame.slice(states,efficiency).some(([text])=>text==='Faulted'));
    assert.match(el('status').textContent,/Seed 7/);
    el('source').value='representative';
    el('source').dispatchEvent(new window.Event('change'));
    assert.match(el('status').textContent,/Round 2 · Seed 78/);
    assert.equal(el('limit').disabled,false);
    assert.equal(el('time').textContent,'0 s');
    assert.equal(el('output').textContent,'0');
    assert.deepEqual(createdSeeds,[7,78]);
    assert.equal(createdDefinitions[0].rate,599/60);
    assert.equal(createdDefinitions.at(-1).residenceSeconds,2);
    el('fit').click();
    el('speed').value='50';
    el('play').click();
    animate(1000);
    animate(1080);
    const before=bottles.at(-1);
    assert(Number.isFinite(before),'draw the bottles produced by the 2D engine');
    bottles.length=0;
    animate(1082);
    assert(bottles.length>0);
    assert.notEqual(bottles.at(-1),before,'the calculated bottle positions move');
    for(let now=1100;el('pause').disabled===false&&now<=6000;now+=20)animate(now);
    assert.equal(el('time').textContent,'25 s');
    const expected=engine.create(createdDefinitions,78);
    while(25-expected.time>1e-8)expected.step(Math.min(1/120,25-expected.time));
    assert(expected.line.at(-1).produced>0);
    assert.equal(el('output').textContent,String(expected.line.at(-1).produced));
    const fittedFrame=labels.slice(lastFrameOrigin);
    const telemetryY=fittedFrame.find(([text])=>text==='upstream')[3]-21*.75*.75;
    const cards=boxes.filter(box=>box.y===telemetryY);
    assert.equal(cards.length,9);
    const silhouettes=boxes.filter(box=>box.y<telemetryY&&box.width>100&&
      (box.height===7.5||box.height>170&&box.height<200));
    assert.equal(silhouettes.length,3);
    let firstCardIndex=0;
    for(const [index,silhouette] of silhouettes.entries()){
      const count=3;
      const first=cards[firstCardIndex],last=cards[firstCardIndex+count-1];
      const center=silhouette.x+silhouette.width/2;
      assert(Math.abs((first.x+last.x+last.width)/2-center)<1e-8);
      const previous=cards[firstCardIndex-1];
      if(previous)assert(first.x>=previous.x+previous.width);
      firstCardIndex+=count;
    }
    const control=el('machine-controls').querySelector('[aria-label="upstream controls"]');
    assert(Math.abs(parseFloat(control.style.left)-(silhouettes[0].x+silhouettes[0].width/2)*scale)<1e-8);
    const cardText=fittedFrame.filter(([, , , y])=>y>=telemetryY);
    assert(cardText.every(([,font])=>font==='6.75px system-ui'||font==='600 6.75px system-ui'));
    for(const title of ['upstream','belt','States','Equipment efficiency']){
      assert(labels.some(([text,font])=>text===title&&font==='600 6.75px system-ui'));
    }
    for(const label of ['Running','Starved','Ramp up','Ramp down','Faulted','Design speed','Availability','Runtime Efficiency','Operational efficiency','Throughput']){
      assert(labels.some(([text,font])=>text===label&&font==='6.75px system-ui'));
    }
    assert.equal(fittedFrame.filter(([text])=>text==='Equipment efficiency').length,2);
    const throughput=fittedFrame.findIndex(([text])=>text==='Throughput');
    assert(throughput>=0);
    assert.equal(fittedFrame[throughput+2][0],'bpm');
    const speeds=fittedFrame.flatMap(([text],index)=>text==='Design speed'?[fittedFrame.slice(index,index+3)]:[]);
    assert.deepEqual(speeds.map(row=>row.slice(1).map(([text])=>text)),[
      ['599','bpm'],['7.2','m/min'],['240','bpm']
    ]);
    const [parameter,value,unit]=speeds[1];
    assert.equal(value[0],'7.2');
    assert.equal(unit[0],'m/min');
    assert.equal(parameter[3],value[3]);
    assert.equal(value[3],unit[3]);
    assert.equal(value[4],'right');
    assert(parameter[2]<value[2]&&value[2]<unit[2]);
    assert.equal(JSON.stringify(records.at(-1).checkpoint),JSON.stringify(records[saved-1].checkpoint),'view saves preserve the independent simulation while viewing a representative round');
    el('source').value='independent';
    el('source').dispatchEvent(new window.Event('change'));
    assert.equal(el('time').textContent,'1 s');

    const action=label=>control.querySelector(`[aria-label="${label} · upstream"]`);
    const active=()=>control.querySelector('[aria-pressed="true"]');
    assert.equal(active(),action('Start / resume'));
    for(const label of ['Pause','Stop','Emergency stop']){
      action(label).click();
      assert.equal(active(),action(label));
    }
    action('Reset emergency stop').click();
    assert.equal(active(),action('Reset emergency stop'));
    assert.equal(action('Reset emergency stop').getAttribute('aria-pressed'),'true');
    action('Start / resume').click();
    assert.equal(active(),action('Start / resume'));

    Object.assign(window.SimulatorEngine,{productPackSize:()=>12,applyProductProfile:items=>items,productPresentation:()=>({})});
    const packer=equipment.at(-1);
    packer.processData.flowUnits={input:'BOTTLES',output:'CASES'};
    packer.processData.equipment.internalCapacityBottles=10;
    const loadPacker=()=>window.STSimulation2D.load(['case','12-pack'],equipment,{}, {seed:7},null);
    loadPacker();
    assert.equal(el('play').disabled,true);
    assert.match(el('status').textContent,/at least 12 bottles/);
    packer.processData.flowUnits={input:'CASES',output:'CASES'};
    packer.processData.equipment.internalCapacityBottles=3;
    loadPacker();
    assert.equal(el('play').disabled,false);
    assert.equal(createdDefinitions.at(-1).capacityBottles,36);
    assert.equal(createdDefinitions.at(-1).residenceSeconds,.75);
    packer.processData.flowUnits={input:'BOTTLES',output:'CASES'};
    delete packer.processData.equipment.internalCapacityBottles;
    loadPacker();
    assert.equal(el('play').disabled,false);
    assert.equal(el('pause').disabled,true);
    assert.equal(el('stop').disabled,true);
    assert.equal(el('reset').disabled,false);
    el('play').click();
    assert.equal(el('play').getAttribute('aria-pressed'),'true');
    assert.equal(el('pause').disabled,false);
    el('pause').click();
    assert.equal(el('pause').getAttribute('aria-pressed'),'true');
    assert.equal(el('stop').disabled,false);
    el('stop').click();
    assert.equal(el('stop').getAttribute('aria-pressed'),'true');
    el('reset').click();
    assert.equal(el('reset').getAttribute('aria-pressed'),'true');
    assert.equal(el('stop').getAttribute('aria-pressed'),'false');
    assert.match(el('status').textContent,/^Ready/);
    const canvas=el('canvas');
    const pointer=(target,type,x,buttons,button=0)=>target.dispatchEvent(Object.assign(
      new window.MouseEvent(type,{clientX:x,clientY:100,button,buttons,bubbles:true}),{pointerId:1}));
    el('fit').click();
    const frameX=()=>labels.slice(lastFrameOrigin).find(([text])=>text==='upstream')[2];
    const fittedX=frameX();
    const titlePosition=()=>labels.slice(lastFrameOrigin).find(([text])=>text==='upstream').slice(2,4).map(value=>value*scale);
    const anchor=[240,180],beforeZoom=titlePosition(),beforeScale=scale;
    const wheel=new window.WheelEvent('wheel',{deltaY:-120,clientX:anchor[0],clientY:anchor[1],bubbles:true,cancelable:true});
    canvas.dispatchEvent(wheel);
    assert(wheel.defaultPrevented);
    assert(scale>beforeScale);
    for(const [index,value] of titlePosition().entries()){
      assert(Math.abs((value-anchor[index])-(beforeZoom[index]-anchor[index])*scale/beforeScale)<1e-8);
    }
    const beforePan=titlePosition()[0];
    pointer(canvas,'pointerdown',120,4,1);
    pointer(window,'pointermove',160,4,1);
    pointer(window,'pointerup',160,0,1);
    assert(Math.abs(titlePosition()[0]-beforePan-40)<1e-8);
    el('fit').click();
    pointer(canvas,'pointerdown',120,1);
    pointer(window,'pointermove',160,1);
    pointer(window,'pointerup',160,0);
    const draggedX=frameX();
    assert.notEqual(draggedX,fittedX);
    canvas.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}));
    assert.equal(frameX(),draggedX);
    window.STSimulation2D.load(['case','12-pack'],equipment,{}, {seed:8},null);
    assert.equal(frameX(),draggedX);
    el('fit').click();
    assert.equal(frameX(),fittedX);
    function stages(types,names=[],parameter='Bottle stage'){
      const machines=['BLOWMOLDER',...types,'CUSTOM'];
      const line=machines.flatMap((type,index)=>[
        {id:'m'+index,name:names[index-1],type,nominalRatePerSecond:10},
        ...(index<machines.length-1?[{id:'b'+index,type:'CONVEYOR'}]:[])
      ]);
      window.STSimulation2D.load(['case','stage-order'],line,null,{seed:7},null);
      el('fit').click();
      const frame=labels.slice(lastFrameOrigin);
      return frame.flatMap(([text],index)=>text===parameter?[frame[index+1][0]]:[]);
    }
    assert.deepEqual(stages(['SLEEVER','FILLER']),['Empty','Labeled','Filled + labeled']);
    assert.deepEqual(stages(['FILLER','SLEEVER']),['Empty','Filled','Filled + labeled']);
    assert.deepEqual(stages(['FILLER','SLEEVER'],[],'Cap'),['Applied','Applied']);
    assert.deepEqual(stages(['FILLER','CAPPER'],[],'Cap'),['Applied']);
    assert.deepEqual(stages(['FILLER','SLEEVER'],['Filler / Capper'],'Cap'),['Applied','Applied']);
    assert.deepEqual(stages(['FILLER','CUSTOM'],['Filler','Tapadora'],'Cap'),['Applied']);
    assert.deepEqual(stages(['PUCKER','FILLER','DEPUCKER'],[],'Puck'),['Present','Present']);
    assert.deepEqual(stages(['PUCKER','FILLER','DEPUCKER']),['Labeled','Labeled','Filled + labeled','Filled + labeled']);
    equipment[1].processData.geometry={lactMm:2000,lpPrimeMm:500,actualDischargeMm:100,actualCodingMm:150};
    equipment[1].processData.upstream={dischargeVelocityMPerMinute:7.2};
    equipment[1].processData.accumulation={restartToFirstPackageSeconds:4};
    Object.assign(geometry,{primeSensorPositionMm:1500,backupSensorPositionMm:500,
      engineering:{input:{packageLengthMm:30,upstreamNominalSpeedBpm:120,upstreamDischargePitchMm:50,downstreamInfeedPitchMm:60,
        conveyorSpeedFactorPercent:0,codingSpeedFactorPercent:50,blockedTimeDelaySeconds:1,
        clearTimeDelaySeconds:0,upstreamStartupTimeSeconds:2,bottlesDischargedAtStop:1,insuranceFactorUnits:0},
        calculated:{dischargeZoneSpeedMmPerSecond:100,codingZoneSpeedMmPerSecond:150,downstreamConsumptionRateMmPerSecond:55}}});
    window.SimulatorEngine.applyProductProfile=(line,profile)=>line.map(item=>({...item,formatId:profile.id}));
    window.SimulatorEngine.resolveProductConveyor=(line,index)=>line[index].formatId==='slow-recovery'?{
      ...geometry,conveyorSpeedMmPerSecond:150,engineering:{...geometry.engineering,
        calculated:{...geometry.engineering.calculated,downstreamConsumptionRateMmPerSecond:80}}
    }:geometry;
    const formats=[{id:'large-overflow'},{id:'slow-recovery'}];
    window.STSimulation2D.load(['case','dimensions'],equipment,null,{seed:7},null,null,null,formats);
    el('fit').click();
    for(const name of ['source','dimensions','failures','show-events','limit']){
      assert(el('settings').contains(el(name)));
    }
    for(const name of ['output','running','canvas','play','fullscreen']){
      assert(el('results').contains(el(name)));
    }
    const events=el('events-panel');
    assert(events.hidden);
    el('show-events').click();
    assert(!events.hidden);
    assert(events.contains(window.document.getElementById('simulation-event-section')));
    el('show-events').click();
    assert(events.hidden);
    assert.equal(el('settings-title').textContent,'Settings');
    assert.equal(el('title').textContent,'Layout');
    assert.equal(el('running').textContent,'0/2');
    const fullscreen=el('fullscreen');
    assert.equal(fullscreen.previousElementSibling,el('fit'));
    fullscreen.click();
    assert(el('results').classList.contains('simulation2d-fullscreen'));
    assert.equal(fullscreen.getAttribute('aria-pressed'),'true');
    window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'}));
    assert(!el('results').classList.contains('simulation2d-fullscreen'));
    assert.equal(fullscreen.getAttribute('aria-pressed'),'false');
    const dimensions=el('dimensions');
    const currentLabels=()=>labels.slice(lastFrameOrigin).map(([text])=>text);
    const marker=label=>{
      const frame=labels.slice(lastFrameOrigin);
      const headingY=frame.find(([text])=>text==='Parameter')[3];
      return frame.find(([text,,,y])=>text===label&&y<headingY);
    };
    const sensorPosition=label=>marker(label).slice(2,4);
    const originalSensors=['B','P'].map(sensorPosition);
    for(const control of ['source','machine-style','dimensions']){
      assert.equal(el(control).closest('.simulation2d-options'),dimensions.closest('.simulation2d-options'));
    }
    assert(!currentLabels().some(text=>text.startsWith('Lact ·')));
    dimensions.checked=true;dimensions.dispatchEvent(new window.Event('change'));
    for(const label of ['Lact','Lp','Accumulation Zone (Lba)','Lbu','Discharge','Coding','Overflow','Lrec']){
      assert(currentLabels().some(text=>text.startsWith(label+' ·')));
    }
    for(const [label,value] of [['Overflow',555],['Lbu',805],['Accumulation Zone (Lba)',695],['Lrec',-710]]){
      assert(currentLabels().includes(label+' · '+value.toLocaleString()+' mm'+(value<0?' deficit':'')));
    }
    const dimensionLabel=prefix=>labels.slice(lastFrameOrigin).find(([text])=>text.startsWith(prefix+' ·'));
    const discharge=dimensionLabel('Discharge'),coding=dimensionLabel('Coding'),overflow=dimensionLabel('Overflow');
    assert(discharge[2]<coding[2]&&coding[2]<overflow[2]);
    assert.equal(discharge[1],'6.75px system-ui');
    const topTier=['Discharge','Coding','Overflow','Lrec','Lp'].map(dimensionLabel);
    for(const entry of topTier)assert.equal(entry[3],discharge[3]);
    for(let index=1;index<topTier.length;index++){
      const [previous,current]=topTier.slice(index-1,index+1);
      assert(current[2]-previous[2]>=(previous[0].length+current[0].length)*2.8125/2+7.99);
    }
    assert(Math.abs(dimensionLabel('Lbu')[3]-dimensionLabel('Accumulation Zone (Lba)')[3])<=10);
    assert(dimensionLabel('Lbu')[3]<overflow[3]);
    assert(dimensionLabel('Lact')[3]<dimensionLabel('Accumulation Zone (Lba)')[3]);

    const lact=dimensionLabel('Lact'),lactY=lact[3];
    const lactLines=segments.filter(({start,end,dash})=>!dash&&start[1]===lactY&&end[1]===lactY);
    assert.equal(lactLines.length,2);
    assert(lactLines[0].end[0]<lact[2]&&lactLines[1].start[0]>lact[2]);
    assert(segments.some(({start,end,dash})=>!dash&&start[1]===discharge[3]+10&&end[1]===start[1]&&Math.abs(end[0]-start[0]-9)<.0001));
    const guides=()=>segments.filter(({start,end,dash})=>dash&&start[1]===lactY&&end[1]>lactY);
    canvas.dispatchEvent(new window.MouseEvent('pointermove',{clientX:lact[2]*scale,clientY:lactY*scale}));
    assert.equal(guides().length,2);
    canvas.dispatchEvent(new window.MouseEvent('pointerleave'));
    assert.equal(guides().length,0);

    const close=(actual,expected)=>assert(Math.abs(actual-expected)<.0001);
    assert.deepEqual(['B','P'].map(sensorPosition),originalSensors);
    close(marker('Design B')[2]-marker('Max Run-Out point')[2],555*.09);
    close(marker('P')[2]-marker('Design B')[2],695*.09);
    assert(!marker('Design P'));
    assert(overflow[3]<marker('B')[3]);
    const headings=labels.slice(lastFrameOrigin).filter(([text])=>text==='Parameter').slice(0,6);
    assert.equal(headings.length,6);
    for(const [index,heading] of headings.entries()){
      assert.equal(heading[3],headings[0][3]);
      if(index)assert(heading[2]-headings[index-1][2]>=100);
    }
    assert(!marker('Recovery Point'));
    window.STSimulation2D.load(['case','dimensions'],equipment,null,{seed:7},null,null,null,[formats[0]]);
    assert(!marker('Recovery Point'));

    Object.assign(geometry.engineering.calculated,{
      overflowProductLengthMm:300,recoveryLengthMm:150,minimumInstalledLengthMm:2400
    });
    window.STSimulation2D.load(['case','engineering-dimensions'],equipment,null,{seed:7},null,null,null,[formats[0]]);
    for(const [label,value] of [['Overflow',555],['Lbu',805],['Accumulation Zone (Lba)',695],['Lrec',-540],['L min',2540]]){
      assert(currentLabels().includes(label+' · '+value.toLocaleString()+' mm'+(value<0?' deficit':'')));
    }
    const analysisEl=id=>window.document.getElementById('conveyor-analysis-'+id);
    const analysis=analysisEl('dialog');
    analysis.showModal=()=>{analysis.open=true;};
    analysis.close=()=>{analysis.open=false;};
    const analysisButton=el('machine-controls').querySelector('[aria-haspopup="dialog"]');
    assert.equal(analysisButton.textContent,'Conveyor Geometry');
    assert(currentLabels().includes('Back-up position'));
    assert.equal(analysisButton.hidden,false);
    analysisButton.click();
    assert(analysis.open);
    assert.equal(analysisEl('body').querySelector('.conveyor-analysis-verdict').textContent,'FAIL');
    const failBadge=analysisEl('body').querySelector('.conveyor-analysis-verdict');
    assert.match(failBadge.title,/Lrec es negativo.*540 mm/);
    const [, , verdictX,verdictY]=labels.slice(lastFrameOrigin).find(([text])=>text==='FAIL');
    canvas.dispatchEvent(new window.MouseEvent('pointermove',{clientX:verdictX*scale,clientY:(verdictY-3)*scale}));
    assert.equal(canvas.title,failBadge.title);
    canvas.dispatchEvent(new window.MouseEvent('pointerleave'));
    assert.equal(canvas.title,'');
    for(const ref of ['K8','L70']){
      const help=analysisEl('body').querySelector('[data-cell="'+ref+'"]').title;
      for(const sign of ['>','='])assert(help.includes('Lrec '+sign+' 0'));
      assert(help.includes('Lrec < 0'));
    }
    assert.equal(analysisEl('title').textContent,'Conveyor Analysis Tool · belt');
    const tableValue=label=>{
      const item=[...analysisEl('body').querySelectorAll('tbody tr')].find(row=>row.dataset.cell===label||row.cells[0].textContent===label);
      assert(item,label);
      const headers=[...item.closest('table').tHead.rows[0].cells].map(cell=>cell.textContent);
      assert.equal(headers[0],'Parameter');
      assert.equal(headers.at(-1),'Unit');
      assert.equal(headers.length,3);
      return [...item.cells].slice(1,-1).map(cell=>cell.textContent);
    };
    assert.deepEqual(tableValue('Back-up Sensor (actual)'),['500']);
    assert.deepEqual(tableValue('Prime Sensor (actual)'),['1,500']);
    assert.deepEqual(tableValue('Discharge'),['100']);
    assert.deepEqual(tableValue('Coding'),['150']);
    assert.deepEqual(tableValue('F8'),['555']);
    assert.deepEqual(tableValue('Accumulation Zone (Lba)'),['695']);
    assert.deepEqual(tableValue('L23'),['7.2']);
    assert.deepEqual(tableValue('L22'),['144']);
    assert.deepEqual(tableValue('L24'),['4.32']);
    assert.deepEqual(tableValue('L34'),['7.2']);
    assert.deepEqual(tableValue('L37'),['10.8']);
    assert.equal(analysisEl('body').querySelector('[data-cell="L23"] input'),null);
    analysis.close();
    assert(!marker('Recovery Point'));
    const extent=label=>{
      const [, , , y]=dimensionLabel(label);
      const lines=segments.filter(({start,end,dash})=>!dash&&start[1]===y&&end[1]===y);
      return Math.max(...lines.map(line=>line.end[0]))-Math.min(...lines.map(line=>line.start[0]));
    };
    const minLength=dimensionLabel('L min'),totalLength=dimensionLabel('Lact');
    assert.equal(minLength[2],totalLength[2]);
    assert.equal(minLength[3]-totalLength[3],14);
    assert(!segments.some(({start,end,dash})=>!dash&&start[1]===minLength[3]&&end[1]===minLength[3]));
    close(extent('Lact'),2000*.09);
    equipment[1].processData.geometry.lactMm=2540;
    const limit=window.STConveyorAnalysis.calculate({
      zone:geometry,data:equipment[1].processData,index:1,
      designProfiles:[{models:equipment,zones:[null,geometry]}]
    }).geometry;
    assert.equal(limit.status,'AT LIMIT');
    close(limit.recovery.value,0);
    equipment[1].processData.geometry.lactMm=2000;
    delete equipment[1].processData.geometry.actualDischargeMm;
    delete equipment[1].processData.geometry.actualCodingMm;
    delete equipment[1].processData.accumulation.restartToFirstPackageSeconds;
    geometry.engineering.input.dischargeRunoutLengthMm=0;
    window.STSimulation2D.load(['case','pending-dimensions'],equipment,null,{seed:7},null,null,null,[formats[0]]);
    assert(currentLabels().includes('Discharge · 0 mm'));
    assert(currentLabels().includes('Coding · pending'));
    el('machine-controls').querySelector('[aria-haspopup="dialog"]').click();
    assert.deepEqual(tableValue('Coding'),['Pending']);
    const pendingBadge=analysisEl('body').querySelector('.conveyor-analysis-verdict');
    assert.equal(pendingBadge.textContent,'NOT EVALUATED');
    assert.match(pendingBadge.title,/Coding actual/);
    assert.match(pendingBadge.title,/Time to First Package After Restart/);
    assert.deepEqual(tableValue('L23'),['7.2']);
    assert.deepEqual(tableValue('F8'),['Pending']);
    analysis.close();

    const calculatedSensors=['B','P'].map(sensorPosition);

    dimensions.checked=false;dimensions.dispatchEvent(new window.Event('change'));
    assert(!currentLabels().some(text=>text.startsWith('Lact ·')));
    assert(!marker('Max Run-Out point'));
    assert(!marker('Design B'));
    assert.deepEqual(['B','P'].map(sensorPosition),calculatedSensors);

    equipment[1].processData.upstream={...equipment[1].processData.upstream,dischargeVelocityMPerMinute:18.816};
    equipment[1].processData.accumulation={...equipment[1].processData.accumulation,restartToFirstPackageSeconds:2};
    equipment[1].processData.geometry={lactMm:5953,lpPrimeMm:1000,actualDischargeMm:0,actualCodingMm:0};
    Object.assign(geometry,{usableLengthMm:5953,productLengthMm:98,productPitchMm:220,
      accumulatedPitchMm:98,conveyorSpeedMmPerSecond:42400/60,primeSensorPositionMm:4953,
      engineering:{input:{packageLengthMm:98,upstreamDischargePitchMm:98,downstreamInfeedPitchMm:250,upstreamNominalSpeedBpm:192,downstreamHighSpeedBpm:175,
        blockedTimeDelaySeconds:.5,clearTimeDelaySeconds:.5,upstreamStartupTimeSeconds:1,
        bottlesDischargedAtStop:2,insuranceFactorUnits:3}}});
    const secondBelt={...equipment[1],id:'belt-2',name:'second belt',processData:{
      ...equipment[1].processData,flowUnits:{output:'CASES'},geometry:{...equipment[1].processData.geometry,lactMm:7000}}};
    const line=[...equipment,secondBelt,{...equipment.at(-1),id:'last-machine'}];
    const format={id:'labeller',name:'Format 1'};
    window.STSimulation2D.load(['case','worksheet'],line,format,{seed:7},null,null,null,[format]);
    el('fit').click();
    const buttons=[...el('machine-controls').querySelectorAll('[aria-haspopup="dialog"]')];
    assert.equal(buttons.length,2);
    buttons[0].click();
    assert.equal(analysisEl('title').textContent,'Conveyor Analysis Tool · belt');
    assert.deepEqual(tableValue('F8'),['1,162.84']);
    assert.deepEqual(tableValue('Accumulation Zone (Lba)'),['3,790.16']);
    assert.deepEqual(tableValue('L62'),['2']);
    assert.equal(analysisEl('body').querySelector('[data-cell="L62"] input'),null);
    assert.deepEqual(tableValue('L20'),['1']);
    assert.deepEqual(tableValue('L22'),['192']);
    assert.deepEqual(tableValue('L23'),['18.82']);
    assert.deepEqual(tableValue('L24'),['18.82']);
    const speedRows=[...analysisEl('body').querySelectorAll('tr[data-zone]')];
    assert.equal(speedRows[0].closest('table').tBodies[0].rows.length,9);
    assert.deepEqual(speedRows.map(row=>row.dataset.zone),[
      'discharge','discharge','discharge','coding','coding','coding','overflow','overflow','overflow'
    ]);
    assert.equal(analysisEl('body').querySelector('[data-cell="L51"]').closest('tbody').rows.length,8);
    for(const [cell,value] of [[51,'1.6'],[52,'2'],[53,'0'],[54,'0'],[55,'3'],[56,'6.6'],[57,'646.8'],[58,'1,162.84']]){
      assert.deepEqual(tableValue('L'+cell),[value]);
    }
    assert.deepEqual(tableValue('L27'),['169.6']);
    assert.deepEqual(tableValue('L30'),['16.62']);
    assert.deepEqual(tableValue('K8'),['1,901.41']);
    assert.deepEqual(tableValue('L (min needed)'),['4,051.59']);
    assert.equal(analysisEl('body').querySelector('.conveyor-analysis-verdict').textContent,'PASS');
    assert(currentLabels().includes('PASS'));
    assert.deepEqual(tableValue('L74'),['13.68']);
    assert.deepEqual(tableValue('L76'),['6.72']);
    assert.deepEqual(tableValue('L79'),['5']);
    assert.deepEqual(tableValue('L80'),['65.63']);
    analysis.close();
    buttons[1].click();
    assert.equal(analysisEl('title').textContent,'Conveyor Analysis Tool · second belt');
    assert.deepEqual(tableValue('I13'),['7,000']);
    assert.deepEqual(tableValue('L27'),['2,035.2']);
    assert.deepEqual(tableValue('L30'),['16.62']);
    assert.deepEqual(tableValue('L58'),['1,162.84']);
    analysis.close();
    const checkpointBeforeViews=JSON.stringify(records.at(-1)?.checkpoint);
    const timeBeforeViews=el('time').textContent,outputBeforeViews=el('output').textContent;
    const views=el('viewports');views.value='4';views.dispatchEvent(new window.Event('change'));
    assert.equal(window.document.querySelectorAll('.simulation2d-viewport:not([hidden])').length,4);
    assert.equal(window.document.querySelectorAll('.simulation2d-viewport-zoom').length,4);
    assert(!el('zoom').closest('.fold-tools'));
    assert.equal(el('zoom').closest('.simulation2d-viewport').dataset.viewport,'0');
    const second=window.document.getElementById('simulation2d-canvas-2');
    const firstPosition=frameX(),position=()=>viewportText.get(second).find(([text])=>text==='belt')[1];
    const initialSecond=position();
    second.dispatchEvent(new window.WheelEvent('wheel',{deltaY:-100,clientX:160,clientY:100,bubbles:true,cancelable:true}));
    assert.notEqual(position(),initialSecond);assert.equal(frameX(),firstPosition,'zooming viewport two preserves viewport one');
    assert.equal(el('machine-controls').parentElement.dataset.viewport,'1');
    const mainZoom=el('zoom-value').textContent;
    const secondSlider=window.document.getElementById('simulation2d-zoom-2');secondSlider.value=String(Number(secondSlider.value)+.3);secondSlider.dispatchEvent(new window.Event('input',{bubbles:true}));
    assert.equal(el('zoom-value').textContent,mainZoom,'each viewport owns its zoom control');
    const secondZoomed=position();
    pointer(second,'pointerdown',120,1);pointer(window,'pointermove',160,1);pointer(window,'pointerup',160,0);
    assert.notEqual(position(),secondZoomed);assert.equal(frameX(),firstPosition,'panning viewport two preserves viewport one');
    assert.equal(JSON.stringify(records.at(-1)?.checkpoint),checkpointBeforeViews,'all viewports share the unchanged simulation');
    assert.equal(el('time').textContent,timeBeforeViews);assert.equal(el('output').textContent,outputBeforeViews);
    for(const count of [3,2,1]){views.value=String(count);views.dispatchEvent(new window.Event('change'));assert.equal(window.document.querySelectorAll('.simulation2d-viewport:not([hidden])').length,count);}
    // Layout changes survive a full unload/reload and keep the simulation checkpoint intact.
    const identity=['viewport-case','saved-layout'],config={seed:7,durationSeconds:25};
    window.STSimulation2D.load(identity,equipment,null,config,null,record=>records.push(record));
    views.value='4';views.dispatchEvent(new window.Event('change'));
    const diagram=el('canvas').closest('.simulation2d-diagram');
    diagram.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:600});
    const vertical=diagram.querySelector('[data-axis="x"]'),horizontal=diagram.querySelector('[data-axis="y"]');
    assert.equal(vertical.getAttribute('role'),'separator');assert(!vertical.hidden&&!horizontal.hidden);
    pointer(vertical,'pointerdown',500,1);pointer(window,'pointermove',700,1);pointer(window,'pointerup',700,0);
    assert(records.at(-1).layout.split.x>.6,'drag changes the column widths');
    horizontal.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    assert.equal(records.at(-1).layout.split.y,.52,'keyboard changes the row heights');
    el('dimensions').checked=true;el('dimensions').dispatchEvent(new window.Event('change'));
    el('machine-style').value='animated';el('machine-style').dispatchEvent(new window.Event('change'));
    el('show-events').checked=true;el('show-events').dispatchEvent(new window.Event('change'));
    secondSlider.value='1.2';secondSlider.dispatchEvent(new window.Event('input',{bubbles:true}));
    pointer(second,'pointerdown',120,1);pointer(window,'pointermove',160,1);pointer(window,'pointerup',160,0);
    const stored=JSON.parse(JSON.stringify(records.at(-1)));
    assert.equal(stored.layout.activeViewport,1);assert.equal(stored.layout.equipmentView,'animated');
    assert(stored.layout.showDimensions&&stored.layout.showEvents);
    window.STSimulation2D.unload();
    Object.defineProperty(second,'clientWidth',{value:600,configurable:true});
    window.STSimulation2D.load(identity,equipment,null,config,stored,record=>records.push(record));
    assert.equal(views.value,'4');assert.equal(el('machine-controls').parentElement.dataset.viewport,'1');
    assert(el('dimensions').checked&&el('show-events').checked);assert.equal(el('machine-style').value,'animated');
    el('speed').dispatchEvent(new window.Event('change'));
    const restored=JSON.parse(JSON.stringify(records.at(-1)));
    assert.deepEqual(restored.layout.split,stored.layout.split);
    assert.equal(restored.layout.cameras[1].scale,stored.layout.cameras[1].scale);
    assert.equal(restored.layout.cameras[1].x,stored.layout.cameras[1].x+90,'screen resizing keeps the same world center');
    assert.equal(restored.layout.cameras[0].x,stored.layout.cameras[0].x);
    assert.equal(JSON.stringify(restored.checkpoint),JSON.stringify(stored.checkpoint));
    vertical.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}));
    assert.deepEqual(JSON.parse(JSON.stringify(records.at(-1).layout.split)),{x:.5,y:.5},'double-click restores equal sizes in both directions');
    const normalViews=JSON.parse(JSON.stringify(records.at(-1).layout.cameras));
    el('fullscreen').click();
    secondSlider.value='1.8';secondSlider.dispatchEvent(new window.Event('input',{bubbles:true}));
    pointer(second,'pointerdown',120,1);pointer(window,'pointermove',195,1);pointer(window,'pointerup',195,0);
    const fullscreenRecord=JSON.parse(JSON.stringify(records.at(-1)));
    assert.deepEqual(fullscreenRecord.layout.cameras,normalViews,'normal mode keeps its own framing while fullscreen is edited');
    const fullscreenViews=fullscreenRecord.layout.fullscreenCameras;
    el('fullscreen').click();el('speed').dispatchEvent(new window.Event('change'));
    assert.deepEqual(JSON.parse(JSON.stringify(records.at(-1).layout.cameras)),normalViews);
    for(let cycle=0;cycle<2;cycle++){
      el('fullscreen').click();el('speed').dispatchEvent(new window.Event('change'));
      assert.deepEqual(JSON.parse(JSON.stringify(records.at(-1).layout.fullscreenCameras)),fullscreenViews,'re-entering fullscreen restores every view without fitting again');
      el('fullscreen').click();
    }
    window.STSimulation2D.unload();
    window.STSimulation2D.load(identity,equipment,null,config,fullscreenRecord,record=>records.push(record));
    el('fullscreen').click();el('speed').dispatchEvent(new window.Event('change'));
    assert.deepEqual(JSON.parse(JSON.stringify(records.at(-1).layout.fullscreenCameras)),fullscreenViews,'fullscreen cameras survive reopening the case');
    assert.equal(JSON.stringify(records.at(-1).checkpoint),JSON.stringify(fullscreenRecord.checkpoint));
    el('fullscreen').click();

    const layerOrder=[],originalPalletDraw=window.STSimulation2DMachines.drawPalletOutput,originalMachineDraw=window.STSimulation2DMachines.draw;
    window.STSimulation2DMachines.drawPalletOutput=(...args)=>{layerOrder.push(args.at(-1));return originalPalletDraw(...args);};
    window.STSimulation2DMachines.draw=(...args)=>{if(args[1]==='PALLETIZER')layerOrder.push('equipment');return originalMachineDraw(...args);};
    const palletLine=[
      {id:'packer',type:'CASE_PACKER',nominalRatePerSecond:1,processData:{flowUnits:{input:'BOTTLES',output:'CASES'},equipment:{internalCapacityBottles:24}}},
      {id:'case-belt',type:'CONVEYOR',processData:{flowUnits:{input:'CASES',output:'CASES'}}},
      {id:'palletizer',type:'PALLETIZER',nominalRatePerSecond:.5,processData:{flowUnits:{input:'CASES',output:'CASES'},equipment:{internalCapacityBottles:3}}}
    ];
    window.STSimulation2D.load(['fixed-layers','case'],palletLine,{},config,null);
    el('machine-style').value='animated';el('machine-style').dispatchEvent(new window.Event('change'));layerOrder.length=0;el('fit').click();
    const stagingIndex=layerOrder.lastIndexOf('staging'),robotIndex=layerOrder.lastIndexOf('robot'),equipmentIndex=layerOrder.lastIndexOf('equipment');
    assert(stagingIndex>=0&&stagingIndex<robotIndex&&robotIndex<equipmentIndex,'complete layout always paints stored pallets, robot, then equipment');
    assert(!layerOrder.includes('foreground'),'no phase-dependent foreground pass can move the robot above the equipment');
    window.STSimulation2DMachines.drawPalletOutput=originalPalletDraw;window.STSimulation2DMachines.draw=originalMachineDraw;
  }finally{dom.window.close();}
});

test('2D retains resident bottles across snapshots and caps admission', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'), {window});
  const definitions=[{kind:'machine',rate:.5,batch:1,startDelay:0,rampSeconds:0,
    capacityBottles:10,residenceSeconds:20,inputBottleFactor:1}];
  const engine=window.STSimulation2DEngine;
  const model=engine.create(definitions);
  for(let i=0;i<1200;i++)model.step(1/120);
  assert(model.line[0].resident.length>0);
  assert(model.line[0].resident.length<10);
  assert.equal(model.line[0].produced,0);
  const restored=engine.create(definitions,1,model.snapshot());
  assert.equal(restored.line[0].resident.length,model.line[0].resident.length);
  for(let i=0;i<1440;i++)restored.step(1/120);
  assert(restored.line[0].produced>0);
  assert(restored.line[0].resident.length<=10);
});

test('resident bottles discharge at even headways and Back-up leaves 25 of 30 after a five-bottle runout', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'), {window});
  const machine={kind:'machine',rate:1.5,batch:1,startDelay:0,rampSeconds:0,
    capacityBottles:30,residenceSeconds:20,inputBottleFactor:1,bottlesPerUnit:1};
  const belt={kind:'belt',length:100000,speed:1000,packageLength:20,pitch:25,packedGap:0,prime:null,backup:null,
    blockDelay:0,clearDelay:Infinity,responseDelay:2,residual:5};
  const engine=window.STSimulation2DEngine;
  const continuous=engine.create([machine]);
  while(continuous.time<65)continuous.step(1/120);
  const output=continuous.line[0].recentOutput;
  assert(output.length>=7);
  for(let i=1;i<output.length;i++)assert(Math.abs(output[i]-output[i-1]-2/3)<1/120+1e-8);
  const model=engine.create([machine,belt]);
  while(model.time<19.8)model.step(1/120);
  assert.equal(model.line[0].resident.length,30);
  assert.equal(model.line[0].produced,0);
  model.line[1].backupBlocked=true;
  while(model.time<30)model.step(1/120);
  assert.equal(model.line[0].produced,5);
  assert.equal(model.line[0].resident.length,25);
  assert.equal(model.line[0].state,'Back-up stop');
});

test('palletizer stages a bounded symbolic output and transfers the last processed case', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DMachines'),{window});
  const art=window.STSimulation2DMachines,colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
  function scene(produced,progress,layer='all'){
    const boxes=[];
    const context=new Proxy({
      fillRect(...args){if(this.fillStyle===colors.belt)boxes.push(args);}
    },{
      get:(target,key)=>target[key]??(()=>{})
    });
    art.drawPalletOutput(context,200,100,180,colors,produced,progress,layer);
    assert(boxes.flat().every(Number.isFinite));
    return boxes.filter(([, ,width,height])=>width===37&&height===28);
  }
  assert.equal(scene(1,.5,'robot').length,1);
  assert.equal(scene(1,.5,'staging').length,0);
  assert.equal(scene(0,1).length,0);
  const moving=scene(1,.5);
  assert.equal(moving.length,1);
  const placed=scene(1,1);
  assert.equal(placed.length,1);
  assert.notDeepEqual(moving,placed);
  assert(scene(120000,1).length<=108);
  assert(scene(120011,.5).length<=108);
  assert.equal(scene(0,1).length,0);
});

test('pallets have 36 spaces in four levels and move on one common floor',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,stage=art.palletStage;
 assert.equal(stage(35,1).exchange,false);assert.equal(stage(36,.6).exchange,true);
 assert.equal(stage(36,.6).shift,0);assert(stage(36,.77).shift>0&&stage(36,.77).shift<1);
 assert.equal(stage(36,1).shift,1);assert.equal(stage(37,0).count,0);
 assert.equal(stage(105,1).forkVisible,false);assert.equal(stage(106,.2).forkVisible,true);
 const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
 function scene(produced,progress,extra={}){
   const decks=[],cases=[];const ctx=new Proxy({roundRect(x,y,w,h){if(Math.abs(w-123)<1e-5&&h===5)decks.push([x,y]);},fillRect(x,y,w,h){if(w===37&&h===28&&this.fillStyle===colors.belt)cases.push([x,y]);}},{get:(o,k)=>o[k]??(()=>{})});
   art.drawPalletOutput(ctx,200,100,180,{...colors,...extra},produced,progress,'staging');return {decks:decks.filter(([,y])=>y<=190),cases};
 }
 const full=scene(36,1);assert.equal(full.cases.length,12);
 assert.equal(new Set(full.cases.map(([x,y])=>x+','+y)).size,12);
 for(let i=0;i<full.cases.length;i++)for(let j=i+1;j<full.cases.length;j++){const [ax,ay]=full.cases[i],[bx,by]=full.cases[j];assert(ax+37<=bx||bx+37<=ax||ay+28<=by||by+28<=ay,'front cartons never overlap');}
 for(let level=0;level<4;level++){const front=190-(level+1)*28;assert.equal(full.cases.filter(([,y])=>y===front).length,3);}
 // Three separated front faces encode the three depth rows symbolically.
 assert.equal(new Set(full.cases.map(([,y])=>y)).size,4);
 const final=scene(108,1);assert.equal(final.decks.length,3);assert(final.decks.every(([,y])=>y===190));
 assert(final.decks.some(([x])=>Math.abs(x-300)<1e-6));
 assert(final.decks.some(([x])=>Math.abs(x-443)<1e-6));
 assert(final.decks.some(([x])=>Math.abs(x-586)<1e-6));
 const picked=scene(106,.4,{forkProgress:.5,forkGroup:2});assert.equal(picked.decks.filter(([,y])=>y===190).length,2);assert.equal(picked.decks.filter(([,y])=>y===180).length,1);
});


test('a palletizer case crosses continuously from belt exit through the machine to pickup', () => {
  const source=script('Simulation2D');
  const context=vm.createContext({
    step:1/120,caseDimensions:()=>({caseWidth:37,caseHeight:28}),
    productHeight:()=>28,beltHalfHeight:()=>18
  });
  vm.runInContext(source.slice(source.indexOf('  function palletInfeed('),source.indexOf('  function drawPalletInfeed(')),context);
  const belt={kind:'belt'},machine={resident:[10],residenceClock:0,residenceSeconds:10};
  const items=[{left:100,width:200},{left:400,width:300}];
  const path=context.palletInfeed([belt,machine],items,100);
  assert.equal(path.cases[0].left,263);
  assert.equal(path.cases[0].top,82);
  machine.residenceClock=5;
  const midway=context.palletInfeed([belt,machine],items,100).cases[0];
  assert.equal(midway.left,463);
  machine.residenceClock=10;
  const end=context.palletInfeed([belt,machine],items,100);
  assert.equal(end.cases[0].left,end.pickup);
  assert.equal(end.cases[0].top,82);assert.equal(midway.top,82,'infeed stays horizontal');
  const window={};
  vm.runInNewContext(script('Simulation2DMachines'),{window});
  const cartons=[];
  const colors={belt:'#777',soft:'#eee',surface:'#fff',accent:'#08f',ink:'#111',caseWidth:37,caseHeight:28,pickupY:end.startBottom};
  const canvas=new Proxy({fillRect(x,y,w,h){
    if(this.fillStyle===colors.belt&&w===37&&h===28)cartons.push([x,y]);
  }},{get:(target,key)=>target[key]??(()=>{})});
  window.STSimulation2DMachines.drawPalletOutput(canvas,720,100,end.pickup,colors,1,0);
  assert.deepEqual(cartons[0],[end.pickup,end.cases[0].top]);
});

test('new output waits behind a symbolic pickup and movement runs 1.2 times faster',()=>{
 const context=vm.createContext({model:{time:0},palletAnimation:null,reducedMotion:{matches:false}}),source=script('Simulation2D');
 vm.runInContext(source.slice(source.indexOf('  function palletTransfer('),source.indexOf('  function productionHeight(')),context);
 const item={produced:0,rate:.5};context.palletTransfer(item);item.produced=1;context.model.time=.1;
 assert.equal(context.palletTransfer(item).progress,0);context.model.time=1;
 const moving=context.palletTransfer(item);assert(Math.abs(moving.progress-.135)<1e-8);
 item.produced=2;assert.equal(context.palletTransfer(item).progress,moving.progress);
 assert.equal(context.palletTransfer(item).produced,1);assert.equal(context.palletTransfer(item).waiting,1);
 context.model.time=8/1.2+.1;assert.equal(context.palletTransfer(item).produced,2);
 context.model.time=16/1.2+.1;assert.equal(context.palletTransfer(item).progress,1);
 context.model={time:0};item.produced=105;context.palletTransfer(item);
 item.produced=106;context.model.time=.1;assert.equal(context.palletTransfer(item).forkProgress,0);
 context.model.time=15.1;assert.equal(context.palletTransfer(item).forkProgress,1);
});


test('palletizer wrist returns continuously to pickup across release and consecutive cycles', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DMachines'),{window});
  const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
  function joints(produced,progress){
    const points=[];
    const context=new Proxy({arc(x,y,r){if([10,15,17].includes(r))points.push([x,y]);}},
      {get:(target,key)=>target[key]??(()=>{})});
    window.STSimulation2DMachines.drawPalletOutput(context,200,100,180,colors,produced,progress);
    return points.flat();
  }
  function close(left,right){
    assert.equal(left.length,right.length);
    left.forEach((value,i)=>assert(Math.abs(value-right[i])<.01));
  }
  close(joints(1,.599999),joints(1,.600001));
  close(joints(1,.039999),joints(1,.040001));
  assert.notDeepEqual(joints(1,.95),joints(1,.99),'return motion continues to the end of the cycle');
  close(joints(1,.999999),joints(2,0));
  close(joints(0,1),joints(1,0));
  for(const boundary of [.6,.74,.94]){
    close(joints(36,boundary-.000001),joints(36,boundary+.000001));
  }
  close(joints(12,.999999),joints(13,0));
  close(joints(36,.999999),joints(37,0));
});

test('all configured machine types have animated drawings', () => {
  const window={};
  vm.runInNewContext(script('Simulation2DMachines'), {window});
  const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#369',belt:'#526b82'};
  function trace(type,time){
    const operations=[];
    const context=new Proxy({},{get:(_,name)=>(...args)=>operations.push([name,...args])});
    const drawn=window.STSimulation2DMachines.draw(context,type,0,0,120,100,colors,time);
    return {drawn,operations};
  }
  const types=['BLOWMOLDER','FILLER','SLEEVER','CASE_PACKER','PALLETIZER'];
  const sizes=types.map(type=>window.STSimulation2DMachines.dimensions(type));
  assert.equal(new Set(sizes.map(size=>size.width)).size,types.length);
  assert.equal(new Set(sizes.map(size=>size.height)).size,types.length);
  assert(sizes[2].width<sizes[1].width&&sizes[4].height>sizes[3].height);
  const still=types.map(type=>trace(type,0));
  assert(still.every(result=>result.drawn));
  assert.equal(new Set(still.map(result=>JSON.stringify(result.operations))).size,types.length);
  types.forEach((type,index)=>assert.notDeepEqual(trace(type,.5).operations,still[index].operations));
  for(const type of ['PUCKER','DEPUCKER','FEEDER','CAPPER','CUSTOM']){
    assert(trace(type,0).drawn);
    assert.notDeepEqual(trace(type,0).operations,trace(type,.5).operations);
  }
  assert.equal(trace('UNKNOWN',0).drawn,false);
});


test('2D honors runtime failure switches, scheduled stops and latched machine controls',()=>{
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'),{window});
  const definitions=[{id:'m',kind:'machine',rate:10,batch:1,startDelay:0,failures:[{rate:1e6,repairSeconds:10}]}];
  const schedule={commands:[{equipmentId:'m',atVirtualSecond:0,action:'PAUSE'}],
    stops:[{startSeconds:1,endSeconds:2,restartPolicy:'RESUME',fromCalendar:true}]};
  const engine=window.STSimulation2DEngine;
  let model=engine.create(definitions,1,undefined,schedule);
  model.configure({failures:false});
  model.step(.1);
  assert.equal(model.line[0].state,'Paused');
  model.control('m','EMERGENCY_STOP');
  model.control('m','RUN');
  assert.equal(model.line[0].state,'Emergency stop');
  model.control('m','RESET');
  assert.equal(model.line[0].state,'Stopped');
  model.control('m','RUN');
  for(let i=0;i<11;i++)model.step(.1);
  assert.equal(model.line[0].state,'Planned stop');
  const before=model.line[0].produced;
  model=engine.create(definitions,1,model.snapshot(),schedule);
  model.configure({failures:false});
  model.step(.1);
  assert.equal(model.line[0].produced,before);
  assert.equal(model.line[0].state,'Planned stop');
  model.configure({calendar:false});
  for(let i=0;i<5;i++)model.step(.1);
  assert(model.line[0].produced>before);
  assert.equal(model.line[0].failureCount,0);
  model.configure({failures:true});
  for(let i=0;i<5;i++)model.step(.1);
  assert.equal(model.line[0].state,'Failed');
  model.configure({failures:false});
  assert.equal(model.line[0].failureRemaining,0);
});

test('2D counts the configured repair ramp and the Back-up response with zero runout',()=>{
  const window={};
  vm.runInNewContext(script('Simulation2DEngine'),{window});
  const engine=window.STSimulation2DEngine;
  const machine={kind:'machine',rate:2,batch:1,startDelay:0,rampSeconds:1,rampAfterRepair:true,
    capacityBottles:2,residenceSeconds:1,inputBottleFactor:1,bottlesPerUnit:1};
  const repair=engine.create([machine]);
  repair.line[0].failureRemaining=.25;
  repair.step(.25);
  assert.equal(repair.line[0].durations.acceleration,0);
  for(let i=0;i<5;i++)repair.step(.25);
  assert.equal(repair.line[0].durations.acceleration,1);
  assert.equal(repair.line[0].state,'Running');
  const belt={kind:'belt',length:5000,speed:100,packageLength:20,pitch:25,packedGap:0,prime:null,backup:null,
    clearDelay:Infinity,responseDelay:1,residual:0};
  const model=engine.create([machine,belt]);
  model.line[1].backupBlocked=true;
  for(let i=0;i<5;i++)model.step(.25);
  assert.equal(model.line[0].durations.deceleration,1);
  assert.equal(model.line[0].state,'Back-up stop');
  assert.equal(model.line[0].durations.backupStop,.25);
  assert.equal(model.line[0].durations.blocked,0);
  assert.equal(model.line[0].produced,0);

  const blocked=engine.create([{...machine,residenceSeconds:0},{...belt,id:'belt'}]);
  blocked.control('belt','STOP');
  for(let i=0;i<16;i++)blocked.step(.25);
  assert.equal(blocked.line[0].state,'Blocked');
  assert(blocked.line[0].durations.blocked>0);
  assert.equal(blocked.line[0].durations.backupStop,0);
});

test('equipment efficiency multiplies quality and speed and uses only internal downtime',()=>{
  const window={};
  vm.runInNewContext(script('EquipmentEfficiency'),{window});
  const {calculate}=window.STEquipmentEfficiency;
  const result=calculate({runningSeconds:80,internalDowntimeSeconds:20,goodProducts:360,rejects:40,designSpeed:10});
  assert.equal(result.availability,.8);
  assert.equal(result.runtimeEfficiency,.45);
  assert.equal(calculate({runningSeconds:1,internalDowntimeSeconds:0,goodProducts:11,designSpeed:10}).throughput,10);
  assert(Math.abs(result.operationalEfficiency-.36)<1e-12);
  assert(Math.abs(result.throughput-3.6)<1e-12);
  assert.equal(calculate({runningSeconds:0,internalDowntimeSeconds:0,goodProducts:0,designSpeed:10}).availability,null);
});


test('production table centers above the three pallet positions and fits their full width',()=>{
  const source=script('Simulation2D');
  const context=vm.createContext({machineTypes:new Map([['robot','PALLETIZER']]),cardGap:24,cardWidth:127.125,
    caseDimensions:()=>({caseWidth:37,caseHeight:28}),productionHeight:()=>80});
  vm.runInContext(source.slice(source.indexOf('  function productionLayout('),source.indexOf('  function palletTransfer(')),context);
  const layout=context.productionLayout([{id:'robot',unit:'CASES'}],[{center:100,telemetryWidth:160}],200);
  const palletWidth=3*37+12;
  const center=layout.start+100+(3*palletWidth+40)/2;
  assert.equal(layout.production+127.125/2,center);
  assert(layout.productionY+80<=90-4*28-24,'table clears the highest stacked cases');
  assert.equal(layout.right,layout.start+100+3*palletWidth+40);
  context.machineTypes.clear();
  const plain=context.productionLayout([{id:'robot',unit:'BOTTLES'}],[{center:100,telemetryWidth:160}],200);
  assert.equal(plain.production,plain.start);
  assert.equal(plain.productionY,-40);
});


test('last-case placement keeps normal speed while pallet exchange retains its own timing',()=>{
 const context=vm.createContext({model:{time:0},palletAnimation:null,reducedMotion:{matches:false}}),source=script('Simulation2D');
 vm.runInContext(source.slice(source.indexOf('  function palletTransfer('),source.indexOf('  function productionHeight(')),context);
 const item={produced:0,rate:100};context.palletTransfer(item);item.produced=1;context.palletTransfer(item);
 assert.equal(context.palletAnimation.duration,8/1.2);context.model.time=4/1.2;
 assert.equal(context.palletTransfer(item).progress,.5);assert.equal(item.rate,100);
 context.model={time:0};item.produced=35;context.palletTransfer(item);item.produced=36;context.palletTransfer(item);
 assert.equal(context.palletAnimation.duration,12);context.model.time=4;
 assert(Math.abs(context.palletTransfer(item).progress-.6)<1e-12);
 context.model.time=8;assert(Math.abs(context.palletTransfer(item).progress-.8)<1e-12);
 item.produced=37;context.model.time=12;assert.equal(context.palletTransfer(item).produced,37);
 assert.equal(context.palletAnimation.duration,8/1.2);
});


test('all waiting cases share one silhouette and one symbolic slot per robot pickup',()=>{
 const context=vm.createContext({model:{time:0},palletAnimation:null,reducedMotion:{matches:false},step:1/120,caseDimensions:()=>({caseWidth:37,caseHeight:28}),productHeight:()=>28,beltHalfHeight:()=>18});
 const source=script('Simulation2D');vm.runInContext(source.slice(source.indexOf('  function palletTransfer('),source.indexOf('  function productionHeight(')),context);
 const item={produced:0,rate:100,resident:[],residenceClock:0,residenceSeconds:2},line=[{kind:'belt'},item],items=[{left:0,width:200},{left:210,width:300}];
 context.palletTransfer(item);item.produced=50;
 let transfer=context.palletTransfer(item);assert.equal(transfer.waiting,50);
 assert.equal(context.palletInfeed(line,items,100,transfer).cases.length,1);
 context.model.time=.4;transfer=context.palletTransfer(item);
 assert.equal(transfer.batch,1);assert.equal(transfer.pickedCases,50);assert.equal(transfer.produced,1);assert.equal(transfer.waiting,0);
 item.produced=80;context.model.time=4;transfer=context.palletTransfer(item);
 assert.equal(transfer.waiting,30);assert.equal(transfer.produced,1);
 assert.equal(context.palletAnimation.settled+transfer.pickedCases+transfer.waiting,item.produced);
 context.model.time=8/1.2+.4;transfer=context.palletTransfer(item);
 assert.equal(context.palletAnimation.settled,50);assert.equal(context.palletAnimation.placed,1);
 assert.equal(transfer.pickedCases,30);assert.equal(transfer.produced,2);assert.equal(transfer.batch,1);
});


test('robot arm links and gripper retain their dimensions when moving pallets and batches',()=>{
  const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
  const art=window.STSimulation2DMachines;
  const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28,batch:3};
  let reference;
  for(const produced of [3,12,36])for(let tick=0;tick<=100;tick++){
    const joints={},widths=[];
    const ctx=new Proxy({arc(x,y,r){if([10,15,17].includes(r))joints[r]=[x,y];},roundRect(x,y,w,h){if(h===4&&this.fillStyle===colors.belt)widths.push(w);}},
      {get:(target,key)=>target[key]??(()=>{})});
    art.drawPalletOutput(ctx,200,100,180,colors,produced,tick/100,'all');
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const lengths=[distance(joints[17],joints[15]),distance(joints[15],joints[10])];
    reference??=lengths;
    lengths.forEach((length,i)=>assert(Math.abs(length-reference[i])<1e-6,'each rigid arm keeps its length'));
    assert(widths.includes(47),'gripper width is fixed for both cases and pallets');
  }
  assert.equal(art.palletStage(1,.3).count,0);
  assert.equal(art.palletStage(1,.6).count,1);
});


test('a picked group draws one case in transit and fills exactly one space',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28,batch:50};
 for(const progress of [.04,.2,.599,.6,.9,1]){
   const cases=[],ctx=new Proxy({fillRect(x,y,w,h){if(w===37&&h===28&&this.fillStyle===colors.belt)cases.push([x,y]);}},{get:(o,k)=>o[k]??(()=>{})});
   window.STSimulation2DMachines.drawPalletOutput(ctx,200,100,180,colors,1,progress,progress<.6?'robot':'staging');
   assert.equal(cases.length,1);assert(cases.flat().every(Number.isFinite));
   if(progress>=.6)assert.deepEqual(cases[0],[306,162]);
 }
});


test('bottle silhouettes are distinct and use the selected liquid only after filling',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,colors={surface:'#fff',belt:'#333',accent:'#08f',liquid:'#16a34a'};
 function trace(type,stage){
   const ops=[],fills=[];const ctx=new Proxy({fillRect(...args){fills.push([this.fillStyle,...args]);}},
     {get:(o,k)=>o[k]??((...args)=>ops.push([k,...args]))});
   art.drawBottle(ctx,10,20,50,100,colors,type,stage);return {ops,fills};
 }
 const styles=['classic','softener','cleaner','shampoo','pump','jug','ribbed','oval-jug','shower'];
 assert.equal(new Set(styles.map(type=>JSON.stringify(trace(type,0).ops))).size,9);
 for(const type of styles){
   assert(!trace(type,0).fills.some(([color])=>color===colors.liquid));
   assert(trace(type,2).fills.some(([color])=>color===colors.liquid));
   assert(trace(type,15).fills.some(([,x,y,w,h])=>x===-5&&y===173&&w===110&&h===27),'puck remains supported');
   assert(trace(type,15).ops.some(([name])=>name==='clip'),'labels follow the bottle silhouette');
 }
});


test('product and pallet drawing dimensions use measured width independently from transport length',()=>{
 const source=script('Simulation2D');
 const context=vm.createContext({sceneScale:.09,productHeights:{BOTTLES:200,CASES:240}});
 vm.runInContext(source.slice(source.indexOf('  function productWidth('),source.indexOf('  function beltHalfHeight(')),context);
 vm.runInContext(source.slice(source.indexOf('  function caseDimensions('),source.indexOf('  function productionLayout(')),context);
 const bottle={kind:'belt',unit:'BOTTLES',packageWidth:55,packageLength:90};
 const box={kind:'belt',unit:'CASES',packageWidth:210,packageLength:340};
 assert.equal(context.productWidth(bottle),55*.09);assert.equal(context.productHeight(bottle),200*.09);
 assert.equal(context.productWidth(box),210*.09);
 assert.equal(context.caseDimensions([bottle,box,{kind:'machine'}],2).caseWidth,210*.09);
 assert.equal(context.productWidth({...bottle,packageLength:900}),context.productWidth(bottle));
 assert.equal(context.productWidth({...bottle,packageWidth:null}),90*.09,'legacy cases without width retain a fallback');
});

test('unset layout colors follow primary and secondary theme colors rather than previous browser colors',()=>{
 const source=script('Simulation2D'),theme={'--accent':'#112233','--secondary':'#778899'};
 const context=vm.createContext({window:{STPreferences:{read:()=> '#ff0000'}},canvas:{},getComputedStyle:()=>({getPropertyValue:name=>theme[name]||''})});
 vm.runInContext(source.slice(source.indexOf('  const bottleStyles='),source.indexOf('  function openAppearance(')),context);
 const defaults=context.validAppearance({});
 assert.equal(defaults.liquid,null);assert.equal(defaults.equipment,null);assert.equal(defaults.conveyors,null);
 assert.equal(context.appearanceColors().liquid,'#112233');assert.equal(context.appearanceColors().equipment,'#778899');
 theme['--accent']='#345678';assert.equal(context.appearanceColors().liquid,'#345678');
 vm.runInContext('appearance=validAppearance({liquid:"#123456",equipment:"#abcdef",conveyors:"#223344"})',context);
 assert.equal(context.appearanceColors().liquid,'#123456');assert.equal(context.appearanceColors().equipment,'#abcdef');assert.equal(context.appearanceColors().conveyors,'#223344');
});

test('palletizer frame no longer draws a second roller track over the case infeed',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const arcs=[],ctx=new Proxy({arc(...args){arcs.push(args);}},{get:(o,k)=>o[k]??(()=>{})});
 window.STSimulation2DMachines.draw(ctx,'PALLETIZER',0,0,120,100,{ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777'},1);
 assert.equal(arcs.length,0,'the roller bed belongs only to the continuous infeed drawing');
 const source=script('Simulation2D');const beams=[],holes=[];
 const context=vm.createContext({window,palletInfeed:()=>({start:10,startBottom:110,pickup:90,caseWidth:20,caseHeight:40,cases:[]})});
 vm.runInContext(source.slice(source.indexOf('  function drawPalletInfeed('),source.indexOf('  function productionHeight(')),context);
 context.drawPalletInfeed(new Proxy({fillRect(...args){beams.push(args);},arc(...args){holes.push(args);}},{get:(o,k)=>o[k]??(()=>{})}),[],[],0,100,{belt:'#777'});
 assert.deepEqual(beams,[[10,110,100,6]]);assert(holes.length>0);assert(holes.every(([,y])=>y===113),'original perforated beam is horizontal at the conveyor outlet');
});


test('caps match the neck centers of every bottle and use the chosen cap color',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,expected={classic:50,softener:44.5,cleaner:50,shampoo:50,pump:50,jug:39.5};
 for(const [type,center] of Object.entries(expected)){
   const caps=[],ctx=new Proxy({fillRect(x,y,w,h){if(this.fillStyle==='#e13277')caps.push({x,y,w,h});}},{get:(o,k)=>o[k]??(()=>{})});
   art.drawBottle(ctx,0,0,55,200,{surface:'#fff',belt:'#333',liquid:'#08f',cap:'#e13277'},type,6);
   assert(caps.length>0);assert.equal(caps[0].x+caps[0].w/2,center,type);
   const neck=art.bottleNeck(type);assert.equal(neck.x+neck.width/2,center);
 }
});

test('forks arrive raised, lower into the pallet and lift the load before reversing',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28,forkGroup:2};
 function frame(progress){
   const forks=[],decks=[];const ctx=new Proxy({roundRect(x,y,w,h){if(w===133&&h===4)forks.push([x,y]);if(w===123&&h===5)decks.push([x,y]);}},{get:(o,k)=>o[k]??(()=>{})});
   window.STSimulation2DMachines.drawPalletOutput(ctx,200,100,180,{...colors,forkProgress:progress},106,.2,'staging');return {fork:forks[0],decks};
 }
 const arriving=frame(.01),lowering=frame(.2),inserted=frame(.3),contact=frame(.42),lifting=frame(.45),carrying=frame(.6);
 assert.equal(contact.fork[1],195,'fork top reaches the underside of the top deck before lifting');
 assert.equal(contact.decks.filter(([,y])=>y===190).length,3,'load remains on the floor until contact');
 assert(arriving.fork[1]<lowering.fork[1]);assert(lowering.fork[1]<inserted.fork[1]);
 assert.equal(inserted.fork[1],198);
 assert(lifting.fork[1]<inserted.fork[1]);assert.equal(carrying.fork[1],185);
 assert.equal(inserted.decks.filter(([,y])=>y===190).length,3);
 assert(lifting.decks.some(([,y])=>y<190&&y>180));
 assert.equal(carrying.decks.filter(([,y])=>y===180).length,1);
 assert(carrying.fork[0]>inserted.fork[0]);
});


test('reference bottles retain their own closures and support independent label styles with stage visibility',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const colors={surface:'#fff',belt:'#333',liquid:'#0af',label:'#da2477',cap:'#cbaa21'};
 for(const type of ['ribbed','oval-jug','shower'])for(const labelShape of ['sticker','wrap','sleeve']){
   function frame(stage,capShape){
     const fills=[],ops=[],ctx=new Proxy({fill(){fills.push(this.fillStyle);},fillRect(...args){fills.push(this.fillStyle);ops.push(['rect',...args]);}},{get:(o,k)=>o[k]??((...args)=>ops.push([k,...args]))});
     window.STSimulation2DMachines.drawBottle(ctx,0,0,50,150,{...colors,labelShape,capShape},type,stage);return {fills,ops};
   }
   assert(!frame(0).fills.includes(colors.label));assert(!frame(0).fills.includes(colors.cap));
   assert(frame(7).fills.includes(colors.label),type+' '+labelShape);assert(frame(7).fills.includes(colors.cap),type);
   assert.deepEqual(frame(7).ops,frame(7,'pump').ops,'stale cap choices cannot change the fixed closure');
 }

});


test('bottle presentation infers omitted preparation steps and honors explicit machines and combined functions',()=>{
 const source=script('Simulation2D'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('  function resolveBottleStages('),source.indexOf('  const machineStyle=')),context);
 function stages(entries){
   const line=[{id:'in',kind:'belt'}],types=new Map();
   entries.forEach((entry,index)=>{
     const [type,name]=Array.isArray(entry)?entry:[entry,''];const id='machine'+index;
     line.push({id,kind:'machine',name},{id:'out'+index,kind:'belt'});types.set(id,type);
   });
   return Array.from(context.resolveBottleStages(line,types).values());
 }
 assert.deepEqual(stages(['FILLER','CASE_PACKER']),[1,7,7],'labeled input becomes filled, labeled and capped after the filler');
 assert.deepEqual(stages(['FILLER','CAPPER','CASE_PACKER']),[1,3,7,7],'an explicit capper keeps the filler discharge uncapped');
 assert.deepEqual(stages(['FILLER','SLEEVER']),[0,6,7],'labels appear only after the labeler');
 assert.deepEqual(stages(['SLEEVER','FILLER']),[0,1,7]);
 assert.deepEqual(stages(['SLEEVER']),[6,7],'without a filler, incoming bottles are already filled');
 assert.deepEqual(stages(['CAPPER']),[3,7]);
 assert.deepEqual(stages(['CUSTOM','CASE_PACKER']),[7,7,7]);
 assert.deepEqual(stages(['BLOWMOLDER','FILLER','CAPPER','SLEEVER']),[0,0,2,6,7]);
 assert.deepEqual(stages([['FILLER','Filler / Capper'],'SLEEVER']),[0,6,7]);
 assert.deepEqual(stages([['CUSTOM','Llenadora'],['CUSTOM','Tapadora'],['CUSTOM','Etiquetadora']]),[0,2,6,7]);
 assert.deepEqual(stages(['PUCKER','FILLER','DEPUCKER']),[1,9,15,7],'puck handling stays independent from bottle preparation');
});


test('fork contact precedes load lift and departure continues past the nominal exit',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines;
 for(const t of [.38,.39,.4,.41,.42]){
   const motion=art.forkliftMotion(t,300,900);assert.equal(motion.loadLift,0);assert(motion.forkRise>=0&&motion.forkRise<=3);
 }
 for(const t of [.43,.45,.48,.6]){
   const motion=art.forkliftMotion(t,300,900);assert(motion.loadLift>0);assert(Math.abs(motion.forkRise-motion.loadLift-3)<1e-8,'fork remains in contact with the underside of the raised deck');
 }
 assert(art.forkliftMotion(.6,300,900).x>300);
 assert.equal(art.forkliftMotion(1,300,900).x,900);
 assert(art.forkliftMotion(1.1,300,900).x>900);
 assert(art.palletStage(106,.2,1.1,2).forkVisible,'the clock cannot abruptly hide an outbound forklift');
});

test('forklift route clears every viewport and longer routes preserve transit speed',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const source=script('Simulation2D'),model={time:0};
 const views=[{canvas:{clientWidth:800},camera:{x:0,scale:.09}},{canvas:{clientWidth:1200},camera:{x:-400,scale:.045}}];
 const context=vm.createContext({window,model,palletAnimation:null,reducedMotion:{matches:false},viewportCount:2,viewports:views,renderingView:0,camera:views[0].camera,sceneScale:.09});
 vm.runInContext(source.slice(source.indexOf('  function forkliftRoute('),source.indexOf('  function palletInfeed(')),context);
 const route=context.forkliftRoute({caseWidth:37,start:200});
 assert(route.exitOffset+200>3200,'the route passes the farthest visible right edge');
 const item={produced:105,rate:.5};context.palletTransfer(item,route);item.produced=106;model.time=.1;
 assert.equal(context.palletTransfer(item,route).forkProgress,0);
 const timing=vm.runInContext('({approach:palletAnimation.forkApproach,hold:palletAnimation.forkHold,depart:palletAnimation.forkDepart,total:palletAnimation.forkPeriod})',context);
 assert.equal(timing.hold,15*.22);assert(timing.total>15);
 const ratio=(route.exitOffset-route.pickupOffset)/(route.baselineExitOffset-route.pickupOffset);
 assert(Math.abs(timing.depart/(15*.5)-ratio)<1e-8);
 model.time=.1+timing.total+.5;assert(context.palletTransfer(item,route).forkProgress>1,'departure is not clamped before clearing the views');
});


test('case colors and marking shapes draw consistently inside the measured carton dimensions',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const colors={caseColor:'#ab8c62',caseAccent:'#42bfa3',surface:'#fff',belt:'#333'};
 for(const [caseMarkShape,count] of [['tape',1],['label',1],['round-label',1],['horizontal-band',1],['vertical-band',1],['cross-band',2],['none',0]]){
   const marks=[],bodies=[];let oval;
   const ctx=new Proxy({fillRect(x,y,w,h){if(this.fillStyle===colors.caseColor)bodies.push([x,y,w,h]);if(this.fillStyle===colors.caseAccent)marks.push([x,y,w,h]);},ellipse(x,y,rx,ry){oval=[x-rx,y-ry,rx*2,ry*2];},fill(){if(oval&&this.fillStyle===colors.caseAccent)marks.push(oval);}},{get:(o,k)=>o[k]??(()=>{})});
   window.STSimulation2DMachines.drawCase(ctx,10,20,80,50,{...colors,caseMarkShape});
   assert.deepEqual(bodies,[[10,20,80,50]]);assert.equal(marks.length,count,caseMarkShape);
   assert(marks.every(([x,y,w,h])=>x>=10&&y>=20&&x+w<=90&&y+h<=70),caseMarkShape+' stays within the case');
 }
});


test('fullscreen resizing preserves the world center and zoom without drift on return',()=>{
 const source=script('Simulation2D');
 const views=[{canvas:{clientWidth:800,clientHeight:400},camera:{scale:.12,x:150,y:220,fit:false},initialized:true},{canvas:{clientWidth:420,clientHeight:300},camera:{scale:.07,x:-90,y:80,fit:false},initialized:true}];
 const context=vm.createContext({viewports:views,activeViewport:1,camera:views[1].camera});
 vm.runInContext(source.slice(source.indexOf('  function captureViewportCameras('),source.indexOf('  function setFullscreen(')),context);
 const original=context.captureViewportCameras();
 const centers=views.map(view=>[(view.canvas.clientWidth/2-view.camera.x)/view.camera.scale,(view.canvas.clientHeight/2-view.camera.y)/view.camera.scale]);
 views.forEach(view=>{view.canvas.clientWidth+=700;view.canvas.clientHeight+=400;});
 context.applyModeCameras(original);
 views.forEach((view,index)=>{
   assert.equal(view.camera.scale,original[index].scale);
   assert(Math.abs((view.canvas.clientWidth/2-view.camera.x)/view.camera.scale-centers[index][0])<1e-8);
   assert(Math.abs((view.canvas.clientHeight/2-view.camera.y)/view.camera.scale-centers[index][1])<1e-8);
 });
 const full=context.captureViewportCameras();
 views.forEach(view=>{view.canvas.clientWidth-=700;view.canvas.clientHeight-=400;});
 context.applyModeCameras(original);
 views.forEach((view,index)=>{assert.equal(view.camera.x,original[index].x);assert.equal(view.camera.y,original[index].y);});
 views.forEach(view=>{view.canvas.clientWidth+=700;view.canvas.clientHeight+=400;});
 context.applyModeCameras(full);
 views.forEach((view,index)=>{assert.equal(view.camera.x,full[index].x);assert.equal(view.camera.y,full[index].y);});
});

test('machine drawings preserve equal horizontal and vertical scale in any viewport box',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777'};
 for(const type of ['BLOWMOLDER','PUCKER','DEPUCKER','FEEDER','CAPPER','CUSTOM','FILLER','SLEEVER','CASE_PACKER','PALLETIZER']){
   for(const [width,height] of [[600,120],[120,400],[240,200]]){
     const scales=[],context=new Proxy({scale(...args){scales.push(args);}},{get:(o,k)=>o[k]??(()=>{})});
     assert(art.draw(context,type,20,30,width,height,colors,.3));
     assert.equal(scales.length,1);assert.equal(scales[0][0],scales[0][1],type+' cannot stretch circles or panels');assert(scales[0][0]>0);
   }
 }
 const signatures=['PUCKER','DEPUCKER','FEEDER','CAPPER','CUSTOM'].map(type=>{
   const bodies=[],context=new Proxy({roundRect(x,y,w,h){if(w>=20&&h>=15)bodies.push([w,h]);}},{get:(o,k)=>o[k]??(()=>{})});
   art.draw(context,type,0,0,240,200,colors,0);return JSON.stringify(bodies);
 });
 assert.equal(new Set(signatures).size,5,'new machine types have different primary body silhouettes');
});

test('animated layout uses the native machine aspect ratio and chooses the configured physical type',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const source=script('Simulation2D'),machineTypes=new Map(),machineStyle={value:'animated'};
 const context=vm.createContext({window,machineTypes,machineStyle,machineHeight:182.25,sceneScale:.09,machineScale:3.75});
 vm.runInContext(source.slice(source.indexOf('  function machineDrawingType('),source.indexOf('  function tallestMachine(')),context);
 const cases=[
   [{type:'CAPPER',name:'Filler reference'},'CAPPER'],
   [{type:'PACEMAKER',processData:{machineType:'SLEEVER'}},'SLEEVER'],
   [{type:'CUSTOM',processData:{machineType:'FEEDER'}},'FEEDER'],
   [{type:'CUSTOM',name:'Depucker'},'DEPUCKER'],
   [{type:'CUSTOM',name:'Pucker'},'PUCKER'],
   [{type:'CUSTOM',name:'Etiquetadora'},'SLEEVER'],
   [{type:'CUSTOM',name:'Alimentadora'},'FEEDER'],
   [{type:'CONVEYOR',name:'Filler infeed'},'CONVEYOR'],
   [{type:'CUSTOM',name:'Unspecified process'},'CUSTOM']
 ];
 for(const [item,expected] of cases)assert.equal(context.machineDrawingType(item),expected);
 const item={id:'machine',kind:'machine',length:1100};
 for(const type of ['PUCKER','DEPUCKER','FEEDER','CAPPER','CUSTOM','FILLER','CASE_PACKER','SLEEVER']){
   machineTypes.set(item.id,type);
   assert(Math.abs(context.displayWidth(item)/context.displayHeight(item)-(window.STSimulation2DMachines.dimensions(type).viewWidth||120)/100)<1e-8);
 }
 machineStyle.value='blocks';assert.equal(context.displayWidth(item),1100*.09*3.75);
 assert.equal(context.displayWidth({kind:'belt',length:2000}),180,'conveyor dimensions keep their measured scale');
});


test('empty pallets sit below the first filling position and rise vertically without overshooting',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
 function decks(produced,progress,layer){
   const rectangles=[],ctx=new Proxy({roundRect(x,y,w,h){if(w===123&&h===5)rectangles.push([x,y]);}},{get:(o,k)=>o[k]??(()=>{})});
   art.drawPalletOutput(ctx,200,100,180,colors,produced,progress,layer);return rectangles;
 }
 const active=decks(1,1,'staging').find(([,y])=>y===190),stack=decks(1,1,'staging').filter(([,y])=>y>active[1]);
 assert.equal(stack.length,3);assert(stack.every(([x])=>x===active[0]));
 const top=Math.min(...stack.map(([,y])=>y));assert(top>active[1]+16,'there is a visible gap below the filling pallet');
 let previous=Infinity;
 for(const progress of [.74,.78,.82,.86,.9,.939999]){
   const moving=decks(36,progress,'robot').find(([x,y])=>x===active[0]&&y>=active[1]&&y<=top);
   assert(moving,'the replacement stays directly under the first position');
   assert(moving[1]<=previous,'the lift goes upward without a downward swing');previous=moving[1];
 }
 assert(previous<active[1]+.001,'the pallet arrives exactly at filling height');
});


test('robot keeps one fixed layer in front of stored pallets throughout the complete cycle',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
 function frame(progress,layer){
   const ops=[],ctx=new Proxy({roundRect(x,y,w,h){if(w===123&&h===5)ops.push('pallet');if(w===47&&h===4)ops.push('gripper');},arc(x,y,r){if(r===15)ops.push('elbow');}},{get:(o,k)=>o[k]??(()=>{})});
   art.drawPalletOutput(ctx,200,100,180,colors,36,progress,layer);return ops;
 }
 for(const progress of [0,.3,.599,.6,.72,.74,.8,.92,.94,.97,1]){
   assert(frame(progress,'robot').includes('gripper'),'the robot never leaves its dedicated layer');
   assert(!frame(progress,'staging').includes('elbow'),'stored pallets never redraw the robot');
   const all=frame(progress,'all');assert(all.indexOf('gripper')>all.lastIndexOf('pallet'),'robot and carried pallet remain ahead of stored pallets');
 }
});

test('shorter rigid robot links still reach every layer and the lower pallet stack',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const art=window.STSimulation2DMachines,colors={ink:'#111',soft:'#eee',surface:'#fff',accent:'#08f',belt:'#777',caseWidth:37,caseHeight:28};
 let reference;
 for(let produced=1;produced<=36;produced++)for(let tick=0;tick<=100;tick+=4){
   const joints={},ctx=new Proxy({arc(x,y,r){if([17,15,10].includes(r))joints[r]=[x,y];}},{get:(o,k)=>o[k]??(()=>{})});
   art.drawPalletOutput(ctx,200,100,180,colors,produced,tick/100);
   const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
   const links=[length(joints[17],joints[15]),length(joints[15],joints[10])];reference??=links;
   for(let i=0;i<2;i++){assert(links[i]<160,'both links are shorter than the previous minimum length');assert(Math.abs(links[i]-reference[i])<1e-7,'the link reaches all targets without stretching');}
 }
});


test('forklift departure cannot slow box placement or delay the next available robot cycle',()=>{
 const window={};vm.runInNewContext(script('Simulation2DMachines'),{window});
 const source=script('Simulation2D');
 function scenario(exitOffset){
   const model={time:0},context=vm.createContext({window,model,palletAnimation:null,reducedMotion:{matches:false}});
   vm.runInContext(source.slice(source.indexOf('  function palletTransfer('),source.indexOf('  function palletInfeed(')),context);
   const route={pickupOffset:386,baselineExitOffset:789,exitOffset},item={produced:105,rate:100};
   context.palletTransfer(item,route);item.produced=106;context.palletTransfer(item,route);
   const frames=[];
   for(const time of [1,3,5,7,9,11,14,17,20,23,26,29,32,35,38,41,44,47]){
     model.time=time;item.produced=106+Math.floor(time/2);
     const state=context.palletTransfer(item,route);frames.push({time,placed:state.produced,progress:state.progress,waiting:state.waiting});
   }
   return {frames,state:context.palletTransfer(item,route)};
 }
 const nearby=scenario(789),distant=scenario(5789);
 assert.deepEqual(nearby.frames,distant.frames,'a long forklift route does not change the robot clock');
 assert(distant.state.forkProgress<nearby.state.forkProgress,'forklift travel still has its own duration');
 const context=vm.createContext({model:{time:0},palletAnimation:null,reducedMotion:{matches:false}});
 vm.runInContext(source.slice(source.indexOf('  function palletTransfer('),source.indexOf('  function palletInfeed(')),context);
 function placement(initial){
   context.model={time:0};const item={produced:initial,rate:100};context.palletTransfer(item);item.produced++;context.palletTransfer(item);
   context.model.time=2;return context.palletTransfer(item).progress;
 }
 assert.equal(placement(35),placement(34),'the last carton travels at the same speed as the preceding carton');
});


test('sensor rings follow the actual Back-up delay timers and retract quickly on interruption',()=>{
 const window={};vm.runInNewContext(script('Simulation2DEngine'),{window});
 const source=script('Simulation2D'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('  function sensorDelayState('),source.indexOf('  function drawSensor(')),context);
 const defs=[{id:'up',kind:'machine',rate:1,batch:1,startDelay:0,rampSeconds:0,failures:[]},
   {id:'belt',kind:'belt',length:300,speed:0,packageLength:30,pitch:60,packedGap:0,prime:250,backup:150,blockDelay:.5,clearDelay:.3,responseDelay:0,residual:0},
   {id:'down',kind:'machine',rate:1,batch:1,startDelay:0,rampSeconds:0,failures:[]}];
 const engine=window.STSimulation2DEngine.create(defs);engine.control('up','STOP');
 const belt=engine.line[1];belt.items=[{x:150}];engine.step(.25);
 const blocked=context.sensorDelayState(belt,engine.line[2],'B');assert(blocked.pending);assert.equal(blocked.mode,'blocked');assert.equal(blocked.progress,.5);
 const before=context.sensorRingState(blocked,null,0);assert.equal(before.ring,.5);
 belt.items=[];engine.step(.01);const canceled=context.sensorDelayState(belt,engine.line[2],'B');assert.equal(canceled.pending,false);
 const start=context.sensorRingState(canceled,before,100),middle=context.sensorRingState(canceled,start,170),end=context.sensorRingState(canceled,middle,241);
 assert(start.fading&&middle.fading);assert(middle.ring<start.ring);assert.equal(end.ring,0);assert.equal(end.fading,false);
 assert.equal(context.sensorRingState(canceled,before,100,true).fading,false,'reduced motion resets the arc immediately');
 belt.items=[{x:150}];engine.step(.5);assert.equal(belt.backupBlocked,true);
 const complete=context.sensorRingState(context.sensorDelayState(belt,engine.line[2],'B'),before,100);
 assert(complete.active&&!complete.fading&&!complete.pending,'timer completion fills the circle without a cancellation animation');
 belt.items=[];engine.step(.15);const clear=context.sensorDelayState(belt,engine.line[2],'B');assert(clear.pending);assert.equal(clear.mode,'clear');assert.equal(clear.progress,.5);
 engine.step(.15);const released=context.sensorDelayState(belt,engine.line[2],'B');assert(!released.active&&!released.pending);
});

test('Prime ring uses the combined downstream ramp time and does not invent a separate sensor delay',()=>{
 const source=script('Simulation2D'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('  function sensorDelayState('),source.indexOf('  function drawSensor(')),context);
 const belt={primeBeam:false},down={state:'Ramp up',awaitPrime:false,activeRampSeconds:1.5,rampElapsed:.75};
 const state=context.sensorDelayState(belt,down,'P');assert(state.pending);assert.equal(state.progress,.5);assert.match(state.name,/combined/);
 down.rampElapsed=1.5;down.state='Running';const finished=context.sensorDelayState(belt,down,'P');assert(finished.active&&!finished.pending);
 assert(!context.sensorRingState(finished,context.sensorRingState(state,null,0),10).fading);
 down.state='Waiting for Prime';down.awaitPrime=true;down.rampElapsed=0;const waiting=context.sensorDelayState(belt,down,'P');assert(!waiting.pending&&!waiting.active);
 down.activeRampSeconds=0;assert.equal(context.sensorDelayState(belt,down,'P').pending,false);
});
