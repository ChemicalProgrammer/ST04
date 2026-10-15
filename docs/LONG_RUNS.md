# Long simulations: duration, events, calculation and history

## Duration

Settings → Simulation offers Elapsed time (seconds/minutes/hours/days/weeks), Number of shifts (1–10,000) and Date/time range with an IANA timezone (America/Mexico_City by default). Existing fixed-second and legacy safety-limit configurations remain readable. Resolved durations round up to a 0.25 s tick. The maximum accepted duration is five years; this is an input limit, not a performance guarantee. Date ranges are elapsed instants in the selected zone. Invalid local dates and nonexistent daylight-saving times are rejected; ambiguous repeated local hours resolve to the runtime's selected matching instant.

Optional shift accounting creates reporting boundaries only. Shift boundaries do not stop equipment or empty conveyors. The summary shows complete shifts and a remaining fraction. Basic quick shift buttons still select duration by shift count; Settings accepts larger counts. Rounds remain independent replications, not consecutive segments of a month.

## Events

Simulation has an Enable events checkbox. Off preserves all event inputs but skips manual commands and planned line stops. MTBF/MTTR and microstops retain their independent physics settings. The event editor and live equipment control buttons appear when enabled in Advance. The loss-details button remains available independently.

Apply plant calendar replaces the old duration-only button. It sets the adjusted physical horizon, generates editable visible line-stop windows and enables events. If events already exist, the user must choose Add, Replace or Cancel. Replace clears existing manual and line events. Add preserves manual commands, deduplicates identical category/time/policy windows and rejects overlapping line windows. Manual equipment commands keep their original meaning and can overlap a line stop; they do not override the line gate or automatically restart equipment when the line window ends.

The visible `run.plannedStops` array is the physical source of truth after application. The internal calendar generator is bypassed; stops never run twice. `plantCalendar.appliedCalendar` retains the accounting snapshot, and `appliedHorizonSeconds` bounds that program. Calendar field edits require another Apply to regenerate visible windows. Event rows allow edits/removal and are paginated at 100 to avoid thousands of DOM rows. All windows remain stored, not just the visible page. Stop totals in Results use the actual applied event list.

## Calculation and playback

- Automatic: Live below one day, Fast at one day or more.
- Live: progressive first-round display, throttled and emitted only when new frames exist.
- Fast: calculates in the background with a worker when permitted, including one-round runs. If workers are blocked, the same calculation yields periodically on the main thread. Results open at the final snapshot; playback is optional.
- Summary: same physics and metrics, with start/end snapshots only. Animation playback and live interventions are unavailable.

The physical tick remains 0.25 s. Fast/Summary use larger UI work chunks, not larger physical steps. Progress shows overall percentage, equivalent simulated minutes and a rough remaining-time estimate. Playback speeds now extend to 10,000× and 1,000,000×; speed controls animation only.

## Recording and charts

The current engine caps first-round frames at roughly 1,000 (maximum 1,001 including endpoints), respecting a coarser requested sample interval. Sampling times are aligned to ticks and endpoints are retained. Rate buckets contain mean, minimum and maximum across their ticks. UI runs store static conveyor descriptions once in `zoneDefinitions`. The viewer resolves those descriptions when displaying a frame. Saving keeps its existing further replay compaction; exact metrics and accounting are retained.

The detailed log is bounded to 2,000 records, with explicit omitted-event counts. These retained records now survive saving. Planned line windows are retained separately in the calendar audit, up to the schedule limit. The system does not promise a complete chronological log of every failure or restart for a long run. Later rounds may retain only metrics under existing batch policy.

Card windows: Auto, 1/5/15 minutes, 1 hour, one shift, 24 hours or Full simulation. Auto grows with the displayed horizon, up to seven days. Mean traces and min–max strokes represent recorded buckets; retained failure/start markers and all planned-window boundaries appear when within the window. A requested short window cannot reconstruct detail absent from a saved coarse recording; labels indicate aggregation or summary-only snapshots. No second-by-second month replay is promised. For runs of one day or more, uncached matched failure-free loss diagnostics require an explicit Calculate matched loss diagnostics action; opening Results does not silently start another long simulation. Cached diagnostics and failure-disabled runs remain immediate.

## Measurement and validation

`benchmark-long-runs.mjs` reports elapsed calculation time, sampled heap, record count, JSON bytes and exact output. Results are stored in `docs/benchmarks/long-run-recording.json`. On the synthetic 13-equipment demo, 0.25 s tick and seed 17, Node v24.19.0 measured about 1.5 s / 4.4 s / 128 s for metrics-only runs of 8 h / 24 h / 30 days. Monthly bounded recording took about 132 s, retained 1,000 frames and produced an 11.6 MB full engine JSON before save compaction. These are development-runtime measurements, not enterprise-browser or Google Drive latency guarantees, and modes differ in work performed. Numerical output/OEE matched at all measured horizons.

Tests cover physical equality across modes, optional events, no calendar double execution, actual worker-thread single-round execution, date/unit conversion, timezone validation, UI saving in Basic/Advance, Add/Replace/Cancel and reopening a scheduled run.

## Manual deployment

Update WebApp.html, RunOptions.html (new), PlantCalendar.html, ClientCore.html, ClientCases.html, ClientSimulation.html, ClientPlayback.html, BasicMode.html, Charts.html, Results.html, UiStandards.html, CaseService.gs, SimulationEngine.html and ScenarioEngine.gs. Both generated engine files must be updated together. No additional external service is introduced.
