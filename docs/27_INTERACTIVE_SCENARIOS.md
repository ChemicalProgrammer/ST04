# Interactive scenario evaluation

Both modes expose every supported local candidate, plus a combined editor. Each
change has a checkbox and an optional physical limit. Increasing targets use a
maximum; decreasing targets use a minimum. Conveyor lengths are shown in metres
and converted to the stored millimetres. A 20 m target with a 15 m maximum is
simulated and cloned as 15000 mm. Limits cannot reverse the proposed direction
past the baseline. Invalid geometry or sensor combinations produce no estimate.

Each edit cancels its prior preview and recalculates after a short debounce.
Baseline and candidate use the same saved duration, seeds, commands and rounds.
Before a configured run, the preview explicitly shows its defaults (300 seconds,
seed 1, one round). Batch metrics use the mean OEE and throughput, not just the
representative replay. Changing input selections requires a fresh evaluation
before creating a scenario. Evaluation never mutates the baseline.

Evaluate all combinations enumerates every nonempty subset of the selected
candidate changes and user-entered external interventions, after applying limits.
It is exhaustive over those discrete targets, not over every real-valued length
or conceivable engineering intervention. Duplicate/conflicting fields and invalid
physical combinations are rejected and counted. The baseline is included as the
no-change alternative. Ranking maximizes throughput, with OEE breaking ties.
Progress includes the total and invalid count. Cancellation leaves no final claim
of optimality. The number of subsets is exponential; no silent truncation or
shorter surrogate simulation is used. Current validators allow at most 64 edits
per scenario; larger subsets are invalid under that contract.

External reliability interventions require a target and a justification of at
least ten characters. Increase MTBF or reduce MTTR; reducing MTBF is a regression.
The intervention may represent equipment replacement, maintenance changes or
repair resources. Its target remains an engineering hypothesis requiring evidence,
not a validated plant gain. Gemini may use these inputs only with supported context;
it must request missing evidence rather than invent improvement percentages.

Edited local proposals use REVIEWED origin. The server checks ownership, revision,
source signature, field bounds, original values and physical audits before cloning.
External justification is preserved with the scenario. Preview results stay local;
the clone must be run to save a result. Limits are applied to the cloned target
values and do not silently become global constraints on unrelated scenarios.

Basic cards hide detailed evidence and Results shows OEE, throughput, production
and the main loss insight. Round tables, equipment comparison tables and detailed
plots remain available in Advance. Existing exports continue to contain full data.
