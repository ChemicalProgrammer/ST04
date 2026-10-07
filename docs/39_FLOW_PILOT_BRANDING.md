# Flow Pilot (FP) branding

The title is defined by `view.fp_flow_pilot` in `TextResources.gs` and applied through `Main.gs`. The application icon is embedded in `FlowPilotIcon.html` and inherits the selected theme.

No GitHub URL is included in the deployed Apps Script sources. The custom favicon is disabled because Apps Script rejects SVG and the user requires no GitHub references inside the web app. The PNG asset remains available in the repository for future approved hosting; it is not loaded by the web app. A custom favicon requires a publicly accessible supported image outside GitHub. The default browser icon is used in the meantime.

The manifest `addOns.common.logoUrl` controls a Workspace add-on logo, not an HTML web app favicon. `appsscript.json` remains unchanged.

To install this change, replace `Main.gs`, `ThemeResources.html`, and `SimulationEngine.html` in Apps Script and publish a new deployment version. Also changed: `scripts/build-browser-engine.mjs`, `test/FlowPilotBranding.test.js`, and this document. The engine build strips documentation-only GitHub URLs from the bundled Python sources while retaining license and copyright text.
