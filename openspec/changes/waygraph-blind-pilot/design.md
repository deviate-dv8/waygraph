## Context

`openspec/changes/waygraph-pilot/`'s own Roadmap section flagged this exact gap when Phase 6
was corrected: non-blind Pilot assumes a Block library already exists; Blind Pilot is the
opposite case, and needs primitives Phase 1-3's session-control work never built because
nothing before now needed them. Two things were verified directly (not assumed) before
writing this design:

- `AutoSession.start()`/`loadBlockLibrary` already tolerate a project with zero `.block.ts`
  files (`src/auto-explore.ts:117` returns empty maps; `detectHere`/`locate`,
  `src/auto-explore-run.ts:71`, return `null` on an empty `navBlocks` list rather than
  throwing). So "open a session on a brand-new site" needs no new code at all.
- The detached-session socket protocol (`src/auto-session-ipc.ts`) already processes one
  request at a time through an explicit queue (`serveSession`'s `enqueue` wrapper around
  `Promise.resolve()`), specifically to prevent two overlapping `await`-heavy handlers from
  interleaving against the same page/mem. Any new op added to this protocol inherits that
  same serialization guarantee automatically - a real, load-bearing fact, not something this
  change needs to design itself.

What's missing is narrow and concrete: a way to act on a page before any Block exists for
that action, and a way for a Block written to disk mid-session to become usable without
restarting the session (which would mean relaunching the browser and losing navigation/mem
state - defeating the point of writing a Block *while* exploring).

## Roadmap (why this slice, not the whole vision)

1. **This change** - `click`/`type`/`goto` raw session ops, plus `reload` for picking up a
   newly-written Block mid-session. Proven end to end against an in-repo synthetic fixture.
2. **Not in this change - Block-content generation.** Nothing here decides what a Block
   should look like or writes `.block.ts`/`*Sel`/mem-key source text. The driving agent
   (Claude, or any other LLM) already knows how to write a source file once it knows the
   conventions (documented in `README.md`) - matching Phase 6's own hard-won lesson that an
   internal decision-maker (there, `resolveAsk`; here, a hypothetical "Block writer") solves
   the wrong problem when an external agent can already do it correctly itself.
3. **Not in this change - Waygraph Map.** A portable, consolidated graph package artifact
   Blind Pilot might eventually target/update directly, per the user's own vision ("update
   the blocks using the waygraph map"). This change writes plain `.block.ts` files via the
   driving agent's own file-write tool, the same way a human author would - it does not
   assume or design any Map-shaped intermediate representation. Real, honest dependency, not
   silently resolved: if Waygraph Map is designed later as the *only* sanctioned way to
   author into `templates/scaffold`'s convention, this change's "write plain files directly"
   approach may need revisiting then - not a decision this change is positioned to make.
4. **Not in this change - Waygraph Router.** An unrelated, opinionated folder convention.
   Orthogonal to Blind Pilot itself; not touched here.
5. **Not in this change - asking the human a clarifying question.** Not a technical
   capability - the driving agent already has a normal conversation channel with its user.
   Nothing here builds a prompt/question API.

## Goals / Non-Goals

**Goals:**
- An agent can act on a live page (click, type, navigate) even when no Block exists yet for
  that action, using the exact same detached-session socket protocol every other
  session-control op already uses.
- A Block written to disk mid-session becomes immediately driveable via the session's
  existing `send`, without restarting the browser or losing navigation/mem state.
- Both integrate into the existing response shapes (`StatusOrSendResponse`) rather than
  inventing a new one - the CLI/agent-facing shape for "here's the resulting snapshot" stays
  singular across `send`/`click`/`type`/`goto`/`reload`.

**Non-Goals (this change):**
- Block-content generation/templating (see Roadmap above).
- Waygraph Map, Waygraph Router (see Roadmap above).
- Any change to `waygraph-pilot`'s own `pilotStart`, or to `resolveAsk`'s removal.
- Frame-scoped raw actions (an iframe's own content) - raw `click`/`type` operate against
  `page.locator(selector)` directly, matching how a Block's own `act()` typically does today;
  a Block needing frame-scoped verification already has `frameVisible`/`frameText`/
  `frameContains` (Phase 5) for that, which is unaffected by this change.

## Decisions

**Raw ops reuse `applyPick`'s own response shape (`StatusOrSendResponse`), not a new type.**
`click`/`type`/`goto` all end the same way `send` does: something happens to the live page,
then the session's own `detectHere`-based snapshot is recomputed and returned. Giving them
their own response shape would mean two ways to say "here's what happened and where you are
now" - `StatusOrSendResponse`'s existing `{ok:true, snapshot, quit} | {ok:false, error}`
already fits exactly, `quit` simply always `false` for these three (there is no "raw action
that ends the session" concept).

**`reload` also reuses `StatusOrSendResponse`.** Re-discovering the library changes what
`currentMenu()` can see (new Nav/Method edges), which the very next `snapshot` already
reflects with no special-casing - `buildExploreMenu`/`currentSnapshot()` are already called
fresh on every request, never cached beyond a single response. `reload` itself does not need
to describe *what* changed (block counts, diffs) - the agent can already tell, by comparing
the snapshot it gets back against the one it had before writing the new Block.

**`AutoSession.reloadLibrary()` replaces `this.library`/`this.graph` in place, and touches
nothing else.** `loadBlockLibrary(projectDir)` and `discoverGraph(projectDir)` are both
already pure, side-effect-free reads of the filesystem - re-running them and swapping the two
fields is the entire implementation. `this.page`/`this.mem`/`this.here`/the browser
context/contextOptions are untouched, by construction (the method never references them).

**No new concurrency design needed for the new ops.** `serveSession`'s existing `enqueue`
wrapper already serializes every request against a session, added here or not - a `reload`
landing between two `send` calls, or a `click` immediately followed by `status`, is already
handled correctly by infrastructure this change doesn't touch.

**Raw actions use `page.locator(selector)` directly (click/fill), not a Trait or a Block.**
There is no Checkpoint to resolve into and no `verify` to run for a raw action - it is
explicitly pre-Block, exploratory interaction, matching the "no Block exists for this yet"
premise. A selector matching nothing is a real, reportable failure (`{ok:false, error}`
naming the selector), not a silent no-op - consistent with `pilotStart`'s (and everything
else's) "fail loud" convention throughout this codebase.

## Risks / Trade-offs

- [Raw actions bypass Block-level verify entirely - a click that "succeeds" (element existed,
  was clicked) but didn't actually do what the agent intended has no automatic detection] ->
  Accepted: this is deliberately pre-Block territory. Once the agent understands the
  resulting behavior well enough to author a real Block for it, that Block's own `verify`
  provides the real correctness check - raw actions are a means to that authoring, not a
  replacement for it.
- [This change's own proof uses a hand-authored fixture Block, not an agent actually
  recognizing a pattern and writing one unassisted] -> Stated plainly, matching this
  project's own established precedent: this change proves the *primitives* work end to end
  (act blind, write a Block, reload, drive it) - not that any particular agent is good at
  recognizing patterns, which is a model-capability question outside this package's scope.
- [Depends on Waygraph Map not existing yet in a way that could make "write plain files
  directly" the wrong long-term answer] -> Real, stated honestly in the Roadmap section
  above, not silently resolved by inventing a Map format here.
