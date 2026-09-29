# Background autosave

The editor holds the working draft in memory. A separate temporary Drive file is unnecessary: it would add writes and introduce another copy to reconcile.

## Save policy

- Ordinary edits save after 1.5 seconds without another edit.
- Continuous edits trigger a save after at most 10 seconds from the first pending edit, provided no previous request is in flight and the draft is valid. Browser timer throttling can delay background-tab timers.
- Only one save request is in flight. Later edits remain in the editor and are coalesced into the next revision. Successful responses update revision metadata, never replace newer editor values.
- Structural operations that already request immediate saves keep that behavior.
- Existing flush points (case navigation, operations requiring persisted inputs, and sign-out) wait for all pending revisions. A flush also drains edits arriving while its request is in flight.
- Opening an unchanged case does not start a periodic save or write an empty revision.
- Timing is centralized in `Autosave.html`: `idleMs` and `maxWaitMs` defaults.

## Failures and lifecycle

Validation failures retain the draft until corrected. Network failures retain the draft and expose Retry; returning online triggers the existing retry path. Revision conflicts require explicit resolution and are never overwritten automatically. Requests remain protected by the server's revision checks.

Resetting an editing session invalidates old callbacks and rejects outstanding flush promises rather than reporting a discarded draft as saved. The browser close warning remains active while changes are pending. A memory draft is not crash recovery: an abrupt browser or device failure can lose changes that have not reached Drive. No API keys or case data are added to local storage by this feature.

## Verification

Autosave tests cover idle coalescing, continuous editing deadlines, one request at a time, revision advancement, edits during an in-flight write, explicit flush, failed saves, conflict handling, and stale callbacks after reset. Timing tests use a controlled clock.
