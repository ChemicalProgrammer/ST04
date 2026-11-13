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
  const dom=new JSDOM(panel,{runScripts:'outside-only'});
  try{
    const {window}=dom,el=id=>window.document.getElementById('simulation2d-'+id);
    const labels=[],bottles=[];
    let lastFrameOrigin,scale,dash,start;
    const segments=[];
    el('panel').classList.remove('hidden');
    Object.defineProperties(el('canvas'),{clientWidth:{value:1100},clientHeight:{value:550}});
    el('canvas').getContext=()=>new Proxy({
      measureText:text=>({width:text.length*5}),
      fillText(text,x,y){labels.push([text,this.font,x,y,this.textAlign]);},
      quadraticCurveTo:x=>bottles.push(x),
      setTransform(factor){scale=factor;},
      setLineDash(pattern){dash=pattern.length>0;},
      moveTo(x,y){start=[x,y];},
      lineTo(x,y){if(start)segments.push({start,end:[x,y],dash});start=[x,y];},
      clearRect(){lastFrameOrigin=labels.length;segments.length=0;dash=false;}
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
      if(rendered)drawn.push({type,seconds:args.at(-1)});
      return rendered;
    };
    window.eval(script('Simulation2D'));
    const source={round:2,seed:78,durationSeconds:10,summary:{outputCount:99999}};
    const createdSeeds=[];
    let createdDefinitions;
    const engine=window.STSimulation2DEngine;
    window.STSimulation2DEngine={create(definitions,seed,checkpoint){
      createdSeeds.push(seed);
      createdDefinitions=definitions;
      return engine.create(definitions,seed,checkpoint);
    }};
    const records=[];
    const equipment=[
      {id:'upstream',type:'FILLER',nominalRatePerSecond:10,processData:{equipment:{internalCapacityBottles:1,stopInputs:{minor:{mtbfMinutes:.001,mttrMinutes:.002}}}}},
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
    const count=drawn.length;
    style.value='blocks';style.dispatchEvent(new window.Event('change'));
    assert.equal(drawn.length,count);
    assert.equal(el('time').textContent,'1 s');
    assert.equal(records.length,saved);
    assert(records.at(-1).checkpoint.line[0].failureCount>0,'split MTBF/MTTR work without a general pair');
    assert.match(el('status').textContent,/Seed 7/);
    el('source').value='representative';
    el('source').dispatchEvent(new window.Event('change'));
    assert.match(el('status').textContent,/Round 2 · Seed 78/);
    assert.equal(el('limit').disabled,false);
    assert.equal(el('time').textContent,'0 s');
    assert.equal(el('output').textContent,'0 bottles');
    assert.deepEqual(createdSeeds,[7,78]);
    assert.equal(createdDefinitions.at(-1).residenceSeconds,2);
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
    assert.equal(el('output').textContent,expected.line.at(-1).produced+' bottles');
    for(const title of ['upstream','belt','Time / failures','Time / sensors']){
      assert(labels.some(([text,font])=>text===title&&font==='600 12px system-ui'));
    }
    for(const label of ['Own failures','Run','Starving','Ramp up','Ramp down','Failure time','Belt speed']){
      assert(labels.some(([text,font])=>text===label&&font==='11px system-ui'));
    }
    const beltSpeed=labels.findIndex(([text])=>text==='Belt speed');
    const [parameter,value,unit]=labels.slice(beltSpeed,beltSpeed+3);
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
    const pointer=(target,type,x,buttons)=>target.dispatchEvent(Object.assign(
      new window.MouseEvent(type,{clientX:x,clientY:100,button:0,buttons,bubbles:true}),{pointerId:1}));
    el('fit').click();
    const frameX=()=>labels.slice(lastFrameOrigin).find(([text])=>text==='upstream')[2];
    const fittedX=frameX();
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
    Object.assign(geometry,{primeSensorPositionMm:1500,backupSensorPositionMm:500,
      engineering:{input:{packageLengthMm:30,upstreamNominalSpeedBpm:120,blockedTimeDelaySeconds:1,
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
    const fullscreen=el('fullscreen');
    assert.equal(fullscreen.previousElementSibling,el('fit'));
    fullscreen.click();
    assert(el('panel').classList.contains('simulation2d-fullscreen'));
    assert.equal(fullscreen.getAttribute('aria-pressed'),'true');
    window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'}));
    assert(!el('panel').classList.contains('simulation2d-fullscreen'));
    assert.equal(fullscreen.getAttribute('aria-pressed'),'false');
    const dimensions=el('dimensions');
    const currentLabels=()=>labels.slice(lastFrameOrigin).map(([text])=>text);
    const marker=label=>labels.slice(lastFrameOrigin).find(([text])=>text===label);
    const sensorPosition=label=>marker(label).slice(2,4);
    const originalSensors=['B','P'].map(sensorPosition);
    for(const control of ['source','machine-style','dimensions']){
      assert.equal(el(control).closest('.simulation2d-options'),dimensions.closest('.simulation2d-options'));
    }
    assert(!currentLabels().some(text=>text.startsWith('Lact ·')));
    dimensions.checked=true;dimensions.dispatchEvent(new window.Event('change'));
    for(const label of ['Lact','Lp','Lba','Lbu','Discharge','Coding','Overflow','Lrec']){
      assert(currentLabels().some(text=>text.startsWith(label+' ·')));
    }
    for(const [label,value] of [['Overflow',420],['Lbu',670],['Lba',830],['Lrec',-335.71]]){
      assert(currentLabels().includes(label+' · '+value.toLocaleString()+' mm'));
    }
    const dimensionLabel=prefix=>labels.slice(lastFrameOrigin).find(([text])=>text.startsWith(prefix+' ·'));
    const discharge=dimensionLabel('Discharge'),coding=dimensionLabel('Coding'),overflow=dimensionLabel('Overflow');
    assert(discharge[2]<coding[2]&&coding[2]<overflow[2]);
    const topTier=['Discharge','Coding','Overflow','Lrec','Lp'].map(dimensionLabel);
    for(const entry of topTier)assert.equal(entry[3],discharge[3]);
    for(let index=1;index<topTier.length;index++){
      const [previous,current]=topTier.slice(index-1,index+1);
      assert(current[2]-previous[2]>=(previous[0].length+current[0].length)*2.5+7.99);
    }
    assert.equal(dimensionLabel('Lbu')[3],dimensionLabel('Lba')[3]);
    assert(dimensionLabel('Lbu')[3]<overflow[3]);
    assert(dimensionLabel('Lact')[3]<dimensionLabel('Lba')[3]);

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
    close(marker('Design B')[2]-marker('Max Run-Out point')[2],420*.09);
    close(marker('P')[2]-marker('Design B')[2],830*.09);
    assert(!marker('Design P'));
    assert(overflow[3]<marker('B')[3]);
    const headings=labels.slice(lastFrameOrigin).filter(([text])=>text==='Parameter').slice(0,6);
    assert.equal(headings.length,6);
    for(const [index,heading] of headings.entries()){
      assert.equal(heading[3],headings[0][3]);
      if(index)assert(heading[2]-headings[index-1][2]>=180);
    }
    assert(!marker('Rec Pt.'));
    window.STSimulation2D.load(['case','dimensions'],equipment,null,{seed:7},null,null,null,[formats[0]]);
    close(marker('P')[2]-marker('Rec Pt.')[2],(830-412.5-55*412.5/65)*.09);

    dimensions.checked=false;dimensions.dispatchEvent(new window.Event('change'));
    assert(!currentLabels().some(text=>text.startsWith('Lact ·')));
    assert(!marker('Max Run-Out point'));
    assert(!marker('Design B'));
    assert.deepEqual(['B','P'].map(sensorPosition),originalSensors);
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
