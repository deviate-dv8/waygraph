# waygraph objectives (living)

ASCII only. Last updated: 2026-09-17.

Parked / in-flight goals so overrides do not lose the main track.

## RFC: Traverse + FFCompose (`docs/proposals/traverse-ffcompose-rfc.md`)

| Phase | Status | Notes |
|-------|--------|-------|
| **A** FFCompose + blitz + `--ff-disabled` | DONE (0.12.13) | Opaque blitz; dispute expand |
| **B** `waygraph traverse` serial | DONE (0.12.8+) | max-visits, leaf/fail lines |
| **C** `--blocks` glob/regex select | DONE (0.12.10+) | auto + traverse |
| **D** `--parallel` + `--session clone` + leases | DONE (0.12.14) | inherit refused if parallel>1 |
| **E** Coverage JSON + `--min-edge-coverage` CI | DONE (0.12.20) | Suite gate exit 2; instance hits cover parent block |


## Richer testing / demo (override track - 2026-09-17)

Tester ask: make waygraph richer for QA/demo narration.

| Item | Status | Notes |
|------|--------|-------|
| Automation highlight tone = **gray** | DONE | Was yellow; verify/auto rings gray |
| Iconified semantic tones | DONE | warning/danger/success/info (+ planned purple) |
| Highlight size / weight | DONE | `size: sm\|md\|lg`, `weight: normal\|bold` |
| Flow episode defaults | DONE | `withHighlightStyle(flow, { size, weight, tone? })` |
| Group pacing (flow / compose / episode) | DONE | `withDemoPace` / `withBlockPace`; FF = blitz |
| Numeric pace | DONE | scale `<=20` (e.g. `0.5`, `2`) or absolute ms `>20` (e.g. `4500`) |
| Pace speaks in UI/console | DONE | panel chip + `waygraph demo: step N · pace 2.5x (~4500ms gates)` |
| Episode fast vs slow | DONE | e.g. pia ep2 gaps/wrongs = `withDemoPace(..., "slow"\|2)` |
| Per-flow speed wins CLI `--fast` | DONE (0.12.18) | Authoring wins for slow/numeric; `--fast` only when pace unset/normal |

### Authoring sketch

```ts
import {
  withDemoPace, withBlockPace, withTitle, withHighlightStyle,
  withHighlightFixtures, composeBlock,
} from "waygraph";

// Fast episode (smoke through happy path)
export const ep1 = withDemoPace(withTitle(happyFlow, "Episode 1 - happy"), "fast");

// Slow episode + larger/bolder rings by default for the whole Flow
export const ep2 = withHighlightStyle(
  withDemoPace(withTitle(gapFlow, "Episode 2 - gaps"), 2.5), // or "slow" / 4500ms
  { size: "lg", weight: "bold" },
);

// Per-slot override on the flow (wins over withHighlightStyle)
export const ep2Fixtures = withHighlightFixtures(ep2, {
  "review-gap": {
    stubAfter: {
      tip: { label: "Side note", tone: "info", size: "sm", weight: "normal" },
    },
  },
});

// One compose group slower than the rest of its flow
const review = withBlockPace(composeBlock("gap-review", [...]), "slow");

// Highlight tones on stubs / slides
stubAfter: {
  bad: { selector: "#err", label: "Wrong state", tone: "danger", size: "lg", weight: "bold" },
  tip: { selector: "#hint", label: "Remember", tone: "info", size: "sm" },
}
```

## Later / nice-to-have

- Phase C leftover: glob `--blocks` on `demo`/`run` flow resolve
- Traverse work-stealing when partition soft-leafs
- FF bootstrap seed for parallel (`--ff` before fork)
- FF covered-via-prefix in coverage reports (RFC open Q3)
