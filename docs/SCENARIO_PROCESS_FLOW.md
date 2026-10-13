# Scenario process: current flow and review points

CAPEX category, optional lower categories, search depth and DOE are independent choices. Medium may include Zero; High may include Zero and Medium independently. The default is unchecked. Proposals are evaluated together against the original source, not added as percentages or efficiencies from separate category cards. A repeated equipment/parameter uses the current category target, then the highest included lower category; search never writes two conflicting targets to one parameter.

## Intervention definitions shared by code and Gemini

| Category / cost | Intervention | Reliability evidence |
|---|---|---|
| Zero CAPEX / existing resources | Operating settings and work practices within installed capacity | OPERATIONAL: explicit MTBF/MTTR targets supported by history or trials. |
| Zero capital / additional OPEX | Additional maintenance, repair staffing or spares | MAINTENANCE: disclose recurring cost; do not call it free or Medium CAPEX. |
| Medium CAPEX | Local retrofit, component rehabilitation or monitoring investment | RETROFIT: installation scope, documented target and source. |
| High CAPEX | Complete equipment replacement or major line/transport redesign | REPLACEMENT: supplier or measured MTBF/MTTR targets; speed may remain unchanged. |

Intervention scope defines category; OEE gain does not. Increase MTBF, reduce MTTR. A high-investment project can have limited dynamic benefit. No monetary category thresholds, costs or ROI are invented. Capacity changes above installed maxima, reference-machine capacity changes and parallel branches remain outside the current scenario contract.

| Step | Action | Inputs and method | Objective | Later use | Output |
|---|---|---|---|---|---|
| 1. Source capture | Gather | Freeze selected equipment, run, engine, saved result provenance and declared interventions. | Reproducible reference. | All candidate construction and cache checks. | Source signature and input snapshot. |
| 2. Diagnosis | Calculate | Accept complete compatible results; use replication mean failure, microstop, starvation and blocking durations. Identify possible upstream/downstream interactions with reference starvation/blocking. | Prioritize investigation without equating idle time with causality. | Proposal ranking. | Loss diagnosis and bounded priority bonuses. |
| 3. Reliability sensitivity (optional) | Simulate / compare | For up to twelve machines prioritized by compatible observed own stops, test MTBF ×2, MTTR ×0.5, both per machine and jointly across screened machines. Use 30 minutes × three matched seeds, exact cache reuse and independent confirmation at the configured horizon for the leading isolated sensitivity and positive joint sensitivity. Preserve baseline speeds and geometry. | Identify reliability leverage without inventing achievable targets. | Investigation and intervention selection; provisional screen may miss long-horizon priorities. | Per-machine throughput/OEE contrasts, coverage, joint sensitivity and independent checks; analysisOnly evidence. |
| 4. Define intervention | Gather / validate | Collect equipment, OPERATIONAL / MAINTENANCE / RETROFIT / REPLACEMENT, numeric target and a justification identifying intervention and source (history, trials or supplier). No sensitivity level is copied automatically. | Separate physical hypotheses from a feasible investment or OPEX plan. | Planner, category validation, DOE and saved scenario traceability. | Documented intervention targets and cost class. |
| 5. Engineering planner | Calculate | Use conveyor geometry, sensor timing, recovery, installed speeds and availability assumptions. Preserve explicit user reliability targets. | Feasible numeric hypotheses. | Category composition and target ranges. | Candidate changes, priorities and physical warnings. |
| 6. Compose categories | Gather / resolve | Read inclusion checkboxes; deduplicate equipment/path with own-category precedence. Allow a Medium/High configuration to add lower categories even when it has no native targets. | Explicit search scope. | Parameter selection, DOE and reproducibility. | Included categories and available targets. |
| 7. Configure variables | Gather | User selects variables, targets, feasible limits and optional DOE factors/levels. Changing categories hides and excludes their inputs and clears excluded DOE factors. | Defined admissible design space. | Search and factorial design. | Selected ranges and up to three/four DOE factors. |
| 8. Optional sensitivity screening | Simulate | Five minutes × three paired seeds for at most twelve feasible targets. Preserve manual selection when no isolated gain is found. | Measured initial DOE suggestions. | Factor selection. | Provisional effects; interactions remain a limitation. |
| 9. Baseline | Reuse or simulate | Exact engine/input/run key and complete finite round metrics are required to reuse. Otherwise simulate matching seeds, horizons and rounds. | Fair reference for the phase. | Candidate gains. | Baseline mean and round metrics plus cache origin. |
| 10. Explore | Simulate / compare | Joint targets, per-equipment blocks, bounded coordinate alternatives and refinement. Use candidate budgets; no default wall-clock cutoff or warm start. | Best tested candidate within the defined range. | DOE context and finalists. | Trials, infeasibility, coverage and stopping reason. |
| 11. DOE | Simulate / analyze | Fix nonfactor winner changes; evaluate all two-level factorial combinations. Effects and High ANOVA require a complete feasible design. | Inspect interactions and add better treatments. | Interpretation and finalist pool. | Factor effects, completeness and optional seed-block ANOVA. |
| 12. Rank finalists | Simulate / compare | Matched 30-minute batches and another seed block. Prefer no worsened engineering checks; maximize throughput without OEE regression. | Reduce short-horizon selection errors. | Winner for independent confirmation. | Finalist metrics and chosen changes. |
| 13. Confirm | Simulate / compare | Different seeds, at least 30 minutes or longer configured horizon; three rounds, up to six for uncertain High results. | Check reproduction rather than select another winner. | Reproduced / validation-needed status. | Independent gain and warnings. |
| 14. Create | Gather approval / save | User reviews actual changes and warnings; clone source, keep provenance and scope. | A traceable hypothesis for further testing. | New simulation and comparison. | Scenario and evaluation evidence. |

