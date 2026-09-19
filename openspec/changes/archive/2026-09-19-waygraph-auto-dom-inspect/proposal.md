## Why

`waygraph auto`'s session (shipped in `waygraph-auto-cli-session-control`, Phase 1) gives an
agent a menu of runnable Blocks, but no way to actually *see* the page. A codebase-blind agent
authoring new Blocks (per `waygraph-planner`/`waygraph-author` in `templates/agents/`) has no
way to find real selectors or confirm what is actually rendered without reading FE source -
which defeats the point of blind authoring, and is exactly the gap Phase 6 (Waygraph Copilot)
will also need closed before it can resolve a plain-language ask against a live page it has
never seen before.

This is Phase 2 of the roadmap in `ROADMAP.md` ("Agent-authoring tooling and Waygraph
Copilot") - current focus is the `waygraph-auto` module. Builds directly on Phase 1's session/
RPC layer (`AutoSession` in `src/auto-session.ts`, the request/response server in
`src/auto-session-ipc.ts`) rather than inventing a new transport.

## What Changes

- A new `dom` op on the existing session request/response protocol (same session, same
  socket, alongside `status`/`send` from Phase 1) and a `waygraph auto dom <sessionId>
  [options]` CLI sub-verb, matching the `auto send`/`auto status`/`auto attach` pattern Phase
  1 already established.
- Two fidelity modes, selected via `--mode aria|full` (default `aria`), plus an orthogonal
  `--selector <sel>` flag that scopes *either* mode to one element's subtree instead of the
  whole page when given ("container" is this combination, not a third mode value - a
  selector is a modifier on a fidelity, not a fidelity of its own):
  - `aria` (**default**): Playwright's `page.ariaSnapshotJSON({ mode: "ai", depth })`, or
    `page.locator(selector).ariaSnapshotJSON(...)` when `--selector` is given - verified as
    the current API for this package's Playwright version (`^1.63.0`); the older
    `page.accessibility.snapshot()` this proposal originally assumed has been **removed** in
    that version. `mode: "ai"` is itself purpose-built for LLM consumption (element refs like
    `[ref=e2]`, iframe snapshots) and Playwright already bounds it via its own `depth` option -
    no custom truncation needed for this mode.
  - `full`: a bounded DOM subtree (tag, attributes, text, children) via a custom
    `page.evaluate()` walk, rooted at `document.documentElement` or, when `--selector` is
    given, at the matched element - since Playwright has no built-in "full DOM as JSON"
    primitive. Hard caps on depth, node count, and per-node text length - this mode is read
    by an LLM agent, not a human, so it must never return unbounded output. A capped response
    is explicitly marked `truncated: true`, never silently incomplete.
- Additive only: does not change `status`/`send`/`attach` behavior from Phase 1, does not
  touch headful mode, does not touch any Block-authoring surface.

## Capabilities

### New Capabilities
- `waygraph-auto-dom-inspect`: a read-only `dom` op on the `waygraph-auto` session protocol,
  giving an agent bounded, token-budget-aware visibility into the live page at a chosen
  fidelity, without reading the target project's frontend source.

## Impact

- `src/auto-session.ts` (mid) - `AutoSession.inspectDom(opts)`: dispatches to the aria
  snapshot, the bounded full-DOM walker, or either scoped to a selector. Read-only - no
  `mem`/page mutation, same guarantee `currentSnapshot()` already gives.
- `src/auto-session-ipc.ts` (small) - new `dom` request/response shape on the existing
  protocol, handled the same way `status` already is (no queue-ordering concerns beyond what
  Phase 1's request queue already provides).
- `src/cli.ts` (new sub-verb) - `auto dom <sessionId> [--mode aria|full|container] [--selector
  <sel>] [--depth N]`, intercepted the same way `auto send|status|attach` already are.
- `tests/` - a new spec proving all three modes against `examples/saucedemo`, including that
  `full` mode's caps actually cap (a real page, not a synthetic tiny fixture).
- `README.md` ("CLI reference") and `docs/auto.html` - document `auto dom` and its modes.
- No change to `waygraph-demo`, `waygraph-traverse`, Phase 1's `send`/`status`/`attach`, or
  any Block-authoring surface.
