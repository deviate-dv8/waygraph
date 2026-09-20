## Context

`ROADMAP.md`'s Phase 6 bullet describes an agent driving a real app session toward a real
user's plain-language goal. This design has already gone through two corrections, both from
direct user rejection, not internal review - both are load-bearing history, not superseded
detail to prune.

**Correction 1 (before any code existed):** an earlier pass assumed Pilot had to run as a
script sandboxed inside an untrusted end-user page, no Playwright/CDP access at all. That
generated a long list of invented hard problems (cross-origin iframe access, synthetic-event
trust, a native-DOM compatibility shim) that don't actually apply. The corrected model,
confirmed by re-reading what Phase 1 already built (`src/auto-session.ts`): `AutoSession` is
a **launched** Playwright session, exactly the same execution model every other command in
this whole roadmap already uses.

**Correction 2 (after the corrected model's first implementation shipped and was demoed):**
that first implementation was itself wrong. It shipped `resolveAsk` (deterministic
token-overlap scoring of a free-text ask against reachable edges' `description` fields),
`pilotNarrate`/`pilotAct` (highlight vs. run the one resolved edge), and a
`waygraph pilot ask "<text>" --mode narrate|agentic` CLI command - fully implemented, tested
(12 tests, all real, against live saucedemo.com), and demoed live. The user's response to
that demo, verbatim: *"this isn't it. its just a glorified waygraph demo --logs stuffs...
this one you made is just an extended version of this of logs but prettified."* The gap: a
real request is multi-step ("log in and buy the backpack for me") and needs an agent
*planning a route through the graph*, not a tool that internally decides the single
best-matching edge for one short phrase and stops there. `resolveAsk` was solving the wrong
problem correctly, not solving the right problem badly - no amount of improving its matching
accuracy would have closed this gap.

**What the correct shape actually needs, verified directly rather than assumed:** before
writing any new code, the corrected shape was proven by hand. A detached session was started
(`auto --cli --detach --non-headless --data '{...}'`), its whole graph read
(`waygraph graph`), and a real multi-step goal - log in, add an item to the cart, complete
checkout - was driven to `OrderComplete` using only `auto send <id> "<pick>"` calls, each
pick chosen by reading the previous `status`/`send` response and reasoning about which edge
served the goal. This used **zero new session-control primitives** - `auto
send/status/dom/trace` (Phase 1-3) already did everything needed. The only real gap: an
agent currently has to know to chain two separate existing commands (`auto --cli --detach`
for the session, `waygraph graph` for the whole-project context) to bootstrap. That is the
entire scope of what this change now builds.

## Roadmap (why this slice, not the whole vision)

1. **This change** - `pilotStart`: combine `spawnDetachedSession` and `discoverGraph` into
   one bootstrap call, proven in-repo. Removes the rejected `resolveAsk`/`pilotNarrate`/
   `pilotAct`/`pilot ask` implementation entirely (preserved at git tag
   `waygraph-pilot-v1-logs-prettified` for reference, not kept live in the codebase).
2. **Not in this change - Blind Pilot.** The same mechanism, but for a project with zero
   pre-existing Blocks: an agent explores a live site cold via the DOM-inspection primitives
   (`auto dom`/`auto trace`, Phase 2-3), recognizes patterns, and *writes* new Block files as
   it goes, asking the human clarifying questions it can't resolve from the DOM alone.
   Confirmed already partially possible today (`AutoSession`/`loadBlockLibrary` tolerate a
   project with zero `.block.ts` files without throwing - `detectHere`/`locate` return
   `null` on an empty `navBlocks` list), but a real, unbuilt gap remains: there is currently
   no raw interaction primitive (`auto click`/`type`/`goto`) for acting on a page before any
   Block exists, and no "write a Block file from what I just did" capability. Out of scope
   here - vision only, tracked in `ROADMAP.md`'s Phase 6b/6c section.
3. **Not in this change - Waygraph Map / Waygraph Router.** A portable, consolidated graph
   package artifact, and a second, opinionated Next.js-App-Router-style folder convention,
   respectively. Both vision only, tracked in `ROADMAP.md`, not scoped or designed here.
4. **Not in this change - a smarter agent embedded as a package feature.** The agent that
   plans a multi-step route through the graph is external to this package (Claude, or any
   other LLM with tool-calling) - this package's job is only to hand it a real session and
   real context, not to embed a planner of its own. Nothing here forecloses a future
   in-package planning helper, but this change does not need one to be useful.
5. **Not in this change - embedding into a real external consumer application.** Proof stays
   in-repo, matching Phases 4 and 5's own established precedent for the identical tension.

## Goals / Non-Goals

**Goals:**
- One call gives an agent everything it needs to start driving a multi-step task: a real,
  already-running session, and the whole project's graph (not just what's reachable right
  now - multi-step planning needs to see steps ahead).
- Driving the session afterward uses only commands that already existed before this change
  (`auto send/status/dom/trace`) - no new execution mechanism.
- The rejected one-ask-to-one-edge architecture is fully removed, not left dangling as dead
  or parallel code.

**Non-Goals (this change):**
- Any plain-language resolver, matcher, or Block-picking logic living inside this package.
  That reasoning belongs to the agent holding the session.
- Blind Pilot, Waygraph Map, Waygraph Router (see Roadmap above).
- Embedding into any real external consumer application (see Roadmap above).

## Decisions

**`pilotStart` composes two already-existing, separately-proven primitives - it does not
wrap them in any new abstraction beyond a single return shape.** `spawnDetachedSession`
already starts a real, persistent session and waits for its own readiness signal before
resolving; `discoverGraph` already walks a project's `.block.ts` files into a
Checkpoint/edge/description graph. `pilotStart` runs both (the graph discovery in parallel
with the session spawn, since neither depends on the other) and follows up with one `status`
read against the now-ready session, returning
`{sessionId, socketPath, headless, graph, snapshot}`. No new server-side session logic, no
change to `auto`'s existing IPC protocol.

**`AutoSession.getPage()`/`peekStubBefore()` are removed, not kept as unused public API.**
Both existed solely to support the now-removed narrate mode (direct Playwright page access
for rendering a highlight ring; previewing a Block's `stubBefore` data without running it).
Neither has any other consumer. Keeping them "in case a future narrate-like feature wants
them" would be exactly the kind of speculative surface this project's own conventions argue
against; if a real future consumer needs them, they can be re-added then, against a real
requirement.

**The rejected implementation is preserved at a git tag, not silently deleted from
history.** `waygraph-pilot-v1-logs-prettified` marks the commit before removal, with a tag
message explaining what it was and why it was superseded - satisfies "don't lose work" without
keeping it live on `main` or re-litigating whether it should come back.

**No new session-control primitive is added, even though Blind Pilot will eventually need
one.** The multi-step saucedemo proof (login + add-to-cart + checkout) used only
`auto send/status`, because that project already has an authored Block library - non-blind
Pilot's whole premise. A raw `auto click/type/goto` primitive is real, future, separately
justified work for Blind Pilot (which has no Block library to pick edges from at all), not
something this change should add speculatively now.

## Risks / Trade-offs

- [An agent still has to do its own multi-step planning/reasoning - this package provides no
  planning assistance beyond the raw graph] -> Accepted, and correct: the planning agent is
  external (Claude, or any LLM with tool-calling), matching the user's own explicit framing
  ("browser-use, but sending waygraph commands instead of raw CDP - lesser, but more accurate
  and deterministic"). This package's job is context + a driveable session, not a planner.
- [Proof stays in-repo, so this change alone does not satisfy `ROADMAP.md`'s own original
  `1.0.0` criterion ("demoable on one real consumer")] -> Stated plainly, same as the
  previous version of this design; reaching it is real, separate, later work.
- [Removing `resolveAsk`/`pilotNarrate`/`pilotAct` discards real, working, tested code] ->
  Deliberate: it solved a problem the user didn't have. Preserved at a git tag for reference,
  not reintroduced without a new proposal explicitly re-opening that decision (see spec.md's
  own requirement to this effect).

## M5 addendum: multi-step routing (`applyPath`/`auto reach`)

Full design history (three rejected approaches, the real correctness bug found by this
change's own tests, and the pre-existing `auto --blocks` limitation this surfaced) lives in
`tasks.md`'s own M5 section, not duplicated here - read it before touching `applyPath` again.
The one decision worth restating at this level: **routing reuses `runChainAuto`'s
already-proven "trust the static graph, run each step directly" model rather than inventing
live-menu-aware cleverness**, because every attempt at the latter (gating on live-menu
visibility, re-planning per step, scoring live options by static-graph distance) was
independently found wrong by direct reproduction. The static graph's own blind spot (a
wildcard edge's real DOM precondition isn't encoded anywhere) is a real, accepted limitation
of the current graph model, not something `applyPath` tries to paper over - it fails loud and
bounded instead, matching how `runChainAuto` already behaves for the identical case.
