# Gemini prompt configuration and chat presentation

Edit the variables at the top of `apps-script/GeminiService.gs` to change the
agent instructions without editing HTTP requests or scenario validation.

| Variable | Purpose |
| --- | --- |
| `ST_GEMINI_PERSONALITY` | Role, tone, explanation style and paragraph structure. |
| `ST_GEMINI_LANGUAGE_POLICY` | Use the latest question's language, or an explicitly requested language. Human-readable scenario fields follow it; schema identifiers remain unchanged. |
| `ST_GEMINI_ENGINEERING_POLICY` | Engineering evidence, model limits, physical checks, reliability interventions and baseline preservation. |
| `ST_GEMINI_SEARCH_POLICY` | Prioritize variables and combinations using compact saved search evidence; respect omissions and keep numerical evaluation in the simulator. |
| `ST_GEMINI_ADVANCE_POLICY` | Supported improvement suggestions include structured proposals for editable scenario cards. |
| `ST_GEMINI_BASIC_POLICY` | Improvements appear as chat text with an empty proposals array. |
| `ST_GEMINI_RESPONSE_FORMAT` | Structured JSON contract for Advance proposals. Basic defines its simpler contract in its own policy. |

The request composes the common sections and the active mode section. It does
not send the opposite mode's rules. Exact allowed parameter paths come from the
scenario engine. Model output still passes the existing server validation, and
Basic suppresses proposals on both the server and the client. Editing prompts
does not bypass scenario validation.

## Paragraph reveal

At the top of `apps-script/Assistant.html`, edit
`window.ST_GEMINI_CHAT_PRESENTATION`:

```js
{ enabled: true, paragraphDelayMs: 180, maxDurationMs: 3000 }
```

The Apps Script request receives a complete response. The client then reveals
its existing text one paragraph at a time; this is a visual presentation effect,
not network streaming and does not reduce the time Gemini needs to answer. The
first paragraph appears immediately. Blank-line-separated paragraphs retain
their original text and separators. Short answers display immediately.

Advance cards appear after the final paragraph and retain their configuration,
evaluation, cancellation and creation controls. Basic displays text only. New
questions are disabled during reveal. Reduced-motion preferences or
`enabled: false` display the complete answer immediately. Switching case or
simulation cancels the old reveal; closing and reopening the chat keeps its
current response. Chat history uses the complete answer, not a partial rendering.

Update the modified Apps Script files and the deployed web app to apply prompt
or presentation changes.

## Search advice and bounded input

Gemini can prioritize variables and combinations using selected equipment, loss
metrics, engineering checks, local proposals, user objectives and saved search
evidence. Advance returns up to three editable cards in priority order; Basic
uses text only. Evaluating or searching a card uses the existing simulator and
independent confirmation. Gemini does not automatically run trials or initiate
an adaptive multi-request loop. The user can evaluate cards and ask again with
updated evidence. No claim of reduced evaluation count is made without testing.

`GEMINI_CONTEXT_BUDGET_` in `GeminiContext.gs` controls the input data budget:
96,000 context characters, 12,000 search-evidence characters, six recent current
evaluations, twelve sampled trials per evaluation and twelve changes per item.
Local proposals are also capped. History retains its separate 16,000-character
budget. These are character limits, not token guarantees; prompts and the user
question add to the request. A separate 160,000-character serialized-request
ceiling includes JSON escaping, prompts, history and question. Older history is
removed first; an oversized mandatory request fails before HTTP with a clear
input-budget message.

Searches now retain the last 24 distinct evaluated candidates in the case, with
changes, feasibility, OEE, throughput and warning count. This bounded history is
not all possible combinations. Older cases remain compatible and explicitly
report missing trial history. Evidence with a different source signature or
simulation ID is excluded. Running and cancelled results remain provisional.

The context reports omitted evaluations, candidates, changes, local proposals
and equipment. Excess data is removed as complete JSON items, never by cutting
JSON text. Other-simulation summaries, local proposals and search evidence are
removed before selected equipment when the overall budget requires trimming.
Saved best candidates, failed checks and user-selected limits guide advice;
plant costs and operating restrictions must be supplied, never inferred.
