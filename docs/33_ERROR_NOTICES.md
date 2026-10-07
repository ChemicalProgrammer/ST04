# Compact application errors

Application, sign-in, case saving, gallery refresh, Settings, Gemini, Sheet import,
configuration import and scenario errors use the shared `STErrors` presenter in
`Dialogs.html`. Each source retains its existing message node and reset behavior.
A single compact error-circle icon appears in the header immediately before Save;
the original inline text is hidden. The header groups currently active errors.
Sign-in and modal forms retain local access because the main header is unavailable
behind authentication or a modal dialog.
Clicking or keyboard-activating the icon opens an accessible shared dialog with
message, code, available details and the available local technical trace. Closing
restores focus. Warnings and normal progress/status text remain unchanged.

Static sources declare `data-error-notice` and their context title. Scenario cards
register their dynamic status node explicitly. Each source has its own observer;
there is no whole-page observer scanning charts during playback. Rich errors use
`STErrors.capture(source,error)` before asynchronous transport information is lost.
Uncaught runtime errors and rejected promises also use the application notice.

Details are shown as text, never model/remote HTML. Each message, details and
trace is bounded to 16,000 characters; nested details have depth/item limits and
repeated-reference handling. No case snapshot or request payload is collected.
Missing technical details are explicitly reported. Opening a dialog makes no
server or Gemini call. Existing retry, cancel and validation behavior is retained.
The dialog has an icon-only Copy error button. It copies the title, message and
technical details. Clipboard API failure uses a temporary textarea copy fallback;
if unavailable, the dialog reports manual copying. No error is sent to a server.

The confirmed onFirstRound Invalid string length failure is fixed in Client.html:
the JSON viewer serializes a bounded aggregate summary, not the full result or
replay. All preview update paths use the same 64,000-character helper. Coverage
reports omitted replay/events and equipment. Engine calculations, live frames,
round statistics and persisted replay are unchanged by this preview reduction.
