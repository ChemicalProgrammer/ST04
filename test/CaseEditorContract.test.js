import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const owner = { email: 'engineer@example.com' };

test('creates a draft case when only a title is provided', () => {
  const runtime = createCaseRuntime();

  const summary = runtime.createCase_({ name: 'New packaging study' }, owner);
  const caseData = runtime.getCase_(summary.id, owner);

  assert.equal(caseData.name, 'New packaging study');
  assert.deepEqual(toPlainObject(caseData.equipment), []);
  assert.equal(caseData.revision, 1);
  assert.equal(caseData.ownerEmail, owner.email);
});

test('updates a case with ordered equipment and increments its revision', () => {
  const runtime = createCaseRuntime();
  const created = runtime.createCase_({ name: 'Editable line' }, owner);
  const original = runtime.getCase_(created.id, owner);

  const saved = runtime.saveCase_({
    id: original.id,
    expectedRevision: original.revision,
    name: 'Editable line v2',
    unitOfFlow: 'bottles',
    equipment: [
      equipment('blower-1', 'BLOWER', 20, 100),
      { ...equipment('pacemaker-1', 'PACEMAKER', 25, 80), unitOfFlow: 'cases' }
    ]
  }, owner);

  assert.equal(saved.revision, 2);
  assert.equal(saved.name, 'Editable line v2');
  assert.deepEqual(saved.equipment.map((item) => item.id), ['blower-1', 'pacemaker-1']);
  assert.equal(saved.equipment[0].unitOfFlow, undefined);
  assert.equal(saved.equipment[1].unitOfFlow, 'cases');
});

test('rejects a stale Case Editor save instead of overwriting a newer revision', () => {
  const runtime = createCaseRuntime();
  const created = runtime.createCase_({ name: 'Concurrent edit' }, owner);
  const original = runtime.getCase_(created.id, owner);
  runtime.saveCase_({
    id: original.id,
    expectedRevision: original.revision,
    name: 'First save',
    unitOfFlow: 'units',
    equipment: []
  }, owner);

  assert.throws(
    () => runtime.saveCase_({
      id: original.id,
      expectedRevision: original.revision,
      name: 'Stale save',
      unitOfFlow: 'units',
      equipment: []
    }, owner),
    (error) => error.simulatorError?.code === 'CASE_CONFLICT'
  );
});

test('preserves explicit real-format process data without inventing missing values', () => {
  const runtime = createCaseRuntime();
  const processData = {
    role: 'CRITICAL_MACHINE',
    machineType: 'BLOWMOLDER',
    equipment: { mtbfMinutes: null, mttrMinutes: null, maximumSpeedBpm: null, bufferMinutes: null },
    geometry: { lactMm: null, lpPrimeMm: null, actualDischargeMm: null, actualCodingMm: null },
    upstream: { packageLengthMm: null, dischargePitchMm: null, startupTimeSeconds: null, bottlesDischargedAtStop: null },
    downstream: { infeedPitchMm: null, rampUpTimeSeconds: null },
    speedAndSensors: {
      conveyorSpeedFactorVsDischargeVelocityPercent: null,
      codingConveyorSpeedFactorVsPreviousConveyorPercent: null,
      additionalParameters: []
    }
  };
  const created = runtime.createCase_({
    name: 'Format line',
    equipment: [{ ...equipment('blowmolder-1', 'BLOWMOLDER', 20, 100), processData }]
  }, owner);

  const stored = runtime.getCase_(created.id, owner);

  assert.deepEqual(toPlainObject(stored.equipment[0].processData), processData);
});

test('preserves Case metadata and exposes its data classification in the Case summary', () => {
  const runtime = createCaseRuntime();
  const metadata = {
    dataClassification: 'PUBLIC_DEMONSTRATION_ONLY',
    dataNote: 'Synthetic values for software testing only.',
    publicReferences: [{ title: 'Public source', url: 'https://example.com' }]
  };

  const summary = runtime.createCase_({ name: 'Public demo', metadata }, owner);
  const stored = runtime.getCase_(summary.id, owner);

  assert.equal(summary.dataClassification, 'PUBLIC_DEMONSTRATION_ONLY');
  assert.deepEqual(toPlainObject(stored.metadata), metadata);
});

test('persists descriptive metadata for a saved What-If simulation', () => {
  const runtime = createCaseRuntime();
  const created = runtime.createCase_({ name: 'What-If study' }, owner);
  const original = runtime.getCase_(created.id, owner);
  const scenario = {
    kind: 'SPEED_BALANCE',
    title: 'Speed balance & V-Graph',
    capex: 'ZERO CAPEX',
    sourceSimulationId: 'simulation-a',
    changes: [{ equipmentId: 'conveyor-1', path: 'processData.accumulation.conveyorSpeedFactorPercent', before: 5, after: 8, unit: '%' }]
  };

  const saved = runtime.saveCase_({
    id: original.id,
    expectedRevision: original.revision,
    name: original.name,
    unitOfFlow: original.unitOfFlow,
    equipment: [],
    simulations: [{
      id: 'simulation-a', name: 'Simulation A', equipment: [], dynamicConfig: {}, results: null, scenario: scenario
    }]
  }, owner);

  assert.deepEqual(toPlainObject(saved.simulations[0].scenario), scenario);
});

function equipment(id, type, rate, capacity) {
  return { id, type, name: id, nominalRatePerSecond: rate, bufferAfterCapacity: capacity, initialMode: 'AUTO' };
}

