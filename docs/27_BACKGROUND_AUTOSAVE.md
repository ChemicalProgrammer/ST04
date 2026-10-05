# Case saving

The editor holds the working draft in memory. A separate temporary Drive file is unnecessary: it would add writes and introduce another copy to reconcile.

## Save policy

Basic always uses manual case saving. Advance Settings exposes an Autosave checkbox and an interval in seconds (1–3600; default 10). The preference is browser-local and retained when switching modes; it never enables automatic saving in Basic.

When autosave is enabled, the first pending edit starts the selected interval. Further edits are coalesced into that revision without postponing the deadline. Structural edits, completed simulations and What-If evidence follow the same timer. Navigation away from the case and server operations requiring persisted context flush pending automatic saves. Opening an unchanged case does not write a revision.

When autosave is disabled, the header shows an icon-only Save case button with an accessible label and tooltip. Edits, completed simulations, imports and scenario-card evidence stay in memory until Save is clicked. Closing Settings, changing views and reconnecting do not silently save a manual draft. Closing the case or switching storage with a pending manual draft offers Save, Discard or Cancel. Browser close protection remains active while changes are pending. Gemini requests require manual changes to have been saved first. Creating a scenario is an explicit persistence action: after confirmation it saves the source case and the new scenario together with their recorded evidence.

Only one save request is in flight. Later edits remain in the editor and are coalesced into the next revision. Successful responses update revision metadata without replacing newer editor values. Disabling autosave cancels its queued timer; a request already sent may still complete. Case drafts and keys are never placed in browser local storage.

## Failures and lifecycle

Validation and network failures retain the draft. Retry remains explicit in manual mode; returning online can retry automatic saves. Revision conflicts require explicit resolution and are never overwritten automatically. Requests remain protected by the server's revision checks.

Resetting an editing session invalidates old callbacks and rejects outstanding flush promises rather than reporting a discarded draft as saved. A memory draft is not crash recovery: an abrupt browser or device failure can lose changes that have not reached Drive.

## Verification

Controlled-clock tests cover manual saving, configured deadlines during continuous edits, mode changes, cancellation of scheduled timers, one request at a time, revision advancement, explicit flush, failed saves, conflict handling and stale callbacks. Interface tests verify Basic and Advance policies, settings persistence, manual result/evidence saving, unsaved-exit choices, and creation of validated All CAPEX scenarios.
