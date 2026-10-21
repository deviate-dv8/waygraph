# `src/flows/`

A `*.flow.ts` composes Blocks from `src/map/` into a runnable path - `waygraph run`/`demo`/`test`
all point at an export here by name (`waygraph run --blocks shopFlow`).

- Prefer `new Engine().map()...end()` (the Map builder: `.gotoPage()`/`.method()`/`.assert()`/
  `.branch()`) over hand-composing raw Blocks - it checks each step's Block kind at runtime and
  the Checkpoint chain at compile time, so a wrong step is a build/test failure, not a
  mid-run surprise.
- Flow settings go in `.end({ title, memStub, sessionReset })`. No nested `withTitle(withMemStub(...))`.
- Demo highlights are ctx stubs chained on the Block where the flow uses it:
  `AddItemBlock.stubAfter((ctx) => { ctx.ring("cart", { selector, label }); })`.
- One flow, one scenario. A flow that needs a genuinely different starting session
  (re-entering the login page mid-chain) sets `sessionReset: true`, rather than hand-clearing
  cookies inside a Block.

New flow → new file here, named for the scenario (`checkout.flow.ts`), not for the Blocks it
happens to use.
