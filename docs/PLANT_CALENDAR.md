# Plant calendar

Settings → Simulation stores `dynamicConfig.plantCalendar` per simulation in the case draft. Save and complete-case JSON exports preserve it. The section contains ten calendar inputs in three columns (one on narrow screens), all in minutes. The checkbox **Consider plant calendar in simulation** enables or disables their use without deleting entered values. Fields are disabled while participation is off or the simulation is running.

- Plant available = total − business external.
- Plant decision = sum of the eight exclusion categories.
- Production available = plant available − plant decision.

CO reporting error currently counts as a positive, mutually exclusive calendar exclusion. If the plant uses a signed correction, clarify that reporting rule before entering the value. Missing categories count as zero. Invalid negative or contradictory totals show errors and suppress projected results.

This is aggregate calendar accounting, not an event scheduler. It does not change run duration or generate shift stop/start commands. When enabled, Results and Results HTML/PDF include projected effective minutes (production available × mean operating effectiveness) and asset utilization over plant available time. When disabled, no calendar-derived metrics appear. Projections assume representative conditions, the same nominal reference and 100% quality.

Actual reference inputs and actual-versus-simulation comparison have been removed. Any older saved reference keys are ignored. Plant comparisons are performed externally. Scheduled events, repeated changeovers, product mix and restart behavior are not modeled by these totals.

The supplied exclusion categories total 5,392 min, yielding 36,367 min of production available time. The application preserves these inputs rather than forcing the report's 5,393 total.

Manual deployment for this revision: PlantCalendar.html and UiStandards.html.
