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
    el('panel').classList.remove('hidden');
    Object.defineProperties(el('canvas'),{clientWidth:{value:1100},clientHeight:{value:550}});
    el('canvas').getContext=()=>new Proxy({
      measureText:text=>({width:text.replaceAll("\u00a0"," ")==="Ramp down 0 s"?84:text.length*5}),
      fillText(text){labels.push([text,this.font]);},
      quadraticCurveTo:x=>bottles.push(x)
    },{get:(target,key)=>target[key]??(()=>{})});
    let animate;
    window.requestAnimationFrame=callback=>{animate=callback;return 1;};
    window.cancelAnimationFrame=()=>{animate=null;};
    const geometry={usableLengthMm:2000,productLengthMm:30,productPitchMm:60,accumulatedPitchMm:30,conveyorSpeedMmPerSecond:120};
    window.SimulatorEngine={resolveProductConveyor:()=>geometry};
    window.eval(script('Simulation2DEngine'));
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
      {id:'upstream',nominalRatePerSecond:10,processData:{equipment:{stopInputs:{minor:{mtbfMinutes:.001,mttrMinutes:.002}}}}},
      {id:'belt',type:'CONVEYOR',processData:{upstream:{packageWidthMm:22}}},
      {id:'m',nominalRatePerSecond:4}
    ];
    window.STSimulation2D.load(['case','simulation'],equipment,null,{seed:7,durationSeconds:25},null,record=>records.push(record),source);
    el('play').click();
    animate(1000);animate(2000);
    el('pause').click();
    assert.equal(el('time').textContent,'1 s');
    const saved=records.length;
    assert(records.at(-1).checkpoint.line[0].failureCount>0,'split MTBF/MTTR work without a general pair');
    assert.match(el('status').textContent,/Seed 7/);
    el('source').value='representative';
    el('source').dispatchEvent(new window.Event('change'));
    assert.match(el('status').textContent,/Round 2 · Seed 78/);
    assert.equal(el('limit').disabled,false);
    assert.equal(el('time').textContent,'0 s');
    assert.equal(el('output').textContent,'0 bottles');
    assert.deepEqual(createdSeeds,[7,78]);
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
    assert(labels.some(([text])=>text==='Ramp down 0\u00a0s'));
    for(const prefix of ['Own failures','Run ','Starving','Ramp up','Ramp down','Failure time']){
      assert(labels.some(([text,font])=>text.startsWith(prefix)&&font==='12px system-ui'));
    }
    assert.equal(records.length,saved);
    el('source').value='independent';
    el('source').dispatchEvent(new window.Event('change'));
    assert.equal(el('time').textContent,'1 s');
  }finally{dom.window.close();}
});
