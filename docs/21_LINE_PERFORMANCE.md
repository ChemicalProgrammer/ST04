# Line speed profile and throughput

The V-Graph now shows two distinct design curves in units per minute:

- **Normal line target**: `min(machine configured BPM, selected pacemaker BPM)`.
- **Recommended overspeed (estimate)**: `normal target + recovery units × 60 / recovery seconds`.

The pacemaker is a **role selected on a machine**, not a machine type. Its
overspeed target equals its normal target. Other targets are derived from the
nearest conveyor toward the pacemaker. Recoverable units are the lesser of
`normal target × MTTR minutes` and the useful installed accumulation in units.
Engineering conveyors use their calculated useful accumulation length; direct
geometry uses its usable length. Unit capacity uses accumulated product pitch,
not moving spacing. Missing geometry or enabled reliability produces no estimate.
Without an accumulating conveyor, no recovery headroom is assigned.

`processData.equipment.recoveryTimeSeconds` specifies the planning interval.
Leaving it blank uses `MTBF minutes × 60` as an explicit planning assumption:
recover the assumed mean-stop disturbance within one mean operating interval.
This interval is not a measured recovery time or a guarantee against another
stop. A shorter selected interval increases the estimated target. Capping the
recoverable units at installed accumulation does **not** mean the buffer covers
the whole MTTR; the analysis records `bufferCoversMeanStop` separately.

The installed maximum remains in the Advance table. Estimates above it are
flagged with a dagger; they are not clipped to capacity or certified feasible.
The chart does not force a symmetric V. It can be asymmetric, have gaps where
data is missing, or overlap where no recovery headroom is required.

The estimate assumes a mean-stop inventory disturbance and the useful buffer's
full available swing. Actual desired/observed inventories, interacting stops,
ramping, upstream refill/downstream drain coordination and machine control
still require dynamic validation. **The engine continues to process at the
configured nominal rate; it does not implement this recovery controller.**
An imported maximum that also initializes the nominal rate no longer serves
as the plotted overspeed recommendation.

The line throughput KPI counts **only units exiting the final equipment**:
`outputCount / durationSeconds × 60`. This measures the complete simulated
run, including failures, starving, blocking and start-up. The selected
`unitOfFlow` is the unit of every stage; imported bottles-per-case is metadata,
not a bottle-to-case conversion. Never compare rates based on different flow
units without a conversion.

The machine table displays observed `equipment.outputCount / duration × 60`
and also separates it algebraically into intrinsic availability
`(duration − stoppedSeconds) / duration` and operating efficiency
`equipment.outputCount / (nominalRatePerSecond × availableSeconds)`.
Operating efficiency includes lost output due to starving, blocking, ramping
and other line interactions. This definition differs from the engine's
existing equipment `performance` metric, which divides by `runningSeconds`;
the two must not be silently substituted. The line outlet rate can differ
from individual machine rates during a finite run as material remains in the
buffers.

## Engineering evidence still missing

The supplied design reference describes backup reserve as the discharged and
in-transit containers divided by **free accumulation fraction** (`1 − P`) in
the accumulating zone. Existing `ConveyorEngineering` calculates its overflow
from effective product pitch (`D / P`) and already includes discharge runout,
reject/coding length, delay and containers discharged at stop. The two
formulations do not yet have proven equivalent definitions of `P`: the reference
distinguishes the discharge, coding and accumulating sections. The Basic
worksheet now reports each design population from the packed output rate and
the compounded zone speeds. The runtime still represents one physical transport
zone at the accumulating belt speed; it does not simulate three separate belts. A geometry-audit PASS is therefore not proof that the separate reference
calculation was verified. Reconcile section-specific speeds/populations and
sensor positions with the full design worksheet before replacing the existing
physical zone model or certifying backup-sensor protection.
