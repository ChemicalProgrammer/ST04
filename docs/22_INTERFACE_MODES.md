# Interface modes

The deployment opens in **Basic** unless its Apps Script Script Property
`ST_UI_MODE` is set to `ADVANCE` (the alias `ADVANCED` is accepted).
Set this in **Project Settings → Script properties** and reload the app.
An absent, blank, or unrecognized value selects Basic. There is no mode
switch in Settings, browser storage, or the case JSON.

Basic uses the existing controls and persistence pipeline:

- The case sidebar and Gemini overlay are hidden. Equipment, Conveyors,
  Simulation, V-Graph, and What-If appear in the top navigation.
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
- A top simulation selector and utility buttons preserve access to existing
  simulations, Settings, closing the case, and signing out.

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

## Removing Basic

The adapter is isolated in `BasicMode.html` and `BasicModeStyles.html`.
Remove their two includes from `WebApp.html`, the optional `STBasicMode`
hooks in `Shell.html`, `Client.html`, and `EquipmentInspector.html`, then
remove the adapter files. `InterfaceMode.gs` and the `uiMode` bootstrap field
can also be removed. The engine and saved case format need no migration.

The adapter moves the original field nodes; it does not clone inputs or
maintain a second draft. Its styling is scoped under `data-ui-mode=basic`.
