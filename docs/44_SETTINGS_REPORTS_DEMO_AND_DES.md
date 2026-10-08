# Settings, reports, comparison and demo update

## Interface

Settings uses General headings in Case, Appearance and Gemini. Gemini has no
enclosing box. The existing themed native select picker uses 30 px rows and
4 px vertical padding. The separate ElegantStyles overlay remains active in
code and can be removed as described in DUAL_COLOR_STYLE.md.

Comparison appears in the header of both modes when the open case contains
more than one simulation. Basic shows OEE, throughput and production, plus
changed inputs; batch outcomes use their means. Advance retains its detailed
metadata, equipment and replication sections.

All HTML/PDF exports inherit both colors. Primary identifies the report brand;
secondary styles titles, borders and table headings. Print uses a white paper
background and the selected palettes' light colors, even when the app is Dark.
The report template and stylesheet remain separate editable modules.

## DES startup

The Python model ran successfully with the real Pyodide 0.27.7 and SimPy 4.1.2
runtime in a sandbox iframe. Direct access to the original CDN failed in the
development environment; this does not establish the cause in a live Apps
Script deployment or another network.

Runtime download failures now retry the pinned npm runtime at
`https://unpkg.com/pyodide@0.27.7/`. A 60-second startup timeout is separate
from the five-minute calculation timeout. Download, Python-model and worker
errors remain distinct. A Python/model error does not retry another engine.
Cancellation still terminates the worker and prevents saving stale results.

## Demo

New public demo cases contain four independent simulations with no preset
results. Existing stored cases remain intact. An 8-hour shift, three rounds and
fixed seed 20261008 reproduce mean OEE 29.97 / 49.20 / 59.19 / 80.29 percent.
See 14_PUBLIC_DEMO_CASE.md for the physical targets and interpretation.
Reliability and the 400 BPM OEE reference are unchanged across the scenarios.
What-If may find other targets; these four configurations are reproducible
examples, not hard limits on further optimization or plant guarantees.

## Verification

- Real Chromium 153 in a sandbox iframe: DES selection, calculation, saved
  provenance, two rounds, four shifts, cancellation and restart passed. The
  first runtime source was deliberately blocked; the second loaded real
  Pyodide assets served locally by request interception. The live Apps Script
  deployment and direct corporate-network access were not tested.
- Real browser inspection: Basic comparison tab, all three General headings,
  absence of the Gemini border and the compact select picker passed with no
  browser errors. A generated PDF was rendered and visually inspected.
- The non-interface suite passed 224 of 225 tests, including all four computed
  demo configurations and input equality with the scenario adapter. The
  remaining branding assertion expects two SVG icons but the existing page
  contains three; the same failure reproduced on the preceding revision.
- Focused UI and contract checks cover comparison visibility, three Basic
  batch means, Settings persistence, selectors, PDF exports and DES fallback.
  Broader UI tests retain previously reproduced failures around scenario
  fingerprint regeneration, JSON-dialog class expectations, stopped import
  startup, obsolete Basic seed visibility, DOE settings and guided options.
- Generic interface fixtures explicitly discard demo-only fixed-seed defaults.
  The scenario maximum test regenerates its plan after changing the installed
  maximum instead of checking the obsolete pre-edit plan.

## Apps Script files to update

BasicMode.html, Client.html, Comparison.html, ElegantStyles.html,
PublicDemoCaseFactory.gs, ReportStyles.html, Reports.html, Results.html,
SimulationEngine.html and WebApp.html. Publish a new deployment version after
copying these modules. Python, Node tests and build scripts remain repository
files rather than separate Apps Script modules.
