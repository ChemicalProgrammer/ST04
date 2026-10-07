# Flow Pilot interface

Current persistence and What-If behavior is documented in
[Automatic persistence and scenario analysis](20_AUTOSAVE_AND_SCENARIOS.md).

The interface separates Cases, Line setup, Simulation, Results and What-If. Settings
is a native modal dialog, not a dashboard card. The mathematical engine in
`src/simulation/` is unchanged.

## Design audit and decisions

The former page mixed equipment editing, run configuration, live playback, final
charts and recommendations. Settings occupied the dashboard, technical labels
used several unrelated palettes, and chart colors did not follow appearance.
The new shell separates those tasks while retaining existing editors, controls,
case deletion, raw JSON, saved simulation tabs, evidence and detailed comparison.

Light is the default for a browser without a saved preference. Existing explicit
preferences are retained. Dark and System use the same semantic state meanings.
The restrained neutral surfaces, compact list, sidebar and tabs follow the
principles requested from Linear/Vercel. Technical results and comparisons use
an analytical table/KPI hierarchy. Settings and command search use compact dialogs.

## Resource dictionary

`apps-script/DesignTokens.html` is the single visual resource dictionary:

- `--font-page`, `--font-section`, `--font-card`, `--font-body`, `--font-secondary`,
  `--font-caption`, `--font-kpi`, `--font-button`, `--font-input`.
- Font family, weights, line height, spacing, radii, borders, surfaces, text,
  semantic status colors, selection/disabled colors, chart series, shadows,
  transitions, z-index and layout dimensions.
- Compatibility `--text-*` and technical `--size-*` aliases keep older equipment
  components adjustable from the same file. Shared sizes reference spacing tokens.
- CSS media-query breakpoints remain literal in the responsive rules: browsers do
  not support CSS custom properties inside media-query conditions.

The embedded DejaVu subset has no external font dependency; its license is in
`docs/FONT-LICENSE.txt` and inside `Fonts.html`. SVG icons are original path assets
in `Icons.html`; all use the same stroke, grid and currentColor.

## Modules

| Module | Responsibility |
|---|---|
| Styles | Base components and accessibility |
| Shell / ShellStyles | Sidebar, navigation, command search, save status |
| CaseGallery / CasesStyles | Search, readiness filter, sort, list/grid, 24-item pagination |
| Settings / DialogStyles | Modal, focus return, Escape, automatic settings persistence |
| Autosave / Dialogs | Serialized edits, conflict handling and reusable confirmations/input |
| WhatIf / ScenarioPlanner | Three CAPEX categories, evidence and validated scenario changes |
| EditorStyles | Equipment/geometry editor |
| SimulationStyles / DashboardStyles | Live rows, expandable time losses, technical panels |
| Charts | Existing canvas rendering, themed series, full-run results and live sparklines |
| Results | Final-run KPIs, equipment table, JSON export, presentation-only aggregates |
| Comparison / AnalysisStyles | Baseline/proposed deltas, changed inputs, complete detail |
| Client | Case, engine and workspace orchestration |
| UiPreferences | Browser appearance, automatic theme observation and remembered entry |

Modules stay flat under `apps-script/` for Apps Script compatibility and are deployed
individually. Tests and previews resolve HTML includes in memory.

## Interaction

- Login verifies the existing Google identity and allowlist through `getBootstrap`.
- Remembered entry saves only the preference to try bootstrap automatically. It
  cannot extend a Google session or bypass authentication. Sign out clears it.
- Cases is the landing view. If storage is not configured, a short status directs
  the user to Settings; creation is disabled until a workspace is configured.
- Sidebar collapse is remembered. Compact navigation is used on small screens.
- Ctrl/Command K opens command search; arrow keys, Enter and Escape are supported.
- Settings appearance changes apply immediately. Other settings save automatically;
  Done/Escape flush pending changes and keep the dialog open on failure. Native
  dialog supplies modality and keyboard containment.
- Simulation retains all scheduled and direct equipment controls. Time losses are
  expandable. Switching saved simulations stops playback and resets its frame.
- Missing saved run settings use the existing input defaults, not empty fields.

## Data meaning

Simulation KPIs follow the displayed virtual frame. Results KPIs and charts use
the complete calculated run. Equipment downtime sums paused, stopped, failure,
micro-stop and emergency counters. Starving, blocking and downtime aggregates are
**equipment-minutes**, not elapsed line downtime; concurrent equipment losses can
overlap. The existing engine's OEE assumes 100% quality until rejects are modeled.

The highest-loss machine is described as an investigation lead, not a proven
bottleneck. What-If uses the shared CAPEX planner described in the current analysis document. Numeric impact
appears only when both scenarios have results. Baseline/proposed comparison shows
absolute and relative deltas; OEE absolute delta is in percentage points, and a zero
baseline has no relative percentage. Different seeds/durations keep the existing
comparison caution. No untested optimization gain is invented.

## Verification and deployment

Run `npm ci`, `npm run build:apps-script`, then `npm test`. Development-only jsdom
and CSS parsers test navigation, settings, themes, pagination, engine run/clone/
comparison/delete flows, failure recovery, selectors, token references and contrast.
They are not included in the deployed application.

`node scripts/preview-ui.mjs` serves a local synthetic preview for visual review.
It uses no real identity or Drive data and is never included in the bundle.
Automated DOM tests do not validate actual browser rendering, native dialog focus
trapping, device layouts or live Google authentication. Visual browser review of
this revision was blocked by the execution environment's local-page policy.

Deploy all `.gs` and `.html` modules from `apps-script/`, retain the required manifest,
and update the deployment. Remove legacy `Code.gs` and `Index.html`.
`Main.gs` serves `WebApp.html` and its includes.
Publishing GitHub changes does not update the running Apps Script deployment.


## Case workspace navigation and Gemini

Cases now has no sidebar. Once a case is open, the sidebar groups saved simulations and comparison, the selected simulation's views, and workspace actions. What-If contains recommendations only. Settings is the sole location for theme selection and 25 accent colors. Semantic state colors remain independent of the accent; their left stripes share `--state-border-width` (5px). Equipment controls use an accessible 2-column, 3-row icon grid beside the sparkline.

The right Gemini panel flushes pending edits before sending a compact analysis of the selected simulation. Replay and raw imports are excluded; coverage counts identify further omissions. Configure your own Gemini API key and model in Settings; default model is `gemini-2.5-flash`. The key lives in Apps Script UserProperties and is never returned by bootstrap or written to browser storage. A blank key preserves the existing key; the explicit removal checkbox deletes it. Chat messages are transient and clear when changing simulation/case or signing out. Requests are only sent by pressing Send. Validated proposals appear as buttons that create separate scenarios after confirmation.

Deploy the updated individual modules together. Apps Script may ask for authorization for external requests after adding UrlFetchApp. Reference: [Gemini generateContent API](https://ai.google.dev/api/generate-content). The integration is tested with mocked API responses; a live request requires the user's API key. DOM and CSS checks do not substitute for final visual review in the deployed Apps Script web app.


### Workspace polish

Settings uses a fixed header/footer with only the body scrolling. The Gemini panel starts at the top edge; drag its left separator or use Left/Right arrows while focused to change its width (360px minimum, viewport constrained). Width is remembered locally. Line setup uses compact edit/delete actions and a drag handle for reordering; Up/Down arrows on the handle offer the same operation. Reordering preserves editor values and honors reduced motion. The sidebar uses “Compare” and wraps/clips long labels without horizontal scrolling.
