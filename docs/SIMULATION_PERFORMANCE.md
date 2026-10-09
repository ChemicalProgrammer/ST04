# Simulation execution and result reuse

The optimization preserves simulation duration, time step, configured replications,
seed order, physics, full numerical metrics and independent confirmation criteria.
No approximation, fewer replications or statistical early stopping is introduced.

## Main simulation

- The JavaScript engine shares up to four workers, reserving one reported logical
  processor for the page. Workers load only simulation dependencies, rather than
  the Python runtime, scenario planners and batch/UI dispatch.
- DES/SimPy shares up to two independent Python runtimes. Devices reporting less
  than 4 GB RAM or only two logical processors use one. Runtimes initialize lazily
  and remain available for subsequent rounds; cancellation terminates affected
  workers, and closing the page disposes them and rejects queued work.
- Progress messages are limited to approximately 20 per second per worker.
  Initial/final progress and round-one streaming frames are retained.
- Photoeye field names and enabled sensor lists are prepared once. Inventory
  sums avoid temporary arrays and duplicate traversals, keeping the original
  addition and sensor-event order. No incremental floating-point inventory
  counter or approximate time step is introduced.
- The client snapshots only the case ID, flow units and equipment for a run,
  rather than cloning saved results and sibling simulations. Worker source is
  prepared once and reused when a worker needs to start.
- Background DES rounds execute the full Python model. Only after computation,
  their transport payload omits replay/events, retaining the first/final frames
  and exact shift boundaries required for normalization. Round-one replay remains
  complete. DES's existing unvalidated OEE limitation remains unchanged.

## What-If

A bounded shared LRU stores metrics for up to 128 completed input configurations
and 8 MiB of estimated key storage, so large equipment lists cannot grow the
cache without a size limit. Keys
contain canonical equipment, flow units, all run settings and an engine-version
namespace. Seed, duration, time step, commands, replication count or equipment
changes invalidate reuse. Applied changes are validated before cache lookup;
engineering warnings are reconstructed for the current proposal.

Completed main results include the same exact input provenance and retain it when
saved. Matching results can supply the baseline without a new simulation. Pending,
cancelled and legacy results without provenance are not eligible. Legacy cases
need one completed run with this version before saved baseline reuse is available.

Independent equipment blocks and alternatives of one coordinate execute in
groups of at most two (`parallelCandidates`, bounded to 1–2). Results
are consumed in the original order, preserving winner/tie/stagnation accounting.
Groups respect remaining candidate and stagnation budgets. Coordinates remain
ordered because later coordinates depend on the current winner; alternatives of
one coordinate share the same other targets and can be evaluated concurrently.
Independent confirmation evaluates baseline and winner concurrently, using a
separate seed block and the full configured replication count. Existing Stop
semantics remain: finish search first; cancel during confirmation.

## Case saves

The client requests compact storage. Simulations up to 16 KiB each can share the
case manifest, bounded to 32 KiB of inline simulation JSON per case. Small edits
then need no simulation-file lookup, creation or deletion. Existing small cases
convert on the next save; subsequent server writes retain the compact format.
Larger simulations keep their immutable files and exact content fingerprints.
Inline manifests use `case-folder-2`; the reader supports both storage versions.
One folder listing replaces individual queries when multiple external files
must be verified or cleaned up. Missing files are still detected and recreated.

The manifest commits only after external files have been staged. Cleanup follows
the commit; a failed write leaves the previous data readable. Owner checks,
revision conflicts, serialized autosave and the small RPC acknowledgement remain
in place. Storage references are omitted from the opened case response so inline
data is sent only once. Save capture no longer clones all simulations twice.
Configured autosave intervals are respected; Save still flushes immediately.

## Reproducible measurement (2026-10-09)

Run against an older checkout containing the original source modules:

```sh
node scripts/benchmark-simulation.mjs --baseline /path/to/old/ST01
```

On this workspace, the four public demo models, each with three full 8-hour
replications at 0.25-second ticks, took **65.60 seconds before / 17.55 seconds
after** in total: **3.74× faster, 73.3% less engine time**. Whole summary responses
matched exactly for all twelve seeds; additional detailed runs compared event
logs and replay samples. Per-model speedups ranged from 3.10× to 4.22×. This is
local JavaScript engine time, not the deployed browser or Drive round-trip time.
The unchanged DES/Python model is not covered by that speedup measurement.

## Validation and performance limits

Real worker-thread tests compare ordered seeds, full metrics, event/frame output,
shift results and statistics with sequential execution. Python tests compare full
and compact transport through the actual DES model and normalizer. Separate tests
cover stale/pending cache rejection, cancellation, runtime download fallback and
saved scenario creation/restoration.

New tests compare serial/parallel CAPEX winners, trial histories, evaluated
variables and independent confirmation, and verify cache reuse beyond 32 inputs
and seed invalidation. Storage tests cover inline/external transitions, UTF-8 and
total size limits, atomic failures, cloning, ownership and revision conflicts.
Three older UI tests also fail on the unchanged baseline: case evidence autosave,
the Basic import icon assertion, and the obsolete DOE eligibility assertion.
These pre-existing failures are separate from the performance regression checks.

Parallelism cannot promise a fixed speedup. Runtime download/initialization,
processor availability, browser limits and memory affect elapsed time. An isolated
worker test is not a measurement of the deployed Apps Script web app or of Pyodide
network initialization. Benchmark the user's representative line in its browser.
