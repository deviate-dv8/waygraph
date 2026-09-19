## Status (read this first, always)

**State: implemented and verified (M1-M5).** Phase 6 of the "Agent-authoring tooling and
Waygraph Pilot" roadmap in `ROADMAP.md` - the final phase. **This proposal was corrected
mid-flight before any code was written**: the first draft wrongly assumed Pilot had to run as
a sandboxed script embedded into an untrusted end-user page (no Playwright/CDP access), which
generated a long list of invented hard problems (cross-origin iframe access, synthetic-event
trust, a native-DOM compatibility shim). Corrected once `AutoSession`'s actual existing
surface was re-checked: Pilot is a launched Playwright session, exactly like every other
command in this roadmap, so none of that applies. Scope is small - a plain-language resolver
plus thin narrate/agentic dispatch over `AutoSession`'s existing, already-proven
`currentSnapshot()`/`applyPick()`.

**Real deviations found during implementation, not anticipated by design.md:**
1. `src/cli.ts` runs `main().catch(...)` unconditionally at module load with no
   `import.meta.url` guard - importing anything from it (as design.md's own Decision planned,
   "reuse `cycleHighlightRings`/`showRing` via export") would trigger the whole CLI's argument
   dispatch as a side effect of loading `src/pilot.ts`, unsafe for a library module. Its ring
   renderer is also deeply coupled to CLI-only terminal-logging helpers (`demoLog`/
   `demoHighlight`/ANSI color codes) that have nothing to do with page rendering. Rather than
   a risky wide extraction untangling a dozen interdependent functions serving two different
   concerns, `src/pilot.ts` ships a small, self-contained, narrate-mode-specific ring renderer
   instead (same visual idea - a highlighted ring + label over the real element - no `cli.ts`
   dependency, no console output of its own). Documented in `src/pilot.ts`'s own file header.
2. `pilot` (unlike `auto --cli --detach`) runs `AutoSession.start()` **in-process**, not via a
   spawned child. `spawnDetachedSession` always re-spawns its child through `bin/waygraph`
   (which registers `tsx/esm`) regardless of how the outer command was invoked - this is why
   the existing `auto-session.spec.ts` tests, which only ever talk to spawned sessions, never
   surfaced this. An in-process command needs `bin/waygraph`'s own loader directly for a
   consumer project's `.block.ts` files' `.js`-suffixed sibling imports to resolve - confirmed
   by direct reproduction (bare `node dist/cli.js pilot ask ...` silently sees zero Blocks;
   `node bin/waygraph pilot ask ...` sees the real menu). Not a bug in `pilot`'s own code -
   just how a real user actually runs it (`bin/waygraph` is the published entry point); the
   test suite's own CLI invocation was the thing that needed fixing, not the command.

12/16 new tests exercise the real mechanism against live saucedemo.com (`tests/pilot/
pilot.spec.ts` x8 library-level, `tests/cli/pilot.spec.ts` x4 real-CLI-level), plus 4 more
pure `resolveAsk` unit tests included in that same file's count - all pass, stable under
`--repeat-each=2` with real concurrent Playwright sessions. Full project regression suite
re-confirmed green (197/197).

**Honest gap, not silently closed:** M3.4/spec.md's "a Block using a bespoke Trait works
identically to one using only built-in factories" is true by code inspection - nothing in
`AutoSession`/`src/pilot.ts` branches on Trait kind anywhere, both just call
`entry.block.instruction.verify`'s Traits generically, same as every other consumer of a
Block in this codebase - but it has not been exercised by a dedicated *live* test against a
real bespoke-Trait Block (e.g. `templates/scaffold`'s `assert-email-received`, which needs a
Docker/Mailpit fixture setup this change didn't invest in, given the underlying claim is
structural, not scenario-specific). Stated plainly rather than marked done on inspection
alone, or silently skipped.

- [x] Milestone 1 (M1) - Plain-language resolver
- [x] Milestone 2 (M2) - Narrate mode
- [x] Milestone 3 (M3) - Agentic mode
- [x] Milestone 4 (M4) - `waygraph pilot` CLI entry point
- [x] Milestone 5 (M5) - In-repo proof

