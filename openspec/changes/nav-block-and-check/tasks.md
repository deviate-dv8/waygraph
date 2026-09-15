## Status (read this first, always)

**State: PLANNING COMPLETE. NOTHING IMPLEMENTED YET.** All four boxes below are unchecked
because no code has been written - `proposal.md`/`spec.md`/`design.md`/this file are the
only things that exist for this change so far.

If you are picking this up cold (fresh session, or resuming after context loss): don't
re-derive anything from a conversation - everything you need is in this change's own four
files. Read them in this order:

1. `proposal.md` - what and why (one read is enough, it doesn't change during implementation)
2. `design.md` - the decisions already made and why (read before touching anything M1-M3
   disagrees with - the reasoning there is not optional context, it's load-bearing)
3. `spec.md` - the exact requirements/scenarios every milestone below must satisfy
4. This file, from wherever the last checked box left off

**Next concrete action, right now:** M1.1 (add `ActionPage` to `src/engine.ts`) - nothing
is checked off, so start there. M1 and M2 have no dependency on each other and can be done
in either order or by two different sessions in parallel; M3 needs M2's NavBlock marker to
exist first (see M3's own note).

**Do not start implementing without being told to.** This change was authored via the
`openspec-propose`/`openspec-update-change` skills in planning-only mode. Confirm with
Dan (or whoever resumed this) before writing code, unless you were explicitly told to
apply this change.

- [ ] Milestone 1 (M1) - ActionPage deprecation warning - not started
- [ ] Milestone 2 (M2) - NavBlock - not started
- [ ] Milestone 3 (M3) - waygraph check - not started (blocked on M2's marker, see M3.2)
- [ ] Milestone 4 (M4) - Proof - blocked on M1-M3
- [ ] Milestone 5 (M5) - Docs - blocked on M1-M3

---

## M1. ActionPage deprecation warning (primary enforcement - independent of M2)

Why this exists / what it must do: see `design.md` "The primary signal is a TypeScript
`@deprecated` warning, not a CLI command." Full requirement text: `spec.md` "A regular
Block's page marks navigation methods as deprecated."

- [ ] M1.1 Add an `ActionPage` type to `src/engine.ts` (or `src/types.ts` - pick whichever
      already holds `Block`'s own type machinery, for locality): structurally `Page` with
      `goto`, `reload`, `goBack`, `goForward` re-declared under a `@deprecated` JSDoc tag
      naming `defineNavBlock` as the alternative. Keep the real method signatures (delegate
      to `Page[method]`'s own type) - only the tag changes.
- [ ] M1.2 Regular `defineBlock`'s `act(page, ...)` SHALL type `page` as `ActionPage`
      instead of raw `Page`. `NavBlock`'s own generated `act()` (M2) internally uses the
      real `Page` (it's the one thing allowed to navigate) - that distinction lives inside
      `defineNavBlock`, invisible to its own authors since they never write its `act()`.
- [ ] M1.3 Confirm existing Blocks that call `page.goto` inside a regular `act()` (a
      throwaway fixture mirroring the frozen `zsign-all` reference shape is enough - do not
      edit any real `zsign-all` file to test this) still typecheck with zero errors under
      `tsc --noEmit`.
- [ ] M1.4 Verify the `@deprecated` tag actually reaches consumers: check the built
      `dist/engine.d.ts` (or wherever `ActionPage` ends up) carries the JSDoc comment
      un-stripped, and manually confirm in an editor that `page.goto(...)` shows struck
      through inside a plain Block's `act()`.
- [ ] M1.5 Export `ActionPage` from `src/index.ts`.

## M2. NavBlock (independent of M1)

Why this exists / what it must do: `spec.md` "NavBlock is a distinct Block that only
navigates" and "A NavBlock's URL may depend on mem."

- [ ] M2.1 Add `NavBlock<Out>` type (extends `Block<Checkpoint<string>, Out>`) and
      `defineNavBlock({ name, url, requires?, verify?, highlights? })` factory to
      `src/engine.ts`. Generated `act(page, _input, mem)` calls
      `page.goto(typeof url === "function" ? url(mem) : url)` - never author-supplied.
- [ ] M2.2 `url` accepts `string | ((mem: MemPage) => string)` - decided in `design.md`
      ("`url` accepts `(mem) => string` from day one"), do not ship string-only.
- [ ] M2.3 Give the built NavBlock object a runtime-detectable marker M3.2 can check for
      (e.g. a non-enumerable `__waygraphKind: "nav"` field) - decide the exact shape here,
      then record what you chose in this task's own line so M3 doesn't have to guess.
- [ ] M2.4 Export `defineNavBlock`, `NavBlock` from `src/index.ts`.
- [ ] M2.5 Confirm (via a test, not just reading the code) a NavBlock drops into
      `engine.defineFlow([start, navBlock, end])`, `connect()`, and `composeBlock()`
      unmodified - no special-casing needed in any of the three.

## M3. waygraph check (secondary enforcement - needs M2.3's marker)

Why this exists / what it must do: `spec.md` "waygraph check sweeps a whole project as a
complementary check." Do not start M3.2 until M2.3 is checked off and you know the marker
shape.

- [ ] M3.1 New `check <project>` subcommand in `src/cli.ts`, reusing the existing
      `walkDir`/Block-discovery pattern `findBlock`/`list` already use to enumerate every
      `*.block.ts` file.
- [ ] M3.2 For each discovered Block, determine whether it was built via `defineNavBlock`
      using the marker M2.3 defined.
- [ ] M3.3 For every non-NavBlock, scan that file's own source text for
      `page.goto(`, `page.reload(`, `page.goBack(`; print a warning naming the file + Block
      name on a match. Never change process exit code.
- [ ] M3.4 Help text: document `check` alongside the existing `list`/`nav`/`validate`/`run`/
      `chain` command list.

## M4. Proof (blocked on M1, M2, M3 all checked off)

- [ ] M4.1 `npm run typecheck` green.
- [ ] M4.2 New test file covering: (a) a static-`url` NavBlock navigates correctly, (b) a
      mem-function `url` NavBlock resolves the URL from mem at run time, (c) a NavBlock
      typechecks and runs inside `defineFlow`, (d) `check` warns on a Block with `page.goto`
      not built via `defineNavBlock`, (e) `check` stays silent on a NavBlock, (f) `check`
      stays silent on a clean action Block with no navigation. (The `@deprecated` tag itself
      is verified per M1.4, not via a runtime test - deprecation isn't a `tsc` diagnostic.)
- [ ] M4.3 Full suite green (`npm test`) - the one known pre-existing
      `engine-config.spec.ts` timing flake, if it flakes, must pass clean standalone before
      you conclude anything is broken (established project pattern - see other changes'
      proof sections, or just re-run `npx playwright test tests/engine-config.spec.ts`
      alone).
- [ ] M4.4 Manually verify `check` against a real project: `zsign-atomic-waygraph` should
      report zero warnings (it already follows the convention by hand); pointing it at a
      throwaway Block with a deliberately misplaced `page.goto` should produce exactly one
      warning naming that file.
- [ ] M4.5 Bump `package.json` version (this is new public API - `defineNavBlock`,
      `ActionPage`, `check` - minor bump, not patch, matching how `chainFlow` etc. were
      versioned in the prior 0.4.0 release), commit, and hold for Dan's explicit go-ahead
      before `npm publish` (established pattern this whole session: always ask before
      publishing).

## M5. Docs (blocked on M1, M2, M3)

- [ ] M5.1 README: document `defineNavBlock` alongside `defineBlock` and `composeBlock` in
      the authoring section, and mention `ActionPage`'s deprecation warning as the reason
      to reach for it.
- [ ] M5.2 README: document `waygraph check` alongside the other CLI commands, framed as
      the whole-project complement to the editor warning.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Port `zsign-atomic-waygraph`'s existing `nav.*.block.ts` files to `defineNavBlock`
      once this change has landed and been used for a while.
- [ ] Roadmap phase 2 (see `design.md`): `locate(page, library)` reverse Trait matching +
      split `requires` (externally-supplied vs producedBy-another-Block) - separate change
      proposal, not started, not scoped beyond the paragraph in `design.md`.
- [ ] Roadmap phase 3 (see `design.md`): federated pool-of-waygraphs with package-scoped
      namespacing - separate change proposal, scoped to owned/cooperating sites, not
      started, not scoped beyond the paragraph in `design.md`.
- [ ] A practice/demo consumer project (e.g. against a RealWorld/Conduit-style app) was
      discussed but explicitly deferred by Dan until M1-M3 are built - "it would be a waste
      of time to test the current [state]." Do not build this until M4 is fully checked off.
