## Status (read this first, always)

**State: implemented and verified.** Phase 3 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md`, building on the shipped Phases 1-2. All four milestones
done, including a mid-implementation scope extension (approved): trace steps now carry
resolved `stubBefore`/`stubAfter`/`stubOnError` demo-narration fixtures, not just Block name
+ Checkpoints. 175/175 relevant tests pass; real end-to-end runs against live saucedemo.com
confirmed by hand and by the extended `tests/cli/auto-session.spec.ts` (4/4, stable under
parallel + repeat stress after fixing a real test-isolation bug found along the way). Not yet
archived to `openspec/changes/archive/`.

- [x] Milestone 1 (M1) - `headless` option + trace core in `AutoSession`
- [x] Milestone 2 (M2) - `headless` + `trace` plumbed through the IPC layer
- [x] Milestone 3 (M3) - CLI: `--non-headless` on `--detach`, `auto trace` sub-verb
- [x] Milestone 4 (M4) - Proof

---

## M1. `headless` option + trace core in `AutoSession`

- [x] M1.1 `AutoSessionInit.headless?: boolean` (default `true`) in `src/auto-session.ts`;
      `AutoSession.start` passes it through to both `new Engine({headless})` and the real
      chromium launch options instead of the hardcoded `true`.
- [x] M1.2 `TraceStep` type: `{ block: string; from: string | null; to?: string; error?:
      string; timestamp: string }`. `AutoSession` holds a private, capped (last 500, oldest
      dropped first via `pushTrace`) `TraceStep[]`.
- [x] M1.3 `applyPick` appends one step on every actual Block attempt (success or failure) -
      not on invalid picks, not on quit (both return before the `from`/try block is reached).
      Reuses the same success/failure branches already there from Phase 1, adding the
      trace-append alongside, not replacing that logic.
- [x] M1.4 `getTrace(): TraceStep[]` pure getter (returns a copy via spread, not the live
      array).
- [x] M1.5 **Scope extension, approved mid-implementation:** `TraceStep` also carries the
      resolved `stubBefore`/`stubAfter`/`stubOnError` demo-narration fixtures when a Block
      authors them, reusing `runStubPhase` (`src/highlights.ts`) - the same mechanism
      `waygraph demo`'s 0.13.5 lifecycle logging already uses, confirmed to have zero
      browser side effects (no `page` argument, pure data resolution), so safe to call from
      `applyPick`. `stubPhaseHasContent()` guards against attaching empty results for Blocks
      with no stubs authored. `proposal.md`/`spec.md`/`design.md` updated to match before
      this was implemented.

## M2. `headless` + `trace` plumbed through the IPC layer

- [x] M2.1 `spawnDetachedSession` pushes `--non-headless` onto the `__auto-serve` child's
      argv when `init.headless === false` - same flag name end to end (CLI -> spawn args).
- [x] M2.2 New `{op:"trace"}` request/response shape in `src/auto-session-ipc.ts` -
      `{ok:true, trace: TraceStep[]}` | `{ok:false, error}` - handled through the existing
      per-session request queue alongside `status`/`send`/`dom`. `requestSession` given a
      third overload so callers get `TraceResponse`, not a loose union.
- [x] M2.3 No change to `status`/`send`/`dom`'s own handling - `trace` added as a fourth
      `else if` branch, existing branches untouched. Verified via `tsc --noEmit`.

## M3. CLI: `--non-headless` on `--detach`, `auto trace` sub-verb

- [x] M3.1 `auto --cli --detach --non-headless` reads `flags.nonHeadless` (already parsed by
      the existing `parseRunFlags` call) and passes `headless: false` into
      `spawnDetachedSession`; `__auto-serve` does the same for the spawned child. No new flag
      parsing needed - `--non-headless` already existed.
- [x] M3.2 `waygraph auto trace <sessionId>` added as a fifth sub-verb alongside
      `send|status|attach|dom`.
- [x] M3.3 `usage()` updated.

## M4. Proof

- [x] M4.1 `npm run typecheck` clean (only the pre-existing, unrelated `tests/unit/*` vitest
      errors remain).
- [x] M4.2 Verified by hand first against live saucedemo.com: `--non-headless` detach
      launched a real Chromium process with no `--headless` flag in `ps aux` (confirmed
      directly); the full login sequence's `trace` showed real, rich `stubBefore`/`stubAfter`
      fixture data (highlight selectors, todo dock state) for `fill-username` etc.; an
      invalid pick left the trace at 3 steps, not 4. Then encoded into
      `tests/cli/auto-session.spec.ts`: added `SessionMeta.headless` (a clean, reliable
      observable added specifically so this didn't need fragile process-inspection in the
      automated test) and a dedicated test asserting `headless: true` by default / `false`
      with `--non-headless`; extended the main sequence test with `trace` assertions (3 named
      steps in order, correct from/to, `stubBefore` present on `fill-username`, no extra step
      from the earlier invalid pick). Real bug caught and fixed during this step: the
      existing `beforeEach`/`afterEach` wiped the *entire* shared `.waygraph-auto/` directory,
      which under Playwright's parallel workers let one test's cleanup delete another
      concurrently-running test's live session files the moment a second test that actually
      creates on-disk sessions ran alongside the main sequence test. Fixed by removing the
      blanket per-test wipe (each test already self-cleans via its own `send q`) and moving
      to a single `beforeAll` wipe. Confirmed stable with `--repeat-each=2` under parallel
      workers after the fix.
- [x] M4.3 Full suite green: 175/175 across the same 8 directories Phases 1-2 verified, no
      flake this run (including the `auto-session.spec.ts` file itself: 4/4, stable under
      repeat + parallel stress).
- [x] M4.4 `README.md` "CLI reference" table + two new explanatory paragraphs, and
      `docs/auto.html` (new "Visible browser + session history" section) updated with
      `--non-headless` on `--detach` and `auto trace`.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Phase 4: agent-skill hardening, and specifically anything that consumes a trace to
      author real Block files - separate change proposal(s).
- [ ] Persisting a trace beyond a session's own lifetime - not scoped here (see design.md
      Non-Goals).
- [ ] Auto-attaching DOM evidence to every trace step - not scoped here (see design.md
      Non-Goals); an agent that wants this already has `dom` to call itself.
