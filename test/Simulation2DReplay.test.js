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
    const labels=[],bottles=[];
    let lastFrameOrigin,scale,dash,start;
    const segments=[],boxes=[];
    el('panel').classList.remove('hidden');
    Object.defineProperties(el('canvas'),{clientWidth:{value:1100},clientHeight:{value:550}});
    el('canvas').getContext=()=>new Proxy({
      measureText(text){return {width:text.length*(this.font?.includes('6.75px')?2.8125:5)};},
      fillText(text,x,y){labels.push([text,this.font,x,y,this.textAlign]);},
      quadraticCurveTo:x=>bottles.push(x),
      rect:x=>bottles.push(x),
      setTransform(factor){scale=factor;},
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
    assert.equal(records.length,saved);
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
    assert.equal(active(),action('Stop'));
    assert.equal(action('Reset emergency stop').getAttribute('aria-pressed'),null);
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
    delete packer.processData.equipment.internalCapacityBottles;
    loadPacker();
    assert.equal(el('play').disabled,false);
    assert.equal(el('pause').disabled,true);
    assert.equal(el('stop').disabled,true);
    assert.equal(el('reset').disabled,false);
    el('play').click();
    assert.equal(el('pause').disabled,false);
    el('pause').click();
    assert.equal(el('stop').disabled,false);
    el('stop').click();
    el('reset').click();
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
    assert.deepEqual(stages(['FILLER','SLEEVER'],[],'Cap'),[]);
    assert.deepEqual(stages(['FILLER','SLEEVER'],['Filler / Capper'],'Cap'),['Applied','Applied']);
    assert.deepEqual(stages(['FILLER','CUSTOM'],['Filler','Tapadora'],'Cap'),['Applied']);
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
  function scene(produced,progress){
    const boxes=[];
    const context=new Proxy({
      fillRect(...args){if(this.fillStyle===colors.belt)boxes.push(args);}
    },{
      get:(target,key)=>target[key]??(()=>{})
    });
    art.drawPalletOutput(context,200,100,180,colors,produced,progress);
    assert(boxes.flat().every(Number.isFinite));
    return boxes.filter(([, ,width,height])=>width===37&&height===28);
  }
  assert.equal(scene(0,1).length,0);
  const moving=scene(1,.5);
  assert.equal(moving.length,1);
  const placed=scene(1,1);
  assert.equal(placed.length,1);
  assert.notDeepEqual(moving,placed);
  assert.equal(scene(120000,1).length,24);
  assert(scene(120011,.5).length<=36);
  assert.equal(scene(0,1).length,0);
});

test('the five machine silhouettes have distinct moving details', () => {
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
  assert.equal(trace('CUSTOM',0).drawn,false);
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
