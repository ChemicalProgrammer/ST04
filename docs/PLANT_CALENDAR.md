# Plant calendar

Settings → Simulation stores `dynamicConfig.plantCalendar` per simulation. Save and complete-case JSON retain it. Disabling participation preserves values. Calendar fields remain in three columns, with one column on narrow screens.

## Aggregate mode

Plant available = total − business external. Plant decision = sum of the eight exclusions. Production available = plant available − plant decision. Results projects effective minutes as production available × mean operating effectiveness, and asset utilization over plant available time. The physical run duration and output are unchanged.

## Scheduled line stops (ST engine)

Seven physical categories can stop the entire line: changeover, cleaning and sanitization, autonomous maintenance, planned maintenance, breaks, meetings/training, and experimentation. Business external time and CO reporting error are accounting exclusions; they do not generate physical stops. CO reporting error is currently a positive exclusion and needs a different contract if the plant uses a signed correction.

The full physical horizon is `(total − business external − CO reporting error) × 60` seconds. Each positive category has a visible event count (default 1); its total minutes are divided equally between its events. No count is inferred from aggregate plant data.

- **Evenly spaced:** deterministic, interleaved categories with operating gaps between all events.
- **Defined start and interval:** a first start and, for repeated events, a start-to-start interval in minutes from physical horizon minute 0.
- **Restart:** cancels the current startup profile and applies configured equipment startup delays and ramps when the stop ends.
- **Resume:** retains startup progress and resumes without triggering a new startup profile.

Both policies retain conveyor inventory; no drain, purge, product-format switch or loss of product is fabricated. Manual control commands remain authoritative: an equipment STOP or emergency stop is not automatically cleared when the planned window ends. Existing failures may be repaired during a calendar stop; new failure occurrence clocks are suspended while stopped. Shift boundaries do not create stop events.

Times are aligned to simulation ticks. Invalid counts, sub-tick durations, overlapping windows, windows beyond the calendar and totals leaving no operating time are rejected. Limits: 1,000 events per category, 5,000 overall. The experimental DES engine reports an explicit unsupported-mode error rather than silently ignoring the calendar.

**Use full calendar duration** selects fixed duration and sets it to the physical horizon rounded up to the next quarter-second. It also raises the display sample interval as needed to keep about 10,000 frames; it does not change the physics tick. A long period still requires a long calculation. A manually shorter or longer run only executes calendar events reached on its own clock; monthly effective-time and AU metrics are suppressed unless it covers exactly the full horizon (one tick tolerance).

## Results and accounting

The engine records `PLANT_STOP_STARTED`/`PLANT_STOP_ENDED`, per-equipment `plannedStopSeconds`, and a result-level `plantCalendar` audit with planned windows and **unique line stop time**, not the sum across equipment. Audit metadata survives saved replays and complete-case JSON; Results HTML/PDF renders it.

Scheduled output already includes planned stops and restart losses. Effective minutes use full simulated horizon × mean OEE. AU divides that equivalent time by plant available time. No extra production-available multiplier is applied. Do not compare raw scheduled-run OEE with aggregate-mode operating OEE without checking their denominators.

A calendar change affecting physical events invalidates stored results. Worker runs, replications, failure-free diagnostics and What-If inputs retain the calendar and its absolute timings. Bounded What-If screens may cover only a prefix; final confirmation uses at least the configured horizon. No random schedules or per-equipment calendar scopes are included in this first stage. Actual plant comparisons remain external.

## Manual deployment

Update PlantCalendar.html, Settings.html, ClientCore.html, ClientSimulation.html, SimulationStyles.html, Results.html, Reports.html, SimulationEngine.html and ScenarioEngine.gs. Both generated engine files must be updated together.
