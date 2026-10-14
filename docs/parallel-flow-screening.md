# Adaptive workers and DOE coverage

The supplied what-if export used ADAPTIVE_CONDITIONAL_FLOW_V1: eight of sixteen eligible variables and six pairs were screened. Its shortlist contained three conveyor-length targets and five Prime-reserve targets, excluding all conveyor-speed targets. Negative results from that shortlist did not establish an optimum.

V3 screens up to sixteen numeric targets and twelve pairs, retaining speed/mechanism diversity when a larger list must be truncated. Pair selection covers different inputs before filling by engineering priority. Actual tested ranges and omitted inputs/pairs remain in the saved evidence. This is not an exhaustive search of continuous values, all interactions or all horizons.

The controlled reproduction uses the exported simulation, saved reliability context, refreshed numeric planner targets, 900 seconds, seed 371953162 and three matched rounds (six for uncertain results). Fifteen targets remain eligible in this context. It selected:

| Conveyor | Speed before → target (mm/s) | Individual throughput gain (units/min) | Individual OEE gain (percentage points) |
| --- | --- | --- | --- |
| PAC–PAL | 1697.3333 → 1915.2 | 1.835676 | 0.951127 |
| DEP–SLE | 451.5542 → 582.75 | 0.877487 | 0.454656 |
| SLE–PAC | 464.6583 → 501.41 | 0.596855 | 0.309251 |

These gains passed the existing paired stability and overflow checks. They are individual screening effects, not additive or independently confirmed gains. Other speed targets were rejected for increased spill, insufficient evidence or negative throughput. Longer conveyors also produced negative short-horizon gains; initial transport/filling time can matter. The subsequent DOE and independent full-duration confirmation remain necessary.

Reproduce with `node scripts/diagnose-flow-screening.mjs input-what-if.json output-report.json`. The script refreshes all numeric planner targets; it does not reconstruct explicit user targets, category exclusions or UI limits. The diagnostic JSON records the tested context and numerical evidence. This run took 43.102 seconds locally for 33 batches, with serial screening; it is not a browser speedup benchmark.

JavaScript simulation now shares one pool sized from available logical CPUs (one reserved for UI), capped at eight model copies. Reported memory below 4 GB limits it to one worker; 4–under 8 GB limits it to three. Unknown CPU capacity defaults to two. SimPy retains its existing conservative one/two-worker memory policy. Independent candidate screening adapts to pool capacity; dependent search steps remain ordered. Batch concurrency includes the first round, including serial mode.

Parallel screening reuses one in-flight extra baseline, consumes results deterministically, and aggregates progress across active jobs. Policy V3 invalidates earlier screening caches. Progress remains an overall upper-bound estimate because extra-seed tests are conditional.

Validation: 63 targeted tests pass, including real Node worker threads against serial numerical results, cancellation/fallback, serial/parallel factor equality, extra-baseline reuse, pair coverage and scenario integration. Browser-specific speedup has not been measured on the user's computer.

Apps Script update: replace `SimulationEngine.html` and `ScenarioExplorer.html` together. Other changes are source, build, diagnostic and test files.
