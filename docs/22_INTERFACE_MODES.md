# Interface modes

The deployment opens in **Basic** unless its Apps Script Script Property
`ST_UI_MODE` is set to `ADVANCE` (the alias `ADVANCED` is accepted).
Set this in **Project Settings → Script properties** and reload the app.
An absent, blank, or unrecognized value selects Basic. There is no mode
switch in Settings, browser storage, or the case JSON.

Basic uses the existing controls and persistence pipeline:

- The case sidebar and Gemini overlay are hidden. Equipment, Conveyors,
  Simulation, V-Graph, and What-If appear in the top navigation.
- Equipment fields remain inside each machine card. Conveyor selection uses
  the existing inspector in an always-open right column, without a collapse
  button or resize grip. On narrow screens the column follows the list.
- V-Graph displays the input speed profile, including before a run, with its
  legend and without result tables.
- Explanatory notes and advisories are hidden. Blocking errors, save status,
  and import validation remain available so failed actions are visible.
- A top simulation selector and utility buttons preserve access to existing
  simulations, Settings, closing the case, and signing out.

Advance uses the existing sidebar, inspector, Gemini, tables, and notes.
This setting changes presentation only; it does not change the engine or
hide capabilities as an access-control measure.

## Removing Basic

The adapter is isolated in `BasicMode.html` and `BasicModeStyles.html`.
Remove their two includes from `WebApp.html`, the optional `STBasicMode`
hooks in `Shell.html`, `Client.html`, and `EquipmentInspector.html`, then
remove the adapter files. `InterfaceMode.gs` and the `uiMode` bootstrap field
can also be removed. The engine and saved case format need no migration.

The adapter moves the original field nodes; it does not clone inputs or
maintain a second draft. Its styling is scoped under `data-ui-mode=basic`.
