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

Main sections have a visible title and the same header spacing. Equipment and
Conveyors share the editor with a title reflecting the selected section. V-Graph
uses the main section title; its former nested title and result exports are hidden
in that view. Main header gaps are 16px; panel padding is 20px (12px on small screens).
All native checkboxes are 16px, independent of field-grid sizing and text scale.

Basic simulation settings group efficiency readings and controls in one compact
panel. Rounds has one label. Both mode switches and navigation move the existing
controls, preserving values, listeners and the running-simulation lock. Conveyor
groups use sentence case and the same heading style. Accent color uses the standard
field label, with the selected color name available through swatch tooltips only.
