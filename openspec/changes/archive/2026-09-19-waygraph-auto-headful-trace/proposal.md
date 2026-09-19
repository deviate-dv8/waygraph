## Why

Phase 1 (`waygraph-auto-cli-session-control`) and Phase 2 (`waygraph-auto-dom-inspect`) give
an agent a fully non-interactive way to drive an explore session and read the live page - but
the session always runs headless, so no human can watch it, and nothing records what the
agent actually did beyond the current menu/state. This is Phase 3 of `ROADMAP.md`'s
"Agent-authoring tooling and Waygraph Copilot": a session an agent drives via RPC while a real
visible browser runs at the same time ("waygraph codegen"), plus a structured record of the
session's own steps for a later, separate authoring step to turn into real Blocks - the
"smarter than Playwright codegen" differentiator this roadmap has been building toward,
because the record is a checkpoint/Block sequence, not raw recorded clicks.

## What Changes

- `AutoSessionInit` gains an optional `headless?: boolean` (default `true` - unchanged for
  every existing caller). `waygraph auto --cli --detach --non-headless` launches the same
  detached, RPC-driven session with a real visible browser window instead of headless
  Chromium. `--non-headless` is the existing flag `run`/`demo` already use for "show the
  browser" (`RunFlags.nonHeadless`, already parsed by `parseRunFlags`, which `auto` already
  calls) - reused rather than inventing a new flag name.
- This is **not** a new picker UI and does **not** touch the existing headful page-embedded
  panel (`headfulPick` in `src/auto-explore-run.ts`) at all - that remains exactly what Phase
  1/2 already guaranteed unaffected. This is a different thing: the same `send`/`status`/
  `attach`/`dom` RPC surface, just optionally pointed at a visible browser window instead of a
  headless one - "both funneled through the one session so state never forks," per
  `ROADMAP.md`'s own framing.
- `AutoSession` accumulates a structured trace of its own history: every `applyPick` call
  that actually attempts to run a Block appends one trace step - Block name, the Checkpoint
  before, the Checkpoint after (or the failure message), a timestamp, and (when the Block
  actually authors them) the resolved `stubBefore`/`stubAfter`/`stubOnError` demo-narration
  fixtures - the same highlight/todo/device data `waygraph demo`'s existing lifecycle logging
  (0.13.5) already computes via `runStubPhase`, reused here since it is pure data with no
  browser side effects. This is a **Checkpoint/Block-level record, not a raw action
  recorder** - it still never captures individual clicks/fills the way Playwright codegen
  does; the fixture data is authored narration metadata, not recorded actions.
- A new `trace` op / `waygraph auto trace <sessionId>` sub-verb (matching the existing
  `send`/`status`/`attach`/`dom` pattern) retrieves the accumulated trace as JSON.
- Turning a trace into actually-authored Nav/Page/Method/Effect Block files is explicitly
  **out of scope** for this change - that consuming step is separate, later roadmap work
  (Phase 4 or beyond). This change only captures and exposes the trace.
- Additive only: default behavior (`headless: true`, trace never queried) is unchanged; Phase
  1/2's `send`/`status`/`attach`/`dom` keep behaving exactly as already specified.

## Capabilities

### New Capabilities
- `waygraph-auto-headful-trace`: an optional visible-browser mode for a `waygraph-auto`
  session, and a structured, Checkpoint/Block-level trace of that session's own history,
  retrievable through the same session protocol.

## Impact

- `src/auto-session.ts` (mid) - `AutoSessionInit.headless?`; `AutoSession` accumulates a
  private `TraceStep[]`, appended inside `applyPick`; new `getTrace()` pure getter.
- `src/auto-session-ipc.ts` (small) - new `trace` request/response shape on the existing
  protocol, and `spawnDetachedSession`/the `__auto-serve` entry point plumb `headless`
  through to the spawned child.
- `src/cli.ts` (small) - `auto --detach` reads `flags.nonHeadless`; new `auto trace
  <sessionId>` sub-verb alongside the existing four.
- `tests/` - a new spec proving a `--non-headless` detached session actually launches a
  visible browser (headless: false reaches the real launch options) and that `trace` returns
  the expected Block/Checkpoint sequence after a real login run - not raw actions.
- `README.md` ("CLI reference") and `docs/auto.html` - document `--non-headless` on
  `--detach` and `auto trace`.
- No change to `waygraph-demo`, `waygraph-traverse`, the existing headful page panel, or any
  Block-authoring surface - consuming the trace to author Blocks is explicitly future work.
