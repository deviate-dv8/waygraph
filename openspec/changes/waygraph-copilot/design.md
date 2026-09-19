## Context

`ROADMAP.md`'s Phase 6 bullet names four sub-pieces: (a) a client-safe manifest compiled
from `discoverGraph`'s output, (b) a client-side port of `locate()`/`findBlockPath`, (c)
plain-language-to-Checkpoint resolution via each Block's `description`, (d) two delivery
modes (narrate, agentic) on the same resolved path. Read directly before writing this design
(not assumed from the roadmap prose): `src/graph.ts`'s `discoverGraph`/`WaygraphEdge`,
`src/engine.ts`'s `locate()`, `src/trait.ts`'s built-in Trait factories (including this
session's own new `frameVisible`/`frameTextEquals`/`frameContainsText`), and
`src/highlights.ts`'s `runStubPhase`.

Three real, load-bearing findings came out of that reading, none anticipated by the roadmap
bullet's own wording:

1. `WaygraphEdge` today is `{ block, file, from, to, kind }` - no `description`, `requires`,
   or `verify` data at all. The "client-safe manifest" does not exist even in principle yet.
2. `locate()` calls `block.instruction.verify`'s Traits' `check(page, mem)` directly - real
   function objects. The six built-in `Trait` factories are each built from plain
   construction data (a selector string, a `URLPatternInit`, an expected string) and are
   therefore reconstructable as native-DOM equivalents from data alone. A bespoke
   `{ name, check(page, mem) {...} }` Trait - used repeatedly in this session's own
   mail-verification work - is arbitrary code and cannot be safely shipped to, or
   reconstructed generically inside, an untrusted end-user browser context.
3. `runStubPhase` (the function that computes a Block's `stubBefore`/`stubAfter` narration
   data for `waygraph demo`'s own overlay) is already page-independent and pure when a
   Block's stub is authored as a static object - real, existing leverage for narrate mode.
   The demo overlay's actual DOM rendering (`cycleHighlightRings` and friends in `src/cli.ts`)
   is Node-side, orchestrating many small `page.evaluate()` calls with real sequencing/
   pacing/waiting logic between them - some browser-side pieces already exist as `window.__wg*`
   globals injected into the page, but the orchestration itself is tightly coupled to
   Playwright's `page.evaluate` bridge. Extracting a genuinely standalone,
   Playwright-independent client bundle is real porting work, not a drop-in reuse.

A fourth finding shapes this change's scope more than any other: **agentic mode (executing a
Block's `act()` for real against the user's live session) requires running that code without
Playwright at all.** A real end user's browser tab has no Playwright bridge - `page.locator`,
`page.waitForURL`, `page.frameLocator`, all the calls every existing Block's `act()` makes,
are Node-side Playwright APIs with no browser-native equivalent. Making agentic mode work
generically needs a Playwright-Locator-shaped compatibility layer built from native DOM APIs
(`querySelector`, `dispatchEvent`, `MutationObserver`-based waiting, etc.) - a substantial,
unsolved porting problem, not a detail this design can wave past.

## Roadmap (why this slice, not the whole vision)

1. **This change** - manifest compiler, client-side `locate()`/`findBlockPath` (built-in-
   Trait-factory subset only), plain-language resolution, narrate mode. Proven in-repo.
2. **Not in this change - agentic mode.** The Playwright-Locator compatibility layer it needs
   is real, substantial, unsolved work - a separate, later proposal once narrate mode is
   proven and a concrete need justifies the investment, not bundled in here speculatively.
3. **Not in this change - client-side recognition of bespoke-Trait Blocks.** A Block using a
   hand-written Trait is included in the manifest (name, description, edges - useful for the
   plain-language index and for *narrating* it) but marked `recognizable: false` and excluded
   from any `locate()`/`findBlockPath` result that requires confirming arrival - solving this
   generically (safely running arbitrary author-supplied code in an untrusted browser
   context) is a different, harder problem than anything else in this phase.
4. **Not in this change - a smarter (embedding/LLM-assisted) plain-language matcher.** A
   deterministic text-similarity baseline is what ships; nothing here forecloses swapping in
   something smarter later, but this change does not require calling an external model to
   produce a working result.
5. **Not in this change - embedding into a real external consumer application.** Proof stays
   in-repo, matching Phases 4 and 5's own established precedent for the identical tension.
   Reaching `1.0.0`'s original "demoable on one real consumer" criterion is a separate, later,
   explicit step this change does not complete.

## Goals / Non-Goals

**Goals:**
- A project's Block graph becomes a plain-JSON manifest safe to ship to an untrusted browser.
- Client-side `locate()`/`findBlockPath` work correctly for every Block built from the
  built-in Trait factories, with zero Node/Playwright/filesystem dependency.
- A plain-language ask resolves to a real Checkpoint using data every Block already must
  supply (`description`), not a new authoring burden.
- Narrate mode gives a real end user a real, visible pointer to the real control that answers
  their ask, reusing already-authored narration data.
- The proof is real (a real browser, a real DOM, a real highlight), even though it is scoped
  to an in-repo example rather than a production consumer app.

**Non-Goals (this change):**
- Agentic mode (see Roadmap above).
- Generic client-side execution of bespoke Trait code.
- A smarter plain-language matcher than deterministic text similarity.
- Embedding into any real external consumer application.
- Changing any existing Block's runtime behavior, `runGraph`, or Playwright-side helper -
  this is new, additive, data-driven client-side surface built from an extended
  `discoverGraph`, not a rewrite of anything that exists.

## Decisions

**The manifest is a separate compiled artifact, not something `discoverGraph` returns for
free.** `discoverGraph`'s existing callers (`waygraph graph`, `waygraph check`'s orphan sweep,
`waygraph auto`'s menu building) need the full, Node-side, file-path-carrying `WaygraphEdge`
shape unchanged - adding `description`/`requires`/a data-only `verify` representation to that
same type would leak Copilot-specific concerns into every existing consumer of the graph. A
new `compileManifest(projectDir)` function (built on top of `discoverGraph`, in `src/graph.ts`
or a new sibling module) produces the separate, smaller, JSON-only `CopilotManifest` shape;
`discoverGraph`'s own return type is unchanged.

**A Block's `recognizable` flag is computed by inspecting its actual `verify`/`resolve`
Traits at compile time, not declared by the author.** Asking every Block author to manually
flag "is my verify built from only built-in Trait factories" would be both extra authoring
burden and a real footgun (a Block using a bespoke Trait that's incorrectly marked
`recognizable: true` would silently ship a manifest claiming a check it cannot actually
perform). The compiler inspects each Trait's own identity (reference-equality against the six
known factory functions, or a small serializable-args record each factory attaches to what it
returns) and computes `recognizable` deterministically - the same "derive it, don't ask the
author to declare it" principle `defineAssertBlock`'s generated `resolve` already uses.

