# Products, conveyor profiles and bottle/case flow

Available in Basic and Advance with the ST engine. Existing cases keep their original uniform-unit behavior until an initial product is selected. Adding a catalog does not convert an existing case automatically or reinterpret its saved results.

## Configuration

1. In Equipment / Conveyors, select input and output units. Conveyors transport either bottles or cases without changing units. A Case Packer may receive bottles and output cases. Adjacent output/input units must agree.
The input/output controls have their own visible card section in Basic and Advance. Cards handling cases also show the selected product’s bottles per case as a read-only value and a Configure in Products shortcut. A Case Packer displays the bottle-to-case conversion. The pack size has one editable source, in Products.

2. Enter machine rates in their **output unit per minute**. For example, 300 bottles/min is 25 cases/min for a 12-bottle case. Existing numeric rates are not silently converted when their unit changes.
3. In the Products menu section, use the Product selection combobox to browse products. The adjacent plus icon adds a product; the trash icon removes the selected product from the draft. Confirm the suggested 12 bottles/case. Enter length **along the direction of travel** for bottles and, if used, cases. Container volume is descriptive.
4. Enter conveyor-specific moving, accumulated, discharge and infeed **free gaps**. Pitch = length + gap. The same product may have different spacing on different conveyors. Manual belt speeds are entered in m/min and stored in mm/s. A blank override retains the base equipment setting; an explicit speed overrides Population / Overspeed targets for that product. An explicit moving gap determines runtime pitch even when a target is retained for automatic speed; the resulting occupancy can therefore differ from the target.
5. Enter optional machine rate, startup and ramp settings by product. MTBF / MTTR, installation length and sensor positions remain on equipment.
6. In Products, select a product and check Use selected product as the initial product for the active simulation. Save products applies the catalog and initial-product choice together; Discard edits restores the previous values. The existing equipment configuration option disables profiles and conversion for that simulation.
7. Enable events. Use + Changeover, or apply scheduled Plant calendar events, then select a destination product on each changeover. A blank destination is a stop that retains the current product and inventory.

## Changeover policy

The first version stops the whole line for the event duration, then removes remaining conveyor inventory at completion, records it as **clear-out bottle equivalents**, applies destination geometry/settings and starts empty. Clear-out is not finished production and is included separately in the material balance. The configured duration must include the operational allowance for clearing the line; progressive draining is **not** simulated. Ordinary stops without a destination retain inventory. Re-selecting the current product does not clear it.

Equipment IDs, random streams, remaining repair times, commands, modes and cumulative counters survive a product change. Restart / resume follows the event policy. Unknown products, invalid boundaries, invalid dimensions and overlapping planned stops are rejected. A changeover beyond the run end does not apply a destination early.

## Accounting and model limits

The ST engine remains a **continuous flow model**. A Case Packer consumes the configured number of bottle equivalents per output case equivalent. This is a mass-flow conversion, not a discrete batching/reject model: fractional case equivalents can exist. The product results table distinguishes full-case equivalents and the fractional remainder; it is not a claim of exact individual box-completion timing. No merges, splits, pallets, mixed-product transport or progressive product-front transitions are added.

Conveyor inventories and equipment production use their local units. Physical lengths, capacity, travel and sensor timing use the matching product geometry. Global production and the material balance use bottle equivalents:

`source input = finished output + remaining inventory + overflow + changeover clear-out + numerical residual`

Global OEE uses accumulated ideal bottle-equivalent output at the configured reference rate for each product, including stop time in the denominator. Shift OEE uses the corresponding ideal-output increment. Per-product rows describe the representative round; the existing main KPIs retain batch means when available. MTBF / MTTR remain shared.

Product definitions live in case metadata, with a catalog snapshot in each configured simulation run for reproducibility. Product results, transitions and per-frame geometry survive save/open and full or summary case export. Product-specific speed recommendations, What-If / DOE and detailed loss decomposition are explicitly withheld pending validation of those analyses with different units and profiles. Existing single-unit cases retain those features.

## Validation

Automated coverage includes physical conversion, mass balance, speed versus storage capacity, changed dimensions/spacing/pack ratio, explicit clear-out, stop behavior, synchronous/asynchronous/batch consistency, invalid references and units, shared reliability/installation, dialog staging/cancel/save, local activity progress, and product results. Existing conveyor, calendar, export, persistence and bundle tests are run alongside these checks. Plant calibration is still required before treating the extended model as validated against production.

## Products workspace layout and equipment changes

Product selection contains the combobox, add/delete icon actions and the initial-product checkbox. General information contains only product-specific properties. Equipment inputs uses the shared table styles for a machine table (input/output units, rate, startup, ramp) and a conveyor table (transported unit, spacing and speed), in the current equipment order within each group.

Adding equipment, removing equipment, importing equipment or synchronizing editor changes reconciles all catalog products by equipment ID. New equipment receives defaults from its current base settings. Existing product-specific values remain unchanged. Renaming/reordering equipment updates the table labels/order without moving values between IDs. Removed profiles are pruned only when no other simulation still uses that equipment ID. Saved run snapshots and previous results are preserved.

Product deletion is staged until Save products and can be discarded. The active simulation's initial-product selection is cleared when that product is deleted. A product referenced by another simulation's initial selection or any changeover cannot be deleted until those references are changed; the workspace identifies the references. Existing run/result snapshots remain historical records.

## Bottle and case presentations

Products contain a Bottle presentation and a Case presentation, with independent length along travel, width and height. The case presentation also stores bottles per case. Width/height are reference dimensions; the serial single-lane conveyor model uses length along travel, gaps and installed length. General-information grids use four columns in wide workspaces, three in intermediate widths and one/two in narrow layouts.

Each equipment profile has an Applies checkbox and input/output presentation selections. Conveyors use the same presentation on input and output. A Case Packer can use Bottle → Case; the next conveyor must use Case. The case conversion ratio and geometry come from the selected product. Profile values fall back to base equipment units when omitted, preserving existing cases. Legacy flat product dimensions and pack sizes remain readable; saving updates their compatibility aliases from the presentation data.

The equipment/conveyor cards display the global initial product. With a selected product, their presentation selectors and operating rate edit that product's profile, retaining the base equipment configuration and other product profiles. Without a selected product, they edit the base equipment settings. Selecting different initial SKUs independently on each card is not supported.

Applicability describes compatibility; it does not create a route or bypass. A partially mapped product may be saved in the catalog without being the initial product. Every product used as the initial selection or a changeover destination must apply to every installed step and pass presentation continuity validation. An unused partially mapped product does not prevent running another compatible product. During a changeover the product size, gaps, speeds and pack count may change, but the bottle/case presentation at each installed step must remain consistent within that run; use separate simulations for different presentation layouts. Saved historical run snapshots are preserved.
