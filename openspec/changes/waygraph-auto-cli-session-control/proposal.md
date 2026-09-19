## Why

`waygraph auto --cli` (`src/auto-explore-run.ts`) is a single in-process `readline/promises`
loop over the CLI process's own stdin/stdout (`cliPick`, `createInterface({ input, output })`
inside `runAutoExplore`). An agent trying to drive it today has no way to inspect the menu or
current Checkpoint between prompts, no way to send one command and get a response back, and
no way to keep a browser session alive across separate tool invocations - it has to blind-pipe
a whole pre-guessed sequence of numbered answers into one process invocation, with no recovery
if an unexpected prompt (a mem-seed question, a missing-key error) appears mid-sequence. This
was confirmed directly this session: an agent testing `--cli` found it "incredibly lacking
with input stuffs."

This is Phase 1 of a larger roadmap (`ROADMAP.md` "Agent-authoring tooling and Waygraph
Copilot") - the current focus, since Phase 6 (Waygraph Copilot) depends directly on the
`waygraph-auto` module's `locate()`/`discoverGraph`/`findBlockPath`, and both the Copilot and
the earlier agent-authoring phases need an agent to be able to drive an explore session without
a TTY. Scoped to session control only; the DOM-inspection tool (Phase 2) and simultaneous
`--cli` + headful (Phase 3) are separate, later proposals.

## What Changes

- `waygraph auto --cli --detach`: starts the existing explore session (same graph/library
  build, mem seeding, browser/context/page launch, and pick-loop body `runAutoExplore` already
  runs) as a long-lived background process instead of blocking in a readline loop. Prints
  `{ sessionId, socketPath }` as JSON to stdout and returns immediately.
- `waygraph auto send <sessionId> "<pick>"`: a short-lived client - connects to the running
  session, sends one pick (a menu index or `q`, identical parsing rules to today's `cliPick`),
  and prints the resulting menu/Checkpoint/`lastRunNote` as JSON to stdout. No TTY, no
  interactive loop - this is the primitive that lets a non-interactive agent (a single Bash
  tool call) drive one step at a time and read the result back.
- `waygraph auto status <sessionId>`: same client shape as `send`, but a pure getter - no
  Block runs, no `mem`/page changes - so an agent can poll state before deciding its next
  `send`.
- `waygraph auto attach <sessionId>`: reopens an interactive readline loop against a running
  detached session, for a human to take over or to debug. Implemented entirely client-side
  (reuses `printCliMenu` / `cliPick`'s existing rendering and parsing against `status`/`send`)
  - no new server-side behavior beyond what `send`/`status` already provide.
- Session identity lives under a per-project `.waygraph-auto/` directory (`<id>.json` for
  metadata, `<id>.sock` for the socket), mirroring the existing `.waygraph-traverse/`
  per-feature dotdir convention already used elsewhere in this codebase. A `quit` op removes
  both.
- Fully additive: bare `waygraph auto --cli` (no `--detach`) keeps behaving exactly as it does
  today - same prompts, same blocking loop, no session id, no socket. Headful mode (no `--cli`
  at all) is untouched.

## Capabilities

### New Capabilities
- `waygraph-auto-cli-session-control`: `waygraph auto --cli` gains an optional detached-session
  mode with a small request/response protocol (`send`/`status`/`quit`) so a non-interactive
  caller can drive an explore session step by step, plus an `attach` command that reopens the
  interactive loop against a running session.

## Impact

- `src/auto-explore-run.ts` (mid) - extract the existing loop's per-turn state (menu, `here`,
  `lastRunNote`) into a JSON-safe snapshot shape, and extract the "apply one pick, run the
  Block, produce the next snapshot" step so both the existing local pick sources (`cliPick`,
  `headfulPick`) and a new remote pick source (resolved by an incoming socket message, the same
  shape headful picks already resolve via `armPickWait`/`pickSlot` from an externally-triggered
  callback) call the same function. No change to `buildExploreMenu`, `detectHere`,
  `runOneBlock`, or Block execution semantics.
- `src/cli.ts` (new commands) - `auto --detach`, `auto send`, `auto status`, `auto attach`,
  reusing the existing `auto` argument-parsing entry point.
- New small module for the unix-socket server/client and `.waygraph-auto/` session-file
  handling (exact filename left to design/tasks).
- `tests/` - a new spec driving a full non-interactive sequence (detach, send a pick, send
  another, status, send quit) against `examples/saucedemo`, asserting on the JSON responses -
  no TTY involved, proving the actual pain point is fixed.
- `README.md` ("CLI reference") and `docs/auto.html` - document the four new invocations.
- No change to `waygraph-demo`, `waygraph-traverse`, or any Block-authoring surface.
