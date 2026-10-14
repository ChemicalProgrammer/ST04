# Plant calendar and actual comparison

Settings → Simulation stores `dynamicConfig.plantCalendar` separately for each simulation, in the normal case draft. Save persists it to the existing cloud case; complete-case JSON exports retain it. Fields use minutes and allow decimals. No plant values are prefilled.

This is an aggregate calendar comparison, not an event scheduler. Eight-hour shifts do not generate stop/start commands. The simulation duration, commands, MTBF/MTTR and physical conveyor behavior are unchanged.

- Plant available = total − business external.
- Plant decision = sum of the eight calendar exclusion categories.
- Production available = plant available − plant decision.
- Actual run time = production available − downtime.
- Actual effective time = explicit effective runtime, otherwise run time − rate loss when both are supplied.
- Actual operating effectiveness = effective / production available.
- Actual asset utilization = effective / plant available.

CO reporting error currently counts as a positive, mutually exclusive calendar exclusion. If the plant uses a signed correction rather than excluded time, its reporting rule must be clarified before using this field. Zero/default blank categories count as no exclusions. UPDT is retained as a reference only; it is not added to Downtime. Invalid negative or contradictory totals stop the comparison and show a message. Conflicting actual effective runtime and calculated effective runtime are flagged, not overwritten.

Results uses mean OEE for batch runs. Simulated effective time is a **period projection**: production available × simulated operating effectiveness. Simulated asset utilization is simulated effectiveness × production available / plant available. This assumes a representative run, the same product/nominal speed reference, and 100% quality. It does not predict the chronological effect of downtime, different products, repeated changeovers or restarts. Equipment downtime sums are not treated as line downtime. Experimental engines without the established quality/reference contract show no projected metrics.

The comparison is also included in Results HTML/PDF exports. Period counts, production weights, SKU mix, quality rejects and scheduled plant events are not implemented in this first step.

For the supplied example, the exclusion categories total 5,392 min, rather than the report's 5,393. The derived production available is therefore 36,367 min; the app deliberately preserves this distinction. Actual effective 21,307 gives 51.02% AU over 41,759 plant-available minutes. UPDT 15,060 exceeds Downtime 10,459 and needs the plant's formula confirmed.

Manual deployment files: PlantCalendar.html (new), WebApp.html, Settings.html, ClientCore.html, ClientSimulation.html, Results.html, Reports.html.
