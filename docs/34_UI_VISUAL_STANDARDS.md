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
menu (Google Sheet / JSON import); Equipment adds JSON export inside that menu. JSON field actions
use text buttons. V-Graph uses its speed-profile heading. Main header gaps are 16px;
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
