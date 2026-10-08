# Two-color appearance

The Elegant overlay is enabled in code for both Basic and Advance. Settings exposes theme, text size and two color samples; color names appear only inside the full 57-color picker dialog. The workspace preview and visual-style selector are removed.

## Defaults and configuration

`apps-script/ThemeResources.html` centralizes the defaults:

- `defaultAccent`: `boat-house` (display name **boat blues**, HEX `#4E8AC2`).
- `defaultSecondary`: `astronomicon-grey` (HEX `#6A7E86`).
- `defaultTheme`: `auto`.
- `visualStyle`: `elegant`. Change to `classic` in code to disable the overlay.
- `automaticTheme`: light from 07:00 to 18:59 and dark from 19:00 to 06:59, using the browser's local time. Automatic schedules the next boundary and refreshes on tab focus or visibility changes. Light and Dark remain explicit manual choices.

Existing explicit color and theme choices remain saved. **Reset colors** applies both default colors. The visual style ignores the old browser-local `visualStyle` preference and now follows the code configuration.

The overlay retains independent status, CAPEX and chart-series colors. Simulation groups seed policy and engine under **General**; Gemini groups model and API-key fields under **General**. The Settings saved-state label follows the primary palette's readable text color.

## Select menus

`ElegantStyles.html` improves the select control and option list using native `appearance: base-select` when supported. The selected option uses the primary color; hover uses its soft variant. Native values, input/change events, form validation and keyboard behavior are retained. Browsers without customizable-select support keep their native list. See the [Chrome implementation documentation](https://developer.chrome.com/blog/a-customizable-select).

## Deployment and rollback

Update `WebApp.html`, `Appearance.html`, `ElegantStyles.html`, `UiPreferences.html`, `ThemeResources.html` and `Settings.html` in Apps Script, then update the deployment. No additional runtime file is required.

The appearance remains in separate modules. Disable it by changing `visualStyle` to `classic` in `ThemeResources.html`, or revert the appearance commits in reverse order to remove it entirely. No case-data migration is required.

## Validation

Seventeen targeted tests pass: modular rendering, account-settings contracts, and automatic-theme boundaries, timer scheduling, manual overrides, reset, and suspended-tab recovery. Render checks verify unique IDs, defined stylesheet variables and removal of the requested Settings elements. Browser visual rendering and live Apps Script deployment still require verification in the running app; a local Chromium binary was unavailable.
