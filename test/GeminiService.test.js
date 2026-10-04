import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup({status=200,denied=false,answer='Observed throughput: 42.'}={}) {
 const values={GEMINI_API_KEY:'private-test-key'},calls=[];
 let record;
 const ctx={PropertiesService:{getUserProperties:()=>({getProperty:k=>values[k]||null})},createSimulatorError_:(code,message,details)=>Object.assign(new Error(message),{code,details}),getCase_:(id,user)=>{assert.equal(user.email,'owner@test');if(denied)throw Error('Access denied');return record;},UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>status,getContentText:()=>JSON.stringify({candidates:[{content:{parts:[{text:answer}]}}]})};}}};
 vm.createContext(ctx);
 for(const file of ['TextResources.gs','PublicDemoCaseFactory.gs','ScenarioEngine.gs','ScenarioService.gs','GeminiContext.gs','GeminiService.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),ctx);
 const demo=JSON.parse(JSON.stringify(ctx.createPublicDemoCaseRequest_()));
 record={id:'case-a',name:'Case A',revision:1,unitOfFlow:'units',simulations:[{id:'a',name:'Simulation A',equipment:demo.equipment,dynamicConfig:{durationSeconds:60,tickSeconds:.25,sampleEverySeconds:1,seed:7,commands:[]},results:{summary:{throughput:42},equipmentMetrics:{},replay:{samples:[{privateReplay:'x'.repeat(2100000)}]}}}]};
 return {ctx,calls,values,record};
}
const request={caseId:'case-a',simulationId:'a',question:'Analyze',history:[]},user={email:'owner@test'};
test('Gemini sends compact selected-simulation context even when replay exceeds the old limit',()=>{
 const {ctx,calls,record}=setup();
 record.simulations.push({...record.simulations[0],id:'b',name:'Other simulation'});
 assert(!JSON.stringify(ctx.getGeminiClientConfig_()).includes('private-test-key'));
 const result=ctx.askGemini_(request,user);assert.match(result.text,/42/);
 const sent=calls[0],payload=sent.options.payload;
 assert.equal(sent.options.headers['x-goog-api-key'],'private-test-key');assert(!payload.includes('private-test-key'));assert(payload.includes('Filler'));assert(payload.includes('throughput'));
 assert(!payload.includes('privateReplay'));assert(payload.length<120000);assert.equal(result.context.replayIncluded,false);assert.equal(result.context.includedEquipment,13);
 assert(JSON.parse(payload).systemInstruction.parts[0].text.includes('entirely in English'));
});
test('Gemini rejects inaccessible cases and nonexistent selected simulations before HTTP',()=>{
 const {ctx,calls}=setup({denied:true});assert.throws(()=>ctx.askGemini_(request,user),/Access denied/);assert.equal(calls.length,0);
 assert.throws(()=>ctx.normalizeGeminiSettings_({model:'../../evil'}),/Check/);
 const other=setup();assert.throws(()=>other.ctx.askGemini_({...request,simulationId:'missing'},user),/Select an existing/);assert.equal(other.calls.length,0);
});
test('Gemini sanitizes remote errors and reports missing keys',()=>{
 const {ctx,values}=setup({status:403});assert.throws(()=>ctx.askGemini_(request,user),/HTTP 403/);delete values.GEMINI_API_KEY;assert.throws(()=>ctx.askGemini_(request,user),/API key in Settings/);
});
test('Gemini accepts validated changes and binds buttons to the original simulation inputs',()=>{
 const fixture=setup(),project=fixture.ctx.STScenarioEngine_.plan(fixture.record.simulations[0]).projects.find(p=>p.canApply);
 const proposal={...project,title:'Test the infeed speed',description:'Static engineering hypothesis'};
 const h=setup({answer:JSON.stringify({text:'Review this scenario.',proposals:[proposal,{...proposal,changes:[{equipmentId:'missing',path:'__proto__.bad',before:null,after:4}]}]})});
 const result=h.ctx.askGemini_(request,user);assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].sourceSimulationId,'a');assert(result.proposals[0].sourceSignature);assert.match(result.text,/did not pass/);
 assert.equal(Object.prototype.bad,undefined);
});
test('history uses a bounded suffix and reports omitted messages',()=>{
 const h=setup();const history=Array.from({length:24},(_,i)=>({role:i%2?'model':'user',text:'text'.repeat(2000)}));
 const result=h.ctx.askGemini_({...request,history},user);assert(result.historyOmitted>0);assert(h.calls[0].options.payload.length<125000);
});

test('Gemini standalone scenario JSON becomes a validated actionable proposal',()=>{
 const fixture=setup(),project=fixture.ctx.STScenarioEngine_.plan(fixture.record.simulations[0]).projects.find(p=>p.canApply);
 const scenario={...project,title:'Sensor study',description:'Review the proposed sensor settings.'};
 for(const answer of [JSON.stringify(scenario),'```json\n'+JSON.stringify(scenario)+'\n```',JSON.stringify([scenario])]){
  const h=setup({answer}),result=h.ctx.askGemini_(request,user);
  assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].title,'Sensor study');
  assert(!result.text.includes('"changes"'));assert.equal(result.proposals[0].canApply,true);
  assert.equal(JSON.parse(h.calls[0].options.payload).generationConfig.responseMimeType,'application/json');
 }
});
test('Gemini incomplete scenario JSON reports a readable error and creates no proposal',()=>{
 const h=setup({answer:'{"title":"unfinished","changes":['});
 assert.throws(()=>h.ctx.askGemini_(request,user),error=>error.code==='GEMINI_RESPONSE_ERROR');
});

