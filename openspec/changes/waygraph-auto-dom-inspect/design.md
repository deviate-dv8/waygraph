## Context

Phase 1 (`waygraph-auto-cli-session-control`) shipped `AutoSession` (`src/auto-session.ts`)
and a request/response socket server (`src/auto-session-ipc.ts`) with `status`/`send` ops.
This change adds a third, read-only op (`dom`) to that same session/protocol - no new
transport, no new session lifecycle.

The original ask for this proposal assumed `page.accessibility.snapshot()` as the fidelity
mechanism. Checked against this package's actual Playwright version (`^1.63.0`,
`node_modules/playwright-core/types/types.d.ts`) before writing this spec: that API is gone.
It has been replaced by `page.ariaSnapshotJSON(options)` / `locator.ariaSnapshotJSON(options)`
- with a `mode: "ai"` option that is *already* purpose-built for LLM consumption (element refs
like `[ref=e2]`, iframe snapshots included) and a built-in `depth` option. This is a better
foundation than the originally-assumed API, not a downgrade - the corrected design leans on it
directly rather than reimplementing depth-limiting by hand.

## Roadmap (why this slice, not the whole vision)

1. **This change** - the `dom` op: `aria` (default), `full`, `container` fidelity.
2. **Not in this change** - simultaneous `--cli` + headful ("waygraph codegen") and a
   structured trace for turning a driven session into authored Blocks (Phase 3).
3. **Not in this change** - agent-skill hardening: `defineAssertBlock`, `*Sel` enforcement,
   orphan-Block self-gate (Phase 4).
4. **Not in this change** - the `maildrop.cc` external-mail adapter (Phase 5).
5. **Not in this change** - Waygraph Copilot itself (Phase 6).

## Goals / Non-Goals

**Goals:**
- An agent can read the live page's structure through the same session/RPC surface it
  already uses for `status`/`send`, at a fidelity it chooses.
- The default mode (`aria`) is small enough to be genuinely useful to hand an LLM without
  extra caller-side filtering.
- The `full` mode can never return unbounded output, no matter how large the real page is.
- Zero behavior change to Phase 1's `status`/`send`/`attach` or to headful mode.

**Non-Goals (this change):**
- Anything from Phases 3-6 above.
- A generalized "select the best fidelity automatically" heuristic - the caller (agent)
  picks the mode; this change does not try to guess intent.
- Live/streaming DOM updates - `dom` is a one-shot read at request time, matching `status`'s
  own pure-getter shape.

## Decisions

**`aria` mode is a thin wrapper over `ariaSnapshotJSON({ mode: "ai", depth })`, not a
custom accessibility-tree serializer.** Playwright's own "ai" mode already produces
reference-annotated, reasonably-bounded output tuned for exactly this use case; reimplementing
that would duplicate Playwright's own maintenance burden for no benefit. `depth` (when given)
passes straight through to Playwright rather than being re-applied by this code.

**`full` mode is a genuinely new, hand-written `page.evaluate()` walker, because no
Playwright API serializes the full DOM as bounded JSON.** `ariaSnapshotJSON` only ever
reflects the *accessibility* tree (ignores non-semantic wrapper `div`s, doesn't expose
arbitrary attributes) - `full` mode exists specifically for a case `aria` can't answer, e.g.
"what CSS classes/data-attributes are actually on this element." Caps (see Risks) are
enforced inside the `page.evaluate()` callback itself, not after the fact, so an
unexpectedly huge DOM never gets fully serialized across the CDP boundary in the first place.

**`container` mode reuses the same two code paths, only changing the root.** For `aria`, the
root becomes `page.locator(selector).ariaSnapshotJSON(...)` instead of `page.ariaSnapshotJSON`
(Playwright already supports both). For `full`, the same walker function takes an optional
root selector and evaluates `document.querySelector(selector)` as its starting node instead
of `document.documentElement`. No separate "container walker" implementation.

**Caps for `full` mode (defaults, all overridable via CLI flags for a first cut only where
noted):** max depth 12, max nodes 800, max text length per node 300 chars. These are
deliberately conservative defaults for an LLM reader, not a human one; a caller that needs
more can raise `--depth`/rely on `container` mode to narrow scope instead of raising node caps
globally (node/text caps are not exposed as flags in this first cut - see Risks).

## Risks / Trade-offs

- [Fixed default caps for `full` mode may be too small for some real pages, or too large for
  a very tight token budget] -> `--depth` is caller-tunable; node-count and text-length caps
  are fixed constants for this first cut rather than additional flags, to keep the CLI surface
  small - revisit only if a real case needs them exposed, matching this codebase's established
  "recipe before promotion" pattern (see `flow-run-tab-options`'s popup-capture decision).
- [`ariaSnapshotJSON`'s `mode: "ai"` output format is Playwright-version-specific and could
  change shape in a future Playwright release] -> Accepted; this package already pins a peer
  range (`^1.40.0`) and documents that dependency versions can sit ahead of a consumer's
  expectations - not a new risk class this change introduces.
- [A `container` selector matching multiple elements is ambiguous] -> Resolved by taking the
  first match (`.first()`), the same convention `Trait.visible` already uses elsewhere in this
  codebase for "something matching," not "the selector is unambiguous."
- [Scope creep toward Phase 3's structured trace, which will also want to capture DOM
  evidence per stop] -> Mitigated by this design doc's explicit Non-Goals; Phase 3 reuses this
  `dom` op when it lands, rather than this change trying to anticipate its shape.
