# Products, conveyor profiles and bottle/case flow

Available in Basic and Advance with the ST engine. Existing cases keep their original uniform-unit behavior until an initial product is selected. Adding a catalog does not convert an existing case automatically or reinterpret its saved results.

## Configuration

1. In Equipment / Conveyors, select input and output units. Conveyors transport either bottles or cases without changing units. A Case Packer may receive bottles and output cases. Adjacent output/input units must agree.
The input/output controls have their own visible card section in Basic and Advance. Cards handling cases also show the selected product’s bottles per case as a read-only value and a Configure in Products shortcut. A Case Packer displays the bottle-to-case conversion. The pack size has one editable source, in Products.

2. Enter machine rates in their **output unit per minute**. For example, 300 bottles/min is 25 cases/min for a 12-bottle case. Existing numeric rates are not silently converted when their unit changes.
3. In the Products menu section, add one or more products. Confirm the suggested 12 bottles/case. Enter length **along the direction of travel** for bottles and, if used, cases. Container volume is descriptive.
4. Enter conveyor-specific moving, accumulated, discharge and infeed **free gaps**. Pitch = length + gap. The same product may have different spacing on different conveyors. Manual belt speeds are entered in m/min and stored in mm/s. A blank override retains the base equipment setting; an explicit speed overrides Population / Overspeed targets for that product. An explicit moving gap determines runtime pitch even when a target is retained for automatic speed; the resulting occupancy can therefore differ from the target.
5. Enter optional machine rate, startup and ramp settings by product. MTBF / MTTR, installation length and sensor positions remain on equipment.
6. In Products, select the initial product for the active simulation. The existing equipment configuration option disables profiles and conversion for that simulation.
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
