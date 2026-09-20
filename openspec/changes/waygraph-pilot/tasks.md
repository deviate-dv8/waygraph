## Status (read this first, always)

**State: corrected and re-implemented (M1-M4). This change has now been rebuilt twice - both
times from direct user correction, not internal review. Read both corrections before touching
anything here again; do not silently narrow or drop either one.**

**Correction 1 (before any code existed):** the first design draft wrongly assumed Pilot had
to run as a sandboxed script embedded into an untrusted end-user page (no Playwright/CDP
access), inventing hard problems (cross-origin iframe access, synthetic-event trust, a
native-DOM compatibility shim) that don't apply. Corrected once `AutoSession`'s actual
existing surface was re-checked: Pilot is a launched Playwright session, like every other
command in this roadmap.

**Correction 2 (after the corrected model's first implementation shipped, was tested, and was
demoed live):** that implementation - `resolveAsk` (deterministic ask-to-edge text matcher),
`pilotNarrate`/`pilotAct`, a `waygraph pilot ask "<text>" --mode narrate|agentic` CLI command,
12 real tests against live saucedemo.com, full README/ROADMAP docs - was **entirely removed**
after the user rejected it: *"this isn't it. its just a glorified waygraph demo --logs
stuffs... this one you made is just an extended version of this of logs but prettified."* A
real request is multi-step; matching one ask to one edge and stopping there does not satisfy
it, no matter how accurate the matching gets. That code is preserved for reference at git tag
`waygraph-pilot-v1-logs-prettified`, not reachable from any active branch.

