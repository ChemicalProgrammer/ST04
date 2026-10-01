# Interface modes

The deployment opens in **Basic** unless its Apps Script Script Property
`ST_UI_MODE` is set to `ADVANCE` (the alias `ADVANCED` is accepted).
Set this in **Project Settings → Script properties** and reload the app.
An absent, blank, or unrecognized value selects Basic. There is no mode
switch in Settings, browser storage, or the case JSON.

Basic uses the existing controls and persistence pipeline:

- The case sidebar is hidden. Equipment, Conveyors,
  Simulation, V-Graph, and What-If appear in the top navigation.
- The header displays the case title. A shared toolbar groups the simulation
  selector, Rename, Clone and Delete in Basic, with consistent icon-and-text
  buttons. Advance uses its sidebar selector and shows only the three actions
  aligned right in the current section heading, without a surrounding frame
  or an additional toolbar row. Case name is editable only in Settings while a case is active.
  Machine cards use
  compact, equal-height inputs and responsive columns. Equipment ID is hidden
  in Basic and read-only in both modes; assigned IDs remain stable. Drag handles
  are hidden on all Basic cards, including conveyors.
- Equipment fields remain inside each machine card. Per-equipment Units and
  Initial Mode are hidden; Basic uses AUTO when editing/saving or starting a run.
  The old case-wide Units input is removed in both modes, with its stored
  metadata retained for compatibility. Conveyor selection uses
  the existing inspector in an always-open right column, without a collapse
  button or resize grip. On narrow screens the column follows the list.
- V-Graph displays normal line targets and estimated recovery overspeed,
  including before a run, with its legend and without result tables.
- Explanatory notes and advisories are hidden. Blocking errors, save status,
  and import validation remain available so failed actions are visible.
- Header utility buttons preserve access to Settings, closing the case,
  and signing out. The Gemini button is aligned to the right of the section navigation,
  outside the navigation itself, in every section. It opens the same resizable right
  panel as Advance, while keeping the Basic conveyor inspector visible. The simulation toolbar stays available across the five
  Basic sections. Machine cards and the conveyor inspector start at the same
  distance below the import controls.

Advance uses the existing sidebar, inspector, Gemini, tables, and notes.
The physical engine is unchanged. Basic initializes equipment automatically;
Advance keeps the Initial Mode selector. Hiding fields is not access control.

Settings includes **Show JSON fields**. Basic defaults to hidden; Advance
defaults to visible. The preference is remembered separately for each mode
in this browser. It hides the equipment JSON sections and the Line Setup JSON
viewer, without affecting Import JSON or exports.

Each machine has a Pacemaker checkbox. Selecting it clears other machine
selections and preserves the physical type (Blowmolder, Filler, etc.). Legacy
PACEMAKER types reopen using their recorded machine type, or CUSTOM if that
information is unavailable, while retaining the role.

Settings displays the 57 named colors from
[ChemicalApplications/ThemeColors.json](https://github.com/ChemicalProgrammer/ChemicalApplications/blob/main/ThemeColors.json)
in a compact grid. `ThemeResources.html` retains each original name and hex;
light/dark soft backgrounds and text colors are derived for contrast. Existing
accent preferences migrate to the nearest source color. This is a bundled
snapshot, so the app does not fetch the palette at startup. Closing Settings
flushes a case-name edit through the existing case autosave flow.

The Drive storage folder can be edited in Settings with a case open. Changing
it flushes pending case edits to the original folder and closes that case before
saving the new folder setting. A failed case save prevents the switch. Existing
cases stay in the original folder, and the gallery reloads from the new folder.

## Removing Basic

The adapter is isolated in `BasicMode.html` and `BasicModeStyles.html`.
Remove their two includes from `WebApp.html`, the optional `STBasicMode`
hooks in `Shell.html`, `Client.html`, and `EquipmentInspector.html`, then
remove the adapter files. `InterfaceMode.gs` and the `uiMode` bootstrap field
can also be removed. The engine and saved case format need no migration.

The adapter moves the original field nodes; it does not clone inputs or
maintain a second draft. Its styling is scoped under `data-ui-mode=basic`.
