import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { renderAppsScript } from '../scripts/render-apps-script.mjs';

test('Flow Pilot branding reaches the Apps Script outer page and both app headers', () => {
  const { html, server } = renderAppsScript();
  const values = {};
  const output = { setTitle(value) { values.title = value; return this; }, setFaviconUrl(value) { values.favicon = value; return this; } };
  const context = vm.createContext({ HtmlService: { createTemplateFromFile(name) { assert.equal(name, 'WebApp'); return { evaluate() { return output; } }; } } });
  vm.runInContext(server, context);
  assert.equal(context.doGet(), output);
  assert.equal(values.title, 'FP · Flow Pilot');
  assert.equal(values.favicon, 'https://raw.githubusercontent.com/ChemicalProgrammer/ST/main/assets/flow-pilot-favicon.png');
  assert.match(html, /<title>FP · Flow Pilot<\/title>/);
  assert.equal((html.match(/viewBox="0 0 52 52"/g) || []).length, 2);
  assert.match(html, /Signed out of Flow Pilot/);
  assert.doesNotMatch(html, /Line Studio|line_studio|\bLS\b/);
});

// A branding failure must not stop the simulator from opening.
test('Flow Pilot still opens when the favicon provider is unavailable', () => {
  const { server } = renderAppsScript();
  const warnings = [];
  const output = { setTitle() { return this; }, setFaviconUrl() { throw new Error('The favicon image type is not supported'); } };
  const context = vm.createContext({ console: { warn(message) { warnings.push(message); } }, HtmlService: { createTemplateFromFile() { return { evaluate() { return output; } }; } } });
  vm.runInContext(server, context);
  assert.equal(context.doGet(), output);
  assert.equal(warnings.length, 1);
});
