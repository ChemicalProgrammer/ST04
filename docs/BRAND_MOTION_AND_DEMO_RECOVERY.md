# Brand motion and prepared demo recovery

`BrandConveyor.html` is a shared inline SVG after the product name on the
welcome card and About dialog. `BrandConveyorStyles.html` defines the primary
bottle silhouettes and secondary conveyor with a subtly moving contour.
Seven bottles are visible across the longer belt. Both colors are solid, with
no highlights, opacity, outlines, frame or gradient. The animation and icon
share one vertically centered, compact row in About. It has no external assets.

`BrandConveyorMotion.html` moves individual bottles in one requestAnimationFrame
loop shared by both instances; the belt uses CSS animation playback rates.
Press − to slow down or + (also =) to speed up, from 0.25× to 4×.
Left and right arrows choose belt direction without relocating bottles. CSS
reverses the belt loop and mirrors its cycle position to avoid a jump.
Keys apply only on Welcome/About and do not intercept input fields or another
open dialog. Both instances share a session-local rate; hidden instances pause.
The reduced-motion preference disables transport and animated effects; removal
still works instantly. The decorative interactions do not change simulation
data, consume simulation workers or call the server.

- Hold a bottle to stop it; upstream bottles accumulate with a minimum gap
  while the belt continues. Release to resume. The pool is bounded to 15 bottles.
- Drag more than 14 SVG units vertically away from the belt, or beyond an end,
  to remove a bottle. A cancelled gesture or an in-lane drop restores it.
- A short click tips one bottle. The wave propagates only when its rotating
  silhouette reaches the next bottle; a sufficiently large gap stops it.
  Bottles settle horizontally and remain fallen until removed, carried off
  the belt or explicitly reset with Escape. Reversal and hiding a view preserve
  their orientation. Transport accounts for their wider footprint. A 280 ms
  delay distinguishes a single click from a double click.
- Double click activates a solid secondary-color gripper that descends vertically
  from above, picks up the primary-color bottle and retracts upward. Its upper
  mechanism is cropped away. Only one pickup runs per instance.
- Focus the animation: Space holds/releases a central bottle, Delete removes,
  R activates the robot, D starts domino and Escape restores the original row.
  Pointer capture supports mouse, pen and touch. Hidden views cancel pending
  gestures and effects; transport and belt animations pause.

The animation uses the normal cursor in every interaction, has no border,
shadow or focus outline, and exposes no tooltip revealing the Easter eggs.
Keyboard instructions remain in its accessibility label.

The case header uses the existing product icon with the primary theme color.
It appears before both the case name and Workspace in the gallery.

Prepared demo recovery now accepts empty result objects created by the saved
case normalizer and compares input objects canonically, including the explicit
default current engine. Physical input, seed or round changes still prevent
fixture reuse; populated user results are preserved. Reopening an unchanged
demo supplies its measured results, which the scenario cards read from the
linked simulations. Creating a demo without the prepared-results module now
reports that missing module instead of silently creating empty results.

`Main.gs` reads included templates with `getRawContent()` and resolves display
resources before HTML processing. This avoids escaped template delimiters and
broken quotation marks in the conveyor's accessibility attributes.

Add `BrandConveyor.html`, `BrandConveyorStyles.html` and `BrandConveyorMotion.html`.
Update `WebApp.html`, `Shell.html`, `ShellStyles.html`, `TextResources.gs`,
`Main.gs` and `PublicDemoCaseFactory.gs`. Ensure `PublicDemoResults.gs` from the
prepared demo update is present. Publish a new Apps Script deployment version.
