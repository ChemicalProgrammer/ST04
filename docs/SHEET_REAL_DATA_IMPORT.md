# Importing production observations from the equipment worksheet

Implemented 2026-10-23. Equipment configuration remains `plant-sheet-v1` / `plant-sheet-v2`. The optional observation block is identified by `R1 = st-real-sheet-v1`. Export to Google Sheets creates a new spreadsheet containing the current equipment configuration plus blank observation inputs; it does not invent measured values or copy simulated results into those inputs.

## Fill the exported sheet

C1:C7 retain the existing case metadata. Equipment headers remain in row 9 and equipment starts in row 10. Yellow cells are observation inputs. Blank or NA means unknown; enter 0 only for an observed zero.

| Row | F — period and production | J — line times | N — reported indicators and reference |
|---|---|---|---|
| 1 | Period start, ISO date/time | Total Time | AU (%) |
| 2 | Period end, ISO date/time | Business External Time | UPDT (%) |
| 3 | Shift 1 production | Plant Available Time | UPDT time |
| 4 | Shift 2 production | Plant Decision Time | Effective Runtime |
| 5 | Shift 3 production | Production Available Time | Rate Loss |
| 6 | Total production | Downtime | Standard rate (bottles/min) |
| 7 | Output basis: GOOD / GROSS / UNCONFIRMED | Run Time | Quality (%) |

Labels are in E/I/M; units are in G/K/O. Line times default to min; s/min/h are accepted and converted to seconds. Production defaults to cases. If R2 is changed, also update G3:G6 to the same unit (BOTTLES, CASES, or COUNT for UNITS). Bottles per case comes from C5. Total production is retained independently; it is never replaced automatically by the shift sum. Shift counts are optional, including for periods longer than a day.

Enter percentage points in N1/N2/N7: `57.4` means 57.4%. Native percentage-formatted cells are also supported: `57.4%` is stored by Sheets as 0.574 and imported as 57.4. Standard rate is a positive value in bottles/min, not average observed throughput.

Dates can be `YYYY-MM-DD`, or ISO timestamps with an explicit offset for exact periods, e.g. `2026-10-23T06:00:00-06:00`. End is exclusive. Prefer offset timestamps for shift boundaries. The metadata date C6 is used if period start is absent. Unknown period/duration stays unknown; start/end do not silently replace Total Time.

| Cell | Purpose / allowed values |
|---|---|
| R1 | Keep `st-real-sheet-v1`; marker enables the optional block. |
| R2 | Production unit: CASES / BOTTLES / UNITS. |
| R3 | AEM basis: UNCONFIRMED / CALENDAR_OUTPUT_FLOW. Confirm only when calendar definitions and runtime as positive flow at final output match. |
| R4 | UPDT definition: UNCONFIRMED / AEM_UNPLANNED / TOTAL_EQUIVALENT_LOSS. |
| R5 | UPDT percentage denominator: UNCONFIRMED / TOTAL / PLANT / PRODUCTION. |
| R6 | Legacy line-time basis: UNCONFIRMED / OUTPUT_FLOW. This separate selector retains the prior comparison contract. |
| V1 | Observation name. |
| V2 | Source / reference, combined with spreadsheet provenance. |
| V3 | Notes. |

R3:R6 default to UNCONFIRMED. Dropdowns and cell notes explain their allowed values. U:W also contains a short guide. Filling a percentage alone does not establish its denominator.

## Equipment observations

| Column, from row 10 | Field |
|---|---|
| Z | Observed downtime (min). |
| AA | Observed stop count, integer. |
| AB | Stop class: UNKNOWN / FAILURES / MINOR / ALL. |
| AC | Observed equipment exposure (min). Required for comparable failure/microstop durations; not inferred from line duration. |
| AD | Equipment observation notes. |
| AE | Exported stable equipment ID; keep it when returning observations to the same equipment. |

