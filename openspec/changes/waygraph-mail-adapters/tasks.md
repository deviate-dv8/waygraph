## Status (read this first, always)

**State: implemented and verified.** Phase 5 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md`. **This change was rebuilt mid-flight, twice**: the first
pass (M1-M4 below, "HTTP adapter attempt") was fully implemented, typechecked, and proven
with real Docker-container integration tests before being discarded in favor of a different,
better-evidenced convention (M5-M8, "browser-driven convention") once real evidence turned
up - see design.md's Context for the full reasoning. Every pass is logged here, in order,
rather than silently erasing earlier ones from history. **A QA-richness follow-up (M9-M10)**
added two new assert Blocks and three new frame-scoped Trait factories, driven by direct user
request after seeing the working demo: "can I check if the email exists, read its content,
and assert against it" - both proven against real negative cases (no email arrives; wrong
content), not just the happy path. **A reuse follow-up (M11)** then answered "what about
100+ different emails in one project" - not with a Block-generating factory (considered,
rejected - see design.md), but by moving the two remaining hardcoded values (link-matching
pattern, expected content) into mem, making the *existing* fixed set of Blocks scenario
-agnostic, and renaming them to match (`extract-verification-link` ->
`extract-email-link`, `assert-verification-email-content` -> `assert-email-content`). Also
fixed a real, missed engine gap found along the way: `defineAssertBlock` never had a
`requires` option. 12/12 relevant tests pass (6 mail-verify + 3 frame-Trait + 2
`defineAssertBlock` `requires` + implicitly re-proven via the 2 pre-existing `example.spec.ts`
tests) on top of the 183 pre-existing project-wide tests (185 total). Not yet archived to
`openspec/changes/archive/`.

- [x] Milestone 1-4 (M1-M4) - HTTP adapter attempt: built, tested, then **discarded**
- [x] Milestone 5 (M5) - Browser-driven `*-external/mailpit/` Blocks
- [x] Milestone 6 (M6) - Real example flow + Docker-container proof
- [x] Milestone 7 (M7) - Docs (README, ROADMAP) rewritten for the new convention
- [x] Milestone 8 (M8) - Final regression + honest proof note
- [x] Milestone 9 (M9) - QA-richness: frame-scoped Traits, existence/content asserts
- [x] Milestone 10 (M10) - QA-richness proof, docs, and the `waygraph auto` menu question
- [x] Milestone 11 (M11) - Mem-driven reuse across scenarios, generic naming, `defineAssertBlock.requires`

---

## M1-M4. HTTP adapter attempt (built, tested, then discarded - see Status above)

- [x] Built `src/mail-adapter.ts` (`MailAdapter`/`MailMessage` types, shared polling,
      `extractLinks`, four factories: `mailhogAdapter`/`maildevAdapter`/`mailpitAdapter`/
      `maildropAdapter`, `resolveMailAdapter` reading a `waygraph.mail` package.json block).
      Exported from `src/index.ts`.
- [x] Real bug caught and fixed before this was ever considered "done": MailHog's
      `MIME.Parts` is a sibling of `Content` on the response item, not nested inside
      `Content.MIME` - caught by testing against a real running `mailhog/mailhog` container,
      not by trusting memory of the API.
- [x] Real finding: MailDev's `latest` Docker tag resolves to an unreleased 3.0.0-rc.*
      rewrite with a completely different, undocumented REST API - pinned to `2.2.1` (the
      last classic-API release) instead, confirmed against a real running container.
      Mailpit's response shape matched the design's assumption exactly on first real test.
- [x] `tests/mail-adapter/` (24 tests): fixture-based parsing tests for all four adapters
      using response bodies recorded from real running containers (not hand-guessed JSON);
      Docker-backed integration tests for MailHog/MailDev/Mailpit (spin up a real, uniquely-
      named, ephemeral-port container, real raw-SMTP send, real fetch, real teardown - never
      touching any already-running container on the host); a real live network test against
      `maildrop.cc`'s empty-inbox case (the "message received" path is fixture-only - a real
      SMTP send via `mx.maildrop.cc:25` hit genuine greylisting on the first live attempt,
      a real anti-spam mechanism this environment can't reliably wait out); polling-behavior
      and `resolveMailAdapter` config-resolution tests. 204/204 relevant tests passed
      (180 pre-existing + 24 new) at the time this was considered complete.
- [x] **Discarded** (see design.md's Context and Decisions): `src/mail-adapter.ts`,
      `tests/mail-adapter/`, and the mail-adapter exports in `src/index.ts` were removed in
      full once the browser-driven convention (M5+) replaced this attempt. Not kept
      alongside it - shipping two competing conventions for the same problem was rejected
      explicitly (see design.md's first Decision).

## M5. Browser-driven `*-external/mailpit/` Blocks

- [x] M5.1 Confirmed Mailpit's real web-UI DOM against a real running `axllent/mailpit`
      container before writing any selector: launched a real container, sent a real SMTP
      message via raw SMTP, drove it with a real Playwright page
      (`page.locator("body").innerHTML()`, then again after a real click on the message
      row). Confirmed: the inbox list row is a real `<a href="/view/:id" class="row ...
      message ...">` (a genuine, if client-side-routed, link - `page.waitForURL(/\/view\//)`
      sees the route change exactly like a full navigation), and the opened message's body
      lives in a `srcdoc` `<iframe id="preview-html">`.
