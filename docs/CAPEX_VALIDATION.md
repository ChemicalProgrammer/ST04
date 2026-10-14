# CAPEX finalist selection and confirmation

Policy: `MATCHED_CAPEX_V9`. Applies to Low (internal tier ZERO), Medium and High CAPEX at every search depth.

- Exploration uses short horizons and produces explicitly provisional card metrics.
- The finalist budget first retains distinct combinations of changed inputs, then fills remaining places by exploratory throughput. Small numerical variants of one combination cannot consume the entire budget before other combinations are considered. This remains a bounded search, not a global optimum.
- All finalists and their unchanged baseline are compared with the configured full duration (at least 1,800 seconds) and matching seeds. Previously this ranking always used 1,800 seconds even for longer configured runs.
- The selected winner is confirmed with a separate, matched seed block. Uncertain three-round confirmation expands to six rounds for every search depth, including Light and Medium. The independent block is never used to choose a different winner.
- A candidate must improve throughput above the existing threshold and must not reduce OEE against its matched baseline. Existing paired uncertainty checks still apply.
- A failed confirmation shows dashes for the proposed scenario metrics, a clear failure message, and the recalculated baseline as context. It remains possible to create a separately identified validation draft.
- Confirmed cards show the matched baseline, duration and rounds. A confirmed 37% candidate can legitimately improve a 35% validation baseline even if an earlier Results run measured 39%; different seeds, rounds or horizons are not directly comparable. An exploratory 40% is not a guarantee of 40% under independent confirmation.
- Saved V8 results remain visible but require a new search before scenario creation under V9.

## Deployment

Copy `apps-script/ScenarioExplorer.html` into the existing Apps Script project and update its deployment. No generated engine or server changes are required. Rerun the affected CAPEX searches.

## Verification

`node --test test/ScenarioSearch.test.js` covers long-horizon winner reversal, distinct finalist combinations, rejected confirmation display and reopening, matched seed comparison, and six-round uncertain confirmation for Low and Medium. Tests use controlled simulation responses; they do not establish the exact cause in a user case whose full evidence has not been supplied.
