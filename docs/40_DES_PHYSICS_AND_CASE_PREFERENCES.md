# DES physics and case preferences

## Delivered behavior

- V-Graph legend, axis labels, machine names, reference and data values use 1.5 times their previous text sizes. Margins and minimum chart width accommodate the larger labels; long graphs scroll horizontally.
- The browser title is exactly `Flow Pilot`. The external PNG favicon is unchanged and the app contains no GitHub links.
- SimPy engine version `0.3.0-experimental` supports linear machine ramps and machine microstops. Existing simulations with no ramp or microstop retain their previous event model.

A ramp integrates processing rate over time and analytically calculates the next item's completion. Interruptions retain unfinished work; repair and explicit restart request a fresh ramp. A microstop freezes the existing start/ramp profile and resumes its remaining work. Its interval is exponential with mean `60 / probabilityPerMinute` seconds, with a uniform duration between configured bounds and a separate per-machine random stream. That interval is the continuous-time counterpart of the current engine's per-tick Bernoulli hazard, not an identical random schedule. Manual mode, user stops and failures suspend new microstop scheduling. Reports include microstop counts, durations, startup time and the model's remaining limitations.

The engine is still a single-item processor / finite FIFO conveyor model. Prime/Back-up sensing, spatial queue tails, conveyor stops/failures, discharge runout and rejects remain unimplemented. DES is an event-scheduling method; physical fidelity depends on the implemented model. This change does not establish equivalence with the current ST motor or commercial simulators. Identical seeds do not pair the two engines' random failure/microstop schedules. Neither numerical agreement nor disagreement alone establishes plant realism. Existing saved results must be rerun to use the new physics.

## Where options are saved

| Scope | Examples | Storage |
| --- | --- | --- |
| General appearance and interaction | Light/dark theme, accent, font size by mode, panel widths, interface mode | Browser localStorage, `st.ui.v1.*`; independent of case, local to browser |
| General account configuration | Drive workspace folder, Gemini model, generation settings, prompts and API key | Apps Script UserProperties; independent of case and scoped to Google account |
| Case options | Autosave enabled/interval, seed policy | Case JSON `metadata.consoleOptions` |
| Case display/analysis options | Show JSON fields, include DOE, chart-series and V-Graph colors | Case JSON `metadata.showJsonFields`, `includeDOE`, `chartColors`, `vgraphColors` |
| Simulation configuration | Selected engine, duration, rounds, actual seed, playback speed, equipment edits | Each entry in case JSON `simulations[]`, using `dynamicConfig`, `playbackRate`, `equipment` |
| Simulation evidence | Results, Gemini history, What-If/DOE evidence | Each entry in case JSON `simulations[]` |

Seed policy now appears in Settings → Case. Basic keeps manual saving; the stored autosave policy applies in Advance. Legacy browser autosave/seed/DOE choices initialize missing case options in the in-memory draft without saving merely because a case opened. The next user save persists them. Changing a case's options no longer rewrites global browser defaults. With manual saving, use Save to persist changes.

Example saved structure:

```json
{
  "metadata": {
    "consoleOptions": {
      "autosaveEnabled": true,
      "autosaveSeconds": 10,
      "seedPolicy": "FIXED"
    },
    "includeDOE": false
  }
}
```

## Validation

Targeted checks only: 7 analytical Python physics checks running the actual bundled SimPy library, 16 Node checks (one invokes those seven), and 7 UI checks for seed/save policy, isolation, V-Graph, DOE and Settings. The analytical checks cover exact ramp completion, partial work after pause/failure, frozen ramps after microstops, random repeatability, sample-interval independence, material conservation, state-time totals and agreement between SimPy and the heap reference agenda. Validation uses local fixtures; no live Apps Script deployment, Gemini analysis of the user's original reports, or commercial-simulator parity is claimed.

## Files changed

Replace these files in Apps Script:

- `apps-script/AnalysisStyles.html`
- `apps-script/Client.html`
- `apps-script/LinePerformance.html`
- `apps-script/ScenarioExplorer.html`
- `apps-script/Settings.html`
- `apps-script/SimulationEngine.html`
- `apps-script/TextResources.gs`
- `apps-script/UiPreferences.html`
- `apps-script/WebApp.html`

Other repository changes:

- `docs/35_BROWSER_SIMPY_ENGINE.md`
- `docs/40_DES_PHYSICS_AND_CASE_PREFERENCES.md`
- `schemas/case.schema.json`
- `src/simulation/SimPyBrowserEngine.js`
- `src/simulation/python/st_des_engine.py`
- `src/simulation/python/st_simpy_engine.py`
- `test/DesPhysics.test.js`
- `test/des_physics_test.py`
- `test/FlowPilotBranding.test.js`
- `test/Interface.test.js`
- `test/SimPyBrowserEngine.test.js`

Run `git pull --ff-only origin main`, `clasp push`, and update the existing deployment to a new version. `appsscript.json` is unchanged; the current engine remains the default.