Observation fields are separate from configured MTBF/MTTR in D/E. Do not add equipment downtimes to calculate line downtime: events can overlap, and buffers may preserve output.

## Preview and apply

1. Export the equipment spreadsheet, then fill only the observation cells you know.
2. Open Import Sheet, paste the link and read Preview.
3. Review the **Real Data observation** block, including source cells, values, units and equipment mapping.
4. Select **Import only Real Data** to clear configuration/metadata selections and disable the packing proposal. Alternatively select the observation checkbox together with the configuration fields you want to apply.
5. Choose **Create a new observation**, or explicitly choose an existing observation to update. Append is the default; updates replace that observation rather than merging unknown cells with old values.
6. Review the target of every equipment observation. Stable IDs take precedence; unresolved rows require an explicit target or Skip observation. New equipment can be targeted only when that row is actually added. Duplicate observation targets are rejected.
7. Acknowledge the review and Apply. Open Real Data, then save the case using its normal save flow.

Importing only an observation retains physical parameters, event programs and saved simulation results. Configuration changes retain the previous invalidation behavior. Existing source sheets without the marker are read as before. Optional observation errors do not block unrelated equipment imports while observations are unchecked. A blank exported block does not create an observation.

Observations belong to case metadata and can be reused against different simulations. Limits remain 100 records / 512 KB per case, with at most 300 equipment observations per record. No raw names or row numbers are used as permanent equipment identity.

## Real Data comparison

The observation preserves period, three optional shift counts, production basis, reported AU/UPDT, line times and equipment downtime. Additional AEM times are stored in `aem.businessExternalDowntimeSeconds`, `aem.plantAvailableSeconds`, `aem.plantDecisionDowntimeSeconds`, `aem.productionAvailableSeconds`, with `aem.basis`. New fields also survive JSON import/export and appear in the complete template.

The comparison and printable report show the source value, simulation, difference, and a **Recalculated real** column. AEM adds AE, AU, OE and RE plus defined UPDT in minutes and percent. Reported AU is not matched automatically to saved OEE. Source percentage disagreements, time-hierarchy inconsistencies, period mismatches and missing definitions disable the affected AEM differences and leave the evidence visible.

- AEM unplanned downtime is Production Available Time minus Runtime.
- Total equivalent loss is Total Time minus Effective Runtime. It is not unplanned downtime.
- Gross production requires 100% declared quality for an automatic AEM comparison in this implementation, because the current comparison assumes no rejects. Good output can be compared with that explicit simulation assumption.
- Effective simulated time uses the observation's confirmed standard rate. No observed calendar exclusions are injected into simulated results.
- With no active calendar, the simulator treats its entire horizon as available. With a calendar, AEM requires the complete scheduled horizon and its saved audit; aggregate calendar projections are not silently paired.
- Failure downtime compares with simulated failure seconds; minor-stop downtime compares with simulated microstop seconds. ALL / UNKNOWN classes remain visible without inventing an aggregate downtime definition. Counts still require the FAILURES class to match simulated failure counts.
- Saved rounds contribute to mean production, output runtime and equipment durations; the representative round does not replace the mean.

See [AEM reference](ASSET_EFFECTIVENESS_MODEL.md) and [Real Data contract](REAL_DATA_COMPARISON.md).

## Deployment and validation

Update together: `SheetImportService.gs`, `SheetExportService.gs`, `SheetImport.html`, `SheetImportMerge.html`, `ClientCases.html`, `RealData.html`, and `RealDataStyles.html`. No engine rebuild or physics changes are required. The importer contract is `sheet-import-20261023-1`; mixed old/new deployments are rejected before applying.

Targeted tests cover exported-sheet → Preview round trips, native percentages and time units, zeros versus unknowns, legacy layouts, mappings and duplicate targets, append/update, optional errors, browser import-only behavior, preservation of saved results/events, and AEM definitions. Apps Script spreadsheet creation still requires authorization and verification in the deployed Google environment.
