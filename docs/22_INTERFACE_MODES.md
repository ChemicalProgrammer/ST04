# Interface modes

The deployment opens in **Basic** unless its Apps Script Script Property
`ST_UI_MODE` is set to `ADVANCE` (the alias `ADVANCED` is accepted).
Set this in **Project Settings → Script properties** and reload the app.
An absent, blank, or unrecognized value selects Basic. This is the initial default;
`st.ui.v1.interfaceMode` in browser storage can override it without affecting other users.

Open Settings, focus its heading or a button (outside editable fields), then press
**M five times within three seconds**. This reveals Basic/Advance. Holding M does
not unlock it, and typing inside a field does not count. The selection is applied
when Settings closes, after pending settings and case edits are saved. The selector
is hidden and its activation counter reset on every close/reopen. No reload is
needed. Browser storage failure leaves Settings open with a visible error. Remove
`st.ui.v1.interfaceMode` to use the deployment default again. This is a presentation
preference, not authorization or an administrator privilege.

Basic uses the existing controls and persistence pipeline:

- The case sidebar is hidden. Equipment, Conveyors,
  Simulation, V-Graph, and What-If appear in the top navigation. Results appears only after the active simulation completes.
- The header displays the case title. A shared toolbar groups the simulation
  selector, Rename, Clone and Delete in Basic, with consistent icon-and-text
  buttons. Advance uses its sidebar selector and shows only the three actions
  aligned right in the current section heading, without a surrounding frame
  or an additional toolbar row. Case name is editable only in Settings while a case is active.
  Machine cards use
  compact, equal-height inputs and responsive columns. Equipment ID is hidden
  in Basic and read-only in both modes; assigned IDs remain stable. Drag handles
  are hidden on all Basic cards, including conveyors.
- Machine cards retain the name and show only speed, MTBF, MTTR, calculated post-buffer minutes and intrinsic availability by default. Failures are mandatory for Basic machines; MTBF and MTTR must be positive. Equipment fields remain inside each machine card. Per-equipment Units and
  Initial Mode are hidden; Basic uses AUTO when editing/saving or starting a run.
  The old case-wide Units input is removed in both modes, with its stored
  metadata retained for compatibility. Conveyor selection uses
  the existing inspector in an always-open right column, without a collapse
  button or resize grip. On narrow screens the column follows the list.
- V-Graph displays normal line targets and estimated recovery overspeed,
  including before a run, with a taller plot and Current (green) / Recommended (magenta) legend. Results has its own section.
- Explanatory notes and advisories are hidden. Blocking errors, save status,
  and import validation remain available so failed actions are visible.
- Header utility buttons preserve access to Settings, closing the case,
  and signing out. The Gemini button is aligned to the right of the section navigation,
  outside the navigation itself, in every section. It opens the same resizable right
  panel as Advance, while keeping the Basic conveyor inspector visible. The simulation toolbar stays available across the six
  Basic sections. Machine cards and the conveyor inspector start at the same
  distance below the import controls.

Advance uses the existing sidebar, inspector, Gemini, tables, and notes.
The physical equations are unchanged. Both modes allow 1–100 replications and the playback speeds 1×, 5×, 10×, 50× and 100×. Basic adds speed, eight-hour shift and round controls above the machines, plus theoretical and simulated efficiencies. The Run button appears only in Simulation. The conveyor column has four Input groups (UPSTREAM, DOWNSTREAM, GEOMETRY, Speed & Sensors) and a Results tab with design checks and measured connection losses. Static outputs are available before a run; measured outputs require a current run. Basic initializes equipment automatically;
Advance keeps the Initial Mode selector. Hiding fields is not access control.

Settings includes **Show JSON fields**. Basic defaults to hidden; Advance
defaults to visible. The preference is remembered separately for each mode
in this browser. It hides the equipment JSON sections and the Line Setup JSON
viewer, without affecting Import JSON or exports.

Advance exposes the Pacemaker checkbox; Basic retains the configured role without adding it to the compact card. Selecting it clears other machine
selections and preserves the physical type (Blowmolder, Filler, etc.). Legacy
PACEMAKER types reopen using their recorded machine type, or CUSTOM if that
information is unavailable, while retaining the role.

Basic Settings displays seven accents: amparo blue, bath turquoise, ferntastic,
tinted iris, fugitive flamingo, cadmium orange and astronomicon grey. An accent
outside this selection resets to amparo blue upon entering Basic. Advance Settings
displays all 57 named colors from
[ChemicalApplications/ThemeColors.json](https://github.com/ChemicalProgrammer/ChemicalApplications/blob/main/ThemeColors.json)
in a compact grid. `ThemeResources.html` retains each original name and hex;
light/dark soft backgrounds and text colors are derived for contrast. Existing
accent preferences migrate to the nearest source color. This is a bundled
snapshot, so the app does not fetch the palette at startup. Closing Settings keeps case-name edits in the draft. Case persistence follows
the selected Advance save interval or the manual Save icon in Basic.

The Drive storage folder can be edited in Settings with a case open. Changing
it saves pending automatic edits to the original folder, or offers Save/Discard/Cancel
for a manual draft, and closes that case before
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

Gemini returns actionable validated What-If scenarios in Advance. Basic requests descriptive improvements and hides scenario creation cards. Proposals bind exact stored before values at generation time; creation verifies the original fingerprint instead of replacing it with a newer server fingerprint.

Basic shows only Speed, MTBF, MTTR, calculated Buffer post and Avail in machine cards. Simulation cards omit equipment command controls and use the space for the speed chart. The advanced run configuration is hidden entirely in Basic because its visible choices have moved into the Basic speed/shift/round groups. Playback Play/Pause/Reset remains available for the whole simulation. V-Graph labels and legends use larger Basic-only text.

Gemini requests carry the effective browser mode. The server uses that valid mode for text-only Basic responses or actionable Advance proposals, falling back to the deployment default for older clients. Basic conveyor speed is an independent m/min input, stored as manual mm/s. Existing moving-gap and Back-up overrides are preserved.
