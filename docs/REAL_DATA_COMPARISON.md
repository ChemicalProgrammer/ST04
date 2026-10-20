# Real data and simulation comparison

The **Real data** section follows Results in Basic and Advance. Observations belong to the case, so the same production day can be compared with different simulations without duplicating measurements. Enter real values manually, import a JSON file, or download the template. Records are stored in `metadata.realData`, using the existing case Save / autosave mechanism. Observations never change physical inputs or clear simulation results.

**Settings > Simulation > Sections > Show Real data** controls visibility per case in Basic and Advance. It is on by default. Hiding the section retains observations and simulation results; if the section is open, navigation returns to Results or Simulation. The choice is retained through the existing case Save / autosave mechanism.

## First comparison

1. Open a case and choose **Real data**.
2. Select **New observation** or **Import JSON**. Imports append records and assign fresh IDs; existing observations remain.
3. Enter the production date, source, data status, full observation duration and production at the final output boundary.
4. Select bottles, cases or native units. Enter bottles per case when conversion is required. Confirm whether the plant count is gross or good output; the current simulation assumes no rejects.
5. If comparing efficiency, enter a confirmed ideal reference speed in bottles/min. AU and simulated OEE are not assumed to share a definition.
6. Select the simulation in the header. Comparisons default to the average of all saved rounds; representative and individual rounds are available.
7. Save case changes. **Export JSON** includes observations, comparisons, warnings, batch variability and the saved input signature. **Export report** downloads a standalone HTML report; use the browser's Print / Save as PDF command for a PDF.

## Rules

- Unknown values are `null`, never zero. For a real zero baseline, absolute differences remain available and relative percentages are undefined.
- Difference is simulated minus real. Efficiency differences are percentage points.
- Production totals and common-reference efficiency require equal durations. Throughput is calculated over each record's full period; differing periods are flagged.
- Known packing-factor mismatches prevent total-production and efficiency deltas. Confirm the product, format, calendar, quality and output boundary as well; matching durations alone does not establish comparability.
- Average results are calculated from saved replication rows, avoiding first-round top-level summaries. The evidence shows sample count, standard deviation and range. A representative round does not replace the mean.
- Provisional / interrupted batches are excluded. If a saved input signature differs from the current configuration, deltas are disabled until rerunning.
- Line downtime, run time, UPDT and equivalent rate losses are retained as real observations. They are not compared with sums of equipment time, which may overlap and exceed the line's elapsed time.
- Equipment stop counts and failure duration are compared only when exposure equals the simulation period and the stop class is explicitly **Failures / repairs**. Minor stops and all stops are not silently relabeled as failures. MTBF / MTTR columns refer to configured inputs, not achieved simulation estimates.
- This is descriptive evidence, not an automatic validation verdict. A small gap for one day does not validate future predictions.

## JSON contract

Use `{ "schema": "st-real-data-v1", "records": [...] }`, a record array, a single record with `durationSeconds`, or an exported `st-real-comparison-v1` report. The archived Spanish Caso C transcription created on 20 October 2026 is also supported: production and time values are mapped, the full source JSON is retained in `sourceSnapshot`, and unconfirmed speed units / unidentified equipment are not inferred.

Record fields: `id`, `name`, `date` (YYYY-MM-DD or empty), `source`, `notes`, `status` (MEASURED / DERIVED / ESTIMATED / PENDING), `production`, `productionUnit` (BOTTLES / CASES / UNITS), `bottlesPerCase`, `referenceSpeedBpm`, `reportedEfficiencyPercent`, `qualityPercent`, `durationSeconds`, `downtimeSeconds`, `runTimeSeconds`, `effectiveRuntimeSeconds`, `updtSeconds`, `rateLossSeconds`, and `equipment`.

Equipment observations use `equipmentId`, optional `name`, `stopClass` (UNKNOWN / FAILURES / MINOR / ALL), `exposureSeconds`, `failureCount`, `failureSeconds`, `mtbfMinutes`, and `mttrMinutes`, plus free-text `notes`. Missing equipment IDs are not automatically mapped by name.

All stored time fields ending in Seconds are seconds. The UI's seconds / minutes / hours selector converts their presentation without modifying duration. MTBF / MTTR remain in minutes. JSON files are limited to 2 MB; a case holds up to 100 observations and 512 KB of real-data records. Export reports contain the selected record and comparison, not an account API key or replay traces.

## Complete template

The Template button includes every supported record and equipment field. It populates equipment IDs and names from the active simulation, including conveyors, and leaves unknown measurements as null. `_guide` documents all fields, units, valid enumeration values, an equipment catalog and a synthetic observation example. Only `records` is imported; guide examples are never treated as measurements. Duplicate a record for another period. Duplicate equipment IDs within one observation are rejected. Equipment-specific notes can be entered in the UI; observations for unmatched IDs remain editable and are marked as not in the simulation.

A generic example is available at [examples/real-data-template.json](../examples/real-data-template.json). Replace placeholder IDs before using that file; the in-app template already supplies the selected simulation’s IDs. These entries describe real observations; physical equipment configuration continues to use Line Setup / Import JSON.
