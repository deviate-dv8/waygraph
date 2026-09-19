## Status (read this first, always)

**State: implemented and verified.** Phase 4 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md`, building on the shipped Phases 1-3. All four milestones
done, including a real bug caught by its own test (`defineAssertBlock` needed to be generic)
and a bonus real-world find: running the new `check` warning against `examples/saucedemo`
turned up 3 genuine inline selectors this session's earlier cleanup had missed, now fixed.
180/180 relevant tests pass. Not yet archived to `openspec/changes/archive/`.

**Follow-up extension (post-M4, found while syncing `templates/` to this change's own
conventions):** `templates/scaffold/src/blocks/demo-web/methods/assert-hello.method.block.ts`
was still hand-written `defineMethodBlock` boilerplate carrying real `stubBefore`/
`stubAfter`/`stubOnError`/`slides` narration fixtures. `defineAssertBlock` as originally
shipped in M1 only accepted `name`/`description`/`checkpoint`/`waitForHeading`/`verify` -
converting this Block would have silently dropped its narration data. Extended
`AssertBlockOptions`/`defineAssertBlock` (`src/engine.ts`) to also accept `stubBefore`/
`stubAfter`/`stubOnError`/`slides`, forwarded straight into the generated `instruction`
object, mirroring the identical pass-through pattern `defineNavClickBlock`/`definePageBlock`
already use. `assert-hello.method.block.ts` now uses `defineAssertBlock` with zero fixture
loss - verified via a real `npm pack` + wired scratch copy (`npx tsc --noEmit` clean,
`npx playwright test` 2/2 green against the offline fixture server). Also wired
`templates/scaffold`'s previously-orphaned `remove-item.effect.block.ts` into `shop.flow.ts`
(Add -> Remove that row -> Add again -> bulk Clear), closing the other scaffold gap found in
the same pass. `templates/quickstart` was separately re-synced from `examples/saucedemo`'s
already-atomic/`*Sel`'d Blocks (untouched by this change originally, found stale). Full
in-repo suite re-confirmed green (180/180) after the engine change; `waygraph check` reports
zero warnings for `templates/scaffold`, `templates/quickstart`, and `examples/saucedemo`.

- [x] Milestone 1 (M1) - `defineAssertBlock` engine helper
- [x] Milestone 2 (M2) - `waygraph check` inline-selector warning
- [x] Milestone 3 (M3) - Agent-skill instruction hardening
- [x] Milestone 4 (M4) - Proof

---

## M1. `defineAssertBlock` engine helper

- [x] M1.1 `AssertBlockOptions` type in `src/engine.ts`: `{ name: string; description?:
      string; checkpoint: string; waitForHeading?: string; verify: Trait[] | ((out) =>
      Trait[]) }`.
- [x] M1.2 `defineAssertBlock(options)` - mirrors `definePageBlock`'s construction pattern:
      builds a `defineMethodBlock<Checkpoint<string>, Checkpoint<string>>` internally,
      generated `act()` waits for `waitForHeading` when given (no-op otherwise), generated
      `resolve()` always returns `checkpoint(options.checkpoint)`.
- [x] M1.3 Exported from `src/index.ts` (value + `AssertBlockOptions` type). Verified via
      `tsc --noEmit`.

## M2. `waygraph check` inline-selector warning

- [x] M2.1 New warning collector alongside the existing `checkCommand`/`NAV_METHOD_CALLS`
      sweep in `src/cli.ts` (`INLINE_SELECTOR_CALL` regex): scans each discovered Block
      file's own source text for `Trait.visible(`/`Trait.text(`/bare `visible(`/`textEquals(`
      immediately followed by a literal string (`"`, `'`, or backtick) rather than an
      identifier/property access. `Trait.url(...)` is not scanned (not a selector-taking
      factory) - confirmed via the real run below. Applies to every Block kind, including
      NavBlocks (unlike the nav-escape sweep, which exempts them) - a Nav's own `verify` is
      just as likely to inline a selector.
- [x] M2.2 `case "check":` in `src/cli.ts` prints the new warnings the same way the existing
      nav-escape warnings print (file + a count line), still never changing the exit code.
- [x] M2.3 Documented as a known blind spot (string concatenation/template-built selectors,
      or a genuinely one-off inline reason) the same way the existing nav-escape check
      documents its own - not silently presented as exhaustive.
- [x] **Bonus, found by running the new check against `examples/saucedemo` for real:** it
      immediately flagged 3 genuine inline selectors this session's earlier atomicity/`*Sel`
      cleanup had missed entirely - the root login route (`nav-login.block.ts`,
      `submit-login.method.block.ts`, `submit-logout.method.block.ts`, plus the two
      `fill-username`/`fill-password` Blocks' `act()`-level selectors) never got a `*Sel`
      object at all. Fixed: new `methods/login.sel.ts` (`LoginSel`), wired into all five
      files; `waygraph check` now reports zero inline-selector warnings for the whole
      example. `NAV.md`/`SITE-MAP.md` updated. Real, live-saucedemo.com proof this tool
      works on a genuine codebase, not just a synthetic fixture - full suite (175/175) and
      the Phase 1-3 proof file (4/4, including a real login run through the now-Sel'd
      Blocks) both still green afterward.

## M3. Agent-skill instruction hardening

- [x] M3.1 `templates/agents/waygraph-author.agent.md`: new explicit rule (#2, renumbering
      the rest) - one distinct action per Block - pointing at this repo's own
      `examples/saucedemo` `fill-username`/`fill-password`/`submit-login` split as the
      canonical before/after, plus a new rule pointing `defineAssertBlock` and `*Sel` at
      each other.
- [x] M3.2 Same file's "Verify locally" section: added a line stating that zero orphan
      Blocks, zero inline-selector warnings, and zero nav-escape warnings (for anything
      touched) are required before reporting done - not informational, a gate.
- [x] M3.3 `templates/agents/waygraph-planner.agent.md`: new "Blind mode (no frontend
      source)" section describing discovery via `waygraph auto --cli --detach`/`status`/
      `dom`/`send`/`trace`; also updated the "Block kinds" list to name `defineAssertBlock`
      as its own kind (was previously lumped into "Method - forms, asserts, ..."). Verified
      `templates/agents/*.agent.md`'s frontmatter still parses via `agent-dive.ts`'s own
      `loadAgentSpecs()` after editing (ran it directly against `dist/`).

## M4. Proof

- [x] M4.1 `npm run typecheck` clean (only the pre-existing, unrelated `tests/unit/*` vitest
      errors remain). Real bug caught and fixed by the test itself before this could be
      marked done: `AssertBlockOptions`/`defineAssertBlock` were not generic, so `Out` could
      never narrow past `Checkpoint<string>` - unusable in a real typed flow position. Fixed
      to mirror `definePageBlock`'s own `Out extends Checkpoint<string>` + `checkpoint:
      Out["__state"]` pattern.
- [x] M4.2 `tests/core/define-assert-block.spec.ts` (4 tests): no-op act + correct resolve
      with no `waitForHeading`; `waitForHeading` waits before verify; `verify` still runs and
      fails loud (not bypassed); the checkpoint tag is stated once, two Blocks self-loop to
      their own tag. Tests the generated `instruction` directly (not via `runGraph`, which
      structurally requires `entry.In = Checkpoint<"__start__">` - a self-loop assert Block
      by design never satisfies that, since it is never meant to be a flow's first Block).
      `tests/cli/check-inline-selector.spec.ts` (1 test) against a new, minimal, isolated
      fixture (`tests/fixtures/inline-selector-check/`, importing `waygraph` via a relative
      path to `dist/`, not a package dependency) - confirms `waygraph check` flags a real
      `Trait.visible("literal")` call and stays silent on an equivalent `*Sel`-referencing
      one. Neither test touches either external consumer project - out of scope for this
      repo's own suite, per design.md.
- [x] M4.3 Full suite green: 180/180 across the same 8 directories Phases 1-3 verified (175
      + 5 new).
- [x] M4.4 `README.md` (Block helpers table + new explanatory section with a code example)
      and `examples/saucedemo/docs/HELPERS.md` updated with `defineAssertBlock` and the
      one-action-per-Block rule.
- [x] M4.5 **Bonus, beyond what this task originally scoped:** running the new `check`
      warning against `examples/saucedemo` for real (not just the isolated fixture)
      immediately found 3 genuine inline selectors this session's earlier atomicity/`*Sel`
      cleanup had missed - the root login route never got a `*Sel` object at all. Fixed: new
      `examples/saucedemo/.../methods/login.sel.ts` (`LoginSel`), wired into all 5 affected
      files (`nav-login.block.ts`, `fill-username`/`fill-password`/`submit-login`/
      `submit-logout` Method Blocks); `waygraph check` now reports zero warnings of any kind
      for the whole example. `NAV.md`/`SITE-MAP.md` updated. Full suite (180/180) and the
      Phase 1-3 proof file (4/4, including a real live-saucedemo.com login run through the
      now-`Sel`'d Blocks) both re-confirmed green afterward - real, not synthetic, proof this
      tool finds and this convention fixes exactly the pattern it was built for.
- [x] M4.6 Honest note, as planned: this proof demonstrates the new tooling and rules work
      correctly inside this repository (including, as it turned out, on this repo's own
      previously-imperfect example) - it does not itself re-verify that either external
      consumer project's own Block library has improved, since re-running the hardened skill
      against them is separate, later work outside this repo's own scope.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Re-running the hardened `waygraph-author`/`waygraph-planner` skill against a fresh
      slice of a real consumer project, and diffing the orphan/warning counts against this
      session's baseline - separate, later work, outside this repo.
- [ ] Retrofitting any existing Blocks (this repo's own examples included) to
      `defineAssertBlock` - not scoped into this change.
- [ ] Phase 5 (`maildrop.cc`) and Phase 6 (Waygraph Copilot) - separate change proposals.