**Client-side checks are reconstructed from captured construction arguments, not by shipping
the factory functions' own code.** `Trait.visible("#some-id")`'s manifest entry captures
`{ kind: "visible", selector: "#some-id" }`, not a serialized function - the client runtime
ships its OWN native-DOM implementation of what "visible" means for each of the six known
kinds, and the manifest only ever carries the plain arguments each factory was called with.
This is what keeps the manifest inert JSON rather than a code-delivery mechanism.

**The client runtime is a genuinely separate build target, not a browser-compatible reading
of the existing `src/`.** The existing package imports `@playwright/test` types and
`node:fs`/`node:path` throughout - none of that can ship to a browser. A new, small,
zero-Node-dependency module (its own `tsconfig`/build target, bundled separately, exported
as a distinct subpath - e.g. `waygraph/copilot-client` - from the published package) is the
only piece a real end-user page ever loads; it depends on nothing from the Node-side engine
beyond the shape of the compiled manifest itself.

**Narrate mode replays `stubBefore`/highlight data client-side; it does not re-invoke
`runStubPhase` unmodified.** `runStubPhase` is pure when a Block's `stubBefore` is a static
object, but when authored as a function `(ctx) => {...}`, that function is Block-author code
with the exact same "arbitrary code in an untrusted browser" problem `verify` has. The
manifest compiler captures the *static* `stubBefore`/`stubAfter` shape (resolving any
authored function server-side, at compile time, using an already-known/typical `out`/`error`
shape - the same fixture data `waygraph demo` already precomputes for its own preview
tooling) rather than shipping the function itself.

## Risks / Trade-offs

- [A project relying heavily on bespoke Traits gets a Copilot that can narrate less of its
  graph than one built entirely from built-in factories] -> Accepted and stated plainly
  (`recognizable: false`) rather than silently degraded or overclaimed - this is itself a
  real, concrete incentive toward the built-in Trait factories where they suffice, matching
  this project's existing "prefer the reusable factory over a bespoke one-off" bias.
- [Deterministic text-similarity matching will sometimes be wrong or unconfident on a
  genuinely ambiguous ask] -> Accepted for this change; "no confident match" is a real,
  correct outcome for a genuinely ambiguous ask, not a bug to eliminate here.
- [Agentic mode - the more ambitious half of the original Phase 6 vision - is not delivered
  by this change] -> Stated plainly, not glossed over; a real, separate, harder problem with
  its own future proposal once narrate mode is proven.
- [Proof stays in-repo, so this change alone does not satisfy `ROADMAP.md`'s own original
  `1.0.0` criterion ("demoable on one real consumer")] -> Stated plainly in spec.md and
  proposal.md rather than silently redefining what `1.0.0` means; reaching it is real,
  separate, later work.
