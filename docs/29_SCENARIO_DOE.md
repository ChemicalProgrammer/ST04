# Optional DOE pilot for What-If

## Enable

Use **Include DOE in this search** in a scenario configuration dialog, or
**Include DOE in What-If searches** in the regular What-If DOE section of Settings. It is off by default. Closing Settings saves this preference
in the current browser. It does not change another
user's settings or the Apps Script deployment default.

## Run

1. Enable DOE and open What-If. Existing cards update without reloading.
2. Open **Configure changes & DOE** in the relevant category/card.
3. Select one to four factors and edit their Low/High levels. The first four
   eligible factors are preselected for convenience, **not** ranked as most
   important. To study other equipment, change the selections explicitly.
4. Keep each factor's main change checkbox selected. Enter physical limits where
   needed. DOE levels are intersected with those limits. Low must remain below
   High. Missing numeric baseline values and external reliability interventions
   are excluded from the pilot; ordinary search can still evaluate those changes.
5. Press **Find best scenario**. The search first runs the existing joint,
   equipment-block and coordinate exploration, then adds a complete two-level
   factorial for the chosen factors. With four factors this is 16 design points;
   with two factors, four. More than four factors is rejected explicitly.
6. Other changes are held fixed at the winner of the preceding search. The DOE
   therefore describes effects conditional on this fixed configuration. Its full
   configuration is included in the export. The unchanged source remains the
   baseline for accepting a gain.

Searches with DOE enabled use at least **three rounds** per evaluated configuration,
including baseline and independent confirmation. Higher configured round counts
are preserved. Duration, commands, tick and sample settings are preserved. The
original simulation configuration is not mutated. A created clone retains its
original run settings; use the exported preview settings to reproduce the same
replicated comparison when running it.

Sixteen combinations at three rounds represent 48 simulated runs for the DOE
stage alone, before the preceding search, baseline and independent confirmation.
Previously evaluated identical configurations may be reused. Work runs through
the existing asynchronous simulator, with progress and cancellation. Disabling
DOE restores the original bounded search and configured round count. Calculation
of a manually selected proposal does not launch a DOE automatically.

## Interpretation

The design reports baseline/candidate OEE and throughput, individual design-point
means, main-effect contrasts and two-factor interaction contrasts. For each term,
the contrast is mean response at coded sign +1 minus mean response at sign -1;
interaction sign is the product of the two factor signs. These are descriptive
contrasts, **not p-values, confidence intervals or a test of significance**.

If any design point is physically infeasible, the observed outcomes are exported,
but factorial effects are withheld: deleting failed rows would break the balanced
design and make those simple contrasts misleading. Engineering audit warnings
remain visible. A candidate that worsens a previously passing check cannot be
promoted as an approved recommendation. If its gain passes independent seeds,
the user may acknowledge the listed trade-offs and save a separate scenario for
engineering review. The server persists the recalculated warnings and
`ENGINEERING_REVIEW_REQUIRED` status; acknowledging does not resolve the checks.

The same throughput/OEE acceptance rules remain in force. The selected winner
must also pass the independent seed block. Neither a DOE nor three rounds alone
guarantees adequate sampling, an optimum, or plant performance. The pilot covers
only the chosen factors and levels; interactions with factors held fixed and
curvature between levels are not identified. A category with no eligible selected
factors runs ordinary search and explicitly reports that DOE was skipped.

## Export and retention

JSON/HTML/PDF What-If exports include the design type, factor bounds, fixed changes,
all design-point observations and feasibility, rounds per combination, descriptive
effects, selected winner and independent validation. The case autosave retention rules in `27_INTERACTIVE_SCENARIOS.md` apply: saved
evidence and factor selections are restored after reopening.

Changing DOE settings invalidates prior approval on visible cards. The original
case stays untouched until a reviewed scenario clone is explicitly created.

## Implementation

- `src/analysis/ScenarioDOE.js`: design matrix and complete-design contrasts.
- `apps-script/ScenarioExplorer.html`: factor controls, replicated execution,
  existing search integration, approval and persisted evidence.
- `apps-script/Settings.html` / `WebApp.html`: visible browser-local checkbox.
- `apps-script/Reports.html`: design and effect export.
- `scripts/build-browser-engine.mjs`: bundles the DOE helpers for Apps Script.

This pilot uses the existing simulation engine; Gemini is not asked to fabricate
simulation outcomes or compute effect estimates.

## Search controls and scope

Zero, Medium and High searches now use separate candidate pools. An independent
**All CAPEX** card explores the union; the lower-CAPEX checkbox has been removed.
When tiers propose different targets for the same field, the higher-tier target
is used as the exploration endpoint (the coordinate search also tests the baseline
and midpoint). This is bounded exploration, not exhaustive enumeration of every
target. The combined card retains HIGH as its conservative storage tier and exports
`searchScope: ALL`. Creating it saves only the validated changes.

Individual hypothesis cards are shown only in Advance. Both modes retain the
category searches. **Calculate OEE & throughput** evaluates the current selection;
**Find best scenario** runs a new optimization. Neither modifies the source case.

While evaluating, scenario controls are locked across cards, including the external
intervention form. Only the active card's Cancel can stop that search. Changing the
global DOE preference applies to a subsequent run without cancelling this one.
Progress shows the current stage, completed simulated configurations, an upper
bound including baseline and independent confirmation, rounds per configuration,
and elapsed wall time updated every second. Cached configurations and early
convergence can make the search finish below that bound. It is not a percentage
or a promise of completion time; no wall-time limit is imposed.

## Configuration dialog and review scenarios

The modal organizes adjustable changes and DOE factors in responsive columns.
All eligible candidate variables appear, including those beyond the first four.
The counter shows selected and available counts; **Clear factor selection**
allows choosing another subset. At four selections, deselect a factor to enable
other choices. Unselected Low/High fields are disabled. The experiment still
uses at most four factors. Missing baselines and external reliability hypotheses
remain ineligible. Edits in the dialog invalidate the old evaluation; closing it
keeps the edits, and Calculate/Search explicitly evaluates them.

Automatic search prefers a gain without new engineering warnings. If none was
found but a warning-bearing gain exists, it confirms that candidate independently
and offers review-only creation with explicit acknowledgement. No gain, failed
confirmation, stale inputs and invalid physics do not gain a creation override.
Acknowledgement and warning status are retained in case evaluations and exports; persisted
clones carry the server's own warning list and review-required status.

## Finish a search early

Stop during Find best scenario finishes the current batch, retains its result,
and validates the best candidate already evaluated with independent seeds.
Remaining search and DOE combinations are skipped. If DOE has started but is
incomplete, observations are preserved and effects are not estimated. If DOE
has not started, the saved evidence explains why it was skipped. Stop during
confirmation, or a second click while finishing a batch, cancels the operation
and keeps creation disabled.


## Finding and enabling factor selection

The scenario configuration dialog always shows the eligible-factor table. The
`Include DOE in this search` checkbox enables the existing browser-local DOE
preference; while disabled, the table remains visible with inactive inputs.
The same preference is available in the regular What-If DOE section of Settings,
independently of the hidden interface-mode selector. A maximum of four selected
factors, two levels per factor and at least three rounds per combination still
apply. Changing the global preference during an active evaluation takes effect
on later searches and does not cancel the running calculation.
