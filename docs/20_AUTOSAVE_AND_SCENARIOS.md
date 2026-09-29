# Automatic persistence and scenario analysis

The application and new code remain in English. The simulation mathematics in
`src/simulation/` are unchanged. This revision changes persistence, presentation
and the analysis layer.

## Automatic saving

Case edits are queued after a short typing pause (450 ms); discrete actions and
completed runs save immediately. Settings use a 600 ms typing pause. No Save button
is needed. A pending/saving/saved/error indicator reflects the actual server result.
Only one case write is in flight. Its response updates the revision without
replacing newer editor values. Changes made during the request are sent next.

Invalid JSON or incomplete required fields remain in the editor and are not sent.
Closing a case, switching to another case, signing out, or asking Gemini first
flushes valid pending edits. Failed saves retain the local edit and expose Retry.
A conflict never overwrites a newer Drive revision; the recovery action downloads
the local draft before loading the current Drive version. Closing the browser with
pending changes triggers its native unsaved-work warning. Browser shutdown/offline
cannot be guaranteed to save to Drive; no confidential case data is cached locally.

Server writes use a user lock around ownership/revision checks and the write.
Settings storage changes are disabled while a case is open. Appearance preferences
continue to apply immediately. Remembered entry hides the welcome form during
server identity verification; an authorization/network error restores it.

## Management and dialogs

Line setup contains Rename, Clone and Delete simulation. Clones preserve inputs
and seed and clear results. At least one simulation remains per case. Delete case
lives in Settings and moves the case to Drive trash. Routine Reload is removed.
The reusable `STDialog` supports titles, plain-text messages, input, custom actions,
OK/cancel, destructive confirmation, keyboard focus and Escape.

Collapsed navigation remains scrollable by wheel/touch/keyboard but hides its
scrollbars. Playback choices are 0.5, 1, 2, 5, 10, 20 and 50. The old 1.5 default
migrates to 2. Playback changes presentation timing, never the engine timestep.

## CAPEX screening

`src/analysis/ScenarioPlanner.js` contains the shared planner and permitted changes.
It is bundled into the browser and `ScenarioEngine.gs` for server validation.
Each category displays its best supported candidate or explains that evidence is
insufficient. Categories are not guaranteed cost estimates:

| Category | Candidate | Evidence |
|---|---|---|
| Zero CAPEX | Infeed speed factor or sensor debounce derived from geometry | Static |
| Medium CAPEX / OPEX | No supported automatic intervention with the current inputs; shown as insufficient evidence | None |
| High CAPEX | Calculated accumulation/recovery length and Back-up position | Static geometry; hybrid when zone losses exist |

Measured MTBF and MTTR remain fixed inputs to the failure model and are excluded
from both local and Gemini scenario changes. The microstop screening limit is four
minutes; longer repairs are flagged for separate review rather than absorbed by
arbitrary buffer growth. A medium CAPEX intervention needs supported, editable
engineering inputs before the planner can propose one.

The planner checks recovery, overflow reserve, installed Back-up, pulse/gap debounce,
the engine's 5% infeed margin and an upstream MTTR accumulation coverage screen.
High CAPEX length is solved with the existing engineering calculator, not a fixed
multiplier. The 1–2× MTTR coverage check uses the adjacent upstream machine and is
not a complete pacemaker protection calculation. It does not shrink longer buffers
automatically. Turn-loss correction, filled-container diameter, desired-state
control and V-graph certification remain **not evaluated** without the required
inputs/model support. The supplied screenshots are a design brief, not a verified
copy of the full handbook. No handbook compliance, plant calibration, ROI or
numerical improvement is certified by a proposed scenario.

## Gemini context and scenario buttons

The server sends the selected simulation's inputs, current aggregate metrics and
engineering audit, plus compact summaries of other simulations. Raw replay samples,
event logs, import rows and full command schedules are excluded. Context has a
96,000-character budget; history has a separate 16,000-character budget. These are
application budgets, not claims about a model's exact token limit. If equipment or
other simulation summaries must be omitted, coverage counts report it. The panel
also reports excluded history. Prompts and default answers are in English.

Gemini may return structured proposals. The server rejects unknown equipment,
unsupported paths, stale before-values, nonfinite/out-of-range inputs, duplicate
changes, invalid topology and newly failing engineering checks. Accepted proposals
appear as explicit actions in the chat. Clicking a button opens a review confirmation
and creates a separate simulation with the listed changes in one revision-checked
write. The source seed and baseline results are preserved; the new result is empty.
No model output is evaluated as code, and no proposal applies automatically.

Conversation context is bound to the selected simulation and clears on changing
simulation/case or signing out. Every creation requires the current case revision.
For local What-If actions, the server recalculates candidates from the saved source
inside the same write lock used to clone it. The selected kind, tier, equipment,
evidence basis and exact before/after edits must match a currently valid candidate.
Evidence is taken from that recalculation. Local actions do not depend on a
browser/server fingerprint comparison. Gemini proposals retain the additional
source fingerprint check. A rerun and Compare are required to quantify the effect.
The API key remains server-side in UserProperties.

## Verification and deployment

Node tests cover write ordering, failure/conflict recovery, model guardrails,
atomic scenario persistence, large replay context reduction and UI workflows.
Google Drive permissions, native browser behavior and real Gemini API responses
still require a deployed-app check with the authorized account. No real plant data
or API credentials are used in automated tests.

Regenerate using `npm run build:apps-script`. For the existing manual deployment,
replace `apps-script/Code.gs` and `apps-script/Index.html` together and update the
Apps Script deployment. Keep the manifest. Do not combine the generated server
bundle with modular `.gs` files. Publishing GitHub changes does not deploy Apps Script.
Scenario RPC failures include a version marker and error code, for example
`[whatif-20260925-3 / SCENARIO_REVIEW_REQUIRED]`, to identify the responding code
without exposing case inputs or credentials. The `/s/` portion of an Apps Script
URL alone does not identify whether the URL ends in `/dev` or `/exec`.

## Workspace presentation and Gemini feedback

Opening a saved case and navigating its views are read-only. Only explicit edits
queue autosave. Playback speed is stored as `simulation.playbackRate`; it is no
longer a Settings control and does not alter simulation mathematics.

Change the brand initials in `TextResources.gs` at `brand.initials`. The brand
background uses the selected accent. CAPEX badges use theme-aware semantic tokens
`--capex-zero`, `--capex-medium` and `--capex-high` (and matching background tokens).
The V-Graph uses its actual container width and a token-controlled height, keeping
labels at the configured font size on wide screens.

Gemini feedback lists saved-case preparation, waiting for the response and server
validation, and completion. The elapsed counter measures request time; these are
application lifecycle states, not model reasoning or estimated internal progress.
The parser accepts a response envelope, a standalone scenario object or an array
of scenarios; all proposals still undergo server validation before getting a
Create scenario button. Malformed/truncated scenario JSON produces a readable
error instead of raw JSON. An unsupported proposal does not get an action button.
