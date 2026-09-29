# `tests/`

Real `@playwright/test` specs, run through `waygraph test` (an alias for `playwright test`,
plus `waygraph test ui`/`report`/`show-trace` for Playwright's own UI Mode/HTML report/trace
viewer). These run against the offline fixture server (see `scripts/README.md`), not a live
network - that's what makes `npm test` green immediately after `waygraph init`.

A spec here typically runs a `*.flow.ts` from `src/flows/` and asserts on its result, rather
than driving the page directly - the flow already encodes the real path and its own `verify`
checks; the spec is proving the flow itself still works end to end, not re-deriving selectors.
