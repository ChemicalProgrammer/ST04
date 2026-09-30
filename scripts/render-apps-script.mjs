// Local preview of the modular WebApp. No deployable bundle is written.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function renderAppsScript(repositoryRoot = root) {
  const directory = path.join(repositoryRoot, 'apps-script');
  const context = vm.createContext({});
  const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
  vm.runInContext(read('TextResources.gs'), context);
  const resolve = text => context.resolveTextResources_(text);
  const html = resolve(read('WebApp.html')).replace(/<\?!=\s*include_\('([A-Za-z0-9]+)'\);\s*\?>/g,
    (_, name) => resolve(read(name + '.html')));
  if (html.includes('<?')) throw Error('Unresolved WebApp template expression.');
  const server = fs.readdirSync(directory).filter(name => name.endsWith('.gs')).sort()
    .map(name => '// Source: apps-script/' + name + '\n' + read(name)).join('\n');
  return { html, server };
}
