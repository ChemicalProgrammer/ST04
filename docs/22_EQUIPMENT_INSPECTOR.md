# Shared equipment inspector

Line Setup uses compact equipment cards. Select a card to edit
that equipment in the resizable right panel. Equipment and Gemini share this area;
only one view is visible. Click the Gemini toolbar button for chat, or an equipment
card for configuration; there are no panel tabs or separate Edit buttons. Switching
views retains the conversation and equipment
drafts. Selecting equipment performs no save. Edits use the existing autosave and
validation flow; incomplete JSON remains a draft and is not saved.

`EquipmentInspector.html` moves the selected card's existing field container into
the panel. It does not clone inputs or create another equipment model. The editor's
field accessors resolve fields in either location; serialization still follows the
ordered cards in `equipment-list`. Rebuilding cards restores selection by equipment
ID within the same case and simulation. Changing case or simulation clears it.
Leaving Line Setup hides the equipment view. Adding equipment selects its editor.

Every parameter has contextual help available by hovering over its label and from
a keyboard-accessible information control. Advanced JSON fields open a dialog with
an illustrative, copyable object and explanations for each example field. Examples
never replace data automatically. The dialog explicitly explains that existing
fields must be preserved and visible conveyor controls take precedence over their
JSON equivalents. All help text is in `TextResources.gs` under `inspector.*` or the
existing conveyor concept keys.

`EquipmentDrag.html` previews sorting with transforms while the pointer is held:
neighboring cards move to show the destination without changing saved order.
Releasing commits the new order through the existing editor operation. Escape,
pointer cancellation and lost capture discard the preview. Arrow Up/Down on the
handle remain available. Motion follows the existing duration token and respects
`prefers-reduced-motion`; dragging near viewport edges scrolls the page.

Regression tests cover selected-equipment persistence, draft retention across
selection, Gemini history, JSON examples, sorting before release and cancellation.
The Apps Script runtime and real browser motion should also be checked after
updating the deployment.
