# `src/flows/`

A `*.flow.ts` composes Blocks from `src/map/` into a runnable path - `waygraph run`/`demo`/`test`
all point at an export here by name (`waygraph run --blocks shopFlow`).

- Prefer `new Engine().map()...end()` (the Map builder: `.gotoPage()`/`.method()`/`.assert()`/
  `.branch()`) over hand-composing raw Blocks - it checks each step's Block kind at runtime and
  the Checkpoint chain at compile time, so a wrong step is a build/test failure, not a
  mid-run surprise.
- `withTitle`/`withHighlightFixtures`/`withSessionReset`/etc. are non-destructive wrappers -
  `someFlow.withTitle("...")` doesn't mutate `someFlow`, it returns a new one. Compose them
  around the finished `.end()` result, not inside the Map chain itself.
- One flow, one scenario. A flow that needs a genuinely different starting session
  (re-entering the login page mid-chain) wraps that segment in `withSessionReset`, rather than
  hand-clearing cookies inside a Block.

New flow → new file here, named for the scenario (`checkout.flow.ts`), not for the Blocks it
happens to use.
