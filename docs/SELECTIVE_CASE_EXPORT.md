# Case export and scenario result cleanup

## Export a case

Use **Settings → Case → Export case (JSON)**, or the export icon in the Case Gallery. Both open the same dialog.

Choose a preset or adjust the selections directly:

| Preset | Contents |
|---|---|
| Complete | All simulations, full results, What-If evaluations, supporting analysis and Gemini conversations. |
| Current simulation | Full information for the active simulation only. |
| Configuration only | All simulation inputs and scenario configuration; no calculated results, evaluations, supporting analysis or conversations. |
| For review | All simulation inputs, result summaries and What-If evaluations; supporting analysis and conversations omitted by default. |

Each simulation has its own inclusion checkbox, results selector, supporting-analysis checkbox, conversation checkbox and individual What-If evaluation checkboxes. Equipment, run settings, calendar and events remain included for each selected simulation. At least one simulation is required.

The preview reports the number of selected simulations, results and evaluations, plus the size of the JSON that will be downloaded. The dialog heading uses the shared progress indicator while preparing the preview and download. A selected result summary includes aggregates and a final snapshot so that Results remains available after import; it omits chart history and individual replication records, and playback is disabled.

Exports operate on a copy. Omitting a simulation or result does not delete it from the open case. When the active simulation is omitted, the first exported simulation becomes active in the exported copy, and the case-level equipment reflects that simulation. Omitting some evaluations also removes shared measurement and discovery caches that could otherwise retain candidate data from omitted evaluations.

## Clear a scenario result

Use the trash icon in a What-If card to remove its generated evaluation, metrics, DOE evidence and prior result snapshots. The card remains available for recalculation. Search settings and selected controls are retained separately; results from other cards and simulations already created from the scenario are preserved.

**Undo** restores the removed card results while the card remains open and no new evaluation or configuration change has replaced the cleared state. The deletion follows the existing case save/autosave behavior. The action is unavailable during an active scenario calculation.

Supporting analyses shared by multiple cards are managed separately through export selections; clearing a card does not delete other cards' evidence.

## Validation

Focused checks cover default complete exports, selective simulation and evaluation exports, independent omission of results and conversations, empty-selection feedback, dialog progress cleanup, preservation of source data, and scenario deletion/undo/reopening. The Settings and Gallery export flows are checked in the interface harness, including Basic and Advance calendar drafts.

The wider regression run is not fully green on the existing baseline: the modular assembly test expects 33 script blocks while `main` already renders 36; the compact-history test expects all events removed while the baseline retains 100 in its fixture; a legacy autosave UI assertion also fails on unchanged `main`. These were reproduced in a detached baseline checkout. No simulation-engine changes are included in this feature.
