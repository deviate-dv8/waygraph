## Why

`ROADMAP.md`'s Phase 6 is the last item in the "Agent-authoring tooling and Waygraph
Pilot" roadmap and the stated gate for `1.0.0`: an agent discovers a real, running app
session and drives it toward a real user's plain-language goal. Phases 1-5 built exactly the
machinery this needs and already proved it stable: `spawnDetachedSession`/`auto --cli
--detach` (Phase 1-3) already starts a real, persistent Playwright session an agent can keep
driving across many calls via `auto send/status/dom/trace <sessionId>`; `discoverGraph`
(pre-existing, powers `waygraph graph`) already produces the whole project's
Checkpoint/edge/description graph.

**This proposal has already been corrected twice, both times by direct user rejection, not
internal review - both corrections are load-bearing and must not be silently reverted by a
future edit to this file:**

1. An early draft wrongly assumed Pilot had to run as a sandboxed, zero-install script
   embedded into a stranger's own page - a fundamentally different, untrusted-browser
   execution model with real hard constraints (no cross-origin iframe access, no trusted
   synthetic input) that don't apply here, because nothing about this capability needs to
   run outside the same Playwright/CDP session every other phase already uses. Corrected to:
   Pilot is a **launched session**, exactly like every `waygraph auto`/`demo` command already
   is - not code injected into an arbitrary tab it doesn't control.

2. **The first shipped implementation of this corrected model was itself wrong**, and was
   removed after being built, tested, and demoed end to end. That version
   (`resolveAsk`/`pilotNarrate`/`pilotAct`, plus a `waygraph pilot ask "<text>"` CLI command)
   resolved one plain-language ask to one best-matching graph edge via deterministic
   token-overlap scoring, then narrated or ran just that one edge. User feedback, verbatim,
   after a live demo of exactly this: *"this isn't it. its just a glorified waygraph demo
   --logs stuffs... this one you made is just an extended version of this of logs but
   prettified."* A real request is multi-step ("log me in and buy the backpack for me",
   "make a signature draft request") and needs an agent that plans and executes a *sequence*
   of Blocks toward a goal - not a tool that internally picks the single best-matching edge
   for one short phrase. That code is preserved for reference at git tag
   `waygraph-pilot-v1-logs-prettified` (not on any active branch), not silently deleted from
   history.

The corrected, final shape was proven live, by hand, before any new code was written for it:
a real multi-step task (log in, add an item to the cart, complete checkout) was driven to
completion against real saucedemo.com using only `auto --cli --detach` + `auto send/status`,
one pick at a time, chosen by reasoning over the graph and each response - using **zero new
execution primitives**. The only genuinely missing piece was a convenience: an agent
currently has to know to chain two separate commands (`auto --cli --detach` to get a session,
`waygraph graph` to get the whole project's graph) to bootstrap. `pilot start` exists only to
combine those two already-existing calls into one.

## What Changes

- **Removed:** `resolveAsk` (plain-language-to-edge resolver), `pilotNarrate` (highlight
  overlay for a resolved edge), `pilotAct` (`applyPick` wrapper), the `waygraph pilot ask
  "<text>" [--mode narrate|agentic]` CLI command, and the two `AutoSession` getters that
  existed only to support narrate mode (`getPage()`, `peekStubBefore()`). All of this
  encoded the rejected one-ask-to-one-edge architecture; none of it had another consumer.
- **New: `pilotStart(init: AutoSessionInit): Promise<PilotStartResult>`** (`src/pilot.ts`) -
  starts a detached session (`spawnDetachedSession`, the exact mechanism `auto --cli
  --detach` already uses) and reads back the whole project's graph (`discoverGraph`, the
  exact mechanism `waygraph graph` already uses) in one call, returning
  `{sessionId, socketPath, headless, graph, snapshot}`. Does not resolve, narrate, or act on
  anything - driving the session afterward is left entirely to whatever agent holds it.
- **New: `waygraph pilot start [--non-headless] [--base-url <url>] [--data <json>]`** CLI
  entry point - a thin wrapper printing `pilotStart`'s result as JSON.
- **Not built, not needed:** any new session-control primitive. `auto send/status/dom/trace
  <sessionId>` already do everything an agent needs to drive a session step by step; a
  multi-step plan is the agent's own reasoning over the graph `pilot start` hands it, not new
  package code.

## Capabilities

### New Capabilities
- `waygraph-pilot`: bootstraps an agent's access to a real, persistent, driveable Playwright
  session in one call - the session itself plus the whole project's graph - so an agent can
  plan and execute a multi-step, natural-language goal using the already-existing
  `auto send/status/dom/trace` session-control surface. Composes Phase 1-3's already-proven
  machinery; does not itself resolve, narrate, or act.

## Impact

- `src/pilot.ts`: rewritten from the resolver/narrate/agentic module to the single
  `pilotStart` bootstrap function.
- `src/auto-session.ts`: `getPage()`/`peekStubBefore()` removed - both existed solely to
  support the now-removed narrate mode, no other consumer.
- `src/cli.ts`: `pilot ask` case replaced with `pilot start`; unused `AutoSession` import
  removed.
- `src/index.ts`: exports `pilotStart`/`PilotStartResult` in place of
  `resolveAsk`/`pilotNarrate`/`pilotAct`/`ResolvedAsk`/`NarrateResult`.
- `tests/pilot/pilot.spec.ts`, `tests/cli/pilot.spec.ts`: rewritten to prove `pilotStart`
  against real saucedemo.com (a real session id, the whole graph, and that the session stays
  alive and driveable afterward via `auto send/status`) instead of the removed resolver.
- `README.md`/`ROADMAP.md`: rewritten to describe the agent-bootstrap shape, with the real
  multi-step saucedemo login+checkout example, and to record both corrections plainly rather
  than silently overwrite the history of what was tried and rejected.
- Git tag `waygraph-pilot-v1-logs-prettified` at the pre-removal commit, preserving the
  rejected implementation for reference without keeping it live in the codebase.
- Honest proof-scope note, unchanged from the prior version of this proposal, matching
  Phases 4-5's own established precedent: proof stays in-repo, not a real external consumer
  app - this satisfies the mechanism, not `ROADMAP.md`'s original `1.0.0` criterion
  ("demoable on one real consumer"), which remains separate, later work.
- Does not touch any external consumer project. Does not change `runGraph`, `locate()`, or
  any Playwright-side helper's existing behavior.
