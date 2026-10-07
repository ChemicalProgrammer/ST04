# Simulation chat and interface update

Each simulation now stores its own `geminiHistory` in its existing Drive simulation
file. The case save normalizer retains message roles, full text, timestamps, model
proposals and context coverage, without DOM nodes or reveal state. Opening a case
or switching simulations restores the selected conversation. Existing records
without a history remain valid. Previously discarded conversations cannot be
recovered. New simulation and scenario clones start with an empty history; cloning
an entire case preserves its simulation records.

Successful answers and clearing a conversation use the existing serialized case
save queue, including in Basic or when periodic autosave is off. Chat-only writes
preserve the exact physical inputs, so saving an answer cannot invalidate its
scenario proposals. Save failures retain the draft and show a retryable error.
Other pending case edits still follow the existing validation and revision checks.
No extra Gemini call is needed to save a conversation.

Every message has a copy action. User messages have an inline question editor and
Regenerate/Cancel actions. On a model message, Edit opens its preceding question.
Regenerate sends the edited question with only its preceding history and replaces
later messages after a successful answer. Failure restores the original branch
and retains the edited question for retry. The network context still uses the
existing bounded history policy; storing a longer conversation does not remove
Gemini's request-size limits. The existing case-size budget still applies, with an
explicit save error rather than silent history deletion.

Request progress now sits at the bottom of the scrollable conversation. Completion
clears it after 900 ms; failed-request progress clears after 2.5 seconds while the
error detail remains available. Switching cases or simulations cancels stale
callbacks, progress timers and paragraph reveal.

The right-panel grip stops on pointerup anywhere in the window, pointer cancellation,
lost capture, window blur or document hiding. A mouse move with no primary button
also clears a stale drag. Hover cannot change width. Keyboard resize remains available.

Other changes:

- Boat blues (`boat-house`, `#4E8AC2`) is the default accent in both modes. Supported
  existing choices are retained; unsupported Basic choices fall back to boat blues.
- Playback has 200×, 500× and 1000× options in both modes and retains them on reopen.
  Playback speed does not change the calculation.
- Playback and clear-chat icon buttons use the same bordered secondary treatment.
- Advance uses the Equipment section's equipment/conveyors/all filters; its separate
  Conveyors navigation tab is hidden. Synchronizing the shell does not reset a filter.
- The filter row has bottom spacing before the cards.
- Chart/V-Graph colors use two columns in Case settings, collapsing to one on narrow
  screens. Periodic Autosave settings now also live under Case.
- HTML and PDF/Print reports snapshot the selected Basic or Advance mode. Basic
  setup uses visible machine/conveyor inputs and computed worksheet values. Basic
  results use the same three principal KPIs, including means across rounds. Technical
  detail, raw JSON, full result tables and What-If checks stay in Advance reports.
  Machine-readable JSON exports remain complete and reusable.

## Validation

`test/Interface.test.js` covers persistence with the real Apps Script save normalizer,
Basic/Advance history isolation, reopen, copy, regeneration and failed regeneration,
scenario proposal validity, release/hover safeguards, high playback rates and Case
settings. `test/CaseEditorContract.test.js` exercises the Drive save/reopen contract.
`test/Reports.test.js` verifies mode-sensitive report data and the actual PDF/Print
callback. `scripts/validate-interface-browser.mjs` runs a real Chromium check in a
sandboxed iframe, using synthetic Apps Script RPCs and no live Gemini request.

The browser validation record is
`docs/validation/2026-10-07-interface-browser.json`. It is a local test, not a live
Apps Script deployment or a production Drive/Gemini verification. The validation
suite summary is `docs/validation/2026-10-07-interface-suite.json`: 200/200 non-interface
checks and 108/111 interface checks passed. The three remaining failures were
reproduced on the previous clean baseline: proposal fingerprint regeneration,
a JSON dialog class expectation, and a Basic seed-section visibility expectation.

## Deployment files

Replace these existing Apps Script modules and update the deployment version:

- `Assistant.html`
- `AssistantStyles.html`
- `BasicMode.html`
- `CaseService.gs`
- `Client.html`
- `DialogStyles.html`
- `EditorStyles.html`
- `ReportComparisonTemplate.html`
- `ReportConfigurationTemplate.html`
- `ReportResultsTemplate.html`
- `ReportWhatifTemplate.html`
- `Reports.html`
- `ScenarioService.gs`
- `Settings.html`
- `TextResources.gs`
- `ThemeResources.html`
- `UiPreferences.html`
- `WebApp.html`

There are no new Apps Script modules or manifest scopes in this update.
