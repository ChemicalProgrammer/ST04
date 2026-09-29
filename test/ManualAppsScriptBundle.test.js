import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildManualAppsScriptBundle } from '../scripts/build-manual-apps-script-bundle.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('manual Apps Script bundle contains all server modules and resolved HTML includes', () => {
  const committedCode = fs.readFileSync(path.join(repositoryRoot, 'apps-script', 'Code.gs'), 'utf8');
  const committedIndex = fs.readFileSync(path.join(repositoryRoot, 'apps-script', 'Index.html'), 'utf8');
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const code = fs.readFileSync(output.codePath, 'utf8');
  const index = fs.readFileSync(output.indexPath, 'utf8');

  assert.equal(committedCode, code, 'apps-script/Code.gs must match the manual bundle generated from apps-script/.');
  assert.equal(committedIndex, index, 'apps-script/Index.html must match the manual bundle generated from apps-script/.');

  for (const sourceFile of ['ApiResponse.gs', 'AuthService.gs', 'ConfigService.gs', 'DriveService.gs', 'CaseService.gs', 'ReferenceCaseFactory.gs', 'PublicDemoCaseFactory.gs', 'Main.gs']) {
    assert.match(code, new RegExp(`Source: apps-script/${sourceFile.replace('.', '\\.')}`));
  }
  assert.match(code, /function doGet\(\)/);
  assert.match(code, /createTemplateFromFile\('Index'\)/);
  assert.doesNotMatch(code, /createTemplateFromFile\('WebApp'\)/);
  assert.doesNotMatch(code, /function include_\(/);
  assert.doesNotMatch(index, /<\?!=\s*include_/);
  assert.doesNotMatch(index, /<\?\s*include_/);

  const scripts = Array.from(index.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
  assert.equal(scripts.length, 22);
  assert.match(index, /window\.STSheetCorrections=/);
  for (const script of scripts) new Function(script);
  new Function(code);
  assert.match(code, /GENERATED SERVER BUNDLE/);
  assert.match(index, /GENERATED CLIENT BUNDLE/);
});

test('manual bundle keeps time-faithful playback and direct equipment scenario controls', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const index = fs.readFileSync(output.indexPath, 'utf8');

  assert.match(index, /At 1×, one virtual second takes one real second\./);
  assert.match(index, /virtualSeconds \* 1000 \/ playbackRate/);
  assert.match(index, /Run \/ resume/);
  assert.match(index, /Planned stop/);
  assert.match(index, /Emergency stop/);
  assert.match(index, /Reset \+ run/);
  assert.match(index, /function applyLiveScenarioControl\(/);
});

test('manual bundle uses a wide, compact live-equipment list on large screens', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const index = fs.readFileSync(output.indexPath, 'utf8');

  assert.match(index, /padding-left: var\(--sidebar-width\)/);
  assert.match(index, /live-equipment-columns/);
  assert.match(index, /State &amp; rate/);
  assert.match(index, /Time losses/);
  assert.match(index, /createAccumulationZoneDetails\(/);
  assert.match(index, /physical accumulation/);
});

test('manual bundle updates live equipment rows in place to preserve scroll position', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const index = fs.readFileSync(output.indexPath, 'utf8');

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


test('manual bundle makes FlowPilot conveyor geometry mandatory and exposes Case deletion', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const code = fs.readFileSync(output.codePath, 'utf8');
  const index = fs.readFileSync(output.indexPath, 'utf8');

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

test('manual bundle exposes photoeye pulses, sustained Back-up timers, and Waiting material', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const index = fs.readFileSync(output.indexPath, 'utf8');

  assert.match(index, /normal photoeye pulse/);
  assert.match(index, /Back-up blocked delay/);
  assert.match(index, /Back-up clear delay/);
  assert.match(index, /PULSING · normal flow/);
  assert.match(index, /Waiting/);
  assert.match(index, /SENSOR_DEBOUNCE/);
});

test('manual bundle includes shared three-tier planning, dialogs and automatic persistence', () => {
  const output = buildManualAppsScriptBundle(repositoryRoot);
  const code = fs.readFileSync(output.codePath, 'utf8');
  const index = fs.readFileSync(output.indexPath, 'utf8');
  for (const name of ['STAutosave','STDialog','STScenarios','STWhatIf']) assert(index.includes(name),name);
  for (const label of ['Zero CAPEX','Medium CAPEX / OPEX','High CAPEX','Static inputs only','Static + dynamic evidence','Advanced engine configuration']) assert(index.includes(label),label);
  assert(index.includes('Global OEE'));
  assert(code.includes('function createScenario_'));
  assert(code.includes('function buildGeminiContext_'));
  assert(!index.includes('id="save-case"'));
  assert(!index.includes('id="reload-case"'));
});
