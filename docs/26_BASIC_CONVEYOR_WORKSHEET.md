# Basic conveyor worksheet

The selected conveyor uses the same Input/Results tabs for every connection.
The reference photograph's Blowmolder → Pucker connection is a silo, which
explains its different fields. ST keeps its configured physical conveyor model;
it does not infer a silo from a machine name.

Machine cards expose Speed (BPM), MTBF and MTTR (minutes). These are persisted
engine inputs. Basic enables failures. Buffer post is the following conveyor's
packed physical capacity divided by the next machine's BPM. Avail (%) is
100 × MTBF / (MTBF + MTTR). Both values are calculated outputs. Simulation is
started from the Simulation section.

## Input mapping

| Group | Controls | Stored fields |
| --- | --- | --- |
| UPSTREAM | Package length; discharge pitch; startup time; bottles at stop | `processData.upstream.packageLengthMm`, `dischargePitchMm`, `startupTimeSeconds`; `processData.accumulation.bottlesDischargedAtStop` |
| DOWNSTREAM | Infeed pitch; ramp-up time | `processData.downstream.infeedPitchMm`, `rampUpTimeSeconds`; ramp is also synchronized to `processData.accumulation.downstreamRampUpSeconds` |
| GEOMETRY | Lact; Lp; discharge actual; coding actual | `processData.geometry.lactMm`, `lpPrimeMm`, `actualDischargeMm`, `actualCodingMm`; actual lengths are synchronized to the engine's discharge/coding runout fields |
| Speed & Sensors | Discharge, coding and accumulation factors; block/clear delays; insurance; overspeed | Existing `processData.speedAndSensors` factors and `processData.accumulation` sensor fields |

Basic derives automatic belt speed, moving pitch and the Back-up position.
The hidden manual speed, moving-gap and installed Back-up overrides are removed
from the Basic draft on save/run. Advance retains its explicit controls. The
Basic design calculations use the BPM shown in the machine cards.

Rates inside the engine are mm/s. Worksheet rates are converted to m/min by
multiplying by 0.06. Package velocity uses upstream BPM × discharge pitch / 60;
B2B output uses upstream BPM × package length / 60. The displayed downstream
consumption uses downstream BPM × infeed pitch / 60. Packed-material demand in
the accumulation equations uses package length instead of infeed pitch.

Discharge speed is package velocity × (1 + discharge factor/100). Coding speed
adds its factor to discharge speed; accumulation speed adds its factor to coding
speed. Zone population is packed B2B output divided by each zone speed × 100.
The percentage bars are these **design populations**, not live inventory.
The engine uses the accumulating speed for its one physical conveyor zone.

Overflow (F8) is the calculated overflow product reserve. Lbu (D8 + E8 + F8)
adds actual discharge and coding lengths. Lba = Lact − Lbu − Lp. The existing
physical bounds and package-spacing validation still apply.

## Results

Static design outputs include anti-starve/anti-block seconds, Lba, Lrec, required
overflow, minimum length and minimum infeed speed. Lba min rampup is the linear
ramp integral: full packed downstream consumption × ramp seconds / 2. Lmin is
Lbu + Lp + this ramp reserve. Lact vs Lmin is PASS at or above that minimum,
FAIL below it, or NOT EVALUATED for missing inputs. It is a model-specific
length check, not a full design certification. Minimum infeed speed uses the
configured overspeed margin, defaulting to the existing 5% when absent.

The engine records connection blocking and starving equivalent seconds at every
tick, including partial-capacity losses and the initial empty-line period.
Conv Loss (%) is the integrated larger blocking/starving weight per tick divided
by run duration, so concurrent constraints are counted once. YES/NO indicates
whether that connection accumulated a nonzero loss. Lost seconds per hour are
equivalent seconds × 3600 / simulated duration. These are observed results,
independent of the design PASS/FAIL and design population bars.

No current run means measured values are unavailable. Older saved results that
lack the new counters also display unavailable values until rerun. Editing
inputs invalidates the previous result through the existing autosave pipeline.
