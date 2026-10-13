# Demo B: reproducibility check

Demo B uses the 13 equipment rows transcribed from the two user-supplied equipment photos. The new comparison screenshots show approximately 38.99% and 39.49% baseline OEE after subtracting the displayed gains; they do not establish identical run seeds or search configurations. The 49.3% versus 40.0% scenario difference cannot be attributed to hardware alone from those screenshots.

Two algorithmic sources of variation were removed from the default search: wall-clock stopping and automatic use of a saved winner. Candidate and stagnation limits still apply. The optional time limit can be enabled explicitly, with loss of reproducibility. Identical seeds, run horizons, targets, DOE levels and software versions remain necessary; stopping early is not an equivalent search.

## Real-engine experiment

- Case: Demo B, source inputs unchanged.
- Engine: current continuous engine.
- Fixed seed: 20261013; three matched exploration rounds.
- Search depth: High; controlled budget: 12 candidates; no DOE in this real-engine experiment.
- Exploration: 15 simulated minutes per round; independent confirmation: 8 hours per round.
- Run 1: one admitted concurrent candidate and normal clock.
- Run 2: two admitted concurrent candidates and a UI clock scaled by 1000.
- Both runs: 23 simulation batches, 12 tested candidates, the same selected changes, and identical independent confirmation results.
- Confirmed baseline mean OEE: 39.70718766666667%.
- Confirmed candidate mean OEE: 46.733565999999996%.

This verifies deterministic execution in separate browser test contexts under altered scheduling and time, not two physical computers or a global optimum. Full-factorial DOE coverage across different clocks is covered separately by the automated controller tests.

## Repeat in the deployment

1. Update the listed Apps Script modules and publish a new deployment version on both computers.
2. Create a regular case, name it Demo B and import the photo equipment data. Set fixed seed 20261013, current engine, eight-hour duration and three rounds for this test. Demo B is a test fixture, not a built-in UI option.
3. Use the same CAPEX category, depth, selected targets, physical limits and DOE factors/levels. Do not stop one search early.
4. Export What-If JSON on each computer. Compare the reproducibility settings, tested-candidate count, stopping reason, selected changes and independent confirmation seeds/results.

Demo B preserves Blowmolder as critical even though Filler runs slower. It also retains PU-FIL discharge pitch 88.9 mm against a 110 mm package and the 135870 mm PAC-PAL length. These values require source verification; no photo inputs were silently changed. The 8-hour horizon, three replications and seed are declared test settings.
