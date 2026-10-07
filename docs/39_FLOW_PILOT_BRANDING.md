# Flow Pilot (FP) branding

Replace these Apps Script files: `Main.gs`, `TextResources.gs`, `WebApp.html`, `Client.html`, `ShellStyles.html`. Add `FlowPilotIcon.html` as an HTML file named `FlowPilotIcon`. Then save and update the web app deployment to a new version.

The browser title is set by `doGet()` using the `view.fp_flow_pilot` text resource. The favicon is set by `HtmlOutput.setFaviconUrl()`, because Apps Script ignores favicon links in the HTML template. Change the HTTPS URL in `Main.gs` to change it later; the image must remain publicly reachable.

The supplied URL (344890) returns HTTP 404. SVG Repo lists Flow Alt at https://www.svgrepo.com/show/374890/flow-alt.svg (CC0). The application embeds its path locally, inheriting the theme foreground through `currentColor`. The browser favicon uses the PNG conversion at `assets/flow-pilot-favicon.png`, publicly served from this repository, and remains static. Apps Script rejected the original SVG favicon with “The favicon image type is not supported”. `doGet()` tolerates favicon failures so branding cannot prevent the application from opening. Desktop tab colors belong to the browser; Apps Script does not allow `theme-color` through its supported meta tags. No tab-color control is promised.

Technical ST identifiers and existing Drive folder names remain stable to preserve saved cases and integrations.

All changed files: the six Apps Script files above, `docs/18_INTERFACE.md`, this document, `test/FlowPilotBranding.test.js`, and `assets/flow-pilot-favicon.png`.

Favicon compatibility fix: replace only `Main.gs` in Apps Script. The PNG is a GitHub asset and is not pushed into Apps Script. The manifest `addOns.common.logoUrl` configures Workspace add-ons, not this HTML web app.
