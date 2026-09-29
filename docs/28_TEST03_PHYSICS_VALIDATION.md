# Test 03 physics validation — draft

The engine derives conveyor transfer from belt speed / moving product pitch, including the discharge limit. `processData.accumulation.speedMode: MANUAL` selects `conveyorSpeedMmPerSecond` over the engineering calculation; existing configurations retain automatic engineering speed. This is currently an engine input, not a new UI control.

`accumulatedPitchMm` distinguishes queued occupancy and photoeye thresholds from moving pitch. If absent, moving pitch is retained for compatibility. Queue storage still uses fluid packets and fixed travel delay: collision with the queue tail and release spacing require further implementation and validation before merge.

STARVED and BLOCKED seconds now count zero-flow ticks. Partial losses are separate equivalent-capacity seconds, exposed in samples, equipment metrics and summary. They are not elapsed state times or line downtime.

## Reference run

Run `node scripts/validate-test03.mjs`. Parameters transcribed from the supplied line-configuration.json: three machines at 120 / 100 / 120 units/min, two 10 m conveyors, 100 mm product length, 120 mm discharge pitch, 5% speed factor, 1 m prime reserve, 28,800 s duration, 0.25 s ticks, seed 20260909. No configuration tuning or noise was introduced.

| Metric | Uploaded engine 0.11.0 | Draft engine 0.11.1 |
| --- | ---: | ---: |
| Final production | 47502.75 | 47502.75 |
| Final conveyor inventories | 79 / 79 | 79 / 79 |
| Sum of blocked seconds | 15102.55 (includes partial losses) | 597.75 (zero-flow states) |
| Sum of starved seconds | 5017.75 (includes partial losses) | 199.5 (zero-flow states) |
| Partial blocking loss seconds | mixed into states | 9754.5 |
| Partial starvation loss seconds | mixed into states | 4810.375 |

The old and new blocked totals are not comparable: the second conveyor now uses its physical transfer rate instead of the legacy nominal rate for loss accounting. Production is unchanged; the FlexSim validation remains open. No new FlexSim run was executed.

## Checks

Six targeted test files pass, including three new regression cases for partial loss accounting and physical transfer rate. Apps Script bundles regenerated. Full suite: 20 files pass, four cannot load because jsdom is unavailable in this environment.

Before merge: add UI inputs; complete queue formation/release; validate accumulated-pitch scenarios, stopped belt discharge and material conservation; rerun Test 03 and compare production, inventory, and state durations per machine against FlexSim. Do not treat the earlier 0.73% production difference as acceptance.
