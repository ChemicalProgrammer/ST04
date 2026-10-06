# Shifts, replications and report layouts

Select **Consecutive shifts** in Simulation. Each shift lasts 0.25–24 hours in quarter-hour increments; the default is eight hours. Choose 1–3 shifts and 1–100 rounds. Fixed duration remains available. Shift boundaries do not reset inventory, controls, failures or random streams. Breaks and shift-specific staffing are not implied; use scheduled commands where needed.

Each round starts from the same configuration and initial conditions with seed `(baseSeed + roundIndex) >>> 0`. A cloned simulation preserves the configuration. The async runner uses the same tick operations and 0.25-second integration step, yields every 1,000 ticks and supports cancellation. An incomplete batch is not published as a successful result. There is no warm-up exclusion.

Results include mean, sample standard deviation, minimum and maximum for numeric line and equipment metrics, plus line production, throughput, OEE and loss totals for each round/shift. A one-round standard deviation is unavailable. These describe model variability, not empirical plant validation. MTBF and MTTR are unchanged. Equipment losses can overlap across machines.

The first round retains up to 121 replay frames and at most 2,000 event entries; omitted-event counts are explicit. Other rounds retain metrics only. The saved batch is stored once, outside replay, and restored when reopening. Standard charts, equipment details, What-If proposals and the existing comparison use round 1, explicitly labeled; batch statistics and seeds are compared separately. Live equipment commands on batch replay are disabled: edit scheduled commands and rerun the batch to keep every round consistent. AI exports and Gemini receive batch statistics, not all raw repetitions.

A 13-equipment demo spanning three eight-hour shifts took approximately 15 seconds for one round in the development Node environment before the final replay reduction. This is not a browser performance guarantee. Runtime scales with duration, equipment count and rounds; use small batches first. The final replay target is 120 intervals rather than 600.

## Report layout files

- `apps-script/ReportTemplates.html`: document cover, footer and table structure.
- `apps-script/ReportResultsTemplate.html`: overview, replication summary, charts, equipment and zones.
- `apps-script/ReportWhatifTemplate.html`: scenario proposals and design checks.
- `apps-script/ReportConfigurationTemplate.html`: metadata, settings, equipment and complete configuration JSON.
- `apps-script/ReportStyles.html`: report typography, spacing, palettes and print rules.
- `apps-script/Reports.html`: data formatting, escaping and populating the named HTML slots.

Keep `data-report` slot names when rearranging templates. Labels use `data-report-text` resource keys from the `templateText` map in `Reports.html`; add new resource keys to that map when extending a template. HTML/PDF snapshot the resolved light/dark theme and primary accent at export time; they need no external fonts or styles. PDF uses the browser print dialog. Enable background graphics in print settings to preserve theme fills.

The equipment inspector remembers its own width, independent of Gemini chat, defaults to 760px where space permits, and distributes fields into one, two or three columns. Its minimum field width is a design token, `--equipment-field-width`.

## Fixed and random seed policy

Advance Settings exposes Fixed (default) or Random seed policy. This preference
is stored in this browser and applies to fresh runs in either interface mode.
Random selects one new unsigned 32-bit base seed using Web Crypto (Math.random
fallback). The actual base seed is displayed and saved with run configuration
and results. Round index i (starting at 0) uses (base seed + i) modulo 2^32.
Fixed uses the current seed input; switching to Fixed keeps the last displayed
seed so the run can be reproduced. Playback, recalculation, saved replay and
What-If/DOE matched comparisons do not regenerate seeds.

## Parallel calculation of rounds

Browser batches retain detailed playback only for round 1. Later rounds calculate
all physical ticks, shifts, equipment metrics and summaries with `summaryOnly`,
without samples or event logs. Their metrics, recorded seeds and statistics remain
saved. Legacy saved batches with later replays remain readable.

The browser bundle creates a shared Web Worker pool of at most four workers,
limited further by reported logical processors (leaving one available where
possible). All scenario cards share the pool. The first detailed round and the subsequent rounds start concurrently in
workers. Round 1 publishes its result through `onFirstRound` as soon as available,
while the final batch promise waits for all metrics. Without workers, cooperative
yields keep the interface responsive. Summary-only scenario batches also use
a worker for round 1. Within a
worker the engine skips UI yields while preserving exactly the same tick logic.

Workers receive only the equipment model, case ID/unit and run configuration;
other saved simulations and replays are excluded. Each round keeps its original
`(baseSeed + index) >>> 0` seed and the same ordered scheduled commands. Results
are assembled by round index, regardless of completion order, before statistics
are calculated. Progress combines fractions from all rounds. Cancellation ends
active workers and queued tasks without accepting partial results. Idle workers
are released after five seconds and leaving the page closes the pool.

Live controls apply to round 1 at the displayed virtual second. Adding a command
recalculates only its detailed path immediately and marks other statistics stale.
When round 1 playback reaches its end, an inline warning appears and later rounds
recalculate with the final command timeline and their original seeds. The new
batch reuses the already recalculated first result (`firstResult`). Pending or
stale results contain no batch averages; `replicationStatus` records their state.
Version checks discard old completions after events, new runs, or switching
case/simulation. Pausing playback alone does not add an equipment event.
Later rounds offer no interactive playback. They do not inherit random failures
from round 1; each uses its own reproducible seed.

If workers are unavailable, blocked by browser policy, or fail to start, the
batch recalculates sequentially with the same inputs and metrics. No Apps Script
server simulation calls or third-party computing services are added. Worker
compatibility in the deployed Apps Script iframe depends on browser policy;
the fallback remains available there. Short runs may spend more time starting
workers than calculating; the pool is reused across nearby batches.

Validation uses actual Node worker threads executing the generated browser worker
code, including exact parity, wrapped seeds, scheduled stop/run events, concurrent
card limits, cancellation, stale messages and blocked-worker fallback. This does
not substitute for measuring throughput in the user's deployed browser.

A local synthetic reference-line benchmark (1,800 simulated seconds, 0.25-second
ticks, eight summary-only rounds, worker startup included) measured 7.48 seconds
sequentially versus 3.51 seconds with four workers, approximately 2.13x faster,
with identical statistics. This measures Node worker threads in the development
environment, not the deployed browser or the user's equipment.

## Progressive round results and chart stability

The simulation panel uses a non-modal progress section instead of blocking
playback behind the replication dialog. Round 1 becomes playable as soon as its
calculation finishes; the result is not promised literally instantly. Background
completion adds verified full batch metrics without resetting playback. New
events invalidate old batch statistics immediately, and final playback triggers
recalculation. Closing/changing a simulation cancels its old session. Cancelling
a background batch after round 1 keeps only that first result, marked cancelled.

Basic card charts use a fixed 80px CSS height and the same drawing height. They
do not derive drawing size from their own intrinsic canvas dimensions, avoiding
the repeated growth loop after frame redraws. Header controls share one spacing
variable, the accessible save status has no layout slot, and Gemini uses an
icon-only button with an accessible label and tooltip.
