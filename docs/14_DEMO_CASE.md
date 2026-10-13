# Demo Case

The console can create **13-unit demo** from the Cases panel. It contains a baseline and three separate, runnable CAPEX scenarios for testing the editor, playback, physical conveyor geometry, seeded micro-stops, and reliability events without adding confidential plant data.

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


## V-Graph CAPEX challenge (revision 4)

The theoretical series availability is approximately **28.74%**, the product
of machine MTBF / (MTBF + MTTR). It is not simulated OEE: buffers decouple some
equipment outages. Reliability stays identical across the four scenarios.

The Filler is the only critical reference machine, at **400 BPM**. Configured
machine speeds descend toward it and rise downstream. Conveyors are excluded
from the machine-speed profile. Rates use equivalent bottles per minute; pack
and pallet conversion is not simulated.

| Machine | Baseline BPM | Zero CAPEX BPM | Medium CAPEX BPM | High CAPEX BPM | Installed maximum BPM |
|---|---:|---:|---:|---:|---:|
| Blowmolder | 460 | 480 | 500 | 580 | 620 |
| Pucker | 430 | 440 | 460 | 540 | 580 |
| Filler | 400 | 400 | 400 | 400 | 420 |
| De-pucker | 420 | 440 | 450 | 500 | 560 |
| Sleever | 440 | 480 | 490 | 520 | 580 |
| Case packer | 460 | 520 | 530 | 550 | 600 |
| Palletizer | 480 | 540 | 550 | 560 | 620 |

The current-speed curve shows configured processing speeds, without clipping
them to the reference rate. Average throughput is reported separately.
Recovery recommendations use installed accumulation, MTTR and a recovery
window. They are local planning estimates, not guaranteed line throughput or
automatic setpoints. The graph does not force arbitrary configurations into a V.

Each CAPEX scenario is an independent set of changes against the baseline:
Zero uses installed speed headroom and existing conveyor settings; Medium adds
12 m buffers and an assumed local restart retrofit; High adds 24 m buffers,
an integrated restart retrofit and Back-up relocation. Speeds stay below
installed maxima. MTBF, MTTR and microstops stay unchanged.

New demos include measured results over three eight-hour rounds with seeds
20261008–20261010. The default is fixed seeds. Prepared results match the exact
revision, equipment and run configuration. Edited inputs and existing user
results are preserved; older revision-3 demos are not silently rewritten.

| Scenario | Mean OEE | Physical changes |
|---|---:|---|
| Baseline | 50.19% | Coherent V-shaped speeds, 5-second restarts, 8 m conveyors. |
| Zero CAPEX | 53.88% | Installed speed headroom, belt factor 100%, Prime window 400 mm. |
| Medium CAPEX | 65.01% | Increased recovery speeds, 12 m buffers, assumed 3-second restart retrofit. |
| High CAPEX | 80.49% | Increased recovery speeds, 24 m buffers, assumed 1-second restart retrofit, Back-up at 3 m. |

These are synthetic model measurements, not plant performance guarantees.
The former 30% baseline depended on machines slower than the declared critical
reference. Removing that inconsistent speed constraint raises baseline OEE;
the results are recalculated rather than preserving incompatible old numbers.

Prepared playback retains only initial and final representative-round frames.
Run again for full playback. Rebuild with
`node scripts/prepare-demo-results.mjs` after changing inputs or mathematics.

Values above were regenerated with engine 0.13.0, using independent random streams per equipment and event type. Saved older engine results must be rerun for a matched comparison.
