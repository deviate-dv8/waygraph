## Why

`ROADMAP.md`'s Phase 6 is the last item in the "Agent-authoring tooling and Waygraph Copilot"
roadmap and the stated gate for `1.0.0`: inject waygraph into an agent that shows a real end
user their own application, live, and helps them navigate it - constrained to a verified,
site-specific Block graph instead of guessing from pixels the way a generic vision-based
"browser use" agent does. Everything Phases 1-5 built (session control, DOM inspection,
headful trace, atomicity/orphan-Block gates, the mail-verification convention) exists to make
a project's own Block library trustworthy enough to point a real end user at, live.

Investigating what "port `locate()`/`findBlockPath` to run client-side" actually requires
(reading `src/graph.ts`, `src/engine.ts`'s `locate()`, and `src/highlights.ts`'s
`runStubPhase()` directly, not assuming from the roadmap prose alone) surfaced two real,
load-bearing constraints ROADMAP.md's own Phase 6 bullet did not anticipate:

1. **`discoverGraph`'s current output has no `description`/`requires`/`verify` data at all** -
   `WaygraphEdge` today is just `{ block, file, from, to, kind }`. The "client-safe manifest"
   Phase 6 describes does not exist yet even in principle; it needs a real compiler step.
2. **A Block's `verify`/`resolve` is only "compilable to data" when built from the known
   built-in `Trait` factories** (`Trait.url`/`Trait.text`/`Trait.visible`/`Trait.frameVisible`/
   `Trait.frameText`/`Trait.frameContains` - each constructed from plain data: a selector
   string, a `URLPatternInit`, an expected string). A bespoke `{ name, async check(page, mem)
   {...} }` Trait - used extensively in this session's own mail-verification work
   (`assert-email-received`, `assert-email-content`) - is arbitrary code, not data, and
   cannot be safely reconstructed from a JSON manifest shipped to a real end user's browser.
   Client-side `locate()` can only recognize Blocks built entirely from the data-only subset;
   a Block using a bespoke Trait is not client-recognizable and must be marked as such, not
   silently dropped or silently assumed to work.

A second, deeper finding: **"agentic" mode (actually executing a Block's `act()` against the
user's live session) requires running that code without Playwright at all** - a real end
user's browser tab has no Playwright bridge. Every existing Block's `act()` calls Playwright
Locator APIs (`page.locator(sel).click()`, `page.waitForURL(...)`, `page.frameLocator(...)`),
none of which exist as native browser APIs. Making agentic mode work generically would need a
Playwright-Locator-shaped compatibility layer built from native DOM APIs - a substantial,
unsolved porting problem in its own right, not a detail to wave past.

## What Changes

Given both findings, this change scopes Phase 6 to what is honestly buildable now, and names
the rest as explicit, separate follow-up rather than silently shrinking the roadmap's own
ambition without saying so:

- **New: a manifest compiler.** Extends `discoverGraph`'s output with each Block's
  `description`, `requires` (key names), and - only for Blocks built entirely from the
  built-in `Trait` factories - a data-only representation of `resolve`/`verify` sufficient to
  reconstruct an equivalent native-DOM check client-side. A Block using any bespoke Trait is
  included in the manifest (for the plain-language index and narrate-mode highlighting, which
  do not need to *check* anything) but flagged `recognizable: false` and excluded from
  client-side `locate()`/`findBlockPath` path-finding, which does.
- **New: a client-side `locate()`/`findBlockPath` port.** A standalone, Playwright-free
  browser module that reconstructs the built-in-Trait-factory checks as native
  `document.querySelector`/`URLPattern` checks against the manifest, run inside the real
  end user's own tab.
- **New: plain-language-to-Checkpoint resolution.** Matches a free-text ask (e.g. "how do I
  invite a signer") against every reachable edge's `description` field - the same field every
  Block already requires today, so zero new authoring burden. A deterministic text-similarity
  match is the baseline; nothing here forecloses a smarter (embedding-based, LLM-assisted)
  matcher later, but this change does not require calling an external model to work at all.
- **New: narrate mode.** Reuses the same `stubBefore`/`WaygraphHighlight` data every Block
  already authors for `waygraph demo`'s own overlay (confirmed already page-independent, pure
  data-in/data-out via `runStubPhase` when authored as a static object) to point at the real
  control on the user's real page - ring/highlight only, no action taken on the user's behalf.
- **Deferred, explicitly out of scope for this change: agentic mode.** Actually executing a
  Block chain against the user's live session needs the Playwright-Locator compatibility
  layer named above - real, substantial, unsolved work belonging to its own later proposal
  once narrate mode is proven and a concrete need justifies the investment.
- **Honest proof-scope note, matching this session's own established precedent (Phases 4 and
  5 both hit the identical tension):** embedding into a real external consumer application is
  out of scope for this repo's own proof. This change's proof embeds the compiled manifest +
  client runtime + narrate overlay into an in-repo example (`examples/saucedemo` or
  `templates/scaffold`) and demonstrates one real plain-language ask resolving to a real
  highlighted control end to end. This satisfies "the mechanism works," not the original
  `1.0.0` criterion of "demoable on one real consumer" - reaching `1.0.0` still needs a
  separate, later step where a real consumer project actually embeds this. Stated plainly
  here rather than silently substituted.

## Capabilities

### New Capabilities
- `waygraph-copilot`: a compiled, client-safe manifest of a project's Block graph; a
  Playwright-free client-side `locate()`/`findBlockPath`; plain-language-to-Checkpoint
  resolution via each Block's `description`; and a narrate-mode overlay reusing existing
  `stubBefore`/highlight data - proven against an in-repo example, not (yet) a real consumer
  app. Agentic mode is named as a distinct, deferred capability, not delivered here.

## Impact

- `src/graph.ts` - `discoverGraph`'s edge shape extended with `description`/`requires`/a
  data-only `verify` representation; a new manifest-compiling entry point.
- New client-side module(s) (browser-target build, no Node/Playwright imports) for
  manifest-driven `locate()`/`findBlockPath` and the narrate overlay.
- New CLI surface (exact shape decided in design.md) to compile a project's manifest and to
  demo/embed the narrate-mode Copilot against a live page.
- One in-repo example (`examples/saucedemo` or `templates/scaffold`) wired with a real,
  proven narrate-mode Copilot demo.
- `README.md`/`ROADMAP.md` - document the capability, its Trait-factory-subset limitation,
  and the honest proof-scope gap against the original `1.0.0` criterion.
- Does not change any existing Block's runtime behavior, `runGraph`, or any Playwright-side
  helper - this is new, additive client-side surface built from data already produced by
  (an extended) `discoverGraph`.
- Does not implement agentic mode. Does not touch any external consumer project.
