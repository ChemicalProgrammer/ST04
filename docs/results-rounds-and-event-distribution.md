# Results rounds and equipment pause distribution

Results defaults to **Average of all rounds**. The view selector also offers the representative round and each individual round. Production, throughput, OEE and equipment state totals use arithmetic means across complete replications of the same duration. Percentages retain their individual run definitions; observed equipment states overlap and are not additive global losses. Production and efficiency cards show minimum and maximum values.

Packing-format rows include zero output when a format is absent from a round. Complete cases and partial equivalents are averaged separately; an average number of complete cases can therefore be fractional. The total bottle equivalents across formats reconciles to average global production. Older saved results without per-round format totals require a new run; no average is inferred from their first round.

The representative round minimizes absolute distance from mean production. Ties use distance from mean OEE, then the earliest round number. It is an actual execution, not a synthetic average. Playback initially selects it when its replay is available. Playback and individual event histories remain actual round data. For ordinary batches whose later rounds kept only summaries, the selected representative round is rerun with the same seed to recover its playback. Fully summary-only diagnostic batches do not generate replay.

## Event time entry

Each equipment event has its own Start value and Unit selector: seconds, minutes or hours. Date entry is available only when Duration method is **Date and time range**. It uses the simulation start and its configured timezone, including daylight-saving offsets, rather than a separate event origin. Changing units preserves the virtual-second offset and does not affect other cards. When leaving date-range mode, date events display elapsed seconds; the stored offset is retained. Planned line stops use minutes. Per-event units and group identifiers are saved with the simulation. Event removal uses the shared trash icon button.

## Distribute pauses

1. Set the simulation duration and open **Distribute pauses** under Equipment control events.
2. Enter a group name, total pause minutes, number of pauses, window start / end in minutes, and random seed.
3. Select affected equipment. The total is shared across the selected targets; each pause targets one selected item.
4. Preview the equipment, start times and durations. Editing any input invalidates the preview.
5. Generate the paired Pause / Run commands. Events are enabled automatically.

The seed reproduces the distribution for identical settings, target order, and existing reservations. The generator uses randomized time slots with equal pause lengths to 0.25-second resolution; final durations absorb tick rounding while preserving the exact total. It limits generation to 200 pauses. Generated pauses do not overlap one another; existing line stops, equipment stops and command transition times are reserved conservatively across all targets. Insufficient free time produces an error without changing the simulation.

Each generated group has a persistent identifier and name. Select a group beside Event time and choose its delete icon to remove all its commands after confirmation. Individual commands remain editable and can also be selected using the existing selection controls.

**Scheduled pause time is not guaranteed lost line-production time.** Buffers, simultaneous reliability failures, startup, and the affected equipment influence the output impact. Do not re-enter a cause already included in MTBF / MTTR. Rate loss is equivalent lost production and should not automatically become an equally long equipment pause. These pauses are equipment commands, not calendar exclusions; they do not reduce the OEE reference period.

## Verification

Targeted checks cover numerical averages, missing formats, deterministic selection, representative replay recovery, exact scheduled pause time, overlap prevention, date conversion, Basic / Advance controls, save / reopen, group deletion and streaming controls. All 57 numerical / import checks and seven selected interface tests passed.

A broader interface selection also encountered three existing failures. They were reproduced against the unchanged parent commit: the old round-one save wait, the assertion that compacted replay contains zero events, and the live-control background save wait. These tests are not evidence of a new regression; the complete historical suite is not claimed to pass.