## Evidence recorded for process review

Evaluations retain category inclusions and the exact requested targets, run signatures and seeds. `phaseAudit` records baseline source, exploration counts/coverage, DOE completeness, finalist count/run and independent confirmation. These records explain what actually ran; the screen percentage reaching 100% does not certify global optimality.

## Demo B experiments

Demo B remains only a repository fixture imported from the photographs. Run `node scripts/test-demo-b.mjs --composition` for an isolated High search followed by High including Zero/Medium with a two-factor DOE. The controlled budget is twelve candidates. Results are written to `docs/demo-b-composition-results.json`; they are engine calculations rather than preset efficiency targets.

Limitations and next review points: a five/15-minute horizon can favor a different candidate from an eight-hour evaluation, especially with large buffers; isolated screening can miss coupled effects; the candidate budget grows with variables and cannot guarantee a global optimum. Use the phase evidence to decide whether additional finalists, longer exploration or interaction-preserving proposals are warranted, instead of changing outputs to reach an expected OEE.

### Controlled composition result

With Demo B, seed 20261013, a twelve-candidate exploration budget and eight-hour independent confirmation, isolated High and High including Zero/Medium plus a complete two-factor/four-combination DOE both retained 46.733566% OEE, against 39.707188% baseline. The combined search evaluated fifteen unique candidates including DOE and twenty-four batches overall. Medium has no native planner targets in this fixture without a declared user intervention; marking its inclusion therefore adds none. The strongest retained change was a High accumulation-length intervention. Additional category scope did not improve this controlled result, so no efficiency gain is inferred merely from enabling the checkboxes.

## Reliability implementation and limits

`SCENARIO_DEFINITIONS` and `SCENARIO_INTERVENTIONS` are exported to browser and server; Gemini receives them even with user prompt overrides. Category validation rejects mismatched reliability intervention types and sensitivity-only proposals. Reliability metadata survives DOE design points, combined-category origin and server normalization. Old reliability targets lacking a type or nonempty justification must be reviewed and re-entered; their values are not silently attributed to a retrofit or replacement.

Gemini context now carries complete result provenance and replication equipment statistics into the planner. Compatible loss diagnosis uses replication means; stale/incomplete results cannot drive priorities. Observed failures and propagated starvation/blocking suggest investigation but do not prove causal lost production. Reliability availability is an equipment diagnostic, not a line OEE prediction.

Run `node scripts/test-demo-b.mjs --reliability` to generate `docs/demo-b-reliability-results.json`. The report separately evaluates per-machine sensitivity and all-machine joint sensitivity and independently checks eight-hour production using a new seed block. These exploratory levels are not supplier specifications, feasible replacement targets or guaranteed plant results. A 30-minute screen can still differ from a full shift, especially with long conveyors and slow initial filling. Threads and worker allocation are unchanged in this implementation.

### Demo B reliability sensitivity result

With thirty-minute screening and independent eight-hour / three-round checks, halving Sleever MTTR changed OEE from 39.707188% to 42.411992% (+2.704804 pp), and throughput from 76.634873 to 81.855144 units/min. Jointly doubling MTBF and halving MTTR for all seven machines yielded 71.696241% OEE (+31.989053 pp) and 138.373745 units/min in the independent check. This joint result demonstrates modeled reliability leverage, not the result of a defined replacement project. Feasible intervention targets and costs must be collected before optimization or investment selection. Thirty-minute screening baseline was 30.181858%: startup/horizon effects remain visible, so comparisons must use the matching baseline for each phase.
