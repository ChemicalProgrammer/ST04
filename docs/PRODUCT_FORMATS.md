# Formats: products, boxes and packing formats

The Formats menu uses three tabs with the shared Settings/header tab design and native select styling. All catalogs belong to the case. Operating settings belong to packing formats; each simulation selects its own initial format and changeover destinations.

| Tab | Editable data | Reuse |
| --- | --- | --- |
| Products | Product name, volume and bottle length/width/height | One product may use several boxes. |
| Boxes | Box name and external length/width/height | One box may be shared by several products. |
| Packing formats | Product reference, box reference, bottles per case, packing pattern, equipment settings | Each combination has its own operating settings. |

Bottles per case is edited only on the packing format. It depends on the product/box/arrangement combination. Packing pattern is descriptive; it does not generate a spatial arrangement or prove the bottles fit the box. The current single-lane conveyor model uses the dimension along travel; width and height are reference data.

## Configuration

1. In Equipment and Conveyors, configure physical input/output units. A conveyor transports bottles or cases. A Case Packer can receive bottles and produce cases. Its downstream conveyor must transport cases. Physical-unit edits apply across packing formats; legacy per-format unit layouts are retained until explicitly changed.
2. In Formats → Products, add the products and bottle dimensions using the compact table.
3. In Boxes, add box dimensions. Pack count is not a box property.
4. In Packing formats, add a combination, select its product and box, and enter bottles per case and optional packing pattern. Confirm the suggested pack size of 12.
5. Enter machine rate, startup and ramp settings, and conveyor-specific gaps/speeds in the tables. Rates use output units per minute: 300 bottles/min equals 25 cases/min for a 12-bottle case. Gap means free space; pitch = product length + gap. Manual belt speeds are entered in m/min and stored in mm/s. Blank overrides retain base settings. MTBF/MTTR, installation length and sensors remain equipment settings.
6. Select Use as initial format for the active simulation and Save formats. Without an initial format the legacy uniform-unit model remains available.
7. In Simulation, enable events and use + Changeover or apply the plant calendar. Destination format selects a complete product/box/count/settings combination. For example, A/Box A → A/Box B → B/Box C.

The three tabs share a draft: switching tabs retains edits. Save formats commits all catalogs together; Discard edits restores them. Deleting a product or box is blocked while a format references it. Deleting a format is blocked while another simulation's initial selection or a changeover uses it. Deleting the active simulation's initial format clears that selection. Saved results and run snapshots remain historical records.

Equipment cards display the active format, its product/box and pack size. Format rates are read-only there; Edit in Formats opens Packing formats. Equipment-unit selectors remain the one editing location for physical input/output function; packing-format tables display them as text. This avoids duplicate presentation and rate editors.

## Compatibility and equipment changes

Applies records compatibility. It does not create a branch or bypass. Every format actually used in a run must apply to every installed step and have valid geometry and continuous units. Draft/incomplete or partially mapped formats may remain in the catalog without blocking another valid format. Changing the bottle/case layout at the same installed step during one run is not supported; use separate simulations for different layouts.

Profiles follow equipment IDs. New equipment receives base defaults in every format. Rename/reorder changes labels/order while preserving values. A removed profile is pruned only when no other simulation still uses its equipment ID. Product and box records remain independent of equipment topology.

## Existing cases, export and reproducibility

Opening an old product catalog presents an independent migration draft. Each old entry becomes a product, a box and a packing format. Format IDs stay equal to the previous IDs, preserving initial and changeover references. Migration does not guess whether similar records are the same product or box. Save formats commits the relational catalog; old snapshots and results are not rewritten.

The canonical case metadata stores `formatCatalog` with products, boxes and formats. Simulation runs receive resolved format snapshots containing the selected bottle/box dimensions and count. Shared catalog edits affect future runs while stored input snapshots remain unchanged. Full case export includes the catalogs; summary export retains format results. Configuration import merges new catalog IDs and rejects conflicting shared records rather than silently overwriting another simulation's data.

## Simulation scope

This change organizes configuration and format selection; it does not add an automatic production planner. Shifts remain reporting boundaries. Schedule explicit changeovers to change the packing format at the required times.

The ST engine uses continuous equivalent flow, not discrete box assembly. It reports complete-case equivalents and fractional remainder separately. Global production and material balance use bottle equivalents. At destination-format changeover completion, remaining inventory is removed and counted separately as clear-out, then the line starts empty. Progressive draining, mixed product fronts, rejects, multiple lanes and automatic fit checks are not added.

`input = finished output + inventory + overflow + changeover clear-out + numerical residual`

OEE integrates the configured reference for each format. Product-specific What-If/DOE, speed recommendations and loss decomposition remain pending validation. Experimental DES does not support these format changes.

## Validation

Tests cover relational reuse, legacy migration without changing output, independent format counts, shared-source edits versus immutable snapshots, A/Box A → A/Box B → B/Box C changeovers, material balance, asynchronous/batch consistency, catalog references and deletion guards, tab drafts/keyboard navigation, equipment reconciliation, shared select styles and read-only card values. Plant calibration is still required.