test('Gemini server errors recommend retrying without blaming the saved key',()=>{
 for(const status of [500,502,503,504]){
  const {ctx}=setup({status});
  assert.throws(()=>ctx.askGemini_(request,user),error=>
   error.code==='GEMINI_REQUEST_FAILED' &&
   error.message.includes('HTTP '+status) &&
   error.message.includes('temporarily unavailable') &&
   !error.message.includes('API key'));
 }
});

test('Basic Gemini requests descriptive improvements and returns no actionable scenarios',()=>{
 const fixture=setup(),project=fixture.ctx.STScenarioEngine_.plan(fixture.record.simulations[0]).projects.find(p=>p.canApply);
 const h=setup({answer:JSON.stringify({text:'Consider increasing accumulation coverage.',proposals:[{...project,title:'Study'}]})});
 h.ctx.getInterfaceMode_=()=> 'BASIC';
 const result=h.ctx.askGemini_(request,user);
 assert.equal(result.proposals.length,0);assert.match(result.text,/accumulation coverage/);
 assert.match(JSON.parse(h.calls[0].options.payload).systemInstruction.parts[0].text,/plain text only/);
});
test('Gemini rounded before values bind to exact saved inputs and survive the create RPC round trip',()=>{
 const fixture=setup(),source=fixture.record.simulations[0],project=fixture.ctx.STScenarioEngine_.plan(source).projects.find(p=>p.canApply);
 const proposal={...project,title:'Exact saved input study',changes:project.changes.map(c=>({...c,before:999.123}))};
 const h=setup({answer:JSON.stringify({text:'Review the study.',proposals:[proposal]})});
 const response=h.ctx.askGemini_(request,user),accepted=JSON.parse(JSON.stringify(response.proposals[0]));assert(accepted);
 assert.notEqual(accepted.changes[0].before,999.123);
 let saved=h.record,writes=0;
 h.ctx.withCaseWriteLock_=fn=>fn();h.ctx.getOwnedCaseFile_=()=>({caseData:JSON.parse(JSON.stringify(saved)),file:{setContent:value=>{saved=JSON.parse(value);writes++;}}});h.ctx.ensureCaseSimulations_=c=>c;h.ctx.generateSimulationId_=()=> 'scenario';h.ctx.Utilities={getUuid:()=> 'unique-clone'};
 const created=h.ctx.createScenario_({caseId:saved.id,simulationId:'a',expectedRevision:1,origin:'GEMINI',sourceSignature:accepted.sourceSignature,proposal:accepted},user);
 assert.equal(writes,1);assert.equal(created.case.simulations.length,2);assert.equal(created.case.simulations[0].dynamicConfig.seed,7);assert.equal(created.case.simulations[1].results,null);
 const changed=setup({answer:JSON.stringify({text:'Review',proposals:[proposal]})});const old=changed.ctx.askGemini_(request,user).proposals[0];
 changed.record.simulations[0].equipment[0].nominalRatePerSecond+=1;
 changed.ctx.withCaseWriteLock_=fn=>fn();changed.ctx.getOwnedCaseFile_=()=>({caseData:changed.record});changed.ctx.ensureCaseSimulations_=c=>c;
 assert.throws(()=>changed.ctx.createScenario_({caseId:'case-a',simulationId:'a',expectedRevision:1,origin:'GEMINI',sourceSignature:old.sourceSignature,proposal:old},user),e=>e.code==='SCENARIO_STALE');
});

test('Gemini honors the requested browser mode independently of the deployment default',()=>{
 const fixture=setup(),project=fixture.ctx.STScenarioEngine_.plan(fixture.record.simulations[0]).projects.find(p=>p.canApply);
 const answer=JSON.stringify({text:'Supported improvements.',proposals:[{...project,title:'Test conveyor changes',description:'Supported physical changes'}]});
 const basic=setup({answer});basic.ctx.getInterfaceMode_=()=> 'ADVANCE';
 assert.equal(basic.ctx.askGemini_({...request,uiMode:'BASIC'},user).proposals.length,0);
 assert.match(JSON.parse(basic.calls[0].options.payload).systemInstruction.parts[0].text,/plain text only/);
 const advance=setup({answer});advance.ctx.getInterfaceMode_=()=> 'BASIC';
 assert.equal(advance.ctx.askGemini_({...request,uiMode:'ADVANCE'},user).proposals.length,1);
 assert.doesNotMatch(JSON.parse(advance.calls[0].options.payload).systemInstruction.parts[0].text,/plain text only/);
});

test('Gemini external reliability proposals preserve intervention evidence',()=>{
 const fixture=setup(),e=fixture.record.simulations[0].equipment[0],before=e.noiseProfile.reliability.mttrMinutes;
 const proposal={title:'Repair crew intervention',tier:'MEDIUM',basis:'STATIC',kind:'CUSTOM',changes:[{equipmentId:e.id,path:'noiseProfile.reliability.mttrMinutes',before,after:before*.8,external:true,justification:'Dedicated repair team with a target supported by repair trials'}]};
 const h=setup({answer:JSON.stringify({text:'External intervention hypothesis.',proposals:[proposal]})});
 const result=h.ctx.askGemini_({...request,uiMode:'ADVANCE'},user);assert.equal(result.proposals.length,1);assert.equal(result.proposals[0].changes[0].external,true);assert.match(result.proposals[0].changes[0].justification,/repair team/);
});
