# Formats: products, boxes and packing formats

The Formats menu uses three tabs with the shared Settings/header tab design and native select styling. All catalogs belong to the case. Reusable operating settings belong to products and boxes; conversion settings belong to packing formats; each simulation selects its own initial format and changeover destinations.

| Tab | Editable data | Reuse |
| --- | --- | --- |
| Products | Product name, volume, bottle dimensions and bottle-processing equipment/conveyor behavior | One product may use several boxes. |
| Boxes | Box name, external dimensions and case-processing equipment/conveyor behavior | One box may be shared by several products. |
| Packing formats | Product reference, box reference, bottles per case and combination-specific conversion settings | Each combination has its own operating settings. |

Bottles per case is edited only on the packing format. It depends on the product/box/arrangement combination. The former Packing pattern field is hidden because it did not affect the simulation. Previously saved descriptions are retained; no spatial fit calculation is performed. The current single-lane conveyor model uses the dimension along travel; width and height are reference data.

## Configuration

1. In Equipment and Conveyors, use Material flow: Bottle → Bottle, Bottle → Case or Case → Case. A conveyor uses Transport unit: Bottle or Case. A Case Packer can receive bottles and produce cases. Its downstream conveyor must transport cases. Physical-unit edits apply across packing formats; legacy per-format unit layouts are retained until explicitly changed. Cards have no format selector or edit shortcut; format-derived nominal rates remain read-only.
2. In Formats → Products, add the products and bottle dimensions using the compact table.
3. In Boxes, add box dimensions. Pack count is not a box property.
4. In Packing formats, add a combination, select its product and box, and enter bottles per case. Confirm the suggested pack size of 12.
5. In Products or Boxes, select the record under Behavior selection. Enter machine rate, startup and ramp settings, and conveyor-specific gaps/speeds in its tables. All equipment and conveyors are listed, with a usage label identifying the current physical flow. Product values are used for bottle flow and box values for case flow; conversion settings remain on the packing format. Other material values may be entered in advance, but take effect only if the equipment flow is changed. Combination-specific Bottle → Case settings remain under Packing formats. Rates use output units per minute: 300 bottles/min equals 25 cases/min for a 12-bottle case. Gap means free space; pitch = product length + gap. Manual belt speeds are entered in m/min and stored in mm/s. Blank overrides retain base settings; new records leave overrides blank rather than copying defaults. Use defaults on a row removes its operating overrides while preserving applicability. Existing explicit settings remain intact. MTBF/MTTR, installation length and sensors remain equipment settings.
6. Save formats. In Simulation, choose Initial format immediately before Playback speed. The selection belongs to the active simulation and is locked during calculation/playback. Base equipment settings retains the legacy uniform-unit model.
7. In Simulation, enable events and use + Changeover or apply the plant calendar. Destination format selects a complete product/box/count/settings combination. For example, A/Box A → A/Box B → B/Box C.

The three tabs share a draft: switching tabs retains edits. Save formats commits all catalogs together; Discard edits restores them. Deleting a product or box is blocked while a format references it. Deleting a format is blocked while another simulation's initial selection or a changeover uses it. Deleting the active simulation's initial format clears that selection. Saved results and run snapshots remain historical records.

The same product behavior is reused by all linked formats; the same applies to boxes. Changing box dimensions or case count can therefore change accumulation and bottle-equivalent flow without duplicating the product settings. A converter keeps its own combination-specific rate.

## Compatibility and equipment changes

Applies records compatibility. It does not create a branch or bypass. Every format actually used in a run must apply to every installed step and have valid geometry and continuous units. Draft/incomplete or partially mapped formats may remain in the catalog without blocking another valid format. Changing the bottle/case layout at the same installed step during one run is not supported; use separate simulations for different layouts.

Profiles follow equipment IDs. New equipment receives blank behavior overrides; it inherits current equipment/conveyor defaults. Rename/reorder changes labels/order while preserving values. A removed profile is pruned only when no other simulation still uses its equipment ID. Product and box records remain independent of equipment topology.

## Existing cases, export and reproducibility

Opening an old product catalog presents an independent migration draft. Each old entry becomes a product, a box and a packing format. Format IDs stay equal to the previous IDs, preserving initial and changeover references. Migration does not guess whether similar records are the same product or box. Save formats commits the relational catalog; old snapshots and results are not rewritten.

Version 2 moves reusable equipment behavior into products and boxes. Identical settings become shared; different settings from an older format are retained as visible overrides under Combination settings. Use shared settings removes a retained override for that equipment. Existing IDs, run snapshots and results are preserved.

The canonical case metadata stores `formatCatalog` with products, boxes and formats. Simulation runs receive resolved format snapshots containing the selected bottle/box dimensions and count. Shared catalog edits affect future runs while stored input snapshots remain unchanged. Full case export includes the catalogs; summary export retains format results. Configuration import merges new catalog IDs and rejects conflicting shared records rather than silently overwriting another simulation's data.

## Simulation scope

This change organizes configuration and format selection; it does not add an automatic production planner. Shifts remain reporting boundaries. Schedule explicit changeovers to change the packing format at the required times.

The ST engine uses continuous equivalent flow, not discrete box assembly. It reports complete-case equivalents and fractional remainder separately. Global production and material balance use bottle equivalents. At destination-format changeover completion, remaining inventory is removed and counted separately as clear-out, then the line starts empty. Progressive draining, mixed product fronts, rejects, multiple lanes and automatic fit checks are not added.

`input = finished output + inventory + overflow + changeover clear-out + numerical residual`

OEE integrates the configured reference for each format. Product-specific What-If/DOE, speed recommendations and loss decomposition remain pending validation. Experimental DES does not support these format changes.

## Validation

Tests cover relational reuse, legacy migration without changing output, independent format counts, shared-source edits versus immutable snapshots, A/Box A → A/Box B → B/Box C changeovers, material balance, asynchronous/batch consistency, catalog references and deletion guards, tab drafts/keyboard navigation, equipment reconciliation, shared select styles, simplified material-flow controls, locked initial-format selection and read-only card values. Plant calibration is still required.

## Conveyor defaults and ownership

Conveyor inputs remain visible and editable even when formats are configured. They are the base values for every product and box that leaves the corresponding override blank. A missing product/box length falls back to each conveyor’s default package length; a run is rejected if neither source supplies valid geometry. An explicit zero gap is an override, not a blank.

| Field group | Owner |
| --- | --- |
| Installed length, prime reserve, discharge/coding runout, sensor positions and sensor delays | Conveyor installation only; not duplicated in products/boxes. |
| Stop response, residual discharge, insurance factor and conveyor design factors | Conveyor defaults. |
| Package length, discharge/infeed pitches, moving/accumulated gaps and belt speed | Conveyor defaults; product/box dimensions and explicit spacing/speed overrides take precedence. |
| Machine rate, startup and ramp | Equipment defaults; matching product/box overrides take precedence. Bottle → Case conversion overrides remain on the format. |

Precedence is retained format exception → matching product/box override → equipment/conveyor default. Use shared settings removes an older format exception; Use defaults removes row overrides. Neither rewrites historical run snapshots.
