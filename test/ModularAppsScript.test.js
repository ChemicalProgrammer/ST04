import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { renderAppsScript } from '../scripts/render-apps-script.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Client wrapper parses directly without server template syntax inside JavaScript',()=>{
  const source=fs.readFileSync(path.join(repositoryRoot,'apps-script','Client.html'),'utf8');
  assert(!source.includes('<?'));
  new Function(source.replace(/<\/?script>/g,''));
  const rendered=renderAppsScript(repositoryRoot).html;
  assert(!/\/\/ include Client[A-Za-z]+/.test(rendered));
  assert.match(rendered,/function renderPlaybackFrame\(/);
});

test('modular Apps Script application contains all server modules and resolved HTML includes', () => {
  const output = renderAppsScript(repositoryRoot);
  const code = output.server;
  const index = output.html;


  for (const sourceFile of ['ApiResponse.gs', 'AuthService.gs', 'ConfigService.gs', 'DriveService.gs', 'CaseService.gs', 'DemoCaseFactory.gs', 'Main.gs']) {
    assert.match(code, new RegExp(`Source: apps-script/${sourceFile.replace('.', '\\.')}`));
  }
  assert.match(code, /function doGet\(\)/);
  assert.match(code, /createTemplateFromFile\('WebApp'\)/);
  assert.equal((code.match(/function doGet\(/g)||[]).length,1);
  assert(!fs.existsSync(path.join(repositoryRoot,'apps-script','Code.gs')));
  assert(!fs.existsSync(path.join(repositoryRoot,'apps-script','Index.html')));
  assert.doesNotMatch(index, /<\?!=\s*include_/);
  assert.doesNotMatch(index, /<\?\s*include_/);

  const scripts = Array.from(index.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.equal(scripts.length, 32);
  assert.match(index, /window\.STScenarioExplorer=/);
  assert.doesNotMatch(index, /\b__ST_(?:HTML_)?TEXT__\s*\(/, 'Client resource calls must be resolved at build time.');
  assert.match(index, /window\.STSheetCorrections=/);
  for (const script of scripts) new Function(script);
  new Function(code);
});

test('modular application keeps time-faithful playback and direct equipment scenario controls', () => {
  const output = renderAppsScript(repositoryRoot);
  const index = output.html;

  assert.match(index, /At 1×, one virtual second takes one real second\./);
  assert.match(index, /virtualSeconds \* 1000 \/ playbackRate/);
  assert.match(index, /Run \/ resume/);
  assert.match(index, /Planned stop/);
  assert.match(index, /Emergency stop/);
  assert.match(index, /Reset \+ run/);
  assert.match(index, /function applyLiveScenarioControl\(/);
});

test('modular application uses a wide, compact live-equipment list on large screens', () => {
  const output = renderAppsScript(repositoryRoot);
  const index = output.html;

  assert.match(index, /padding-left: var\(--sidebar-width\)/);
  assert.match(index, /live-equipment-columns/);
  assert.match(index, /State &amp; rate/);
  assert.match(index, /Time losses/);
  assert.match(index, /createAccumulationZoneDetails\(/);
  assert.match(index, /physical accumulation/);
});

test('modular application updates live equipment rows in place to preserve scroll position', () => {
  const output = renderAppsScript(repositoryRoot);
  const index = output.html;

  assert.match(index, /function ensureLiveEquipmentColumns\(/);
  assert.match(index, /function createLiveEquipmentCard\(/);
  assert.match(index, /function updateLiveEquipmentCard\(/);
  assert.match(index, /function updateAccumulationZoneDetails\(/);
  assert.match(index, /function updateLiveEquipmentControl\(/);
  assert.match(index, /function captureLiveEquipmentScrollAnchor\(/);
  assert.match(index, /function restoreLiveEquipmentScrollAnchor\(/);
  assert.match(index, /window\.requestAnimationFrame\(/);
  assert.match(index, /window\.scrollBy\(0, delta\)/);
  assert.doesNotMatch(index, /function renderLiveEquipment\(sample\) \{\s+var target = document\.getElementById\('live-equipment'\);\s+target\.textContent = '';/);
});


test('modular application makes FlowPilot conveyor geometry mandatory and exposes Case deletion', () => {
  const output = renderAppsScript(repositoryRoot);
  const code = output.server;
  const index = output.html;

  assert.match(index, /FlowPilot conveyor design/);
  assert.match(index, /Installed length L_act/);
  assert.match(index, /Required overflow L_bu/);
  assert.match(index, /Conveyor design audit/);
  assert.match(index, /FlowPilot geometry is active by default/);
  assert.doesNotMatch(index, /Use format fields/);
  assert.doesNotMatch(index, /Explicit accumulation-zone override JSON/);
  assert.match(index, /Delete case/);
  assert.match(code, /function deleteCase\(/);
});

test('modular application exposes photoeye pulses, sustained Back-up timers, and Waiting material', () => {
  const output = renderAppsScript(repositoryRoot);
  const index = output.html;

  assert.match(index, /normal photoeye pulse/);
  assert.match(index, /Back-up blocked delay/);
  assert.match(index, /Back-up clear delay/);
  assert.match(index, /PULSING · normal flow/);
  assert.match(index, /Waiting/);
  assert.match(index, /SENSOR_DEBOUNCE/);
});

test('modular application includes shared three-tier planning, dialogs and automatic persistence', () => {
  const output = renderAppsScript(repositoryRoot);
  const code = output.server;
  const index = output.html;
  for (const name of ['STAutosave','STDialog','STScenarios','STWhatIf']) assert(index.includes(name),name);
  for (const label of ['Zero CAPEX','Medium CAPEX','High CAPEX','Static inputs only','Static + dynamic evidence','Advanced engine configuration']) assert(index.includes(label),label);
  assert(index.includes('Global OEE'));
  assert(code.includes('function createScenario_'));
  assert(code.includes('function buildGeminiContext_'));
  assert(index.includes('id="save-case"'));
  assert(index.includes('id="settings-autosave"'));
  assert(index.includes('id="settings-autosave-seconds"'));
  assert(!index.includes('id="reload-case"'));
});


