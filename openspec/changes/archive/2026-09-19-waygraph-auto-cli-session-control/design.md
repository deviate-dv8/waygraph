## Context

Confirmed directly this session by reading `src/auto-explore-run.ts` in full:
`runAutoExplore` is one function that owns graph/library build, mem seeding, browser launch,
and a `for (;;)` loop whose only two pick sources today are `cliPick` (blocks on a local
`readline` question) and `headfulPick` (blocks on a promise resolved by a page-exposed
function, `__wgAutoPick`, wired via `armPickWait`/`pickSlot`). An agent driving `--cli` has to
pipe a whole guessed answer sequence into one process invocation with no way to inspect state
mid-run or recover from an unexpected prompt - this was reported directly this session as
"incredibly lacking with input stuffs" when an agent tried to test it.

This is Phase 1 of the roadmap in `ROADMAP.md` ("Agent-authoring tooling and Waygraph
Copilot"). Phase 6 (Waygraph Copilot) depends on `waygraph-auto`'s `locate()`/
`discoverGraph`/`findBlockPath`, and needs an agent-drivable session as a building block;
Phases 2-3 (DOM-inspection tool, simultaneous `--cli` + headful) build on the session/RPC
layer this change introduces.

## Roadmap (why this slice, not the whole vision)

Six phases were laid out; only Phase 1 is scoped and specced here.

1. **This change** - session control: `--detach`, `send`, `status`, `attach`.
2. **Not in this change** - a `dom`/`inspect` verb on the same RPC surface with `full`/
   `aria`/`container` fidelity layers, for an agent to read the live page without FE source
   access.
3. **Not in this change** - decoupling `--cli` from `headless` so an agent can drive via RPC
   while a real visible browser runs at the same time ("waygraph codegen"), plus a structured
   trace for turning a driven session into authored Blocks.
4. **Not in this change** - agent-skill hardening (`waygraph-author.agent.md` rules,
   `defineAssertBlock`, `*Sel` enforcement in `verify` arrays, orphan-Block self-gate).
5. **Not in this change** - the `maildrop.cc` external-mail adapter.
6. **Not in this change** - Waygraph Copilot itself (the client-safe graph manifest, browser-
   side `locate()`/`findBlockPath`, intent resolution, narrate/agentic delivery modes).

Phase 1 stands on its own: it is useful today (any script or agent gains a real,
non-interactive way to drive `waygraph auto --cli`) even if Phases 2-6 never get built, the
same "stands alone" bar `nav-block-and-check` held itself to for its own phase 1.

## Goals / Non-Goals

**Goals:**
- A non-interactive caller can start an explore session, drive it one pick at a time, and
  read its state back, without a TTY and without guessing a whole input sequence upfront.
- A human can still attach an interactive terminal to a session already running headless in
  the background, using the exact rendering/parsing the foreground loop already has.
- Zero behavior change to the existing foreground `--cli` and headful paths - this change is
  additive, not a rewrite of the picker loop.

**Non-Goals (this change):**
- DOM-inspection tooling (Phase 2).
- Simultaneous `--cli` + headful, or any trace/codegen output (Phase 3).
- Any change to `buildExploreMenu`, `detectHere`, `runOneBlock`, or Block execution
  semantics - this change only adds a transport/session-lifecycle layer around the existing
  loop body.
- Any change to headful (non-`--cli`) behavior.
- Multi-client concurrency on one session (two callers `send`-ing to the same session at the
  same time) - out of scope for a first cut; see Risks.

## Decisions

**The detached server is a plain request/response handler, not a re-armed wait promise.**
Originally planned to reuse `headfulPick`'s `armPickWait`/`pickSlot` shape (a promise some
external event resolves) for the remote pick source too. Reversed once the server's actual
shape was worked out: `armPickWait` exists because headful has one continuously-running loop
that must synchronize with an *unpredictable, asynchronous* browser click arriving whenever it
arrives. A socket server has no such loop to unblock - each incoming `send`/`status` request
directly awaits the session's own `applyPick`/`snapshot` call and responds. The only thing
that still needs care is that two requests must not run concurrently against the same `page`/
`mem` (Node's single-threaded event loop already prevents true parallelism, but two
overlapping `await`-heavy handlers could still interleave); a simple per-session request queue
(each request awaits the previous one's completion before starting) is sufficient - no
promise-arming pattern needed at all. This does not change the additive, low-risk framing:
it is still net-new code alongside the existing loop, just simpler than first planned.

**`attach` is implemented entirely client-side, with zero new server behavior.** It connects,
calls `status`, renders the result with the existing `printCliMenu`, reads a line with a local
`readline` using the existing `cliPick` parsing rules, and calls `send` with the result -
repeating until quit or disconnect. Considered making the server itself switch into an
"interactive" sub-mode for an attached client; rejected because it would require the server to
track per-connection interactive state for no behavioral gain over just calling `send`/`status`
in a loop from the client, and it would make `attach` a second, parallel picker implementation
to keep in sync with `cliPick` instead of the same one.

**The wire pick is always the same plain value `cliPick` already accepts (a menu index or
`q`/`quit`), never a serialized Block or MemKey reference.** The outgoing snapshot (menu,
Checkpoint, `lastRunNote`) needs to become plain JSON for the wire, but the incoming pick does
not - it is already just a number or a short string today, and stays that way over the socket.
This avoids any need to serialize/reconstruct `Block`, `MemKey`, or `ExploreEdge` objects
across the process boundary; the detached server always resolves a pick against its own
already-loaded `library`/`graph`, exactly as the foreground loop does today.

**Session identity lives under `.waygraph-auto/`, mirroring `.waygraph-traverse/`.** This
codebase already has a per-feature dotdir convention for local process-coordination state
(`.waygraph-traverse/` holds lease and coverage files for `waygraph traverse`). Reusing that
shape rather than inventing a new location keeps consumer `.gitignore` entries and mental
model consistent.

**Unix domain socket, not a TCP port.** Considered a loopback TCP port with a random/assigned
port number; rejected in favor of a unix socket under the project-local dotdir - no port
allocation/collision concerns across multiple concurrent sessions or multiple agents on the
same machine, and the socket's mere presence on disk is itself the "is this session alive"
signal `status`/`send` can check before attempting to connect.

## Risks / Trade-offs

- [A detached session that crashes without going through the `q`/`quit` path leaves a stale
  socket/metadata file behind] -> `send`/`status`/`attach` SHALL detect an unreachable socket
  and report a clear error rather than hang (see spec's "stale or unreachable session"
  scenario); cleaning up the stale files themselves is a small follow-up, not blocking this
  change.
- [Two callers sending to the same session concurrently could interleave picks in a
  surprising order] -> Accepted as out of scope for this first cut - a single logical driver
  (one agent, or one attached human) per session is the intended usage; documented as a
  known limitation, not silently glossed over.
- [The detached process outlives the terminal/session that started it, which could surprise
  an operator who expects `Ctrl-C` to stop everything] -> Mitigated by `--detach` being
  opt-in (bare `--cli` behavior is unchanged) and by `send q` / `quit` being the documented,
  explicit way to end a session - not a new failure mode, the same shape as any other
  intentionally-backgrounded process.
- [Extracting the loop's per-turn state into a shared snapshot/step function could
  accidentally change foreground behavior] -> Mitigated by treating "zero behavior change to
  existing `--cli`/headful paths" as a hard proof requirement (see tasks.md M1.3), not just an
  intention.
