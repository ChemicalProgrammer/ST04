# Compact application errors

Application, sign-in, case saving, gallery refresh, Settings, Gemini, Sheet import,
configuration import and scenario errors use the shared `STErrors` presenter in
`Dialogs.html`. Each source retains its existing message node and reset behavior.
A compact error-circle icon appears beside it; the original inline text is hidden.
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
This presentation change does not fix the underlying Invalid string length error.