- [x] M5.2 `templates/scaffold/src/blocks/demo-external/mailpit/mailpit-sel.ts`
      (`MailpitSel.messageRow = "a.message"`, `MailpitSel.previewIframe = "#preview-html"` -
      both confirmed against the real DOM in M5.1, not guessed).
- [x] M5.3 `nav-mailpit-inbox.block.ts` (`defineNavBlock`, checkpoint `MailpitInbox`, `url`
      from `WAYGRAPH_MAIL_URL` env var defaulting to Mailpit's usual local port).
- [x] M5.4 `methods/open-message.method.block.ts` (`defineMethodBlock`, `MailpitInbox` ->
      `MailpitMessageOpen`, `requires: [ExpectedRecipient.key]` - correctly externally
      supplied, matches the row by mem-set recipient rather than inbox position, avoiding
      the wrong-message bug both real projects independently guarded against).
- [x] M5.5 `methods/extract-verification-link.method.block.ts` (`defineMethodBlock`,
      self-loop on `MailpitMessageOpen`, reads the link via
      `page.frameLocator(MailpitSel.previewIframe).locator('a[href*="verified=1"]')` +
      `getAttribute("href")`, `mem.set`s `VerificationLink` - no REST call anywhere).
- [x] M5.6 `mailpit-inbox.page.block.ts` (`definePageBlock` hub, arrival-only, registers
      both Methods - mirrors the real projects' own page-hub-for-the-inbox-screen shape).
- [x] M5.7 `demo-web/nav-verification-link.block.ts` (`defineNavBlock`, back into the app,
      `url: (mem) => mem.get(VerificationLink.key).url` - **no** `requires` for
      `VerificationLink`, since it's produced earlier in the same chain, not supplied
      externally; declaring it would make preflight reject the run before the flow could
      ever produce it - same lesson as the first (HTTP-based) attempt at this exact Block).
- [x] M5.8 New states/mem keys: `demo.states.ts` gains `MailpitInbox`/`MailpitMessageOpen`;
      `demo.mem-keys.ts` gains `VerificationLink`/`ExpectedRecipient`. `demo-sel.ts`/
      `home.html` gain the `verified-banner` proof point (only revealed by `?verified=1`,
      so navigating there proves the exact extracted link was followed).

## M6. Real example flow + Docker-container proof

- [x] M6.1 `templates/scaffold/src/flows/mail-verify.flow.ts`: `nav-mailpit-inbox` ->
      `open-message` -> `extract-verification-link` -> `nav-verification-link` - four atomic
      Blocks, no compound actions.
- [x] M6.2 `templates/scaffold/tests/mail-verify.spec.ts`: since the scaffold has no real
      backend, the test plays the role of "the app sent the email" itself - spins up a real,
      throwaway Mailpit container (never reusing any already-running container on the host),
      sends a real SMTP message with a real `<a href="...verified=1">` link back to the
      scaffold's own fixture page, runs `mailVerifyFlow` for real, asserts the final
      Checkpoint. Verified via a real `npm pack`-wired scratch install (matching this
      session's established verification discipline): `tsc --noEmit` clean, the test green,
      stable under `--repeat-each=2` with two containers running concurrently, and zero
      leftover containers confirmed via `docker ps` after the run.
- [x] M6.3 `waygraph check templates/scaffold` reports zero nav-escape/inline-selector/
      orphan warnings for the new Blocks.

## M7. Docs

- [x] M7.1 `README.md`'s "Mail adapters" section rewritten in full around the
      browser-driven convention (renamed "Mail adapters (cross-origin, browser-driven)"),
      with the complete four-Block example and the `requires`-omission explanation.
- [x] M7.2 `ROADMAP.md`'s Phase 5 section and summary-table row rewritten to record the
      pivot honestly: what was built first (the HTTP adapter), why it was replaced (real
      convergent evidence from two independent projects), and what shipped instead.

## M8. Final regression + honest proof note

- [x] M8.1 Full project typecheck (`npx tsc --noEmit`) and build (`npm run build`) clean
      after removing `src/mail-adapter.ts` and its exports.
- [x] M8.2 Full in-repo Playwright regression suite re-run after the removal (the same 180
      pre-existing tests this whole roadmap phase has verified against, minus the 24 removed
      mail-adapter tests) - confirmed green, nothing else depended on the removed module.
- [x] M8.3 Honest proof note (this Status section, above): the browser-driven convention has
      real, live-container, live-DOM proof for exactly one catcher (Mailpit) - not fixtures,
      not assumption, not a description of an untested pattern. MailHog/MailDev/`maildrop.cc`
      browser-driven equivalents are named as real, plausible future work in design.md's
      Roadmap, not silently claimed as already covered.

## M9. QA-richness: frame-scoped Traits, existence/content asserts

- [x] M9.1 `src/trait.ts`: `frameVisible(frameSelector, innerSelector)`,
      `frameTextEquals(frameSelector, innerSelector, expected)`,
      `frameContainsText(frameSelector, innerSelector, expected)` - mirror `visible`/
      `textEquals` exactly, scoped via `page.frameLocator(frameSelector)`. Exposed as
      `Trait.frameVisible`/`Trait.frameText`/`Trait.frameContains` and as named exports from
      `src/index.ts`, matching the existing `urlMatches`/`textEquals`/`visible` pattern.
- [x] M9.2 `demo-external/mailpit/methods/assert-email-received.method.block.ts`:
      `defineAssertBlock<MailpitInbox>`, a mem-aware `{ name, check(page, mem) }` Trait
      (dynamic selector from `ExpectedRecipient`, since no static factory can express that) -
      confirms arrival without opening/consuming the message.
- [x] M9.3 `demo-external/mailpit/methods/assert-verification-email-content.method.block.ts`:
      `defineAssertBlock<MailpitMessageOpen>`, `Trait.frameContains(MailpitSel.previewIframe,
      "body", EXPECTED_VERIFICATION_EMAIL_TEXT)` - confirms the message body's actual copy,
      not just that a link exists.
- [x] M9.4 `open-message.method.block.ts`: wrapped its `waitFor` timeout in a clear, named
      error (`no email arrived for "<email>" within 30s`) instead of leaking Playwright's own
      generic timeout error - real QA-facing clarity improvement, not required but requested.
- [x] M9.5 Real bug caught twice (once per new assert Block) before this could be considered
      done: both were first written without an explicit `defineAssertBlock<...>` type
      argument, defaulting `Out` to wildcard `Checkpoint<string>` - harmless for
      `AssertHelloBlock` (last Block before `end`) but breaking `defineFlow`'s tuple typing
      once a wildcard Block sits between two specifically-typed ones (both of these do).
      Fixed with explicit `<MailpitInbox>`/`<MailpitMessageOpen>` type arguments; documented
      in spec.md, design.md, README.md so this isn't rediscovered from a cryptic error again.
- [x] M9.6 `demo-web/methods/assert-item-added.method.block.ts` (a third example, outside the
      mail context, answering "can an assert check what a Method's result actually was"):
      `defineAssertBlock<ItemInCart>`, a mem-aware Trait confirming the specific row's own
      Remove button appeared (not just "some" row) plus `Trait.text(DemoSel.cartCount, "1")`
      - wired into `shop.flow.ts` right after the `add-item` it checks.

## M10. QA-richness proof, docs, and the `waygraph auto` menu question

- [x] M10.1 `mailVerifyFlow` extended to six Blocks: `nav-mailpit-inbox` ->
      `assert-email-received` -> `open-message` -> `assert-verification-email-content` ->
      `extract-verification-link` -> `nav-verification-link`.
- [x] M10.2 `tests/mail-verify.spec.ts`: three real, live-Mailpit-container tests - the happy
      path (now also proving both new asserts don't false-negative), `assert-email-received`
      failing loud when no email ever arrives for a fresh recipient, and
      `assert-verification-email-content` failing loud when a real email with a real link
      has the wrong surrounding copy (isolating the content check from the link-extraction
      step). Real finding while writing these: a `defineFlow` chain's verify-failure error
      names the *whole path taken so far* (each composed Block's own name accumulates
      through `connect()`), not just the failing Block's own name - genuinely useful for QA
      (shows exactly how far a run got), but the test assertions had to match that reality
      rather than the leaf name they were first written against.
- [x] M10.3 `tests/verify/trait-factories.spec.ts` (main package): 3 new tests against a real
      `data:` URL page with a real `srcdoc` iframe - the new frame Traits find content a
      plain `page.locator` genuinely cannot see, and `frameContains` fails loud, naming
      itself, on a real mismatch.
- [x] M10.4 Answered directly (user question, not assumed): does a wildcard-`In` external Nav
      clutter `waygraph auto`'s live menu on every screen? No - `buildExploreMenu`
      (`src/auto-explore.ts`) already excludes URL-based Navs once on a known screen (a
      pre-existing engine behavior, its own code comment literally names "mailpit" as the
      motivating example). Documented in README.md and ROADMAP.md rather than left as a
      verbal answer only.
- [x] M10.5 `waygraph check templates/scaffold` clean; full in-repo regression suite
      re-confirmed green (183/183: 180 prior + 3 new frame-Trait tests) after all of M9-M10;
      `npm run build`/`npx tsc --noEmit` clean.

## M11. Mem-driven reuse across scenarios, generic naming, `defineAssertBlock.requires`

- [x] M11.1 Considered and rejected a factory-function shape (`clickEmailLink({...})`
      returning `{ blocks: [...] }` to spread into a flow) for "handle 100+ different email
      scenarios without hand-writing Blocks per scenario" - see design.md's Decision.
      Realized instead that `open-message`, the link-extraction Method, and both new assert
      Blocks were *already* scenario-agnostic except for two hardcoded values.
- [x] M11.2 `demo.mem-keys.ts`: new `ExpectedLinkPattern` (`key<string>`) and
      `ExpectedEmailContent` (`key<string>`) mem keys - plain `key<T>`, not `keyGroup`, since
      each is a single string value, not a shaped object.
- [x] M11.3 `extract-email-link.method.block.ts` (renamed from
      `extract-verification-link.method.block.ts`): the link-matching substring now comes
      from `mem.get(ExpectedLinkPattern)`, `requires: [ExpectedLinkPattern]`, no hardcoded
      `"verified=1"` string.
- [x] M11.4 `assert-email-content.method.block.ts` (renamed from
      `assert-verification-email-content.method.block.ts`): the expected copy now comes from
      a bespoke mem-aware Trait reading `ExpectedEmailContent` at check time (not the static
      `Trait.frameContains` factory, which bakes its expected string in at Block-definition
      time), `requires: [ExpectedEmailContent]`.
- [x] M11.5 `assert-email-received.method.block.ts`: added the missing
      `requires: [ExpectedRecipient.key]` for consistency (its mem-aware Trait already read
      this key; it just wasn't declared).
- [x] M11.6 Real engine gap found and fixed: `AssertBlockOptions`/`defineAssertBlock` in
      `src/engine.ts` had no `requires` field at all, unlike every other Block-options
      interface. Added with the exact same optional pass-through pattern already used
      elsewhere. `EmailLink` (renamed from `VerificationLink`) - the mem key holding the
      extracted link - and the mail-provider page's method-registry keys in
      `mailpit-inbox.page.block.ts` updated to match the renames.
- [x] M11.7 `tests/core/define-assert-block.spec.ts` (main package): 2 new tests - `requires`
      is passed through to the generated Block; omitting it leaves it `undefined`, not an
      empty array.
- [x] M11.8 `mail-verify.flow.ts` and its doc comment updated to describe the four
      mail-reading Blocks as reusable, mem-driven, and scenario-agnostic.
- [x] M11.9 `tests/mail-verify.spec.ts`: rewritten to seed all three scenario-specific mem
      keys explicitly, plus a new test proving the actual reuse claim - the same four Blocks
      (same flow, zero new code) correctly handle a second, unrelated email scenario
      (different recipient, different expected content, and a decoy link in the body that
      `ExpectedLinkPattern` must correctly discriminate against, not just pick the first
      link found). 6 mail-verify tests total, all real (live Mailpit container, real SMTP
      sends), stable under repeated runs, zero leftover containers.
- [x] M11.10 README.md's "Mail adapters" section restructured with a new "Reusable across
      scenarios" subsection (the mem-key table, the two-scenario code example, the naming
      rationale) and all renamed Block/mem-key references updated throughout. ROADMAP.md's
      Phase 5 section updated with the reuse story as the direct answer to "100+ different
      emails". `waygraph check templates/scaffold` clean; full in-repo regression suite
      re-confirmed green (185/185: 183 prior + 2 new `defineAssertBlock.requires` tests);
      `npm run build`/`npx tsc --noEmit` clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] A second real worked example against MailHog or MailDev's own web UI (different DOM,
      same pattern) - genuine additional proof, not required for this change to be complete.
- [ ] A browser-driven equivalent for `maildrop.cc`'s own web UI (unexplored - its DOM was
      never inspected in this change, unlike Mailpit's).
- [ ] Re-evaluating a headless/no-browser-tab mail-verification path if a real, concrete need
      for one surfaces later - a new proposal informed by that need, not a revival of the
      exact HTTP interface discarded here.
- [ ] Phase 6 (Waygraph Copilot) - separate, later change proposal, sequenced after this one.
