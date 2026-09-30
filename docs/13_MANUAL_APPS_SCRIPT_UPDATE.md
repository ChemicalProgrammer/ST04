# Modular Apps Script update

Deploy the individual `.gs` and `.html` files in `apps-script/`, together with `appsscript.json`. `Main.gs` serves `WebApp.html`, which loads the interface modules.

1. Update the modules from the same repository revision. Run `npm run build:apps-script` after changing the engine sources in `src/`; this updates `SimulationEngine.html` and `ScenarioEngine.gs`.
2. Remove legacy `Code.gs` and `Index.html` from the Apps Script project. They are no longer generated or deployed.
3. Preserve the existing manifest settings and configured permissions.
4. Save and update the existing web-app deployment to a new version to test through its `/exec` URL.

When using clasp, configure `rootDir` as `apps-script`, as shown in `.clasp.json.example`. Check the remote file list after synchronization to ensure the legacy files are gone. Do not upload `src/`, `scripts/`, `test/`, or documentation as application files.

Keep the existing Apps Script project to retain its user settings and API key. Removing the two legacy source files does not delete cases stored in Drive. Publishing changes on GitHub does not update the running Apps Script deployment.

Tests and the local preview resolve `WebApp.html` and its includes in memory through `scripts/render-apps-script.mjs`; they do not write combined deployment files.
