# Experimental browser SimPy engine

In Advance mode, open **Settings → Simulation → Simulation engine**. The
current ST engine remains the default for new and existing simulations.
Selecting **DES · Python / SimPy (experimental)** changes only the selected
simulation and clears its previous results. The selection is saved in
`dynamicConfig.engineId`; missing values mean `ST_CURRENT`.

Python runs inside a module Web Worker through **Pyodide 0.27.7**. **SimPy
4.1.2** owns the event calendar and clock; the previously evaluated Python model
owns material transfer and downtime. No Google Cloud project, external Python
server, local Python installation, API key or new Apps Script scope is needed.
The first DES calculation downloads the runtime from:

`https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`

This is a network dependency, not an offline deployment. A blocked CDN, CSP or
unsupported Worker produces an explicit error; the app does not silently run a
different engine. ST runs without loading Pyodide. Runtime loading is lazy, and
the audited SimPy wheel, package metadata and MIT license are bundled locally in
the generated HTML, so DES needs no PyPI lookup or package resolution at runtime.

## Supported model and limits

- Alternating serial machine–conveyor lines with at least two machines.
- Individual items; one item in service per machine; blocking after service.
- Finite FIFO conveyors with full-length delay, packed capacity, admission and
  discharge headways; constant belt speed.
- Deterministic processing times and repair times; exponential MTBF with
  independent seeded streams per machine.
- Machine start delay, pause, stop, run, emergency latch and reset; conveyor
  controls and conveyor failures are rejected explicitly.
- Rounds use base seed + index. Shifts are sampled at exact boundaries. Replay
  frames and event logs are bounded. Cancellation terminates Python's Worker;
  it cannot commit a partial result as a completed run.

The geometry adapter uses ST's own geometry calculations, but **this is not the
same physical model**. Spatial queue tails, Prime/Back-up sensors, belt stop
control, ramps, discharge runout, microstops and rejects are not simulated.
Unsupported inputs are rejected. Omitted features and library provenance are
saved with the result, replay, HTML/PDF report and bounded AI export/context.

**OEE remains unavailable (`null`), not zero and not replaced by capacity
achievement.** What-If evaluation is disabled for this experimental model.
Capacity achievement, processing utilization and throughput can be inspected,
but are not validated plant OEE. Cross-engine comparisons show a model warning.
Identical numeric seeds do not pair failure schedules across the two engines.

## Build and deployment

`npm run build:apps-script` requires Python 3 only on the development/build
machine to read the vendored wheel. It generates `SimulationEngine.html` with
the JavaScript adapter and embedded Python sources. The build remains
deterministic; no network download is needed for that step.

Deploy the repository's `.gs`/`.html` Apps Script modules normally and create a
new deployment version. Python source files and the wheel stay in the repository;
they are not uploaded as separate Apps Script files. Existing Drive records and
manifest scopes are preserved.

The live Apps Script deployment and company network access must be checked after
updating. Local iframe tests cannot reproduce all company policies or Google's
production iframe headers.

## Validation on 2026-10-07

- Real Chromium 133, inside a sandboxed iframe with module Worker: selection,
  calculation, result persistence and engine provenance passed.
- The 60/60 BPM, 600-second reference produced **598 items**, with material
  residual **0**. Two rounds used seeds **73, 74** and both produced 598.
- Four 150-second shifts produced **148, 150, 150, 150** items. Cancellation
  stopped synchronous Python; a subsequent run again produced 598.
- Runtime assets were the official npm Pyodide 0.27.7 files served locally by
  the browser test harness. Direct CDN access is blocked in this execution
  environment. This test does not claim corporate CDN or live Apps Script access.
- The integrated Python files passed the prototype's 45 physical/scheduler tests.
- The repository's non-interface Node tests passed: 197/197, including six new
  adapter, dispatch, bounded replay and cancellation tests.
- Nine focused UI checks passed, including the new selector and palette checks.
  The complete initial suite reported
  five unrelated pre-existing failures, reproduced on clean commit
  `f4e30b9`: scenario fingerprint regeneration, keyboard reorder, pointer
  reorder, JSON dialog button class and Basic seed-section expectation.
  The old seven-color expectation was updated to the requested fourteen colors.

To reproduce the optional real browser test, install Playwright in your test
environment and extract `npm pack pyodide@0.27.7`. Then run:

```sh
node scripts/validate-simpy-browser.mjs --runtime /path/to/pyodide/package
```

Optional arguments: `--chromium /path/to/chromium` and
`--playwright /path/to/playwright/index.mjs`. Only runtime-asset requests are
intercepted. The generated app, Worker, SimPy, selector, persistence and cancel
logic are executed unchanged. Server RPCs use synthetic local fixtures.

## Interface changes

Basic now exposes fourteen palettes. “boat blues” maps to the existing source
palette **boat house** (`#4E8AC2`); its source HEX is preserved. “hoke in one”
maps to **hole in one**. All 57 source palettes remain available in Advance.
An unsupported previous Basic color switches to à l'orange, the first allowed
palette.

The right-panel grip uses a thin neutral line with a visible keyboard focus
indicator. Section and Settings-tab changes use a 160 ms fade with 4 px movement;
native dialogs use 150 ms entry/exit transitions where supported. Reduced-motion
preferences disable these effects. Browsers without discrete transitions keep
normal native dialog behavior.

SimPy wheel SHA-256:
`43071f84b6512c9b4fcb33ef057f240ccb1d1f3b263f9b4f9229d072e310b372`.
