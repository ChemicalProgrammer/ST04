# Public demonstration Case

The console can create **Public 13-unit demo** from the Cases panel. It contains a baseline and three separate, runnable CAPEX scenarios for testing the editor, playback, physical conveyor geometry, seeded micro-stops, and reliability events without adding confidential plant data.

## Data boundary

The Case is labelled `PUBLIC_DEMONSTRATION_ONLY` and carries its own `metadata.dataNote` and public reference links. Public Krones pages provide broad equipment-capacity context for blow moulding, filling, packing, and palletising. They do not provide the specification of one integrated line.

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

New demo cases include Baseline, Zero, Medium and High simulations with no preset
results. Run each to calculate its actual output. Existing saved cases are not
rewritten. The baseline also retains the three input hypotheses in What-If;
further optimization can produce different results.

The default run is one 8-hour shift, three rounds, fixed base seed `20261008`.
The current ST engine produces these mean OEE values over seeds 20261008–20261010:

| Scenario | Mean OEE | Physical changes against baseline |
|---|---:|---|
| Baseline | 29.97% | Non-reference machines under-set at 160 BPM, 35-second restarts, 6 m conveyors. |
| Zero CAPEX | 49.20% | Retune installed non-reference machines to 300 BPM, belt factor to 100%, Prime window to 400 mm. |
| Medium CAPEX | 59.19% | Retune to 400 BPM plus a documented synthetic control retrofit targeting 10-second restarts. |
| High CAPEX | 80.29% | Retune to 420 BPM, 3-second restart-control upgrade, 18 m conveyors and Back-up relocation to 3 m. |

Machine MTBF (4 min), MTTR (0.3 min), microstops and the 400 BPM reference remain
identical in all four runs. All speed targets stay within installed maxima. The
scenario adapter reports no newly regressed engineering checks for these targets.
These are model measurements of synthetic inputs, not efficiency guarantees;
changing duration, seed, controls or engine changes the result. DES does not yet
report validated OEE. Reproduce with `node --test test/PublicDemoCaseFactory.test.js`.
