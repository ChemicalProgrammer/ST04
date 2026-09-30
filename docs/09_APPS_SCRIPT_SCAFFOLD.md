# Apps Script scaffold

## What is implemented

The `apps-script/` directory is the modular Apps Script web-app scaffold. It provides a minimal HTML Service console, active-user identity checks, user-scoped settings, a Drive workspace boundary, and Drive-backed Case summaries. Deploy the individual `.gs` and `.html` modules with the manifest; see `13_MANUAL_APPS_SCRIPT_UPDATE.md`.

It deliberately does **not** send data to Gemini or run the simulation on the server. The existing deterministic engine remains an independent browser-compatible module.

## Security model

1. The web app executes as the **user accessing it**.
2. `Session.getActiveUser().getEmail()` must return an email; otherwise the app returns `IDENTITY_UNAVAILABLE` and stops.
3. `ALLOWED_USER_EMAILS_JSON` is optional. When set, it must be a JSON array of lowercase/uppercase-insensitive email addresses; every other user receives `ACCESS_DENIED`.
4. Every user chooses one Drive workspace root. The server checks that the current user can open that folder before saving the setting.
5. The app creates only three managed child folders: `SimulatorTemplate Cases`, `SimulatorTemplate Artifacts`, and `SimulatorTemplate Exports`.
6. Case records include `ownerEmail`; list operations return only records owned by the active user.

The setup does not store passwords, API keys, Drive content in User Properties, or any Gemini credential in the HTML client.

## First deployment

1. Create a standalone Apps Script project under the intended Google account.
2. Copy `.clasp.json.example` to `.clasp.json` and replace the placeholder with the project script ID. Never commit `.clasp.json`.
3. From a local clone with clasp authenticated, run `clasp push`.
4. In Apps Script Project Settings, set Script Properties as appropriate:
   - `ALLOWED_USER_EMAILS_JSON`: optional, for example `["engineer@example.com"]`.
   - `FIXED_KNOWLEDGE_FOLDER_ID`: optional for this scaffold; it will be required once source retrieval is added.
5. Deploy as a web app executing as **User accessing the web app**. Choose the narrowest organization-approved audience.
6. Open the deployed app, paste the ID of a Drive folder you own or can access, and save it. The app will make controlled subfolders.

## Files and responsibilities

| File | Responsibility |
|---|---|
| `Main.gs` | Web entry point and server action boundary |
| `AuthService.gs` | Active identity and allowlist verification |
| `ConfigService.gs` | User and global configuration contracts |
| `DriveService.gs` | Drive workspace verification and managed folders |
| `CaseService.gs` | Case creation/listing with owner filter |
| `ReferenceCaseFactory.gs` | Explicit sample case for initial smoke testing |
| `WebApp.html`, `Styles.html`, `Client.html` | Presentation only; no process calculations |

## Verification

Run the local automated tests from the repository root:

```bash
node --test
```

The Apps Script settings tests run with mocked `PropertiesService` and `DriveApp`; they verify defaults, successful workspace save, and rejected inaccessible folders.

## Next boundary

The next step is a Case editor and client-side engine bundle. The editor will produce validated JSON; the browser will run the reference engine and send only completed result artifacts to Apps Script for persistence. Gemini remains outside that transaction until deterministic results exist.
