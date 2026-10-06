# Settings categories

Settings uses five keyboard-accessible tabs. Arrow keys, Home and End move between
tabs, and each panel preserves its controls while hidden. Closing with Done, the
close icon or Escape applies pending settings through the existing save pipeline.

| Tab | Options | Scope |
| --- | --- | --- |
| Case | Name, include What-If DOE, equipment chart series colors, delete case | Case JSON; normal case save policy |
| Appearance | Theme, accent palette, text size, JSON-field visibility; existing restricted interface-mode selector | Browser preferences |
| Simulation | Autosave and interval, fixed/random seed policy | Browser preferences; configurable in Advance; Basic saves manually |
| Gemini | Model, private API key, ten prompt sections and inclusion checkboxes | Google account User Properties |
| Storage | Drive workspace root folder | Google account settings |

The Case tab requires an open case. DOE uses `metadata.includeDOE`; older cases
fall back to the previous browser preference until explicitly set. A card's DOE
toggle and Settings edit the same option and retain the existing factor selection
and evaluation behavior. Different cases can therefore retain different DOE
policies. This option controls future evaluations, not an automatic search.

Chart colors use `metadata.chartColors`, with up to 13 equipment-series slots.
Only explicitly changed colors override the light/dark theme palette. The first
series also colors line output; equipment beyond 13 repeat these series. Reset
removes the overrides. Colors apply immediately, survive opening the saved case,
and clear when returning to the gallery. These display changes mark the case
pending without invalidating simulation results or changing simulation inputs.

Appearance applies immediately in this browser. Text size offers 80%, 90%, 100%,
110% and 125% relative to the current default. Basic preserves its existing 80%
base scale and 12px minimum, then applies this preference. Existing accent choices
and the restricted interface-mode access remain unchanged.

Account settings retain their existing debounced save and retry behavior; prompt
checkboxes do not discard text. Case changes follow manual/automatic case saving,
and closing Settings does not implicitly save a Basic case. See
`30_GEMINI_PROMPTS_AND_CHAT.md` for prompt composition, persistence and budgets.
