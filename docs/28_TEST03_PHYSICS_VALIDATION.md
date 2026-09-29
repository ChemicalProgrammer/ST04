# Conveyor physics and Test 03 validation (engine 0.12.0)

## Result

The supplied eight-hour Test 03 reference now produces **47,853.686508 units**, compared with **47,852 discrete units** in the supplied FlexSim screenshot: +1.686508 units, approximately **+0.003524%**. This comparison uses the existing screenshot, not a new FlexSim run. The engine remains a fractional flow model; close throughput does not certify all state transitions or stochastic behavior.

## Physical rules

- Automatic belt speed uses upstream discharge velocity × (1 + speed factor). Manual mode uses `processData.accumulation.conveyorSpeedMmPerSecond`. The legacy nominal conveyor BPM value is not a second transfer limit.
- Free-flow transfer capacity is physical belt speed / moving pitch. Moving pitch is package length + `movingGapMm`, or the engineering spacing when that gap is absent.
- Accumulated pitch is package length + `accumulatedGapMm` (default 0 mm), with `accumulatedPitchMm` supported for JSON input. Packed capacity is floor(length / accumulated pitch). Accumulated pitch cannot exceed moving pitch.
- Admission checks both packed capacity and occupied length: queued units × accumulated pitch + moving units × moving pitch.
- A queue grows from the discharge end. Incoming flow reaches its tail and joins the compressed pool. The downstream discharge available in the current tick is subtracted before locating stationary backlog, preventing normal moving flow from falsely creating a queue.
- Queue discharge is capped by belt speed / accumulated pitch; a stopped belt freezes travel and prevents queued material delivery. Restart drains the queue subject to downstream speed and space.
- Transit packets represent uniform fractional flow over their entry tick. A packet crossing the exit partway through a tick is split; rounding entire packets to the next tick no longer creates an artificial throughput bottleneck.

Line Setup provides automatic/manual belt speed, manual mm/s, moving gap and accumulated gap controls. Values persist through autosave, reopening, cloning and JSON export. The preview shows active physical speed, transfer BPM, packed capacity and free travel. Worksheet audit values remain identified as automatic design assumptions.

## Reference configuration

Run `node scripts/validate-test03.mjs`. The reference inputs are transcribed from the supplied `line-configuration.json` without fitting parameters to the external output: three machines at 120 / 100 / 120 units/min; two 10 m conveyors; package length 100 mm; discharge pitch 120 mm; speed factor 5%; prime reserve 1 m; 28,800 seconds; 0.25-second ticks; seed 20260909; no commands or reliability noise.

| Metric | Uploaded engine 0.11.0 | Engine 0.12.0 | FlexSim screenshot |
| --- | ---: | ---: | ---: |
| Final production | 47502.75 | 47853.686508 | 47852 |
| Conveyor 1 final inventory | 79 | 99.826944 | 100 |
| Conveyor 2 final inventory | 79 | 79.365079 | 80 |
| Machine 1 productive capacity (%) | — | 83.398082 | 83.39 Processing |
| Machine 2 productive capacity (%) | — | 99.861392 | 99.86 Processing |
| Machine 3 productive capacity (%) | — | 83.079317 | 83.08 Processing |

Productive capacity is output / (nominal rate × full duration). It is an equivalent processing-utilization measure for the deterministic reference, **not** an elapsed discrete processor state. For example, a fractional model can report RUNNING throughout a tick while processing below nominal capacity; FlexSim can alternate full-rate processing and blocking within that interval. `stateSeconds` separately reports exhaustive elapsed fluid-model state durations.

`starvedSeconds` and `blockedSeconds` count zero-flow ticks. Partial positive-flow input/output losses use `partialStarvationLossSeconds` and `partialBlockingLossSeconds`; they are equivalent lost capacity, not additional stopped time. Results displays these separately. Backup stop seconds count zero-flow controlled stops, avoiding overlap with running time.

`summary.materialBalance` includes source input, outlet output, all inventory (including internal handoffs), overflow and residual. Test 03 residual is 0 within reporting precision. Its final source input is 48037.295197, outlet 47853.686508 and total inventory 183.60869; inventories are rounded independently.

## Verification and limits

Regression coverage includes physical speed limits, manual overrides, invalid spacing, compressed queue buildup/release, stopped-belt discharge, conservation, state duration accounting, tick sensitivity and the eight-hour external-reference comparison. The UI test edits controls, autosaves them, reopens the case and runs the saved geometry through the engine. Apps Script browser and manual bundles are rebuilt from source.

Reference regression tolerances are explicitly fractional-vs-discrete: <2 output units, <1 unit per conveyor inventory, and <0.02 percentage points for productive capacity. These are not acceptance limits for all cases. FlexSim's maximum inventory includes 101 units in conveyor 1, while this model enforces the configured packed capacity of 100; external entrance/exit item conventions still differ.

Next validation work is a separate benchmark set covering multiple machine-cycle/transport speeds, controlled stops, accumulation gaps and seeded reliability scenarios. Compare exhaustive state definitions before asserting state-time equivalence. Existing saved results retain their old engine version and must be rerun to use the new rules.
