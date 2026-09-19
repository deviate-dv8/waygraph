## Why

`ROADMAP.md`'s Phase 6 is the last item in the "Agent-authoring tooling and Waygraph
Pilot" roadmap and the stated gate for `1.0.0`: point a real user at a real running app
and resolve a plain-language ask ("how do I invite a signer") to a real Checkpoint, then
either narrate it (highlight the real control) or drive it for real. Phases 1-5 built
exactly the machinery this needs and already proved it stable: `AutoSession` (Phase 1) is a
Playwright-driven session that already exposes a live, JSON-serializable menu of every
reachable edge - each one already carrying that Block's required `description` - and
already executes any one of them for real via `applyPick()`. `discoverGraph`/`findBlockPath`
(pre-existing) already do graph reachability. The ring/highlight overlay `waygraph demo`
already renders is real, Playwright-orchestrated, and proven.

An earlier pass at this proposal wrongly assumed Pilot had to run as a sandboxed,
zero-install script embedded into a stranger's own page - a fundamentally different,
untrusted-browser execution model with real hard constraints (no cross-origin iframe
access, no trusted synthetic input) that don't apply here at all, because nothing about this
capability needs to run outside the same Playwright/CDP session every other phase already
uses. Corrected: Pilot is a **launched session**, exactly like every `waygraph auto`/
`demo` command already is - not code injected into an arbitrary tab it doesn't control.
Given that, the only genuinely new piece is the plain-language resolver; everything else is
composition of already-shipped, already-stable Phase 1-5 machinery.

## What Changes

- **New: a plain-language-to-edge resolver.** Given a free-text ask and an `AutoSession`'s
  live `currentSnapshot()`, scores the ask against every reachable edge's `description`
  (already a required field on every Block) and returns the best-matching edge, or "no
  confident match" - no new authoring burden, no new data captured from Blocks that isn't
  already there.
- **New: narrate mode.** Given a resolved edge, renders the same ring/highlight overlay
  `waygraph demo` already renders for that Block - reusing its `stubBefore`/highlight data
  and `src/cli.ts`'s existing ring-rendering primitives (exported for reuse, not
  reimplemented) - against the session's real live page, without running the Block.
- **New: agentic mode.** Given a resolved edge, calls the session's existing
  `applyPick(String(edge.index))` - this already runs the real Block for real, already
  proven in Phase 1's own proof suite. No new execution mechanism.
- **New: a `waygraph pilot` CLI entry point** (`ask "<text>" [--mode narrate|agentic]
  [--detach|--non-headless|...]`), built as a thin layer over the existing `AutoSession`/
  session-control surface from Phase 1, not a parallel session mechanism.
- **Not built:** a client-safe manifest compiler, a Playwright-free client-side runtime, a
  native-DOM compatibility shim, or a `recognizable`-subset distinction for Blocks using
  bespoke Traits. None of that is needed - `locate()`/`verify` keep running exactly as they
  do today, server-side, inside the same Playwright session, with full access to whatever
  the Block's own code does (bespoke Trait included).

## Capabilities

### New Capabilities
- `waygraph-pilot`: resolves a plain-language ask to a real, reachable Checkpoint/edge
  using each Block's existing `description`, then either narrates (highlights the real
  control) or acts (runs the real Block) against a real, live `AutoSession` - composing
  Phase 1-5's already-proven machinery, not a new execution architecture.

## Impact

- New module (e.g. `src/pilot.ts`): the plain-language resolver, and narrate/agentic
  dispatch built on `AutoSession`.
- `src/cli.ts`: export the ring-rendering primitives (`cycleHighlightRings`, `showRing`, and
  their small helpers) so `src/pilot.ts` can reuse them instead of duplicating; add the new
  `pilot` sub-command.
- `AutoSession` itself is unchanged - this is a new consumer of its existing public surface
  (`currentSnapshot`, `applyPick`), not a modification to it.
- One in-repo example (`examples/saucedemo` or `templates/scaffold`) wired with a real,
  proven Pilot demo (a real ask, real resolution, real narration, real agentic execution).
- `README.md`/`ROADMAP.md` - document the capability and the corrected architecture (a
  launched session, not an embedded untrusted-browser script).
- Honest proof-scope note, matching Phases 4-5's own established precedent: proof stays
  in-repo, not a real external consumer app - this satisfies the mechanism, not `ROADMAP.md`'s
  original `1.0.0` criterion of "demoable on one real consumer," which remains separate,
  later work.
- Does not touch any external consumer project. Does not change `runGraph`, `locate()`, or
  any Playwright-side helper's existing behavior.
