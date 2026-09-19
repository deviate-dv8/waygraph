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
- [ ] Milestone 5 (M5) - Real-consumer proof (out of scope for this change, tracked
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
