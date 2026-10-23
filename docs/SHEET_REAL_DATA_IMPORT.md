# Simple production observations in the equipment worksheet

Updated 2026-10-23. Export to Google Sheets retains case metadata in C1:C7, equipment headers in row 9, and equipment configuration in A10:Y. Yellow observation cells contain only the data from the supplied production summary. No additional measurements or definition selectors are required.

## Cells to fill

| Cell | Field | Unit |
|---|---|---|
| F1 | AU | % |
| F2 | UPDT | % |
| F3 | Shift 1 | cases |
| F4 | Shift 2 | cases |
| F5 | Shift 3 | cases |
| F6 | Total Production Day (Cases) | cases |
| F7 | Total Production Day (Units) | base bottle units |
| J1 | Total Time | min |
| J2 | Business External Time | min |
| J3 | Plant Available Time | min |
| J4 | Plant Decision Time | min |
| J5 | Production Available Time | min |
| J6 | Downtime | min |
| J7 | Run Time | min |
| N1 | Rate Loss | min |
| Z10 onward | Downtime of the equipment on the same row | min |

Leave unknown fields blank. Zero is an observed zero. AU/UPDT accept percentage points (`57.4`) or native percentage-formatted cells (`57.4%`). All times in this simple format are minutes. Keep the labels exported by the app.

The sheet does not ask for extra dates, quality, standard speed, effective runtime, UPDT minutes, observation notes, stop counts, stop classifications, exposure or denominator selectors. The existing metadata date C6 is reused. Column AA contains an automatically populated, hidden equipment identifier; do not fill it manually. The only added visible equipment column is Z (downtime).

The parser identifies this simple layout from the AU label in E1 and the downtime header in Z9. Existing configuration-only sheets and the earlier extended observation format (`R1 = st-real-sheet-v1`) remain readable.

## Import into Real Data

1. Export the equipment sheet and fill the yellow observation cells that are available.
2. Open Import Sheet, paste the link, and read Preview.
3. Choose **Import only Real Data** to retain equipment configuration, events and saved simulation results. Alternatively select configuration fields and the observation together.
4. Create a new observation or explicitly select an existing observation to update. Review equipment matching; the hidden ID is matched automatically when it belongs to the current line. Unresolved equipment can be mapped in the app.
5. Acknowledge review, Apply, and save the case. The imported observation is selected in Real Data.

Cases and units are preserved separately as `reportedProductionCases` / `reportedProductionUnits`; the primary production uses units when available, otherwise cases. Both reported totals remain visible in Real Data and JSON exports. Shifts are case counts. The existing C5 packing factor is used for conversions and consistency warnings; no packing factor is inferred from disagreement between totals.

Effective runtime may be derived as Run Time minus Rate Loss when both are available and consistent. AU and UPDT percentages remain exactly as reported. No UPDT duration, standard speed, stop counts, failure classification or quality is invented. Equipment exposure follows the reporting period given by Total Time; the stop class stays unconfirmed. This allows importing only the supplied data without requesting further worksheet inputs.

## Comparison and limits

Production and throughput compare using matching periods and units. The comparison retains reported values and recalculated source values separately, and flags mismatches. Runtime/UPDT/failure-based differences still require compatible definitions; additional definitions, when present in an imported record, are preserved internally; the HTML editor does not ask for them. Missing standard-rate or stop-class evidence does not prevent importing and saving the observation.

Equipment downtimes are never summed as line downtime. An unconfirmed equipment downtime is not silently relabeled as a failure. Existing AEM comparison rules and the complete optional JSON contract remain available for observations with additional evidence, but the worksheet does not require those fields.

Limits: 100 observations / 512 KB per case; at most 300 equipment observations per record. Blank exports do not create observations. Updating an existing observation replaces that observation explicitly; appending is the default.

## Deployment

Update `SheetImportService.gs`, `SheetExportService.gs`, `SheetImport.html`, and `RealData.html` together, then update the deployment. This simplification builds on the previous import implementation; keep its other modules installed. Importer contract: `sheet-import-20261023-2`. No engine rebuild is required.

Validation covers the supplied summary values, native percentage formatting, zero/unknown handling, simple export-to-Preview round trips, compatibility with earlier layouts, independent import, equipment matching and preservation of simulation results.

## Simple HTML editor

Real Data uses the same 15 production/time fields as this worksheet, all times in minutes. Its equipment table contains only Equipment and Downtime (min). Bottles per case, quality, standard speed, dates, notes, stop counts, exposure and definition selectors are not repeated as editable form fields. Existing metadata survives edits. Production totals and shifts are editable independently; effective runtime is derived from runtime minus Rate Loss. Update `RealData.html` and `RealDataPanel.html` together for this interface revision.

## Immediate comparison of simple observations

The simple Real Data editor now compares its 15 displayed fields directly, without the definition selectors removed from the form. Existing manually entered values are used on the next render; no re-entry is required. Differences refresh after every edit. The screen and HTML report omit the Basis column; explanations remain in warnings, row tooltips and JSON evidence.

The default simple reporting contract is explicit:

- AU uses effective simulated time divided by plant available time. Effective simulated time uses the nominal reference stored with the result (saved OEE × simulated horizon), not a new measured standard speed inferred from observed production.
- UPDT is non-running line time divided by production available time. Line downtime = production available minus positive-flow runtime at final output. Calendar stops are excluded once.
- Rate Loss = output runtime minus effective simulated time. Negative or missing results remain unavailable.
- Production uses base bottle/native units and the existing packing configuration for case conversion. Both reported case and unit totals are preserved.
- Shift counts use saved per-shift results and the selected-round mean; differing shift counts do not get fabricated by dividing daily production.
- The equipment downtime table is always rendered for all configured equipment, including rows without an entered observation. Its default downtime = equipment exposure minus time with positive output, which includes starving, blocking and planned stops. It is not a sum of overlapping state counters. Records already classified as failures or microstops keep that narrower interpretation.

The default downtime comparison is descriptive. The source's equipment downtime may have a different scope; the definition above is shown in a warning. AU/UPDT discrepancies between source percentages and source time arithmetic are flagged without discarding the reported percentage. Equipment times are never summed to manufacture line downtime.

Missing detail disables only the affected differences. Different reporting periods, different known packing factors and genuinely stale simulation inputs still suppress incompatible comparisons. Averaged running times and equipment downtime use all selected saved rounds, including legacy statistics-only batches when that detail is available. Old results lacking running-time detail require a new run for those specific metrics.

For this revision update `RealData.html`, `RealDataPanel.html` and `RealDataStyles.html` together. Tests cover numeric differences without hidden selectors, mean/round selection, live edits, missing detail, stale/period guards, shift mismatches, and the always-visible equipment table.
