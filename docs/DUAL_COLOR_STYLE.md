# Optional two-color appearance

Settings → Appearance offers **Elegant · two colors** and **Classic · original style** in both Basic and Advance. Elegant is the default visual style; the user's existing primary palette and text scale are preserved.

- Primary color retains the existing accent behavior for actions, selection and focus.
- Secondary color decorates soft equipment headers, section titles, structural borders, chart containers, dialogs and the assistant header. The default is `encore`, a subdued slate.
- Light, dark and automatic appearance remain supported. Secondary text uses the existing theme-specific accessible text variants.
- Status indicators, CAPEX tiers and chart series retain their semantic colors.
- Appearance preferences are browser-local and apply immediately. They do not modify case or simulation data.

## Files and deployment

Upload `Appearance.html` and `ElegantStyles.html` alongside the updated `WebApp.html` to the Apps Script project, then update the web app deployment. Both new files are HTML files, even though one holds JavaScript and the other CSS.

`Appearance.html` owns secondary-color selection and style persistence. `ElegantStyles.html` contains the optional app-wide overlay, scoped to `html[data-visual-style=elegant]`. The existing theme resources, preference controller and base styles are unchanged. New Appearance controls are styled in the same file and are available in both visual styles.

## Revert or discard

For an immediate visual rollback, select **Classic · original style**. No page refresh is needed; the secondary choice is retained if Elegant is selected again. **Reset visual style** restores Elegant with the default secondary color while retaining the primary color.

To remove the feature from source completely, revert the single appearance commit. Alternatively restore `WebApp.html` from its previous version, remove the two new HTML modules and restore the modular include-count assertion in `test/ModularAppsScript.test.js`. No case migration or server change is required.

## Validation

The modular renderer resolves all includes and compiles every client script. The existing modular and account-settings checks pass (13 tests). A controller smoke check verifies independent color preferences, dark text variants, saved-style restoration, Classic rollback, invalid values and factory-reset synchronization. Visual rendering and live Apps Script deployment still need verification in the running application; a local Chromium binary was unavailable in the editing environment.
