# Case catalog and incremental loading

The start page formerly opened every `.case.json` to extract its name, equipment
count and timestamps. A case's results and replay were parsed even when it was
never opened. `CaseIndex.gs` now maintains a small derived catalog in the existing
`SimulatorTemplate Cases` folder: `cases-index-<encoded-user-email>.json`.

## Loading

- Bootstrap reads the user catalog only. It never opens complete case files.
- The browser paints the saved list, then calls `refreshCaseCatalog` in the
  background. Search, sorting, pagination and opening a listed case remain usable.
- Reconciliation enumerates Drive file metadata and compares file IDs and modified
  timestamps. Unchanged indexed cases require no JSON reads.
- New or changed cases are read in batches of at most eight files, with a four
  second target per batch, followed by a short browser yield. A single Drive read
  cannot be interrupted, so the target is not a hard request timeout.
- Each response contains summary records only. `getCase` loads the full JSON when
  the user opens that case; other cases' results are not prefetched into the browser.
- An absent or corrupt index is rebuilt progressively. On the first load the list
  fills in as batches finish. Later loads show the stored list immediately.

`ST_CASE_INDEX_LIMITS` controls the server batch size and time target. The refresh
icon restarts reconciliation, including files changed manually outside the app.
A failed refresh leaves already listed cases available and permits retry. Switching
folders, signing out or starting a newer catalog request invalidates old callbacks.
Local saves and clones created during scanning survive a late, older response.

## Consistency and access

The existing case JSON remains authoritative. The catalog is not a replacement for
ownership checks or revision checks. Its owner is verified; scan entries must be
owned by the current user and match the case file's name. Deleted or moved files
are omitted, and a stale file ID is not used to load a file outside the case folder.
Each workspace and user has its own index. There is no browser cache of private
case data beyond the existing in-memory workspace.

Create, save, delete and scenario creation update the catalog under the case write
lock. Catalog refresh uses the same lock and preserves its scan checkpoint during
other writes. If a case write succeeds and the catalog write fails, the case save
still returns success. Reconciliation can repair the catalog from the case's Drive
modification timestamp. No existing case files are migrated, deleted or rewritten
by catalog building.

## Possible next storage version

A folder per case, a small `case.json` for general data/default configuration and
one JSON per simulation could reduce opening and saving large multi-simulation
cases. That is a separate change to the persistence contract. It requires lazy
simulation fetching, careful handling of comparison and Gemini context, migration
of existing cases, and a committed manifest/revision so a failed multi-file save
cannot expose a mixture of old and new simulations. The current change addresses
start-page loading without requiring that migration or changing case exports.
