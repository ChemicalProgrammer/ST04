# Shared interface standards

`UiStandards.html` is included after the layout styles and centralizes the visual
hierarchy for both modes. `BasicModeStyles.html` controls Basic layout and visibility,
without independent font sizes or weights.

| Role | Shared token | Size at 100% |
| --- | --- | --- |
| Page / case name | font-page | 20px |
| Main section / dialog title | font-section | 16px |
| Subsection / card heading | font-card | 14px |
| Text / field label / input | font-body / font-input | 13px |
| Supporting text | font-secondary | 12px |
| Caption | font-caption | 11px |

Advance defaults to 100%; Basic defaults to 110%. Settings offers 80, 90, 100,
110 and 125 percent. Scaling occurs only once at the document root. Choices persist
as `st.ui.v1.fontScale.advance` and `.basic`; existing explicit global preferences
remain a fallback for browsers upgraded from earlier versions.

Views start with subsection headings; the header navigation identifies the main
section. Subsection controls align right. Equipment and Conveyors share one file
menu (Google Sheet / JSON import); Equipment has a separate icon button for JSON export. JSON field actions
use labeled icon buttons. V-Graph uses its speed-profile heading. Main header gaps are 16px;
panel padding is 20px (12px on small screens). Checkboxes remain 16px.

Basic simulation settings use separate efficiency and control boxes with prominent
percentages. Navigation moves the existing controls, preserving listeners and run
locks. Conveyor worksheets grow with their content and use the page scrollbar.

Basic What-If cards show evaluated OEE, throughput and changes from the matching
baseline; Advance retains the detailed comparison table. Both presentations use
the same evaluation, independent validation and creation gate. No ROI or production
estimates are fabricated. Design checks and Results suggestions are Advance-only.
Warning and analysis panels share padding, borders and typography, preserving
severity colors. Accent names remain available through swatch tooltips only.

Verification: modular Apps Script and Settings contracts, targeted jsdom tests for
JSON import isolation, conveyor worksheets, scenario rejection/stop controls,
subsection navigation and mode font scaling. Real-browser visual review is still
needed on the deployed Apps Script page.

Basic CAPEX overview: Current, Zero, Medium, High in a single four-column row.
The current card reads the saved result (batch means when available), has no
calculation actions and displays a dash when no result exists. Narrow containers
scroll horizontally instead of wrapping the four cards. Advance retains its
existing detailed categories, including All CAPEX. File-menu summaries and icon
buttons share dimensions and have no extra bottom margin; subsection headings
share typography, minimum height and spacing.

Basic scenario cards hide technical status/progress paragraphs and show an
indeterminate progress bar only while evaluating or validating. The OEE delta is
labeled in percentage points, not relative percent. Error diagnostics remain in
the header, and required engineering acknowledgements remain available. Medium
CAPEX uses the semantic info color, including cards with no eligible targets.
Export triggers use an upward arrow; Import uses a downward arrow and text-only
menu choices. Conveyor cards hide their unused Basic data container.

Comparison appears after What-If in Advance navigation only. Basic omits the
Comparison utility. Gallery account email is untruncated and Settings/Sign out
use labeled icons. Settings removes category titles already named in the tabs;
the Case name field spans the content width.

Simulation: Basic aligns Run simulation with Simulation settings. Run controls
is no longer displayed. Playback actions are icons, and the right-aligned percent
uses displayed virtual time / configured duration, clamped to 0–100%, preserving
streaming playback and pause/reset behavior. Background replication has its own
progress indicator. Scenario activity is a 9px themed animated bar; all four Basic
cards share the lateral border and a padded title background.

Results export offers JSON (the existing bounded AI summary), HTML and PDF. Full
replay JSON export is removed from that menu. Native result storage is unchanged.
Basic presents generic units; Advance displays the specified flow unit. New demo
cases use units. Import dropdown options share the same menu style as exports.

What-If mode changes rebuild the view immediately. Evaluation keys and saved
controls include the originating Basic/Advance mode so selections and metrics
restore independently. Legacy evaluations without a mode can be adopted by the
first mode that saves them; no old record is deleted. Basic keeps Current/Zero/
Medium/High and colors the lateral borders green/blue/violet by CAPEX tier.
Individual hypotheses are removed from both modes; category searches remain.

Scenario configuration uses one adjustable-parameter table. DOE adds selection,
Low and High columns to each eligible row (maximum four factors), shown when DOE
is enabled. Units appear in one column; parameter labels omit the duplicate unit
suffix. Physical limits and DOE range validation are unchanged. Settings groups
JSON fields and Include DOE checkboxes without a repeated title; Appearance uses
adjacent label/control columns instead of opposite edges of the dialog.
