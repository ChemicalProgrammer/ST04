import {readClientSource} from '../scripts/render-apps-script.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('1000x playback skips display samples and reaches the final frame without changing results',()=>{
 const code=readClientSource();
 const samples=Array.from({length:101},(_,i)=>({virtualSecond:i}));
 const state={run:{result:{samples,summary:{outputCount:77}},sampleIndex:0,playing:true}};
 const before=JSON.stringify(state.run.result);let callback,now=0,delay,finished=0,captured=0,saveChanges=0;
 const context={state,roundSession:null,captureSimulationView(){captured++;},autosave:{change(){saveChanges++;}},performance:{now:()=>now},document:{getElementById:()=>({value:'1000'})},window:{setTimeout:(fn,ms)=>{callback=fn;delay=ms;return 1;}},renderPlaybackFrame(){},syncRunControls(){},setPlaybackStatus(){},finishRoundSession(){finished++;}};
 vm.createContext(context);
 for(const name of ['findSampleIndexAtOrBefore','schedulePlaybackStep','playbackDelayMilliseconds']){
  const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+10);
  vm.runInContext(code.slice(start,end),context);
 }
 vm.runInContext('schedulePlaybackStep()',context);assert.equal(delay,35);
 now=35;callback();assert.equal(state.run.sampleIndex,35);
 now=105;callback();assert.equal(state.run.sampleIndex,100);assert.equal(state.run.playing,false);
 assert.equal(finished,1);assert.equal(captured,1);assert.equal(saveChanges,1);
 assert.equal(JSON.stringify(state.run.result),before);
});


test('completing a target batch keeps the final playback frame and saves that view',()=>{
 const code=readClientSource(),samples=[{virtualSecond:0,outputCount:0},{virtualSecond:42,outputCount:77}];
 const state={run:{result:{samples},sampleIndex:1,roundIndex:0}};
 const result={samples,effectiveRuntimeStop:{status:'REACHED'},batch:{representativeRound:2}};
 const tab={};
 const context={state,result,session:{run:{rounds:3,calculationMode:'LIVE'}},roundSessionActive:()=>true,
   syncPlaybackRounds(){},selectPlaybackRound(){assert.fail('target completion switched the playback round');},
   toggle(){},renderResultJsonPreview(){},shell:{sync(){}},renderPlaybackFrame(){},
   activePersistentSimulation:()=>tab,cloneJson:value=>JSON.parse(JSON.stringify(value)),
   createStoredSimulationResult:()=>({}),captureSimulationView(){tab.results.view={virtualSecond:state.run.result.samples[state.run.sampleIndex].virtualSecond};},
   saveActiveCase(){}};
 vm.createContext(context);
 for(const name of ['findSampleIndexAtOrBefore','persistRoundResult']){
  const start=code.indexOf('    function '+name+'('),end=code.indexOf('\n    function ',start+10);
  vm.runInContext(code.slice(start,end),context);
 }
 vm.runInContext("persistRoundResult(session,result,'COMPLETE')",context);
 assert.equal(state.run.result.samples[state.run.sampleIndex].outputCount,77);
 assert.equal(tab.results.view.virtualSecond,42);
});
