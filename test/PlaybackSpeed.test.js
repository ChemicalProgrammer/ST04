import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('1000x playback skips display samples and reaches the final frame without changing results',()=>{
 const code=fs.readFileSync('apps-script/Client.html','utf8');
 const samples=Array.from({length:101},(_,i)=>({virtualSecond:i}));
 const state={run:{result:{samples,summary:{outputCount:77}},sampleIndex:0,playing:true}};
 const before=JSON.stringify(state.run.result);let callback,now=0,delay,finished=0;
 const context={state,roundSession:null,performance:{now:()=>now},document:{getElementById:()=>({value:'1000'})},window:{setTimeout:(fn,ms)=>{callback=fn;delay=ms;return 1;}},renderPlaybackFrame(){},syncRunControls(){},setPlaybackStatus(){},finishRoundSession(){finished++;}};
 vm.createContext(context);
 for(const name of ['findSampleIndexAtOrBefore','schedulePlaybackStep','playbackDelayMilliseconds']){
  const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+10);
  vm.runInContext(code.slice(start,end),context);
 }
 vm.runInContext('schedulePlaybackStep()',context);assert.equal(delay,35);
 now=35;callback();assert.equal(state.run.sampleIndex,35);
 now=105;callback();assert.equal(state.run.sampleIndex,100);assert.equal(state.run.playing,false);
 assert.equal(finished,1);
 assert.equal(JSON.stringify(state.run.result),before);
});
