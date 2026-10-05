# Interactive scenario evaluation

The methodology and supported-variable matrix are documented in
[28_WHAT_IF_METHODOLOGY.md](28_WHAT_IF_METHODOLOGY.md).

Each change has a checkbox and optional physical limit. Increasing targets use a
maximum; decreasing targets use a minimum. Lengths are displayed in metres and
manual conveyor speeds in m/min. A 20 m target capped at 15 m is simulated and
cloned as 15000 mm. Limits cannot reverse a proposal beyond its baseline.

Line-wide workspaces are separated by CAPEX category. An explicit checkbox can
include lower-CAPEX options in Medium/High searches; higher-tier targets take
precedence for conflicting fields. Individual hypotheses are
available in a collapsed section. Search evaluates the joint proposal, equipment
blocks and up to three coordinate passes over original/intermediate/target values.
It is not exhaustive and does not guarantee a global optimum. External reliability
interventions retain their supported target rather than inventing intermediate
maintenance performance. The baseline is always the no-change alternative.

Baseline and candidate use matching seeds, duration, rounds and commands. Only a
throughput gain above max(0.001 units/min, 0.1% of baseline), without OEE regression,
qualifies. The winner must reproduce this gain in an independent seed block.
Static engineering regressions are displayed rather than throwing
SCENARIO_AUDIT_REGRESSION before simulation; they still prevent the card from
creating a recommended scenario. Physically invalid geometry remains rejected.
This is a screening rule, not a statistical confidence guarantee or plant proof.

Each edit cancels the previous preview and debounces recalculation. Cancellation
leaves no final estimate. The baseline is not mutated. Edited/local search
proposals use REVIEWED origin. Ownership, revision, signature, original values and
physical inputs are rechecked on the server. Browser preview approval is not a
server-side simulation certificate. Saved clones must be run to retain results.

External reliability targets require external:true and an intervention/evidence
justification of at least ten characters. Increase MTBF or reduce MTTR. The
intervention's CAPEX category must be reviewed; cost is not inferred by the model.

Basic Results retains OEE, throughput, production and main loss information;
round tables and technical plots remain in Advance and exports.

## Exported evaluation evidence

What-If JSON, HTML and PDF exports now include the case's saved calculated
evaluations for the exact source-input signature. They include line-wide searches
and individual proposals, selected changes, physical limits, actual evaluated
targets, baseline/candidate OEE and throughput, differences, run configuration,
trial counts, independent seeds and their results, timestamps and engineering
warnings. States distinguish no improvement, reproduced improvement, failed
independent validation, engineering review, running, cancelled and errors.

Exports read the evaluation registry when clicked, so bindings created before a
calculation still include its completed evidence. Changing selections invalidates
old approval; changing source inputs excludes mismatched evaluations. An independent
seed comparison is simulation evidence, never plant validation. The saved baseline
result remains separate from the matched baseline used by the scenario preview.

Evidence and card controls belong to each simulation and follow the case saving
policy. Advance can save them automatically at its configured interval; Basic
and manual Advance require the Save icon. Wait for the saved indicator before
closing the page. Reopening restores
matching evaluations, limits, DOE factors and external intervention options.
Interrupted searches retain their latest checkpoint but require a new run; they
do not resume automatically. Changed inputs keep the historical data in the case
but cannot restore a current approval or appear as current exported evidence.
New simulation and scenario clones start without inherited card evaluations. JSON keeps full numeric precision; HTML/PDF use formatted
values. PDF uses the same report HTML. Uncalculated proposals remain hypotheses.

The optional browser-local DOE pilot adds up to four selected factors and a
complete two-level factorial to category searches. See
[29_SCENARIO_DOE.md](29_SCENARIO_DOE.md) for activation, replication, constraints,
descriptive effects and export semantics.
