# Rate Loss comparison

The plant Rate Loss field in Real Data and the existing Sheets template is an observation only. Importing or editing it does not create stops, change speeds or deduct production. No additional input fields are required.

The ST engine measures these summary fields in seconds for every round:

- `lineRunSeconds`: ticks with positive flow at the final output.
- `lineEffectiveRuntimeSeconds`: sum of final output divided by the nominal line reference rate active during that tick. With format profiles, both output and reference use bottle equivalents.
- `lineRateLossSeconds`: runtime minus equivalent productive time.

The nominal reference follows the existing pacemaker / Filler / fallback selection. It is not automatically the installed maximum. Output divided by a full-period weighted speed is not used for the measured time when formats change.

Full stops contribute to downtime, not Rate Loss. Reduced flow during ramps, stop transitions or other constraints contributes to Rate Loss only as seen at final output during positive-flow ticks. A 2-minute ramp at a 300 bottles/min reference producing 300 bottles rather than 600 represents one minute of equivalent loss. The engine retains its existing tick-based ramp behavior; the example describes equivalent loss rather than promising a particular ramp integration accuracy.

Buffers can absorb equipment ramps. Do not add equipment ramp durations or equipment losses to obtain the line value. The current stop transition models response and residual discharge, not gradual deceleration. Quality remains an assumption of 100%; these are not rejected-bottle counts.

Results and HTML/PDF reports show runtime, effective runtime and Rate Loss, with expandable help in Results and Real Data. Selected rounds show their own values. Average views and comparison use the mean of independently measured round counters. Incomplete or inconsistent measurements stay unavailable rather than becoming zero. A negative equivalent loss indicates an inconsistent reference and is not silently converted into a valid loss.

For comparison, use the same reporting period, product formats, output boundary, reference speeds and definition of runtime. Positive-flow runtime is a model convention and may differ from a plant's PLC runtime signal. Plant Rate Loss remains unchanged; recalculated real AU uses the plant times. The simple comparison uses measured simulation runtime and effective runtime when available. Older single-format results retain an explicitly warned approximation; older multi-format results require a new run for Rate Loss. The experimental DES engine does not acquire this ST-engine measurement.

A model/cache version change ensures new runs calculate the counters. Existing saved observations remain intact.