**The re-implementation (this file's current milestones) was proven by hand before being
written as code**: a real multi-step goal (log in, add an item to cart, complete checkout)
was driven to `OrderComplete` against live saucedemo.com using only pre-existing commands
(`auto --cli --detach`, `waygraph graph`, `auto send/status`) - zero new execution
primitives. The only real, confirmed gap was a convenience: combining session-start and
graph-discovery into one bootstrap call for an agent, instead of two it would otherwise have
to know to chain itself. That gap is `pilotStart` / `waygraph pilot start`, below.

- [x] Milestone 1 (M1) - Remove the rejected implementation
- [x] Milestone 2 (M2) - `pilotStart` bootstrap function
- [x] Milestone 3 (M3) - `waygraph pilot start` CLI entry point
- [x] Milestone 4 (M4) - In-repo proof
- [x] Milestone 5 (M5) - Multi-step routing (`applyPath`/`auto reach`)
- [ ] Milestone 6 (M6) - Real-consumer proof (out of scope for this change, tracked
      separately - see spec.md's own honest-scope requirement)

---

## M1. Remove the rejected implementation

- [x] M1.1 Deleted `resolveAsk`, `pilotNarrate`, `pilotAct`, `ResolvedAsk`, `NarrateResult`,
      the self-contained ring-renderer (`installPilotOverlay`/`showPilotRing`), and all
      related constants (`STOPWORDS`, `stem`, `tokenize`, `MIN_CONFIDENCE`) from
      `src/pilot.ts` - none had another consumer once the `pilot ask` CLI case was removed.
- [x] M1.2 Removed `AutoSession.getPage()` and `AutoSession.peekStubBefore()` from
      `src/auto-session.ts` - confirmed (via repo-wide grep) both existed solely for the
      now-removed narrate mode, no other caller anywhere in `src/`/`tests/`.
- [x] M1.3 Removed the `pilot ask` CLI case from `src/cli.ts`; removed the now-unused
      `AutoSession` import (confirmed via grep it had no other use in that file); updated
      `usage()`'s pilot section.
- [x] M1.4 Updated `src/index.ts`'s exports (`resolveAsk`/`pilotNarrate`/`pilotAct`/
      `ResolvedAsk`/`NarrateResult` removed).
- [x] M1.5 Tagged the pre-removal commit `waygraph-pilot-v1-logs-prettified` (annotated,
      with a message explaining what it was and why it was superseded) - preserves the
      rejected implementation for reference without keeping it live on `main`.

## M2. `pilotStart` bootstrap function

- [x] M2.1 `src/pilot.ts`: `pilotStart(init: AutoSessionInit): Promise<PilotStartResult>` -
      runs `spawnDetachedSession(init)` and `discoverGraph(init.projectDir)` in parallel
      (neither depends on the other), then one `requestSession(..., { op: "status" })`
      against the now-ready session, returning
      `{ sessionId, socketPath, headless, graph, snapshot }`.
- [x] M2.2 No new session-control logic - `spawnDetachedSession`/`discoverGraph`/
      `requestSession` are all pre-existing, unmodified (Phase 1-3, and the pre-existing
      `graph` command's own mechanism respectively).
- [x] M2.3 Real tests (`tests/pilot/pilot.spec.ts`, imported from `dist/` not `src/` per the
      established dual-module-instance precedent): a real session id/socket path/headless
      flag are returned; the returned `graph` contains the whole project (Checkpoints/edges
      not reachable from the starting position included, e.g. `OrderComplete`/`finish-order`
      from a fresh `LoginPage` start) - not scoped down to the current snapshot; the
      returned `snapshot.here` matches the session's real starting position; and, separately,
      that the session really is still alive and driveable afterward - a caller can pick an
      edge straight out of the returned snapshot and `send` it, then read a fresh `status`,
      using only the pre-existing IPC surface.
- [x] M2.4 Real bug found and fixed while writing these tests: the test's own `afterEach`
      recursively deleted the whole shared `.waygraph-auto/` directory, racing with a
      sibling test's still-running session under Playwright's default parallel workers
      (confirmed by reproducing the failure, then fixing it - not assumed). Fixed by relying
      on each test's own explicit `send "q"` to quit its session, matching
      `tests/cli/pilot.spec.ts`'s already-correct pattern; both files pass at
      `--repeat-each=2` under real concurrent Playwright workers afterward.

## M3. `waygraph pilot start` CLI entry point

- [x] M3.1 New `pilot` sub-command in `src/cli.ts`:
      `waygraph pilot start [--non-headless] [--base-url <url>] [--data <json>]` - reuses
      `parseRunFlags`/`applyRunFlags`, the same shared flag surface `auto`/`demo`/`run`
      already use. Prints `pilotStart`'s result as JSON; a thrown error is reported with
      exit code 1, not a silent failure.
- [x] M3.2 `usage()` text rewritten for the `pilot` section (the old `pilot ask` text
      described a resolver/narrate/agentic split that no longer exists).
- [x] M3.3 Real tests (`tests/cli/pilot.spec.ts`, via `bin/waygraph` - `discoverGraph`, run
      in-process by `pilot start`, imports this project's own `.block.ts` files, which need
      `tsx/esm` registered; the same reason `waygraph graph` itself has always needed
      `bin/waygraph`, not a `pilot`-specific concern): a real `pilot start` call returns a
      real session id/socket path and the whole project graph against live saucedemo.com;
      that session is still reachable via a separate real `auto status <sessionId>` call
      afterward; and an unrecognized `pilot` sub-verb (`pilot ask`, the old verb) reports
      clear usage with exit code 1, not a crash.

## M4. In-repo proof

- [x] M4.1 Chose `examples/saucedemo` (same as before) - consistent with the mail-verify and
      original Pilot precedent for reusing one already-atomic example rather than adding a
      second one purely for redundant proof.
- [x] M4.2 Real end-to-end proof, in two layers: `tests/pilot/pilot.spec.ts` (the library
      function) and `tests/cli/pilot.spec.ts` (the real CLI), both against live
      saucedemo.com. Separately, the underlying claim - that an agent can reach a real
      multi-step goal using only pre-existing commands - was proven by hand via direct shell
      commands (`auto --cli --detach` -> `waygraph graph` -> repeated `auto send/status`)
      reaching real `OrderComplete` through login + add-to-cart + checkout + finish-order,
      before `pilotStart` itself was written; this is the concrete example `design.md`/
      `ROADMAP.md` both cite.
- [x] M4.3 `README.md`/`ROADMAP.md` updated: the corrected capability, both corrections
      (sandboxed-runtime, then one-ask-to-one-edge) stated plainly rather than overwritten,
      and the honest 1.0.0-scope note carried forward unchanged.
- [x] M4.4 Full regression suite re-confirmed green: 190/190 across every test directory
      except `tests/unit/` (a pre-existing, unrelated gap - five files there import `vitest`
      directly, which isn't installed; confirmed via `git blame` to predate this session by
      many releases, not something this change touched or introduced). `npm run build`
      clean.

## M5. Multi-step routing (`applyPath`/`auto reach`)

Direct user feedback after M1-M4 shipped: driving a real multi-step task one `auto send` at a
time is real, reported pain on a rich graph ("the entire prompts of the day" for one
walkthrough). `AutoSession.applyPath(targetCheckpoint)` / `waygraph auto reach <sessionId>
<Checkpoint>` runs a whole route in one call instead.

**Three designs were tried and rejected in sequence, each found wrong by direct reproduction
against live saucedemo.com, not theory - read this before changing `applyPath` again:**
1. Compute the path once via `findBlockPath`, run each step gated on live-menu visibility -
   fails immediately: a `from: "*"` edge (e.g. "Checkout") looks reachable from anywhere to
   the static graph, but the live menu only shows it once its real DOM precondition holds
   (checked via `navRunnable`), which the static graph has no way to know.
2. Re-plan after every real step instead of trusting a route computed once upfront - doesn't
   fix it: the very first suggestion is already the premature wildcard edge, so re-planning
   from the same starting position reproduces the identical wrong answer.
3. Score every live-menu option by its static-graph distance to the target (greedy
   best-first) - also wrong: wildcard "shortcuts" make most states look artificially close to
   any target, so a harmless self-loop Method (e.g. `fill-password`) can score as well as real
   progress, and the session gets stuck repeating it.

**What actually works:** stop trying to be clever about live-menu visibility at all, and
reuse `auto --blocks <From> <To>`'s own already-shipped approach (`runChainAuto`) - compute
the path once via a BFS, then run each step directly, trusting the graph the same way
`runChain`'s flow execution already does. The one difference from `runChainAuto`: this runs
against the session's own already-live page/context/mem, not a freshly spawned browser - the
whole reason to stay in one session.

**A real, separate correctness bug found by this change's own test suite, not anticipated by
the above:** a Block can resolve to a *different* real Checkpoint than its own graph edge
promised without throwing at all - e.g. `submit-login`'s `resolve()` legitimately "stays on
LoginPage" on bad auth instead of erroring. Trusting a step's `ok: true` alone would silently
report success while sitting on the wrong page. Fixed two ways: (a) `findBlockPathDetailed`
(new, in `src/graph.ts`, alongside the unmodified `findBlockPath`) returns each hop's specific
edge (block name *and* the Checkpoint it targets), not just a block-name list - needed because
a union-Out Block (e.g. `add-all-to-cart`, which has both an `ItemInCart`-targeting and a
`LoggedIn`-targeting edge) can have several edges sharing one name with different `to` tags;
re-deriving "the expected `to`" by name after the fact can silently grab the wrong one. (b)
`applyPath` verifies `this.here` against that specific edge's `to` after every step, not only
once at the end, failing loud (naming the step and where it actually landed) rather than
reporting false success.

**A real, pre-existing limitation surfaced, affecting `auto --blocks` too, not something this
change introduced:** for a target reachable only by crossing a `from: "*"` edge whose real
precondition depends on same-Checkpoint "setup" actions the graph can't see (e.g. filling
form fields before a submit), neither `applyPath` nor the already-shipped `auto --blocks
<From> <To>` can safely route there automatically - both will attempt the graph's shortest
theoretical path and fail loud (a real, bounded error, e.g. a Playwright click/wait timeout,
not a silent wrong answer or a hang) rather than succeed. Confirmed by direct reproduction
against saucedemo's own `LoginPage -> OrderComplete` (crosses exactly this kind of edge) for
both commands. Stated honestly rather than silently worked around; fixing the underlying
graph model to encode real DOM preconditions is real, separate, unscoped future work.

- [x] M5.1 `src/graph.ts`: `findBlockPathDetailed` (new, additive - `findBlockPath` itself
      unchanged, still used wherever only the block-name sequence matters).
- [x] M5.2 `src/auto-session.ts`: `applyPath(targetCheckpoint): Promise<ApplyPathResult>`;
      `runNamedBlock` factored out of `applyPick` as the shared execution core both now call.
- [x] M5.3 `src/auto-session-ipc.ts`/`src/cli.ts`: `{ op: "reach"; checkpoint: string }` IPC
      op, `waygraph auto reach <sessionId> <Checkpoint>` CLI verb (90s request timeout, not
      the other ops' 15s default - a real multi-step route runs several real Blocks in
      sequence before responding, a legitimately slow single request, not a hang).
- [x] M5.4 Real tests against live saucedemo.com: reaching an already-current Checkpoint
      returns immediately (`path: []`); a real multi-step route with no setup-step
      requirement (`LoggedIn -> CartPage` via `nav-cart`) runs correctly in one call; a route
      crossing a wildcard edge whose real precondition isn't met fails loud within a bounded
      time, not a hang, and leaves the session alive and usable afterward; an unknown target
      Checkpoint is reported clearly. Both library-level (`tests/pilot/pilot.spec.ts`) and
      CLI-level (`tests/cli/auto-session.spec.ts`) layers covered. Full regression suite
      re-confirmed green (201/201, same `tests/unit/` exclusion as before). `npm run build`
      clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Blind Pilot: an agent exploring a live site with zero pre-existing Blocks, writing new
      Block files as it recognizes patterns. Confirmed partially possible today
      (`AutoSession`/`loadBlockLibrary` tolerate zero `.block.ts` files without throwing),
      but real gaps remain unbuilt: no raw interaction primitive (`auto click/type/goto`)
      for acting before any Block exists, and no "write a Block file from what just
      happened" capability. Tracked in `ROADMAP.md`'s Phase 6b/6c section.
- [ ] Waygraph Map / Waygraph Router - vision only, tracked in `ROADMAP.md`.
- [ ] A smarter (embedding/LLM-assisted) plain-language matcher - explicitly not being
      reconsidered; see spec.md's own requirement against reintroducing a resolver.
- [ ] Embedding into a real external consumer application, and the associated `1.0.0`
      declaration this change alone does not complete.
