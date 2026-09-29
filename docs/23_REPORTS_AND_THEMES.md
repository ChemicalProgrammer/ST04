# Reports, compact analysis and themes

## Right panel

Equipment cards open configuration directly; the Gemini toolbar button replaces
configuration with chat. There are no view tabs or separate Edit icons. Cards are
keyboard focusable and Enter/Space selects them. Both side panels use matching
panel-outline icons with direction arrows appropriate to their edge.

## Theme resources

`apps-script/ThemeResources.html` is the accent dictionary. Each named palette has
`light` and `dark` entries, each containing `accent`, `soft` and `onAccent` colors.
Add or remove an entry there to change the Settings palette. `defaultAccent`
selects the default; a removed saved color falls back to it or the first entry.
Keep at least one complete palette. Check contrast when adding colors. Semantic
status colors, typography, dimensions and the initial fallback remain centralized
in `DesignTokens.html`; the accent dictionary does not change failure/status meaning.

## Results exports

The Results Export menu preserves the full JSON export and adds:

- Compact AI JSON: a versioned analysis object, capped at 64,000 characters. It
  includes run seed/duration/units, aggregate results, equipment inputs and metrics,
  conveyor calculations and supported proposals. It excludes replay, samples,
  event logs, raw imports and command schedules. Coverage records equipment and
  proposals omitted to fit the budget. Up to 500 equipment records are considered
  before size trimming. Long text and deep/custom objects are also summarized.
  This is a character budget, not a guarantee for every AI model's token window.
- Standalone HTML: summary, equipment metrics and inputs, conveyor/sensor metrics,
  plus snapshots of the currently rendered results charts. It embeds chart images
  and SVG; no fonts, scripts or external resources are required to open the report.
- PDF / Print: opens that report in a new tab and invokes the browser print dialog.
  Select Save as PDF. If popups are blocked, allow them or export HTML and print it.
  No external converter receives the report.

Aggregated equipment losses overlap in clock time and must not be interpreted as
elapsed line downtime. Throughput uses final output over the full run. Input units
and the fixed plant MTBF/MTTR policy are recorded in compact exports.

## What-If

Categories with no proposed changes are not displayed as empty cards. If there
are no proposals at all, a single empty state explains the lack of support. The
engineering checks remain visible. Proposals with actual changes that fail model
validation remain reviewable but cannot be applied.

Each change lists equipment name, parameter label, current and proposed values,
units and instructions describing where to change the value and what it controls.
The exact JSON path is secondary information. HTML and PDF / Print exports use
these same descriptions, evidence and engineering checks. Creating and simulating
the successor is still necessary to quantify any benefit.

`Reports.html` handles export data and rendering; `ReportStyles.html` centralizes
standalone report styling. `TextResources.gs` contains report/UI explanations.
Tests cover data size/omissions, HTML escaping, PDF handoff, direct panel selection,
scenario filtering and palette additions/removals. Final PDF pagination and visual
appearance depend on the browser and should be reviewed after deployment.

The document shell and per-export section order now live in `ReportTemplates.html`, `ReportResultsTemplate.html`, `ReportWhatifTemplate.html` and `ReportConfigurationTemplate.html`. Exports snapshot the active light/dark theme and primary accent. See `25_SHIFTS_REPLICATIONS_AND_REPORT_LAYOUTS.md` for named slots and replication report behavior.
