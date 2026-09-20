## Status (read this first, always)

**State: implemented and verified (M1-M3). M4 (docs) remaining.** Phase 6b of the
"Agent-authoring tooling and Waygraph Pilot" roadmap. Builds on `waygraph-pilot` (Phase 6,
corrected and shipped as `pilotStart`), which explicitly flagged this exact gap in its own
design.md Roadmap section rather than building it speculatively.

Two things were verified directly before this proposal was written, cited here so a future
implementer doesn't have to re-derive them: `AutoSession.start()`/`loadBlockLibrary`
(`src/auto-explore.ts:117`) already tolerate a project with zero `.block.ts` files without
throwing; `serveSession`'s existing request-queue (`src/auto-session-ipc.ts`) already
serializes every op against a session, so the new ops below inherit that guarantee for free.

**Real bugs found and fixed during implementation, not anticipated by design.md:**
1. `here` is only re-detected lazily when it's currently `null` (`currentMenu()`'s own
   `if (this.here === null)` cache) - a raw action landing somewhere a Block now recognizes,
   from an already-non-null `here`, would never re-trigger detection. Fixed by having
   `rawClick`/`rawType`/`rawGoto` explicitly reset `this.here = null` before rebuilding the
   menu, forcing the existing `detectHere` logic to run again - not a new detection path.
2. `discoverGraph`'s per-file import `catch` (`src/graph.ts`) silently swallows most errors
   (only a dual-`@playwright/test`-install error gets logged) - a genuinely broken `.block.ts`
   file (e.g. a bad `Trait.url` call - `urlMatches` takes a `URLPatternInit` object, not a
   bare path string, a real mistake made while writing this change's own proof fixture) makes
   that Block silently vanish from the graph with no error anywhere, not a crash. Not fixed by
   this change (out of scope - `discoverGraph`'s existing behavior, not something this
   proposal's own requirements touch); flagged here so a future Blind Pilot agent (or its own
   human) knows a "reload did nothing" symptom can mean a real import error in the file it
   just wrote, not a package bug.
3. A "Block not wired into any `.flow.ts`" (`findOrphanBlocks`, reported by `waygraph graph`)
   is a separate diagnostic from `discoverGraph`'s own edge list - orphan status does NOT
   exclude a Block from the live session's menu. Initially assumed otherwise; confirmed wrong
   by direct reproduction before writing the fix around it (there was nothing to fix - the
   mechanism already worked once the real `Trait.url` bug above was found and corrected).
4. `playwright.config.ts` sets `fullyParallel: true`, so even one test's own repeated runs
   (`--repeat-each`) can execute concurrently across different worker processes - a shared,
   fixed mutable project directory (one test's `blocksDir` write happening while a different
   worker running the *same* test, or a different test, read "zero Blocks") raced exactly the
   way concurrent runs of the same test would. Fixed by giving every test in
   `tests/cli/auto-session-blind-pilot.spec.ts` its own throwaway `mkdtempSync` project
   directory - not just avoiding overlap between *different* tests (the fix already applied
   twice earlier in `waygraph-pilot`'s own test files), but real per-invocation isolation.

- [x] Milestone 1 (M1) - Raw interaction primitives (`click`/`type`/`goto`)
- [x] Milestone 2 (M2) - Live library reload (`reload`)
- [x] Milestone 3 (M3) - In-repo synthetic fixture + end-to-end proof
- [x] Milestone 4 (M4) - Docs

---

## M1. Raw interaction primitives

- [x] M1.1 `src/auto-session.ts`: three new methods on `AutoSession` -
      `rawClick(selector: string)`, `rawType(selector: string, text: string)`,
      `rawGoto(url: string)`. Each acts against the session's own live page (the same
      liveness guarantee every existing method gets via `ensureLivePage`), then calls the
      same `detectHere` logic `applyPick` already uses and returns a fresh
      `SessionSnapshot`. A selector matching nothing SHALL be a reported failure (name the
      selector), not a silent no-op or a hang.
- [x] M1.2 `src/auto-session-ipc.ts`: extend the `ServerRequest` union with
      `{ op: "click"; selector: string }`, `{ op: "type"; selector: string; text: string }`,
      `{ op: "goto"; url: string }`; extend `serveSession`'s dispatch `if`/`else if` chain
      with three new branches calling the M1.1 methods, reusing `StatusOrSendResponse` as
      the response type (`quit` always `false`) - no new response type, per design.md.
- [x] M1.3 `src/cli.ts`: three new `auto` sub-verbs, following the exact existing pattern
      `send`/`dom`/`trace` already establish (same `sessionId` positional handling, same
      `requestSession` call, same JSON-stdout/exit-code-1-on-failure convention):
      - `waygraph auto click <sessionId> <selector>`
      - `waygraph auto type <sessionId> <selector> <text>`
      - `waygraph auto goto <sessionId> <url>`
      `usage()` updated with these three lines alongside the existing `send`/`dom`/`trace`
      entries.
- [x] M1.4 Real tests, against a real detached session with zero `.block.ts` files (the M3
      fixture, or an inline temp directory if simpler for this milestone alone): `click`
      actually clicks a real element and the response snapshot's `here` is `null` (nothing
      recognizes the page yet); `type` actually fills a real input, confirmed by reading the
      input's value back via `auto dom`; `goto` actually navigates the live page, confirmed
      via a follow-up `dom`/`status` read; each of the three fails loud (named selector,
      `ok: false`) when the target doesn't exist, not a hang or a false success.

## M2. Live library reload

