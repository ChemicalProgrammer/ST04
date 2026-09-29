import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');

const serverFiles = [
  'TextResources.gs',
  'ApiResponse.gs',
  'AuthService.gs',
  'ConfigService.gs',
  'DriveService.gs',
  'CaseService.gs',
  'ReferenceCaseFactory.gs',
  'PublicDemoCaseFactory.gs',
  'ScenarioEngine.gs',
  'ScenarioService.gs',
  'GeminiContext.gs',
  'GeminiService.gs',
  'SheetImportService.gs',
  'Main.gs'
];

const htmlIncludes = [
  ['DesignTokens', 'DesignTokens.html'],
  ['Fonts', 'Fonts.html'],
  ['Styles', 'Styles.html'],
  ['EditorStyles', 'EditorStyles.html'],
  ['SimulationStyles', 'SimulationStyles.html'],
  ['AnalysisStyles', 'AnalysisStyles.html'],
  ['ShellStyles', 'ShellStyles.html'],
  ['CasesStyles', 'CasesStyles.html'],
  ['DialogStyles', 'DialogStyles.html'],
  ['DashboardStyles', 'DashboardStyles.html'],
  ['ThemeResources', 'ThemeResources.html'],
  ['UiPreferences', 'UiPreferences.html'],
  ['SimulationEngine', 'SimulationEngine.html'],
  ['Icons', 'Icons.html'],
  ['Settings', 'Settings.html'],
  ['Dialogs', 'Dialogs.html'],
  ['Autosave', 'Autosave.html'],
  ['WhatIf', 'WhatIf.html'],
  ['CaseGallery', 'CaseGallery.html'],
  ['ReportStyles', 'ReportStyles.html'],
  ['ReportTemplates', 'ReportTemplates.html'],
  ['ReportResultsTemplate', 'ReportResultsTemplate.html'],
  ['ReportWhatifTemplate', 'ReportWhatifTemplate.html'],
  ['ReportConfigurationTemplate', 'ReportConfigurationTemplate.html'],
  ['Reports', 'Reports.html'],
  ['Results', 'Results.html'],
  ['LinePerformance', 'LinePerformance.html'],
  ['Shell', 'Shell.html'],
  ['Charts', 'Charts.html'],
  ['Comparison', 'Comparison.html'],
  ['AssistantStyles', 'AssistantStyles.html'],
  ['Assistant', 'Assistant.html'],
  ['EquipmentDrag', 'EquipmentDrag.html'],
  ['EquipmentInspector', 'EquipmentInspector.html'],
  ['SheetImportStyles', 'SheetImportStyles.html'],
  ['SheetImportMerge', 'SheetImportMerge.html'],
  ['SheetImportCorrections', 'SheetImportCorrections.html'],
  ['SheetImport', 'SheetImport.html'],
  ['Client', 'Client.html']
];

export function buildManualAppsScriptBundle(rootDirectory = repositoryRoot) {
  const appsScriptSourceDirectory = path.join(rootDirectory, 'apps-script');
  const manualOutputDirectory = path.join(rootDirectory, 'apps-script');
  const resources = fs.readFileSync(path.join(appsScriptSourceDirectory, 'TextResources.gs'), 'utf8');
  const resourceContext = vm.createContext({});
  vm.runInContext(resources, resourceContext);
  const readSource = (file) => {
    const source = fs.readFileSync(path.join(appsScriptSourceDirectory, file), 'utf8').trimEnd();
    return file === 'TextResources.gs' ? source : resourceContext.resolveTextResources_(source);
  };
  const readServerSource = (file) => {
    var source = readSource(file);
    if (file !== 'Main.gs') return source;
    return source.replace(
      /\nfunction include_\(filename\) \{\n  return resolveTextResources_\(HtmlService\.createHtmlOutputFromFile\(filename\)\.getContent\(\)\);\n\}\n?/,
      '\n'
    ).replace("createTemplateFromFile('WebApp')", "createTemplateFromFile('Index')");
  };

  const code = [
    '// GENERATED SERVER BUNDLE.',
    '// GENERATED from apps-script/; edit the modular sources, not this file.',
    ''
  ].concat(serverFiles.flatMap((file) => [
    '// -----------------------------------------------------------------------------',
    `// Source: apps-script/${file}`,
    '// -----------------------------------------------------------------------------',
    readServerSource(file),
    ''
  ])).join('\n');

  let index = readSource('WebApp.html');
  for (const [includeName, sourceFile] of htmlIncludes) {
    const marker = `<?!= include_('${includeName}'); ?>`;
    if (!index.includes(marker)) {
      throw new Error(`Manual bundle expected ${marker} in apps-script/WebApp.html.`);
    }
    index = index.replace(marker, () => readSource(sourceFile));
  }
  if (index.includes('<?')) {
    throw new Error('Manual bundle still contains an unresolved Apps Script template expression.');
  }
  index = '<!-- GENERATED CLIENT BUNDLE. Source modules: apps-script/. -->\n' + index + '\n';

  const codePath = path.join(manualOutputDirectory, 'Code.gs');
  const indexPath = path.join(manualOutputDirectory, 'Index.html');
  fs.writeFileSync(codePath, code);
  fs.writeFileSync(indexPath, index);
  return { codePath, indexPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const output = buildManualAppsScriptBundle();
  process.stdout.write(`Generated ${output.codePath} and ${output.indexPath}\n`);
}
