# Shifts, replications and report layouts

Select **Consecutive shifts** in Simulation. Each shift lasts 0.25–24 hours in quarter-hour increments; the default is eight hours. Choose 1–3 shifts and 1–50 rounds. Fixed duration remains available. Shift boundaries do not reset inventory, controls, failures or random streams. Breaks and shift-specific staffing are not implied; use scheduled commands where needed.

Each round starts from the same configuration and initial conditions with seed `(baseSeed + roundIndex) >>> 0`. A cloned simulation preserves the configuration. The async runner uses the same tick operations and 0.25-second integration step, yields every 1,000 ticks and supports cancellation. An incomplete batch is not published as a successful result. There is no warm-up exclusion.

Results include mean, sample standard deviation, minimum and maximum for numeric line and equipment metrics, plus line production, throughput, OEE and loss totals for each round/shift. A one-round standard deviation is unavailable. These describe model variability, not empirical plant validation. MTBF and MTTR are unchanged. Equipment losses can overlap across machines.

The first round retains up to 121 replay frames and at most 2,000 event entries; omitted-event counts are explicit. Other rounds retain metrics only. The saved batch is stored once, outside replay, and restored when reopening. Standard charts, equipment details, What-If proposals and the existing comparison use round 1, explicitly labeled; batch statistics and seeds are compared separately. Live equipment commands on batch replay are disabled: edit scheduled commands and rerun the batch to keep every round consistent. AI exports and Gemini receive batch statistics, not all raw repetitions.

A 13-equipment demo spanning three eight-hour shifts took approximately 15 seconds for one round in the development Node environment before the final replay reduction. This is not a browser performance guarantee. Runtime scales with duration, equipment count and rounds; use small batches first. The final replay target is 120 intervals rather than 600.

## Report layout files

- `apps-script/ReportTemplates.html`: document cover, footer and table structure.
- `apps-script/ReportResultsTemplate.html`: overview, replication summary, charts, equipment and zones.
- `apps-script/ReportWhatifTemplate.html`: scenario proposals and design checks.
- `apps-script/ReportConfigurationTemplate.html`: metadata, settings, equipment and complete configuration JSON.
- `apps-script/ReportStyles.html`: report typography, spacing, palettes and print rules.
- `apps-script/Reports.html`: data formatting, escaping and populating the named HTML slots.

Keep `data-report` slot names when rearranging templates. Labels use `data-report-text` resource keys. HTML/PDF snapshot the resolved light/dark theme and primary accent at export time; they need no external fonts or styles. PDF uses the browser print dialog. Enable background graphics in print settings to preserve theme fills.

The equipment inspector remembers its own width, independent of Gemini chat, defaults to 760px where space permits, and distributes fields into one, two or three columns. Its minimum field width is a design token, `--equipment-field-width`.