---

## M1. Plain-language resolver

- [x] M1.1 `src/pilot.ts`: `resolveAsk(snapshot: SessionSnapshot, ask: string):
      ResolvedAsk | null` - flattens `snapshot.sections` into the same reachable-edge list
      `printCliMenu` already iterates, scores each edge's `description` against `ask`.
- [x] M1.2 Deterministic token-overlap scoring, confirmed (not just assumed) against real
      Block descriptions from `examples/saucedemo`: fraction of the ask's own meaningful
      tokens (stopwords stripped) found in the edge's description, `MIN_CONFIDENCE = 0.34`
      below which the resolver returns `null`. Real accuracy gap caught by the real test
      below (not a synthetic case): "submit the login form" tied `fill-password` against
      `submit-login` because "submits" (description) never matched "submit" (ask) with no
      stemming, and the tie broke on iteration order toward the wrong edge. Fixed with a
      small, deterministic suffix-stripping step (`stem()` - strips trailing
      `ing`/`ed`/`es`/`s`, guarded by minimum lengths) - still the same token-overlap
      approach, not the embedding/LLM matcher design.md defers, just accurate enough to not
      lose real, unambiguous ties to an unrelated edge.
- [x] M1.3 Real tests (`tests/pilot/pilot.spec.ts`): 5 pure tests (no browser) covering an
      ask matching one reachable edge, a different ask matching a different edge, a
      well-matching-but-unreachable edge never returned, a genuinely ambiguous ask returning
      `null`, and an edge with no `description` never matchable. Plus real `SessionSnapshot`
      data from a real `AutoSession` against `examples/saucedemo` in the M2/M3 tests below,
      not a hand-built fixture snapshot only.

## M2. Narrate mode

- [x] M2.1 **Deviated from design.md's original plan** ("export `cycleHighlightRings`/
      `showRing` from `src/cli.ts`") - see Status above for why. `src/pilot.ts` ships its own
      small, self-contained `installPilotOverlay`/`showPilotRing` (a CSS ring + label
      positioned via `getBoundingClientRect`, no `cli.ts` dependency).
- [x] M2.2 `AutoSession` gained two small, additive, read-only public methods it didn't have
      before (not anticipated by design.md, a real gap found while wiring this): `getPage()`
      (the session's live page - narrate mode needs direct Playwright access
      `currentSnapshot()`/`inspectDom()`'s JSON-only surface deliberately doesn't expose) and
      `peekStubBefore(blockName)` (a named Block's own `stubBefore` data via the existing
      `runStubPhase`, without running it - `applyPick` already computes this internally but
      never exposed it). Both are pure getters/lookups; neither changes any existing method's
      behavior - confirmed by the full existing `tests/cli/auto-session.spec.ts` suite still
      passing unmodified.
- [x] M2.3 `src/pilot.ts`: `pilotNarrate(session, resolved): Promise<NarrateResult>` - looks
      up the resolved edge's Block's `stubBefore` data via `session.peekStubBefore`, renders
      the ring via the self-contained renderer against `session.getPage()`, without calling
      `applyPick`. Throws a clear, named error (not a silent no-op) when the Block has no
      stub highlight data, or when the highlighted selector doesn't exist on the live page.
- [x] M2.4 Real test: after `pilotNarrate` runs for a resolved edge, the target element is
      visibly highlighted on the real page (`#wg-pilot-ring.wg-pilot-visible` actually
      visible), the real input field it points at is still empty, and the session's own
      `currentSnapshot().here` is unchanged - proven against real saucedemo.com, not a
      fixture. A second real test proves the "no stubBefore data" error path fires for a
      real Block (`submit-logout`) that genuinely has none authored, reached via a full,
      real three-step login sequence, not a contrived case.

## M3. Agentic mode

- [x] M3.1 `src/pilot.ts`: `pilotAct(session, resolved): Promise<ApplyPickResult>` - calls
      `session.applyPick(String(resolved.edge.index))` directly; no new execution logic.
- [x] M3.2 Real test: `pilotAct`'s result for a real ask ("fill in my username") is identical
      (same `ok`, same resulting Checkpoint) to manually calling `applyPick` with that same
      edge's index directly, run as two separate real sessions against live saucedemo.com -
      proves this is genuinely the same path, not a parallel one that could drift.
