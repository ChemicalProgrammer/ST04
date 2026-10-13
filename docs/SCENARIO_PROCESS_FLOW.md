# Scenario process: current flow and review points

CAPEX category, optional lower categories, search depth and DOE are independent choices. Medium may include Zero; High may include Zero and Medium independently. The default is unchecked. Proposals are evaluated together against the original source, not added as percentages or efficiencies from separate category cards. A repeated equipment/parameter uses the current category target, then the highest included lower category; search never writes two conflicting targets to one parameter.

| Step | Action | Inputs and method | Objective | Later use | Output |
|---|---|---|---|---|---|
| 1. Source capture | Gather | Freeze selected equipment, run, engine, saved result provenance and declared interventions. | Reproducible reference. | All candidate construction and cache checks. | Source signature and input snapshot. |
| 2. Diagnosis | Calculate | Accept complete compatible results; use replication mean failure, microstop, starvation and blocking durations. Identify possible upstream/downstream interactions with reference starvation/blocking. | Prioritize investigation without equating idle time with causality. | Proposal ranking. | Loss diagnosis and bounded priority bonuses. |
| 3. Engineering planner | Calculate | Use conveyor geometry, sensor timing, recovery, installed speeds and availability assumptions. Preserve explicit user reliability targets. | Feasible numeric hypotheses. | Category composition and target ranges. | Candidate changes, priorities and physical warnings. |
| 4. Compose categories | Gather / resolve | Read inclusion checkboxes; deduplicate equipment/path with own-category precedence. Allow a Medium/High configuration to add lower categories even when it has no native targets. | Explicit search scope. | Parameter selection, DOE and reproducibility. | Included categories and available targets. |
| 5. Configure variables | Gather | User selects variables, targets, feasible limits and optional DOE factors/levels. Changing categories hides and excludes their inputs and clears excluded DOE factors. | Defined admissible design space. | Search and factorial design. | Selected ranges and up to three/four DOE factors. |
| 6. Optional sensitivity screening | Simulate | Five minutes × three paired seeds for at most twelve feasible targets. Preserve manual selection when no isolated gain is found. | Measured initial DOE suggestions. | Factor selection. | Provisional effects; interactions remain a limitation. |
| 7. Baseline | Reuse or simulate | Exact engine/input/run key and complete finite round metrics are required to reuse. Otherwise simulate matching seeds, horizons and rounds. | Fair reference for the phase. | Candidate gains. | Baseline mean and round metrics plus cache origin. |
| 8. Explore | Simulate / compare | Joint targets, per-equipment blocks, bounded coordinate alternatives and refinement. Use candidate budgets; no default wall-clock cutoff or warm start. | Best tested candidate within the defined range. | DOE context and finalists. | Trials, infeasibility, coverage and stopping reason. |
| 9. DOE | Simulate / analyze | Fix nonfactor winner changes; evaluate all two-level factorial combinations. Effects and High ANOVA require a complete feasible design. | Inspect interactions and add better treatments. | Interpretation and finalist pool. | Factor effects, completeness and optional seed-block ANOVA. |
| 10. Rank finalists | Simulate / compare | Matched 30-minute batches and another seed block. Prefer no worsened engineering checks; maximize throughput without OEE regression. | Reduce short-horizon selection errors. | Winner for independent confirmation. | Finalist metrics and chosen changes. |
| 11. Confirm | Simulate / compare | Different seeds, at least 30 minutes or longer configured horizon; three rounds, up to six for uncertain High results. | Check reproduction rather than select another winner. | Reproduced / validation-needed status. | Independent gain and warnings. |
| 12. Create | Gather approval / save | User reviews actual changes and warnings; clone source, keep provenance and scope. | A traceable hypothesis for further testing. | New simulation and comparison. | Scenario and evaluation evidence. |

## Evidence recorded for process review

Evaluations retain category inclusions and the exact requested targets, run signatures and seeds. `phaseAudit` records baseline source, exploration counts/coverage, DOE completeness, finalist count/run and independent confirmation. These records explain what actually ran; the screen percentage reaching 100% does not certify global optimality.

## Demo B experiments

Demo B remains only a repository fixture imported from the photographs. Run `node scripts/test-demo-b.mjs --composition` for an isolated High search followed by High including Zero/Medium with a two-factor DOE. The controlled budget is twelve candidates. Results are written to `docs/demo-b-composition-results.json`; they are engine calculations rather than preset efficiency targets.

Limitations and next review points: a five/15-minute horizon can favor a different candidate from an eight-hour evaluation, especially with large buffers; isolated screening can miss coupled effects; the candidate budget grows with variables and cannot guarantee a global optimum. Use the phase evidence to decide whether additional finalists, longer exploration or interaction-preserving proposals are warranted, instead of changing outputs to reach an expected OEE.

### Controlled composition result

With Demo B, seed 20261013, a twelve-candidate exploration budget and eight-hour independent confirmation, isolated High and High including Zero/Medium plus a complete two-factor/four-combination DOE both retained 46.733566% OEE, against 39.707188% baseline. The combined search evaluated fifteen unique candidates including DOE and twenty-four batches overall. Medium has no native planner targets in this fixture without a declared user intervention; marking its inclusion therefore adds none. The strongest retained change was a High accumulation-length intervention. Additional category scope did not improve this controlled result, so no efficiency gain is inferred merely from enabling the checkboxes.