- [x] M2.1 `src/auto-session.ts`: `reloadLibrary(): Promise<void>` - re-runs
      `loadBlockLibrary(this.projectDir)`/`discoverGraph(this.projectDir)` (or whatever
      pairing `AutoSession.start()` itself already uses internally - reuse that exact call,
      do not duplicate its logic) and replaces `this.library`/`this.graph` in place. Does not
      touch `this.page`, `this.mem`, `this.here`, or the browser/context.
- [x] M2.2 `src/auto-session-ipc.ts`: extend `ServerRequest` with `{ op: "reload" }`; one new
      dispatch branch calling `reloadLibrary()` then returning the same
      `StatusOrSendResponse` shape as M1 (fresh `currentSnapshot()`, `quit: false`).
- [x] M2.3 `src/cli.ts`: `waygraph auto reload <sessionId>` - same existing pattern.
      `usage()` updated.
- [x] M2.4 Real test: write a new `.block.ts` file to a project directory a session is
      already running against, confirm it does NOT appear in a `status` read taken before
      `reload`, send `reload`, then confirm a subsequent `status`/`send` DOES see and can run
      it - all against the same still-running session. Combined with M3's end-to-end test
      below rather than a separate one, since both need the identical setup.

## M3. In-repo synthetic fixture + end-to-end proof

- [x] M3.1 `tests/fixtures/blind-pilot-site/` - a tracked, static, two-page fixture
      (`pages/index.html`: an input wired to echo its value into a visible div, a button that
      writes a marker div, a link to the second page; `pages/second.html`: one heading),
      served over a real local HTTP server (matching `templates/scaffold`'s own offline
      fixture-server precedent - no network), plus a `package.json` declaring
      `"waygraph": "file:../../.."` (matching `examples/saucedemo`'s own real dependency
      declaration). Deliberately small - a mechanism proof, not a realistic site.
- [x] M3.2 Each test gets its own **throwaway `mkdtempSync` project directory** (a fresh copy
      of the fixture's `package.json` plus a `node_modules/waygraph` symlink), not the tracked
      fixture directory itself - starts with zero `.block.ts` files. Real bug found while
      building this (see Status above): a single shared mutable project directory raced under
      `fullyParallel: true` + `--repeat-each`, so per-test isolation is real, not incidental.
- [x] M3.3 Real end-to-end test (`tests/cli/auto-session-blind-pilot.spec.ts`, "cold-start end
      to end") walking the whole cold-start sequence in order, against one
      continuously-running session (proving the browser never restarts across it):
      1. `auto --cli --detach` against the zero-Block project -> confirms a real session
         starts, `snapshot.here` is `null`, `sections` is empty.
      2. `auto dom <sessionId> --selector "#go-second"` -> confirms real DOM visibility into
         the fixture's actual first page, no Block involved.
      3. A real `.block.ts` file (a URL-based `defineNavBlock` recognizing `/second.html` via
         `Trait.url({ pathname: "/second.html" })`) is written to the project directory
         mid-test - standing in for what a driving agent would author, not code this package
         generates (per spec.md's own requirement that this capability generates no Block
         content). Confirmed still invisible in a `status` read taken before `reload`.
      4. `auto reload <sessionId>` (M2) -> confirms the new Block is now visible in a fresh
         `status`, without the session having restarted.
      5. `auto send <sessionId> "<pick>"` runs the newly-authored Block for real -> confirms
         `here` becomes the real `"SecondPage"` Checkpoint, proving it is genuinely driveable,
         not just visible.
      Also four smaller, focused tests for M1.4/M2.4 individually: `click` actually clicks a
      real element (`here` stays `null`, marker div updated, confirmed via `auto dom`); `type`
      actually fills a real input (confirmed via the echo div, since `.fill()` sets the DOM
      value property, not the `value` HTML attribute a plain DOM walk would otherwise miss);
      `goto` actually navigates the live page (confirmed via a follow-up `dom` read of the
      new page's own heading); `click`/`type` each fail loud, naming the selector, when
      nothing matches. All 6 tests pass at `--repeat-each=2` under real concurrent Playwright
      workers (one heavier end-to-end run needed its own timeout raised to 45s under
      `--repeat-each=3` stress specifically - real host contention from several concurrent
      Chromium launches, not a logic issue, per the Status section's bug #4 above).
- [x] M3.4 Full existing regression suite re-confirmed green after M1-M3 (same scope as
      `waygraph-pilot`'s own M4.4 - every directory except the pre-existing, unrelated
      `tests/unit/` vitest gap): 196/196 (190 previous + 6 new). `npm run build` clean.

## M4. Docs

- [x] M4.1 `README.md`: new "Blind Pilot (cold start, zero Blocks)" section documenting
      `click`/`type`/`goto`/`reload`, the worked cold-start example, the two real gotchas
      found (silent import errors, orphan status not gating the live menu), and the honest
      scope note - plus a "Cold start (zero Blocks)" pointer in the existing CLI reference
      section alongside the pilot/dom entries.
- [x] M4.2 `ROADMAP.md`: Phase 6b split out as its own "Blind Pilot - shipped" section (moved
      out of the combined "6b/6c - vision only" heading); Phase 6c retitled to cover only
      Waygraph Map/Router, still explicitly vision-only, not marked done.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Waygraph Map - a portable, consolidated graph package artifact; whether Blind Pilot
      should write into it instead of plain files is a real, open question this change
      deliberately does not resolve (see design.md's Roadmap section).
- [ ] Waygraph Router - an opinionated, Next.js-App-Router-style folder convention.
- [ ] Any Block-content generation/templating helper living inside this package.
- [ ] A real external-site proof (this change's proof is an in-repo synthetic fixture only).
