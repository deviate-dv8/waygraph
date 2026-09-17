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
| **E** Coverage JSON + `--min-edge-coverage` CI | **NEXT (parked)** | Suite gate |

## Richer testing / demo (override track - 2026-09-17)

Tester ask: make waygraph richer for QA/demo narration.

| Item | Status | Notes |
|------|--------|-------|
| Automation highlight tone = **gray** | DONE | Was yellow; verify/auto rings gray |
| Iconified semantic tones | DONE | warning/danger/success/info (+ planned purple) |
| Highlight size / weight | DONE | `size: sm\|md\|lg`, `weight: normal\|bold` |
| Group pacing (flow / compose / episode) | DONE | `withDemoPace` / `withBlockPace`; FF = blitz |
| Episode fast vs slow | DONE | e.g. pia ep2 gaps/wrongs = `withDemoPace(..., "slow")` |

### Authoring sketch

```ts
import { withDemoPace, withBlockPace, withTitle, composeBlock } from "waygraph";

// Fast episode (smoke through happy path)
export const ep1 = withDemoPace(withTitle(happyFlow, "Episode 1 - happy"), "fast");

// Slow episode (gaps / wrongs / convention review)
export const ep2 = withDemoPace(withTitle(gapFlow, "Episode 2 - gaps"), "slow");

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
