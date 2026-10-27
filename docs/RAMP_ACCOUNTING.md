# Start ramp and stop-transition accounting

Implemented 2026-10-27 for the ST current engine (`0.17.1`). These are passive observations of the existing physics. No acceleration/deceleration input, speed profile, random stream, buffer capacity or production count is changed by this feature.

## What is actually modeled

A start sequence can contain a zero-flow startup delay followed by a linear ramp toward the configured nominal operating rate. Nominal operating speed is not necessarily the installed maximum speed. The new start-ramp counters exclude the delay and count only executed simulation ticks where the ramp limits the requested flow. Starving/blocking can reduce actual flow further during those ticks.

The current stop model has no continuous deceleration ramp. A Back-up stop can include a response interval and residual discharge before holding stopped. Those phases are labeled **Stop transition**, not ramp-down. STOP, PAUSE, emergency stops, failures and calendar stops do not acquire invented deceleration durations.

A future physical ramp-down requires an explicit deceleration parameter and a separately validated model. This feature does not infer one from MTTR, startup duration, or residual bottle count.

## Per-equipment counters

All counters live in each result's `equipmentMetrics[equipmentId]`:

| Field | Meaning |
|---|---|
| `startRampSeconds` | Eligible simulation time spent executing the start ramp, in seconds. |
| `startRampOutputUnits` | Actual output/transfer during those ticks, in native output units. |
| `startRampBottleEquivalents` | The same actual output converted to bottle equivalents when the conversion is known. |
| `startRampCount` | Number of start sequences that actually reached an eligible ramp tick. |
| `stopTransitionSeconds` | Eligible ticks with an active Back-up response or pending residual discharge. |
| `stopTransitionOutputUnits` | Actual output/transfer during those stopping ticks, in native units. |
| `stopTransitionBottleEquivalents` | The stopping output converted to bottle equivalents, when known. |
| `stopTransitionCount` | Number of Back-up controls that reached an eligible stopping tick. |

Eligibility excludes unavailable equipment, calendar stops, Prime waiting and startup delay. A Back-up control takes precedence over a paused start profile, so a tick is not counted in both phases. Unavailable/repair intervals do not increment the counters. The same start sequence resuming after repair is not counted as another start. A manual STOP followed by RUN creates another sequence. A simulation ending partway through a sequence records only its executed ticks.

Time resolution is the physics tick. A configured duration not divisible by the tick is represented by the ticks actually used by the existing flow model. Output is integrated from the actual equipment output delta, including zero/partial output under material constraints. It is not calculated as nominal speed times configured ramp duration.

## Bottle counts

For an active product/format, each native output unit is converted using the equipment's active bottle-equivalent factor at that instant. For example, one case in a 12-pack is 12 bottle equivalents. Format changes from 12 to 6 bottles/case use the corresponding factor for each phase segment.

Without an active format, explicit bottle output can be counted directly. Generic units or cases without a known conversion leave bottle equivalents `null`, while native-unit totals and times remain available. The default is not an assumed 12-pack.

This is processed throughput during a phase, not rejects, losses or lost production opportunity. The fluid engine can report fractional equivalent counts. The same physical bottle may pass multiple equipment; per-equipment counts must not be summed as unique line bottles. Startup and subsequent stopping can also process the same bottle at one equipment; the feature does not track individual bottle identities.

## Results, replications and exports

Results includes a **Start ramps and stop transitions** table, with seconds and bottle equivalents for each phase and equipment. The normal Results round selector applies: the default is the mean of all saved rounds, with individual/representative rounds available. The table also appears in Basic printable HTML/PDF reports.

Counters are computed independently of recording interval and retained event logs. Summary-only background calculations include them. Saved simulation JSON, complete-case exports and per-round equipment metrics retain them through the existing save path. JSON/advanced scalar exports also expose native-unit and sequence-count fields.

Missing metrics from old results or unsupported engines display `—`, not zero. No totals are reconstructed from downsampled charts. Re-run with the ST engine to obtain the new counters. The experimental DES adapter does not yet supply this accounting; its rows remain unavailable rather than claiming equivalent physics.

The input-signature version/cache changes prevent a previously cached result from being reused as a new measurement. Existing saved results are not rewritten.

## Deployment

Update these Apps Script files together:

- `SimulationEngine.html` — rebuilt from the tested engine sources.
- `Results.html` — on-screen table.
- `Reports.html` — shared table data and report content.
- `ReportResultsTemplate.html` — report section.

No new configuration fields or Google Sheets columns are needed. `ScenarioEngine.gs` is unchanged by this feature.

## Validation

The targeted engine/report tests cover analytical ramp output, startup-delay exclusion, truncated restarts, emergency/manual/calendar stops, repair pauses, actual Back-up stopping flow, unknown conversions, active case-to-bottle conversions across formats, asynchronous/summary calculations, mean/selected round presentation, missing older metrics and saved JSON. A direct comparison with the previous committed browser engine confirms unchanged production summaries, sampled physics and events for three fixed seeds.

A separate existing `SimulationPersistence.test.js` assertion expects all replay events to be dropped. The unchanged baseline code retains up to 2,000 events, so that existing assertion fails with 100 retained versus 0 expected. It is unrelated to these counters and was not modified. The new targeted saved-result test verifies that phase counters and per-round metrics survive JSON serialization.
