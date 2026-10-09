# Hybrid scenario search

What-If has its own processing depth, independent of playback duration and replication settings. The default is Medium. Choose depth in the scenario configuration dialog; the selection and evaluation evidence are saved with the simulation.

| Depth | Exploration per round | Finalist ranking / confirmation per round | Exploration candidates | DOE factors / combinations |
| --- | --- | --- | --- | --- |
| Light | 5 min | 10 min | 16 | 2 / 4 |
| Medium | 10 min | 20 min | 28 | 3 / 8 |
| High | 15 min | 30 min | 40 | 4 / 16 |

Each exploration, DOE and finalist-ranking batch uses three rounds. High starts confirmation with three rounds and expands to six if the paired throughput gain's preliminary 95% t interval does not clear the practical improvement threshold. This decision uses matched seed pairs. The final pass criterion remains a throughput gain greater than max(0.001 units/min, 0.1% of baseline), without OEE regression; it is not a significance test.

## Without DOE

1. Rank adjustable targets by existing engineering proposal priorities.
2. Validate physical feasibility and simulate the combined proposal, equipment blocks and coordinate alternatives.
3. Stop exploration at the depth's candidate, elapsed-time or stagnation budget.
4. Re-rank up to two (Light) or three (Medium/High) improving finalists against a newly simulated baseline at the longer horizon, using a shared seed block offset by 100003. Prefer candidates without worsened engineering checks.
5. Confirm the selected winner against baseline on a separate seed block offset by at least 1000003. Confirmation never selects another winner. Display the independently confirmed metrics; unsuccessful reproduction remains explicitly marked for validation.

## With DOE

The same exploration is followed by a reserved full factorial, two-level stage using the explicitly selected factors and bounds. Light allows two factors, Medium three, High four. Excess factor selections are rejected with an actionable message, never silently dropped. The suggestion button uses engineering priorities and feasible ranges.

DOE is not skipped when ordinary exploration exhausts its budget. Its separate elapsed-time budget is 2/5/10 minutes for Light/Medium/High; the time limit is checked between batches, so an in-flight batch can exceed it. Unfinished or physically infeasible designs are reported as incomplete and do not receive effect estimates or ANOVA. Other variables remain fixed at the exploration winner. The finalist-ranking and independent-confirmation stages then proceed as above. Stopping exploration manually skips DOE and confirms the best found; stopping during DOE or confirmation cancels the evaluation.

## High ANOVA

High retains each DOE round's seed, OEE and throughput. It fits full factorial treatment means plus seed blocks, including higher-order interactions so they are not incorrectly assigned to residual error. For N factorial combinations and r shared seeds, residual degrees of freedom are (N−1)(r−1). Each factorial contrast has SS = N r effect² / 4, one degree of freedom, F = SS / residual mean square, and an F upper-tail p-value.

P-values are exploratory, unadjusted for multiple comparisons, and assume independent seed blocks and homogeneous residual variance. Zero residual variance yields unavailable F/p-values rather than fabricated certainty. Statistical significance is not economic benefit, a global optimum, or plant validation. ANOVA does not change the winner-selection criterion.

## Persistence and source files

Evaluation evidence stores depth, phase configurations, selected factors, per-round DOE responses, ANOVA, initial and final confirmation, and stopping reasons. Changing depth or DOE settings invalidates creation until recalculation. The source simulation's playback configuration remains unchanged.

- `src/analysis/ScenarioSearch.js`: profiles, phase run configurations, uncertainty trigger.
- `src/analysis/ScenarioDOE.js`: factorial design, descriptive effects, seed-block ANOVA.
- `apps-script/ScenarioExplorer.html`: UI, phase budgets, ranking and confirmation.
- `apps-script/SimulationEngine.html`: deployed browser bundle.
- `scripts/build-browser-engine.mjs`: bundle generation including search and ANOVA exports.
