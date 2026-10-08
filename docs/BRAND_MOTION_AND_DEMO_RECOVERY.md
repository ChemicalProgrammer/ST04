# Brand motion and prepared demo recovery

`BrandConveyor.html` is a shared inline SVG after the product name on the
welcome card and About dialog. `BrandConveyorStyles.html` defines the primary
bottle silhouettes and secondary conveyor with a subtly moving contour.
Seven bottles are visible across the longer belt. Both colors are solid, with
no highlights, opacity, outlines, frame or gradient. The animation and icon
share one vertically centered row in About. It has no external assets or timers.

`BrandConveyorMotion.html` uses animation playback rates for seamless speed
changes. Press − to slow down or + (also =) to speed up, from 0.25× to 4×.
Left and right arrows choose belt direction. CSS reverses the repeating loop;
the cycle position is mirrored to keep the silhouettes in place when reversing.
Keys apply only on Welcome/About and do not intercept input fields or another
open dialog. Both instances share a session-local rate; hidden instances pause.
The reduced-motion preference disables the animation.

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
