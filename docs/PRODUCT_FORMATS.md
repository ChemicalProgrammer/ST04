# Products and Formats

The Formats menu has two tabs, using shared header tabs, native selects, compact fields and table styles. There is no separate Boxes catalog or Combination settings subsection.

| Tab | General fields | Equipment behavior |
| --- | --- | --- |
| Products | Current product, name, volume and bottle length/width/height | Bottle-processing machines and bottle conveyors. |
| Formats | Current format, name, linked product, bottles per case and case length/width/height | Case Packer, case-processing machines and case conveyors. |

One product can have several formats: Product A / 12 bottles, Product A / 24 bottles, Product B / 12 bottles. Each format owns its case dimensions and operating settings. Editing one format's case does not change another format. Product edits are shared by all linked formats.

## Controls and saving

Each tab uses a selector followed by Add, Delete, Clear fields, Import configuration and Export configuration icon buttons. Delete and Clear require confirmation; cancellation preserves the draft. Product deletion is blocked while formats reference it. Format deletion is blocked while other simulations or changeovers reference it; deleting the active initial format clears that selection. Clearing a format retains its ID and product reference; its name/count must be re-entered before saving.

Fields appear immediately below the toolbar in the shared compact grid. Equipment behavior contains Machines, then Conveyors. There are no secondary Save or Discard buttons: edits join the normal case draft and use the main Save / existing autosave. Invalid records cannot be saved.

## Configure the line

1. Set physical Material flow on machines: Bottle → Bottle, Bottle → Case, or Case → Case. Set Transport unit on conveyors: Bottle or Case. A Case Packer must use Bottle → Case for conversion; downstream conveyors and the Palletizer use Case / Case → Case.
2. Add a Product, its bottle dimensions and optional behavior settings.
3. Add a Format, select the Product, enter bottles per case, and enter case dimensions. Confirm the suggested count of 12.
4. Under the format's Equipment behavior, set the Case Packer's output rate and any case-machine/conveyor overrides. Rates use output units per minute: 300 bottles/min is equivalent to 25 cases/min for a 12-bottle format. A converter configured with bottle flow still appears with a prompt to configure Bottle → Case; its case fields are disabled until the physical flow is correct.
5. In Simulation, choose Initial format before Playback speed. It is saved per simulation and locked during execution. Changeover destinations select another format, which supplies its product and packaging settings.

Use settings enables a row's overrides. Unchecking dims/disables its controls, retains entered values, and uses installed defaults during simulation. It never removes equipment from the serial line. Blank values also inherit defaults; zero is an explicit zero gap. Use defaults clears operating overrides while retaining physical units and the checkbox selection.

## Field ownership and units

| Field group | Owner |
| --- | --- |
| Bottle dimensions | Product. |
| Product reference, bottles per case, case dimensions | Format. |
| Machine rate, startup and ramp | Product for bottles; format for cases and Bottle → Case conversion; blanks inherit equipment defaults. |
| Moving/accumulated/discharge/infeed gaps and manual belt speed | Product or format overrides for the matching transported unit; blanks inherit conveyor defaults. |
| Installed length, prime reserve, discharge/coding runout, sensor positions and delays | Conveyor installation only. |
| MTBF/MTTR | General equipment configuration. |

Gap means free space; pitch = length along travel + gap. Manual speed inputs use m/min, stored as mm/s. Missing product/case lengths inherit valid conveyor package-length defaults; missing both sources is rejected. Width and height are reference data in the current single-lane model. There is no spatial fit or packing-pattern calculation.

Profiles follow equipment IDs. Added equipment receives blank overrides. Removed profiles are pruned only when no other simulation still uses the ID. Physical-unit edits are shared across formats. Different bottle/case layouts during one run are not supported; use separate simulations for different layouts.

## Migration, history and configuration files

Catalog version 3 stores products and formats. Former box dimensions and effective case behavior are copied into each referencing format; IDs, initial-format references and changeover destinations stay unchanged. Former box records are retained in a legacy catalog archive for recovery. Existing run snapshots/results are never rewritten. Legacy bottle-specific format exceptions remain visible as migrated overrides; clearing them restores shared product settings.

Product configuration files retain the v1 material schema. Format files use `st-material-configuration-v2` and include the product reference, count, case dimensions and behavior. Import preserves the current record ID, checks equipment IDs and field types, and rejects missing product references before changing the draft. Import dialogs use the shared dialog layout and local progress bar. Complete-case/configuration imports normalize older catalogs and merge new records without overwriting conflicting shared IDs.

The engine receives resolved immutable snapshots. Editing a product or format affects future runs. Full-case export contains the catalogs and history; summary exports retain format production attribution. A separate Box column is no longer needed beside Format and Product in production tables.

## Simulation scope

The ST engine uses continuous equivalent flow, not discrete box assembly. Global production and material balance use bottle equivalents; results report complete-case equivalents and fractional remainder separately. At destination-format changeover completion, remaining inventory is counted as clear-out and the line starts empty.

`input = finished output + inventory + overflow + changeover clear-out + numerical residual`

This does not add an automatic shift planner, progressive draining, mixed-product fronts, rejects, multiple lanes or fit checks. Explicit changeovers change the active format. OEE integrates its configured rate reference. The full CAPEX cards retain Configuration, DOE controls, search, saved evidence and result deletion with formats selected. Search preserves the initial format and changeovers; product/format profiles take precedence over equipment defaults, so changing a default overridden by a profile may produce no gain. Format-specific speed recommendations still require validation. Results retain equipment-state percentages and the matched failure-free diagnostic using the original format schedule and seeds. For formats, conditional reliability loss and remaining loss sum with baseline OEE to 100%; remaining loss includes nominal speed, transport, planned stops and other flow effects. The nominal machine-speed gap is not separated across formats. Long-period diagnostics require the Calculate matched loss diagnostics action. Experimental DES does not support these format changes.

Tests cover migration equivalence, independent format packaging, shared product behavior, checkbox fallback, configuration import/export, reference guards, main-case saving, format changeovers and material balance. Plant calibration is still required.