function createCaseRuntime() {
  function makeFolder() {
  const files = new Map(),children=new Map();
  const folder = {
    getFolders:()=>iterator([...children.values()]),
    getFoldersByName:name=>iterator(children.has(name)?[children.get(name)]:[]),
    createFolder(name){const child=makeFolder();children.set(name,child);return child;},
    getFiles: () => iterator([...files.values()]),
    getFilesByName: (name) => iterator(files.has(name) ? [files.get(name)] : []),
    createFile: (name, content) => {
      const file = createFile(name, content);
      files.set(name, file);
      return file;
    }
  };
  return folder;
  }
  const folder=makeFolder();
  const context = vm.createContext({
    Utilities:{getUuid:()=>crypto.randomUUID()},
    JSON,
    Error,
    Date,
    Array,
    MimeType: { PLAIN_TEXT: 'text/plain' }
    ,LockService: {getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})}
  });

  ['TextResources.gs', 'ApiResponse.gs', 'CaseService.gs'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(repositoryRoot, 'apps-script', file), 'utf8'), context, { filename: file });
  });
  context.getWorkspaceFolders_ = () => ({ cases: folder });
  return context;
}

function createFile(name, content) {
  let fileContent = content;
  return {
    getId: () => 'file-' + name,
    getName: () => name,
    getBlob: () => ({ getDataAsString: () => fileContent }),
    setContent: (nextContent) => { fileContent = nextContent; },setTrashed:()=>{}
  };
}

function iterator(values) {
  let index = 0;
  return {
    hasNext: () => index < values.length,
    next: () => values[index++]
  };
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

test('clones a complete case into an independent owned record and denies other owners',()=>{
 const runtime=createCaseRuntime();
 const summary=runtime.createCase_({id:'original-case',name:'Original case',equipment:[equipment('unit','CUSTOM',10,0)],simulations:[{id:'sim-a',name:'A',equipment:[equipment('unit','CUSTOM',10,0)],dynamicConfig:{seed:21,durationSeconds:28800},results:{summary:{produced:123}},sourceImport:{sheet:'source'}}]},owner);
 const before=runtime.getCase_(summary.id,owner);
 const cloned=runtime.cloneCase_(summary.id,owner),copy=runtime.getCase_(cloned.id,owner);
 assert.notEqual(copy.id,before.id);assert.equal(copy.name,'Copy of Original case');assert.equal(copy.revision,1);
 assert.deepEqual(toPlainObject(copy.simulations),toPlainObject(before.simulations));assert.equal(copy.metadata.clonedFromCaseId,before.id);
 runtime.saveCase_({...copy,expectedRevision:copy.revision,name:'Changed copy'},owner);
 assert.deepEqual(toPlainObject(runtime.getCase_(summary.id,owner)),toPlainObject(before));
 assert.throws(()=>runtime.cloneCase_(summary.id,{email:'other@example.com'}),e=>e.simulatorError?.code==='CASE_NOT_FOUND');
});

test('save failures report the storage stage and safe reference without exposing case data',()=>{
 const runtime=createCaseRuntime(),logs=[];runtime.console={error:line=>logs.push(JSON.parse(line))};
 runtime.persistCaseRecord_=(record,owned)=>{owned.file.setContent(JSON.stringify(record));return owned.file;};
 runtime.getOwnedCaseFile_=()=>({caseData:{id:'a',revision:1,name:'Private case',ownerEmail:owner.email},file:{setContent:()=>{throw Error('private storage details');}}});
 assert.throws(()=>runtime.saveCase_({id:'a',expectedRevision:1,name:'Private case',equipment:[]},owner),error=>error.simulatorError?.code==='CASE_SAVE_FAILED'&&/WRITE/.test(error.message)&&/SAVE-/.test(error.message));assert.equal(logs[0].stage,'WRITE');assert(!JSON.stringify(logs).includes('Private case'));assert(!JSON.stringify(logs).includes('private storage'));
 runtime.persistCaseRecord_=(record,owned)=>{owned.file.setContent(JSON.stringify(record));return owned.file;};
 runtime.getOwnedCaseFile_=()=>{throw Error('private folder');};assert.throws(()=>runtime.saveCase_({id:'a'},owner),error=>error.simulatorError?.code==='CASE_SAVE_FAILED'&&/READ/.test(error.message));
});

test('simulation chat survives Drive save and reopen with isolated histories and no presentation state',()=>{
 const runtime=createCaseRuntime();const history=[{role:'user',text:'Where is the bottleneck?',createdAt:'2026-10-07T17:00:00Z',node:{transient:true}},{role:'model',text:'**Review the filler.**',visibleText:'partial',revealing:true,context:{includedEquipment:2},proposals:[]}];
 const made=runtime.createCase_({name:'Saved chat',simulations:[{id:'a',name:'A',equipment:[],geminiHistory:history},{id:'b',name:'B',equipment:[]}]},owner);
 let record=runtime.getCase_(made.id,owner);assert.equal(record.simulations[0].geminiHistory[1].text,'**Review the filler.**');assert.equal(record.simulations[0].geminiHistory[0].node,undefined);assert.equal(record.simulations[0].geminiHistory[1].revealing,undefined);assert.equal(record.simulations[1].geminiHistory.length,0);
 record.simulations[1].geminiHistory=[{role:'user',scope:'GENERAL',text:'Another simulation'}];record.expectedRevision=record.revision;runtime.saveCase_(record,owner);record=runtime.getCase_(made.id,owner);assert.equal(record.simulations[0].geminiHistory.length,2);assert.equal(record.simulations[1].geminiHistory[0].text,'Another simulation');assert.equal(record.simulations[1].geminiHistory[0].scope,'GENERAL');assert.equal(record.simulations[0].geminiHistory[0].scope,'CASE');
 assert.throws(()=>runtime.normalizeGeminiConversation_([{role:'system',text:'Invalid'}]),error=>error.simulatorError?.code==='INVALID_CASE');
});
