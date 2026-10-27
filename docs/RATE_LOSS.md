# Rate Loss: gross shortfall, recovery and net balance

The plant Rate Loss field remains an observation-only input. It never imposes stops or a production penalty. No new capture fields are added.

## Consistent accounting at final output

For each tick with positive final output, use the saved nominal reference of the active format, in the same units as the output:

- Equivalent productive time = output / reference rate.
- Gross shortfall = max(0, tick duration - equivalent productive time).
- Above-reference recovery = max(0, equivalent productive time - tick duration).

Sum each independently across the run. Their exact unrounded identity is:

Runtime - effective runtime = gross shortfall - recovery.

`lineRateLossSeconds` now records gross shortfall. `lineRateRecoverySeconds` records recovery. `lineNetRateBalanceSeconds` preserves the signed net balance. Negative net balance is retained, not clipped or called an invalid reference merely because final equipment can drain a buffer above the pacemaker rate. Status is `ABOVE_REFERENCE_OUTPUT` if such flow occurred; `INCONSISTENT_REFERENCE` is reserved for missing/invalid reference information.

The decomposition is at simulation tick resolution. It is not a causal estimate of ramp losses or a guarantee of matching a plant PLC runtime definition. Full no-flow stops remain separate. Faster final equipment, buffer discharge, reference choice and within-tick averaging affect the metric. Gross shortfall is not automatically the AEM plant net Rate Loss.

## Comparison

Real Data preserves the 15 capture fields. It displays simulated gross shortfall. If above-reference recovery occurs, it explains the equivalent recovery and withholds only the Rate Loss delta until the plant gross/net definition is confirmed. Other comparisons continue under their existing rules. No unsupported difference is fabricated.

Results and printable reports show gross loss, recovery and signed net balance, with the identity above. Each replication saves all counters; averages require all measured round values and never turn missing counters into zero. Re-run older results and What-If evaluations. Saved observations are preserved.

## Interpretation supplied to Gemini

`totalFailureSeconds` is the sum of equipment failures, not exclusive line downtime: intervals overlap and buffers can isolate their effects. Repair recoveries with `repairRampEnabled=false` are expected immediate restarts. Conveyor sensor ramp parameters can act on neighboring machines. Missing conveyor MTBF/MTTR means no modeled own random failures, not physical immunity from stops.

The supplied user JSON was not available for reproduction. Regression checks use deterministic synthetic cases, including buffered bursts. The full Node/UI suite must be run in a usable execution environment.
