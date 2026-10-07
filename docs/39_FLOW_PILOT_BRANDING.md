# Flow Pilot (FP) branding

The title is defined by `view.fp_flow_pilot` in `TextResources.gs` and applied through `Main.gs`. The application icon is embedded in `FlowPilotIcon.html` and inherits the selected theme.

No GitHub URL is included in the deployed Apps Script sources. The favicon uses the publicly accessible PNG at https://www.salesforceicons.com/SLDS/icons/utility/flow_alt_120.png. Its response was verified as HTTP 200, image/png. The SVG equivalent was rejected by Apps Script. Favicon errors are logged without preventing the simulator from opening. Actual favicon rendering must be checked in the deployed Apps Script app.

The manifest `addOns.common.logoUrl` controls a Workspace add-on logo, not an HTML web app favicon. `appsscript.json` remains unchanged.

To install this favicon change, replace only `Main.gs` in Apps Script and publish a new deployment version. Also changed: `scripts/build-browser-engine.mjs`, `test/FlowPilotBranding.test.js`, and this document. The engine build strips documentation-only GitHub URLs from the bundled Python sources while retaining license and copyright text.
