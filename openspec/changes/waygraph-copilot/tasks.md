## Status (read this first, always)

**State: planned, not yet implemented.** Phase 6 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md` - the final phase, scoped down from the roadmap's original
two-delivery-mode vision to narrate-mode only, plus a manifest compiler and client-side
`locate()`/`findBlockPath`, once reading the actual code (`discoverGraph`, `locate()`,
`runStubPhase`) surfaced real, load-bearing constraints the roadmap prose hadn't accounted
for (see design.md's Context). Agentic mode is explicitly deferred to a later proposal.

- [ ] Milestone 1 (M1) - Manifest compiler
- [ ] Milestone 2 (M2) - Client-side runtime module (locate/findBlockPath port)
- [ ] Milestone 3 (M3) - Plain-language-to-Checkpoint resolution
- [ ] Milestone 4 (M4) - Narrate mode
- [ ] Milestone 5 (M5) - CLI/build wiring
- [ ] Milestone 6 (M6) - In-repo proof

---

## M1. Manifest compiler

- [ ] M1.1 `CopilotManifest`/`CopilotEdge`/`CopilotCheck` types (new, separate from
      `WaygraphGraph`/`WaygraphEdge` - see design.md's first Decision) - plain, JSON-safe data
      only, no function types anywhere in the shape.
- [ ] M1.2 `compileManifest(projectDir)` (built on `discoverGraph`'s own file-walking, not a
      second implementation of it): for each edge, capture `description`, `requires` (key
      names only, not `MemKey` object identity), and attempt to capture `resolve`/`verify` as
      data.
- [ ] M1.3 `recognizable` detection: inspect each Trait in a Block's `verify` (and its
      `resolve`'s Checkpoint) against the six built-in factories
      (`urlMatches`/`textEquals`/`visible`/`frameVisible`/`frameTextEquals`/
      `frameContainsText` from `src/trait.ts`) by reference identity (or an attached
      serializable-args record each factory returns alongside its `check` function - decide
      the concrete mechanism here, prototype both before committing). A Block using anything
      else gets `recognizable: false`, with the specific reason recorded (e.g. "bespoke Trait
      not built from a known factory") - never a silent guess.
- [ ] M1.4 Static `stubBefore`/`stubAfter` capture for narrate mode: when a Block's stub is a
      plain object, capture it as-is; when it is a function, resolve it once at compile time
      using representative `out`/`error` inputs (matching how `waygraph demo`'s own preview
      tooling already precomputes fixture data) and capture the *result*, not the function.
- [ ] M1.5 Real test: a fixture project's compiled manifest is deep-equal after a
      `JSON.stringify`/`JSON.parse` round-trip (per spec.md's first requirement) - proves it
      is genuinely inert data, not an object graph that only looks JSON-safe.
- [ ] M1.6 Real test: a Block built entirely from built-in Trait factories compiles
      `recognizable: true` with correct captured check data; a Block using a bespoke Trait
      (e.g. this repo's own `assert-email-received`) compiles `recognizable: false` with a
      real, specific reason - not fixture-only, run against `templates/scaffold`'s and
      `examples/saucedemo`'s real, existing Blocks (both recognizable and not).

## M2. Client-side runtime module (locate/findBlockPath port)

- [ ] M2.1 New build target: a genuinely separate, zero-Node-dependency TypeScript module
      (own `tsconfig`, no import of `@playwright/test`/`node:fs`/`node:path` anywhere in its
      dependency graph - enforced by a real build-time or lint-time check, not just
      discipline) exported as a distinct subpath from the published package.
- [ ] M2.2 Native-DOM reconstruction of each of the six built-in Trait factory "kinds"
      (visible/text-equals/url-matches/frame-visible/frame-text/frame-contains) using
      `document.querySelector`, an iframe-equivalent DOM traversal for the frame-scoped ones,
      and `URLPattern` (a real browser API - confirm current browser support requirements
      before committing to it as the only mechanism, and name a fallback if support is a real
      concern for this project's target audience).
- [ ] M2.3 Client-side `locate(manifest)`: walks `recognizable: true` Blocks the same way
      `engine.ts`'s own `locate()` does, returns the matching Checkpoint or `null`.
- [ ] M2.4 Client-side `findBlockPath(manifest, fromTag, toTag)`: same graph-search logic as
      `src/graph.ts`'s own `findBlockPath`, operating on the manifest's edges instead of a
      `WaygraphGraph`'s.
- [ ] M2.5 Real test, run in an actual browser context (not a Node DOM shim) against a real
      compiled manifest and a real loaded page: client-side `locate()` returns the same
      Checkpoint the server-side `locate()` returns for the same page/Block.

## M3. Plain-language-to-Checkpoint resolution

- [ ] M3.1 A deterministic text-similarity matcher (decide and justify the concrete
      algorithm here - e.g. token-overlap scoring, not assumed) over every edge reachable
      from the current Checkpoint's `description` field, using `findBlockPath`'s own
      reachability to scope candidates (an ask should only ever resolve to somewhere
      actually reachable from here, not the whole project's graph unconditionally).
- [ ] M3.2 A confidence threshold below which the resolver reports "no confident match"
      rather than the best of a bad set (per spec.md's requirement) - real test proving both
      the positive and negative case against real Block descriptions from an in-repo example.

## M4. Narrate mode

- [ ] M4.1 Client-side highlight/ring rendering, built fresh for this zero-Node-dependency
      module (not a direct port of `src/cli.ts`'s `cycleHighlightRings` and friends, which
      are Playwright-`page.evaluate`-orchestrated - see design.md's Context finding #3) -
      reuses the manifest's captured static stub data as its only input.
- [ ] M4.2 Wire the resolved edge (M3) to its captured stub data (M1.4) to the highlight
      renderer (M4.1): one real, callable "narrate this ask" entry point in the client
      runtime module.
- [ ] M4.3 Real test, in an actual browser: given a resolved edge with real stub/highlight
      data, the real target element on a real page gets a real visible highlight, and no
      click/fill/navigation occurs as a side effect (per spec.md's requirement).

## M5. CLI/build wiring

- [ ] M5.1 A new `waygraph` CLI surface to compile a project's manifest to a file (exact
      command name/flags TBD - follow this project's existing subcommand conventions, check
      `src/cli.ts`'s `usage()` text for the established pattern before inventing a new one).
- [ ] M5.2 The client runtime module built and published as its own subpath export -
      confirm the package's build tooling (check `package.json`'s current build scripts
      before assuming what's available) can actually produce a separate browser-target
      bundle from this single-package repo, or whether that needs its own new build step.

## M6. In-repo proof

- [ ] M6.1 Pick `examples/saucedemo` or `templates/scaffold` (decide once M1-M5 make the real
      integration shape concrete, record the reasoning here - same discipline this session
      used for the mail-verification example's own M4.1).
- [ ] M6.2 Wire the compiled manifest + client runtime + narrate mode into that example's own
      fixture/live page, demonstrate one real plain-language ask (e.g. "how do I add an item
      to my cart") resolving to a real Checkpoint and a real highlighted control, end to end.
- [ ] M6.3 Real test proving this end to end against a real browser page (Playwright
      acceptable here as the *test harness* driving a real page and asserting on the real
      DOM/highlight outcome, even though the client runtime under test itself has zero
      Playwright dependency - the harness and the thing it tests are not the same claim).
- [ ] M6.4 Honest status note (per spec.md's last requirement): this proof demonstrates the
      mechanism works in-repo; it does not satisfy `ROADMAP.md`'s original `1.0.0` criterion
      of "demoable on one real consumer" - that remains separate, later, unmet work.
- [ ] M6.5 `README.md`/`ROADMAP.md` updated: the capability, its `recognizable`-subset
      limitation, agentic mode's deferred status, and the honest 1.0.0-gap note.
- [ ] M6.6 Full in-repo regression suite green; `npm run build`/`npx tsc --noEmit` clean for
      both the existing Node-side package and the new client-side build target.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Agentic mode - the Playwright-Locator-to-native-DOM compatibility layer it needs is
      real, substantial, unsolved work; a separate, later proposal once narrate mode is
      proven and a concrete need justifies the investment.
- [ ] Generic client-side execution of bespoke Trait code (safely running author-supplied
      arbitrary code in an untrusted browser context) - a different, harder problem.
- [ ] A smarter (embedding/LLM-assisted) plain-language matcher than deterministic text
      similarity.
- [ ] Embedding into a real external consumer application, and the associated `1.0.0`
      declaration this change alone does not complete.
