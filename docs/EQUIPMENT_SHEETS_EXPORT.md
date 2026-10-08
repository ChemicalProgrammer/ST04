# Equipment Google Sheets export

Equipment → Export → Google Sheets creates a new native spreadsheet in the
connected workspace's `SimulatorTemplate Exports` folder. The success dialog
links to the spreadsheet. Export never overwrites the imported source.

The export uses the active simulation's current Equipment editor values,
including edits that have not yet been saved. It does not save or run the case.
The server authenticates the user and checks case ownership before writing.
Existing Drive and Sheets OAuth scopes suffice.

The import contract is reused: metadata in C1:C7, headers in row 9, equipment
in A10:W, in line order. Values are written in one batch. Column C marks the
critical machine with Y/N; optional missing fields use NA; percentage fields
use numeric percentage points, not fractional percentage cell formatting.
Current conveyor settings take precedence over stale imported sensor data.
Disabled reliability exports NA rather than historical MTBF/MTTR.

Column F represents installed maximum BPM, falling back to configured BPM
when no maximum exists. The current importer initializes running speed from F;
therefore this format cannot preserve separate nominal and maximum speeds.
Simulator-only settings (manual conveyor speed, backup location, noise other
than MTBF/MTTR, run configuration, initial modes, etc.) are outside the plant
worksheet contract. Use JSON for the complete simulation configuration.

The new sheet uses the selected primary and secondary colors, readable header
contrast, filters, frozen headers and alternating rows. User strings starting
with `=` are written as literal text. Export validates the importer contract
before creating the file; a failed write attempts to trash only its own new file.

Deploy: add `SheetExportService.gs`; update `Main.gs`, `WebApp.html`, `Client.html`,
`Dialogs.html`, and `TextResources.gs`, then publish a new Apps Script version.
