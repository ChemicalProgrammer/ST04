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

The saved case manifest and its referenced simulation files remain authoritative. The catalog is not a replacement for
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

## Folder storage

Each case now uses `SimulatorTemplate Cases/<case-id>/`:

| File | Contents |
| --- | --- |
| `case.json` | General data, initial equipment/configuration, ownership, revision and simulation file references |
| `simulation-<position>-<version>.json` | One simulation's inputs, results, suggested scenarios and saved search evidence |

The catalog remains in `SimulatorTemplate Cases`, outside individual case folders.
Reconciliation reads only `case.json` for folder cases; simulation blobs are loaded
when opening the case. The existing `getCase` response and exports still contain
complete simulations, so the browser contract does not change.

New cases and clones use folders immediately. Legacy `<id>.case.json` cases remain
readable and listed. Their first successful save, including scenario creation,
migrates them automatically; catalog building does not migrate anything. The old
flat file goes to Drive Trash only after the new manifest commits.

Saving reuses unchanged simulation files. Changed simulations receive new version
filenames before `case.json` commits the full reference list. A failed staging or
manifest write leaves the previous committed version readable. After committing,
obsolete simulation files are moved to Trash as best-effort cleanup. This keeps
multi-file failures from exposing partly updated simulations. Cleanup and catalog
failures do not turn an already committed save into a failure response.

Case deletion, from the gallery or Settings, requires confirmation and moves the
whole case folder to Drive Trash. Legacy cases move their flat file to Trash.
Ownership and revision checks continue to run under the per-user write lock.
