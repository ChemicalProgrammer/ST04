import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {analyzeLinePerformance} from '../src/analysis/LinePerformanceAnalysis.js';

test('results render an accessible speed profile and distinguish outlet from machine throughput', () => {
  const dom = new JSDOM('<section id="line-performance"><p id="vgraph-context"></p><div id="vgraph-plot"></div><p id="vgraph-caveat"></p><table><tbody id="performance-rows"></tbody></table><p id="throughput-method"></p></section>', {runScripts:'outside-only'});
  dom.window.SimulatorEngine = {analyzeLinePerformance};
  dom.window.__ST_TEXT__ = key => key;
  dom.window.eval(fs.readFileSync('apps-script/LinePerformance.html', 'utf8').replace(/^<script>|<\/script>\s*$/g, ''));
  const machine = {id:'f',name:'Filler',type:'FILLER',nominalRatePerSecond:4,processData:{equipment:{maximumSpeedBpm:300}}};
  const result = {durationSeconds:60,unitOfFlow:'bottles',summary:{outputCount:120,lineOeePacemakerEquipmentId:'f'},equipmentMetrics:{f:{outputCount:180,stoppedSeconds:15}}};
  Object.defineProperty(dom.window.document.getElementById('vgraph-plot'),'clientWidth',{value:1440});
  dom.window.STLinePerformance.render(result, [machine]);
  const document = dom.window.document;
  assert.equal(document.querySelectorAll('#performance-rows tr').length, 1);
  assert.match(document.getElementById('throughput-method').textContent, /120 bottles/);
  assert.match(document.getElementById('throughput-method').textContent, /120 bottles\/min/);
  assert.match(document.getElementById('performance-rows').textContent, /180/);
  assert.equal(document.querySelector('#vgraph-plot svg').getAttribute('role'), 'img');
  assert.equal(document.querySelectorAll('#vgraph-plot circle').length, 3);
  assert.equal(document.querySelectorAll('#vgraph-plot .vgraph-recommended-dot').length,1);
  assert.match(document.querySelector('#vgraph-plot .vgraph-recommended-dot title').textContent,/exceeds_maximum/);
  assert.match(document.getElementById('performance-rows').textContent,/320 †/);
  assert.equal(document.querySelector('#vgraph-plot svg').getAttribute('viewBox'),'0 0 1440 260','SVG coordinates match the displayed width so labels are not magnified');
  dom.window.close();
});