- [x] M3.3 Real end-to-end test: a full three-step real login (`fill-username` ->
      `fill-password` -> `submit-login`, each resolved from a fresh plain-language ask
      against the live post-act snapshot) reaches the real `LoggedIn` Checkpoint via
      `pilotAct` alone - not a synthetic single-step case.
- [ ] M3.4 **Deferred to M5 or later, not yet proven**: a resolved edge whose Block uses a
      bespoke, hand-written Trait (e.g. this repo's own `assert-email-received` from
      `templates/scaffold`) works identically in both narrate and agentic mode to one using
      only built-in Trait factories, per spec.md's requirement. Nothing in the implementation
      restricts this (there is no `recognizable`-style gate at all in this design - see
      spec.md), but it has not yet been exercised by a real test the way the saucedemo login
      path has. Flagged honestly rather than marked done on the strength of "the code has no
      restriction" alone.

## M4. `waygraph pilot` CLI entry point

- [x] M4.1 New `pilot` sub-command in `src/cli.ts` (`waygraph pilot ask "<text>" [--mode
      narrate|agentic] [--non-headless] [--base-url <url>] [--data <json>]`) - reuses
      `parseRunFlags`/`applyRunFlags` (the same shared flag surface `auto`/`demo`/`run`
      already use), not a parallel set of options. `--detach`/persistent multi-ask sessions
      deliberately not wired - each `pilot ask` call is a single-shot fresh `AutoSession`
      (starts, resolves, narrates/acts once, closes); a persistent Pilot session is real,
      separate future work, not required by spec.md's single-ask requirements.
- [x] M4.2 Wires `resolveAsk` + `pilotNarrate`/`pilotAct` to a real, freshly-started
      `AutoSession` - reports a clear, real error naming the ask (and current position) when
      resolution returns no confident match, exit code 1, not a silent no-op. Verified for
      real against live saucedemo.com: `waygraph pilot ask "fill in my username" --mode
      agentic` (real field filled, JSON result printed), `waygraph pilot ask "fill in my
      username" --mode narrate --non-headless` (real visible ring on screen), and
      `waygraph pilot ask "xyzzy plugh qux"` (clear error, exit code 1).

## M5. In-repo proof

- [x] M5.1 Chose `examples/saucedemo` (not `templates/scaffold`) - `tests/pilot/
      pilot.spec.ts` already proves the underlying mechanism against it directly (M2/M3), so
      reusing it for the CLI-level proof too is genuine consistency, not redundant setup work
      (matching the mail-verification example's own precedent for the identical choice).
- [x] M5.2 Real end-to-end demo via the real `waygraph pilot` CLI (`tests/cli/pilot.spec.ts`,
      4 tests, `bin/waygraph` not `dist/cli.js` directly - see the in-process/spawned-child
      deviation above): agentic mode really filling the username field against live
      saucedemo.com, narrate mode really resolving and returning the real target
      selector/label headless, a no-confident-match ask failing loud with exit code 1, and an
      invalid sub-verb reporting clear usage instead of crashing. Also manually verified
      headful (`--non-headless`) with a real visible ring on screen, and agentic mode
      end-to-end via direct terminal runs before the automated tests were written.
- [x] M5.3 Honest status note (per spec.md's last requirement, also in this file's Status
      section above): this proof demonstrates the mechanism works in-repo; it does not
      satisfy `ROADMAP.md`'s original `1.0.0` criterion of "demoable on one real consumer" -
      that remains separate, later, unmet work.
- [x] M5.4 `README.md`/`ROADMAP.md` updated: the capability, its reuse of Phase 1-5
      machinery, both real deviations found during implementation, and the honest 1.0.0-gap
      note.
- [x] M5.5 Full in-repo regression suite green (197/197); `npm run build`/`npx tsc --noEmit`
      clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] A smarter (embedding/LLM-assisted) plain-language matcher than deterministic text
      similarity.
- [ ] Embedding into a real external consumer application, and the associated `1.0.0`
      declaration this change alone does not complete.
