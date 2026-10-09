# Demo Case

The console can create **Public 13-unit demo** from the Cases panel. It contains a baseline and three separate, runnable CAPEX scenarios for testing the editor, playback, physical conveyor geometry, seeded micro-stops, and reliability events without adding confidential plant data.

## Data boundary

The Case is labelled `DEMO_ONLY` and carries its own `metadata.dataNote` and public reference links. Public Krones pages provide broad equipment-capacity context for blow moulding, filling, packing, and palletising. They do not provide the specification of one integrated line.

Therefore, its MTBF, MTTR, physical geometry, sensor positions, speed factors, pack configuration, and equivalent-flow values are deliberately marked as transparent **synthetic assumptions**. They must not be used as a design limit, a plant benchmark, or a CAPEX recommendation.

## What runs in the MVP

The engine models every step as an equivalent-bottle flow. The six conveyor objects use mandatory synthetic physical geometry and control parameters. It does not yet transform bottles into cases or pallets; the pack configuration is stored only as an explicit model assumption.

| Input | Current deterministic behaviour |
|---|---|
| `noiseProfile.microStop` | Seeded short stops, driven by probability per minute and a duration range. |
| `noiseProfile.reliability.mtbfMinutes` | Seeded exponential time-to-failure while the unit is operational. |
| `noiseProfile.reliability.mttrMinutes` | Fixed repair duration after a generated failure. |
| FlowPilot fields on each demo conveyor | Mandatory physical capacity, belt speed, leading-product travel to Prime, Back-up controlled stop, restart debounce, residual-discharge overflow accounting, and a design audit. |

Using a fixed random seed makes the same Case and run configuration repeat exactly. Change the seed to observe another plausible realization of the declared assumptions.

## Synthetic engineering inputs

The demo supplies synthetic `L_act`, `L_p`, package length, discharge pitch,
speed factor, runout, sensor delays, insurance and Back-up positions so it can
exercise the FlowPilot formulas. They are transparent example values, not
measurements from any production line. The unnamed Speed & sensors fields still
remain empty rather than being guessed.

## Public context references

- [Krones Contiform Speed](https://www.krones.com/en/products/machines/contiform-speed-stretch-blow-moulder.php)
- [Krones Modulfill Dual](https://www.krones.com/en/products/machines/modulfill-dual.php)
- [Krones packaging-line reference](https://www.krones.com/en/company/press/magazine/reference/coca-cola-hbc-egypts-fastest-canning-line.php)
- [Krones Modulpal Pro](https://www.krones.com/en/products/machines/modulpal-pro-palletiser.php)


## Calibrated CAPEX challenge (2026-10-08)

The initial theoretical equipment efficiency is approximately **28.74%**, the
product of each machine's `MTBF / (MTBF + MTTR)`. This is series availability,
not a simulated OEE prediction: buffers can decouple individual outages.
Reliability differs by machine but stays identical across the four scenarios.

The instantaneous V-Graph is available before running. It uses the following
configured speeds and calculated buffer-recovery estimates, without preset
simulation results. The Filler remains the 400 BPM reference.

| Machine | Configured BPM | Recommended recovery BPM | Maximum BPM |
|---|---:|---:|---:|
| Blowmolder | 240 | 270.5 | 600 |
| Pucker | 210 | 248.3 | 580 |
| Filler | 400 | 400 | 420 |
| De-pucker | 220 | 251.9 | 570 |
| Sleever | 170 | 206.4 | 560 |
| Case packer | 250 | 286.7 | 590 |
| Palletizer | 230 | 261.5 | 560 |

Recovery recommendations follow the existing formulas, using available
accumulation, MTTR and the MTBF recovery window. They describe local recovery
headroom and do not guarantee that retuning one machine will achieve 400 BPM
throughout the line.

New demo cases include Baseline, Zero, Medium and High simulations with measured
results prepared by the ST engine using the default three seeds. They load
without rerunning the engine. The baseline's category cards show these same
saved scenario means; further optimization can produce different results.
Unchanged saved demos from the same revision can also receive these derived
results on open. Edited inputs and existing user results are never replaced.

The prepared result retains full aggregate and per-round metrics, with only the
initial and final frames for representative-round playback. Run a simulation
again for full playback history. Rebuild the fixture after changing demo inputs
or engine mathematics with `node scripts/prepare-demo-results.mjs`.

The default run is one 8-hour shift, three rounds, fixed base seed `20261008`.
The current ST engine produces these mean OEE values over seeds 20261008–20261010:

| Scenario | Mean OEE | Physical changes against baseline |
|---|---:|---|
| Baseline | 30.12% | Uneven non-reference speeds of 170–250 BPM, 5-second restarts, 8 m conveyors. |
| Zero CAPEX | 51.66% | Retune installed non-reference machines to 450 BPM, belt factor to 100%, Prime window to 400 mm. |
| Medium CAPEX | 59.35% | Balanced 420 BPM operating targets, 12 m buffers, and an assumed control retrofit targeting 3-second restarts. |
| High CAPEX | 80.03% | Retune to 550 BPM, 1-second restart-control upgrade, 24 m conveyors and Back-up relocation to 3 m. |

Machine MTBF (1.4–2.8 min), MTTR (0.3–0.4 min), microstops and the 400 BPM reference remain
identical in all four runs. All speed targets stay within installed maxima. The
scenario adapter reports no newly regressed engineering checks for these targets.
These are model measurements of synthetic inputs, not efficiency guarantees;
changing duration, seed, controls or engine changes the result. DES does not yet
report validated OEE. Reproduce with `node --test test/DemoCaseFactory.test.js`.
