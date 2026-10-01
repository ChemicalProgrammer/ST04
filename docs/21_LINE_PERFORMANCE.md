# Line speed profile and throughput

Results now show a **design-speed profile** for non-conveyor machines. Normal
speed comes from `nominalRatePerSecond × 60`; configured maximum speed comes
from `processData.equipment.maximumSpeedBpm`. Both are expressed as a percent
of the selected pacemaker's normal speed. The chart shows the available
over-speed profile, not a certified V-Graph: the engine processes at nominal
speed and does not yet command maximum recovery speed after a microstop.
After a run, the table also shows an availability-only capacity estimate for
non-pacemaker machines:
`max(machine nominal BPM, pacemaker nominal BPM / intrinsic availability)`.
Intrinsic availability is `(duration − stoppedSeconds) / duration` and excludes
starvation and blocking. A target above the configured maximum is flagged as
unavailable; without a maximum its feasibility is unknown. This simple static
capacity target does not account for buffer dynamics or certify that recovery
is achievable. It is not plotted as an overspeed recommendation. The engine
does not use it to change machine speed.
The design handbook describes overspeed as the capability of adjacent machines
to refill an upstream buffer or drain a downstream buffer after a stop. In the
desired state, machines run close to the critical machine's normal rate. The
required recovery rate depends on the inventory deviation, the usable
accumulation, and the intended recovery time. Those inputs and a tested speed
controller are needed before recommending a numeric overspeed. The configured
maximum line shows available machine capability only; a V-shaped profile is
neither guaranteed nor certified by the current analysis.
An imported Sheet sets nominal speed from its maximum-speed column, so a new
import has zero demonstrated recovery reserve until operating speed is set
separately in Line setup. An absent or lower-than-normal maximum is not
interpreted as valid capacity.

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
distinguishes the discharge, coding and accumulating sections, while the
current engine derives one population from the upstream output and conveyor
speed. A geometry-audit PASS is therefore not proof that the separate reference
calculation was verified. Reconcile section-specific speeds/populations and
sensor positions with the full design worksheet before replacing the existing
physical zone model or certifying backup-sensor protection.
