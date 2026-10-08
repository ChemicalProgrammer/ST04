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
- Background DES rounds execute the full Python model. Only after computation,
  their transport payload omits replay/events, retaining the first/final frames
  and exact shift boundaries required for normalization. Round-one replay remains
  complete. DES's existing unvalidated OEE limitation remains unchanged.

## What-If

A bounded shared LRU stores metrics for 32 completed input configurations. Keys
contain canonical equipment, flow units, all run settings and an engine-version
namespace. Seed, duration, time step, commands, replication count or equipment
changes invalidate reuse. Applied changes are validated before cache lookup;
engineering warnings are reconstructed for the current proposal.

Completed main results include the same exact input provenance and retain it when
saved. Matching results can supply the baseline without a new simulation. Pending,
cancelled and legacy results without provenance are not eligible. Legacy cases
need one completed run with this version before saved baseline reuse is available.

The initial independent equipment blocks execute in groups of at most two. Results
are consumed in the original order, preserving winner/tie/stagnation accounting.
Groups respect remaining candidate and stagnation budgets. Coordinate refinement
remains ordered because subsequent proposals depend on the current winner.
Independent confirmation evaluates baseline and winner concurrently, using a
separate seed block and the full configured replication count. Existing Stop
semantics remain: finish search first; cancel during confirmation.

## Validation and performance limits

Real worker-thread tests compare ordered seeds, full metrics, event/frame output,
shift results and statistics with sequential execution. Python tests compare full
and compact transport through the actual DES model and normalizer. Separate tests
cover stale/pending cache rejection, cancellation, runtime download fallback and
saved scenario creation/restoration.

Parallelism cannot promise a fixed speedup. Runtime download/initialization,
processor availability, browser limits and memory affect elapsed time. An isolated
worker test is not a measurement of the deployed Apps Script web app or of Pyodide
network initialization. Benchmark the user's representative line in its browser.
