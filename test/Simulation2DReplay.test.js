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
  const [upstream,,downstream]=model.line;
  assert(transitions>0);
  assert.equal(downstream.failureCount,transitions);
  assert(downstream.durations.failure>0);
  assert(downstream.durations.starving>0);
  assert(downstream.durations.acceleration>1);
  assert(upstream.durations.deceleration>0);
  const restored=window.STSimulation2DEngine.create(definitions,7,model.snapshot());
  assert.equal(restored.line[2].failureCount,transitions);
  assert.equal(restored.line[2].durations.starving,downstream.durations.starving);
});

test('2D selects the representative row and restores its compact conveyor geometry', () => {
  const code=readClientSource();
  const context=vm.createContext({cloneJson:value=>JSON.parse(JSON.stringify(value))});
  for(const name of ['expandStoredReplay','playbackReplay','representativeRoundFor2D']){
    const start=code.indexOf('    function '+name+'(');
    assert(start>=0);
    vm.runInContext(code.slice(start,code.indexOf('\n    function ',start+10)),context);
  }
  const first={samples:[{virtualSecond:0,outputCount:4}]};
  const second={round:2,samples:[{virtualSecond:5,accumulationZones:[{id:'z',inventoryUnits:5}]}],
    zoneDefinitions:{z:{ownerEquipmentId:'conveyor',geometry:{usableLengthMm:800}}}};
  const results={replay:first,batch:{representativeRound:2,rows:[{},{
    seed:20,durationSeconds:5,summary:{outputCount:15}
  }],representativeReplay:second}};
  const source=context.representativeRoundFor2D(results);
  assert.equal(source.round,2);
  assert.equal(source.seed,20);
  assert.equal(source.summary.outputCount,15);
  assert.equal(source.samples[0].accumulationZones[0].ownerEquipmentId,'conveyor');
  assert.equal(source.samples[0].accumulationZones[0].geometry.usableLengthMm,800);
  delete results.batch.representativeReplay;
  assert.equal(context.representativeRoundFor2D(results),null);
});

test('2D replays recorded counters and final totals without replacing its independent checkpoint', () => {
  const markup=readFileSync(new URL('../apps-script/WebApp.html',import.meta.url),'utf8');
  const panel=markup.match(/<section id="simulation2d-panel"[\s\S]*?<\/section>/)[0];
  const dom=new JSDOM(panel,{runScripts:'outside-only'});
  try{
    const {window}=dom,el=id=>window.document.getElementById('simulation2d-'+id);
    const labels=[];
    el('panel').classList.remove('hidden');
    Object.defineProperties(el('canvas'),{clientWidth:{value:1100},clientHeight:{value:550}});
    el('canvas').getContext=()=>new Proxy({
      measureText:text=>({width:text.length*5}),
      fillText:text=>labels.push(text)
    },{get:(target,key)=>target[key]??(()=>{})});
    let animate;
    window.requestAnimationFrame=callback=>{animate=callback;return 1;};
    window.cancelAnimationFrame=()=>{animate=null;};
    window.SimulatorEngine={};
    window.eval(script('Simulation2DEngine'));
    window.eval(script('Simulation2D'));
    const totals={outputCount:24,runningSeconds:3,starvedSeconds:2,startRampSeconds:1,stopTransitionSeconds:2,
      failureSeconds:1,failureCount:2};
    const source={revision:'round2',round:2,seed:78,durationSeconds:10,summary:{outputCount:24},equipmentMetrics:{m:totals},
      samples:[{virtualSecond:0,outputCount:0,equipment:[{id:'m',availabilityState:'STARVED',starvedSeconds:1}]},
        {virtualSecond:9,outputCount:20,equipment:[{id:'m',availabilityState:'RAMPING_UP',startRampSeconds:1}]}]};
    const records=[];
    window.STSimulation2D.load(['case','simulation'],[{id:'m',nominalRatePerSecond:4}],null,{},null,record=>records.push(record),source);
    el('play').click();
    animate(1000);animate(2000);
    el('pause').click();
    assert.equal(el('time').textContent,'1 s');
    const saved=records.length;
    el('source').value='representative';
    el('source').dispatchEvent(new window.Event('change'));
    assert.match(el('status').textContent,/Round 2 · Seed 78/);
    assert.equal(el('limit').disabled,true);
    assert(labels.includes('Starving 1 s'));
    el('play').click();
    animate(1000);animate(11000);
    assert.equal(el('output').textContent,'24 bottle eq.');
    assert(labels.includes('Own failures 2'));
    assert(labels.includes('Ramp up 1 s'));
    assert(labels.includes('Ramp down 2 s'));
    assert.equal(records.length,saved);
    el('source').value='independent';
    el('source').dispatchEvent(new window.Event('change'));
    assert.equal(el('time').textContent,'1 s');
  }finally{dom.window.close();}
});
