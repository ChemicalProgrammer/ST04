# MTBF operating-time clock

The ST engine now interprets the configured MTBF as operating time between failures. The clock consumes a full physics tick only when that equipment actually processes positive flow. It does not advance simply because the equipment is enabled in AUTO or MANUAL.

| Situation | Consumes MTBF exposure? |
|---|---|
| Productive operation, including partial flow | Yes: one full productive tick |
| Productive startup ramp or residual discharge | Yes: one full productive tick |
| Initial delay or a zero-output ramp tick | No |
| Waiting for Prime or total starvation | No |
| Total blocking or completed Back-up stop | No |
| Pause, STOP, calendar stop, repair or emergency | No |

The existing physical model determines whether flow is positive. This operating-time convention does not claim to model a motor spinning empty, calendar wear, standby failure or separate wear mechanisms.

## Failure and repair timing

A sampled exponential operating-time interval is retained across idle periods. Actual productive ticks consume it. If a tick exhausts the interval, the failure is applied at a following tick boundary when the equipment is in an operational mode. Exposure can exceed the sampled interval by less than or equal to one tick; the model does not split a productive tick to place an intra-tick failure. Very short MTBF inputs need a suitably short tick.

Repair duration remains the configured fixed MTTR under the existing repair/stop rules. The change does not add another initial delay or enable repair ramps. Repair ramps remain explicitly opt-in per equipment. Initial, manual-command and sensor restart rules remain as configured. The separate random microstop occurrence model is unchanged.

## Recorded evidence

- Result summary and equipment metrics: `reliabilityClockBasis = POSITIVE_PROCESSED_FLOW_TICKS`.
- Equipment metrics: `reliabilityExposureSeconds`, including per-round persistence and batch means. This time is recorded even if stochastic failures are disabled or no reliability profile is configured; in those cases it is an exposure diagnostic only and does not create failures.
- Exposure uses elapsed productive ticks, not output divided by nominal speed. In this continuous-flow engine it matches the existing `runningSeconds` counter.
- For a reporting period, observed MTBF can be computed as exposure / failure count, using minutes consistently. A zero failure count leaves the estimate undefined. For pooled rounds use total exposure / total failures; do not infer causality from failure counts or sum overlapping equipment downtime as line downtime.

The finite reporting horizon, censoring and random sample mean mean that observed MTBF is not guaranteed to equal the configured distribution mean in one round. Higher production can increase productive exposure; gains are not guaranteed by changing the clock.

## Compatibility and validation

The engine/cache version changed. Old results and saved What-If evaluations retain their historical interpretation and must be rerun; no MTBF/MTTR inputs are altered or fitted to plant observations. Experimental DES behavior is unchanged.

Regression coverage includes one hour with no supply/Prime authorization, delayed startup, manual pauses, scheduled stops, partial flow, productive ramps, Back-up response/residual discharge, fixed MTTR, repair-ramp opt-in, reproducible seeds, async/summary calculations and replication persistence. A local 24-hour case was rerun at its original seed; material and Rate Loss balances close. This does not validate a plant forecasting model or establish the new mean of all saved rounds.
