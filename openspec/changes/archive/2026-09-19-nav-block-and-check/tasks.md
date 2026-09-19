## Status (read this first, always)

**State: M1-M5 IMPLEMENTED AND VERIFIED. Not yet committed/published (holding for explicit
go-ahead on the version bump + npm publish per M4.5).** Dan approved implementation
2026-09-15 ("we need the navblock and actionpage thing and the provider thing") and a
related, not-originally-spec'd feature (`EngineConfig.browsers`, a pluggable browser
provider - see its own section below) was built alongside since Dan asked for both in the
same message.

If you are picking this up cold: `git log`/`git diff` on `src/engine.ts`, `src/types.ts`,
`src/cli.ts`, `src/index.ts`, `README.md` shows the real state - don't trust this file's
prose over the actual diff if they ever disagree. As of this update, everything below is
implemented, typechecks, builds, and passes its own new tests plus the full existing suite
(105/105, the one known `engine-config.spec.ts` timing flake did not even flake this run).

**Next concrete action:** M4.5 - bump `package.json`, commit, and get Dan's explicit
go-ahead before `npm publish` (established pattern all session: never publish without
being asked).

- [x] Milestone 1 (M1) - ActionPage deprecation warning - done
- [x] Milestone 2 (M2) - NavBlock - done
- [x] Milestone 3 (M3) - waygraph check - done
- [x] Milestone P - EngineConfig.browsers (pluggable browser provider, not originally
      spec'd - see its own section below) - done
- [x] Milestone 4 (M4) - Proof - done except the publish half of M4.5
- [x] Milestone 5 (M5) - Docs - done

---

## M1. ActionPage deprecation warning (primary enforcement - independent of M2)

Why this exists / what it must do: see `design.md` "The primary signal is a TypeScript
`@deprecated` warning, not a CLI command." Full requirement text: `spec.md` "A regular
Block's page marks navigation methods as deprecated."

- [x] M1.1 `ActionPage` type added to `src/types.ts` (not `engine.ts` - `Instruction`/
      `Block`/`Page` already live there, for locality): structurally `Page` with `goto`,
      `reload`, `goBack`, `goForward` re-declared under `@deprecated`, real method
      signatures preserved via `Page["goto"]` etc.
- [x] M1.2 `defineBlock`'s `instruction` param (in `src/engine.ts`) types `act`'s `page` as
      `ActionPage` via `Omit<Instruction<In,Out,any>, "act"> & { act(page: ActionPage, ...) }`
      - narrower than the base `Instruction.act(page: Page, ...)`, which stays untouched
      (real runtime contract every Block obeys, `NavBlock`'s generated `act()` included).
      `Page` is structurally assignable to `ActionPage` (same members, only the JSDoc tag
      differs), so this satisfies `Instruction.act`'s wider signature - verified by M1.3
      actually typechecking, not just by this reasoning.
- [x] M1.3 Verified via `tests/nav-block-and-provider.spec.ts` ("a regular Block's act()
      still compiles and runs when it calls page.goto") - this is real proof, not just a
      comment: if `ActionPage` were a hard type error instead of `@deprecated`, this whole
      test file would fail `tsc --noEmit` before ever running. It compiles and runs
      unchanged, confirmed both via `npx tsc --noEmit` (clean) and the test itself passing.
- [x] M1.4 `@deprecated` reaches `dist/types.d.ts` un-stripped (confirmed via `npm run
      build` + reading the output). Editor-squiggle check is inherently manual/visual - not
      re-verified after the initial design conversation; ask Dan to eyeball it in his own
      editor if he wants that specific confirmation.
- [x] M1.5 `ActionPage` exported from `src/index.ts` (as a type, from `./types.js`).

## M2. NavBlock (independent of M1)

Why this exists / what it must do: `spec.md` "NavBlock is a distinct Block that only
navigates" and "A NavBlock's URL may depend on mem."

- [x] M2.1 `NavBlock<Out>` (type alias for `DefinedBlock<Checkpoint<string>, Out>`) and
      `defineNavBlock({ name, checkpoint, url, description?, requires?, verify?,
      highlights? })` added to `src/engine.ts`, right after `defineBlock`. Generated
      `act(page, _input, mem)` calls `page.goto(typeof url === "function" ? url(mem) : url)`
      via a cast back to the real `Page` (the one legitimate internal use of navigation -
      never reaches an author, who never writes this `act()` by hand). **Added a field not
      in the original spec sketch**: `checkpoint: Out["__state"]` - the spec's own example
      (`defineNavBlock({ name, url })`, no checkpoint) never actually said what determines
      `Out`; a NavBlock never branches on observed evidence the way a regular Block can, so
      `resolve` is just `() => checkpoint(options.checkpoint)`, and something has to name
      that tag. Matches the real `zsign-atomic-waygraph` pattern
      (`resolve: () => checkpoint("LoginForm")`, a fixed tag, not a proposal artifact.
- [x] M2.2 `url` accepts `string | ((mem: MemPage) => string)` - verified by a real test
      (parameterized route resolved from mem at run time).
- [x] M2.3 Marker: `Object.defineProperty(built, "__waygraphKind", { value: "nav",
      enumerable: false, configurable: false })`. Confirmed non-enumerable (doesn't leak
      into `Object.keys`/`JSON.stringify`) by test.
- [x] M2.4 `defineNavBlock`, `NavBlock` exported from `src/index.ts`.
- [x] M2.5 Confirmed via test: a NavBlock drops into `defineFlow([start, nav, after, end])`
      next to a regular Block with zero special-casing, `flow.blocks()` reports both by name
      correctly.

## M3. waygraph check (secondary enforcement)

Why this exists / what it must do: `spec.md` "waygraph check sweeps a whole project as a
complementary check."

- [x] M3.1 `check [project]` subcommand added to `src/cli.ts`'s `main()` switch, reusing
      `walkDir`/`importModule` (the same in-process-import pattern `validate`/`list`/`nav`
      already use - NOT the child-process delegation `chain` uses, since `check` never runs
      a Block, only imports it for introspection, same risk profile as the 4 pre-existing
      commands that already do this against real target projects).
- [x] M3.2 `isNavBlockMarked(exported)` checks `exported.__waygraphKind === "nav"`.
- [x] M3.3 `NAV_METHOD_CALLS = ["page.goto(", "page.reload(", "page.goBack(",
      "page.goForward("]` (four, not the three `spec.md` originally listed - `goForward`
      was a spec oversight, since `ActionPage` covers all four; fixed spec.md to match the
      implementation rather than the other way around). Warns via `console.warn`, never
      throws, never touches `process.exitCode`.
- [x] M3.4 Documented in `usage()`'s help text, alongside `list`/`nav`/`validate`/`run`/
      `chain`.

## M-P. EngineConfig.browsers - pluggable browser provider (not originally spec'd)

Dan, same message as the M1-M3 go-ahead: "the provider thing" - "pia project really want
this." "Waygraph is just an opinionated Playwright" - `src/engine.ts` had two places
hardcoding `LAUNCHERS = { chromium, firefox, webkit }` straight from `@playwright/test`
(`buildFlow`'s own `run(mem, config)` launch, and `chainFlow`'s). Puppeteer explicitly out
of scope per Dan ("no time for that for now") - different `Page`/`BrowserContext` shape
entirely, not a seam this change touches.

- [x] `EngineConfig.browsers?: Partial<Record<"chromium"|"firefox"|"webkit", BrowserType>>`
      added, each key defaulting to the real Playwright export when omitted.
- [x] `resolveLauncher(browserName, config)` helper added right after the `LAUNCHERS` const;
      both hardcoded call sites now go through it instead of `LAUNCHERS[browserName]`
      directly.
- [x] Verified via 2 tests: a fake `chromium`-shaped launcher (its own `.launch()` stub) is
      actually invoked instead of the real one when `config.browsers.chromium` is set; the
      unchanged default (no `browsers` given) still launches the real chromium.
- [x] README documents the `browsers` option and the `playwright-extra`/stealth-plugin
      rationale.
- [ ] **Not done, not spec'd, flag if it matters**: the CLI's OWN step-mode launch (`chain
      --step`, in `src/cli.ts`'s `main()`) still hardcodes `const { chromium } = await
      import("playwright");` directly - it does NOT go through `EngineConfig.browsers`,
      since the demo overlay tool is a different code path entirely from the `Engine`/
      `Flow.run` API pia would actually use programmatically. If pia (or anyone) wants
      stealth launching INSIDE the interactive step-mode demo specifically, that's a
      separate, unscoped follow-up - ask before building it.

## M4. Proof

- [x] M4.1 `npm run typecheck` (`tsc --noEmit`) - clean.
- [x] M4.2 `tests/nav-block-and-provider.spec.ts` - 9 tests (3 NavBlock behavior + 1 marker
      + 1 ActionPage-doesn't-block + 2 browser-provider - covers every scenario originally
      planned here, expanded to also cover the provider work).
- [x] M4.3 Full suite: 105/105 green this run (the one known pre-existing
      `engine-config.spec.ts` timing flake did not flake this time; already independently
      reconfirmed clean-standalone multiple times earlier this session, unrelated file).
- [x] M4.4 See its own entry above (M4 section) - real finding, not the original guess:
      `zsign-atomic-waygraph` gets 12 warnings (its own pre-existing nav blocks, still
      plain `defineBlock`), zero false positives; a 3-block throwaway fixture produced
      exactly 1 warning naming only the mixed block.
- [ ] M4.5 Version bump + commit + **hold for explicit publish go-ahead** - not done yet,
      this is the actual next action (see Status above).

## M5. Docs

- [x] M5.1 README's dense "Status:" paragraph (Quick start section) now covers
      `defineNavBlock`/`ActionPage`/the deprecation mechanism, appended after the existing
      `RunGraphOptions` sentence in the same style.
- [x] M5.2 `waygraph check` documented in `usage()`'s CLI help text (that's this package's
      actual command reference - the README's own CLI section, if one gets added later, is
      a separate concern not touched here).
- Note: `chainFlow`/`withSessionReset`/`withTitle`/`narrate()` from the EARLIER 0.4.0
  release were never added to README's Status paragraph either (a pre-existing gap, not
  something this change introduced) - flagged, not fixed, since Dan's ask this round was
  scoped to NavBlock/ActionPage/provider specifically.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Port `zsign-atomic-waygraph`'s existing `nav.*.block.ts` files to `defineNavBlock` -
      now has real motivating data (M4.4: 12 warnings today), still not started, still a
      separate change/session's work, not silently bundled into this one.
- [ ] CLI step-mode's own browser launch isn't wired to `EngineConfig.browsers` - see M-P's
      last line.
- [ ] Roadmap phase 2 (see `design.md`): `locate(page, library)` reverse Trait matching +
      split `requires` (externally-supplied vs producedBy-another-Block) - separate change
      proposal, not started, not scoped beyond the paragraph in `design.md`.
- [ ] Roadmap phase 3 (see `design.md`): federated pool-of-waygraphs with package-scoped
      namespacing - separate change proposal, scoped to owned/cooperating sites, not
      started, not scoped beyond the paragraph in `design.md`.
- [ ] A practice/demo consumer project (e.g. against a RealWorld/Conduit-style app) was
      discussed but explicitly deferred by Dan until this change was built - it now is, so
      this is unblocked, but still not started; ask before starting it, it wasn't part of
      this round's explicit ask.
