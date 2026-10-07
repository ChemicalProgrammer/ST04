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
  assert.equal(values.favicon, 'https://www.salesforceicons.com/SLDS/icons/utility/flow_alt_120.png');
  assert.doesNotMatch(html + server, /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)/i);
  assert.match(html, /<title>FP · Flow Pilot<\/title>/);
  assert.equal((html.match(/viewBox="0 0 52 52"/g) || []).length, 2);
  assert.match(html, /Signed out of Flow Pilot/);
  assert.doesNotMatch(html, /Line Studio|line_studio|\bLS\b/);
});
