---
name: waygraph-blind-pilot
description: Cold-start a waygraph project against a real site with zero existing Blocks - navigate with raw primitives, recognize real patterns, and author real Nav/Page/Method Blocks as you go. Use when the target app has no (or very little) waygraph coverage yet, not for driving an already-Block-covered app.
---

Blind Pilot is the same session mechanism as `waygraph-pilot`, minus the requirement of any
pre-existing Blocks. A project with zero `.block.ts` files still gets a live session —
`browser click/type/goto/press/upload` act on the real page before any Block exists to cover it.
This package generates **no Block content for you** - you write real `.block.ts`/`*Sel`/
mem-key files by hand as you go. That's the whole point: turn one-off exploration into
permanent, reusable, typed coverage instead of leaving nothing behind.

## Session lifecycle (list first)

```
waygraph browser                         # list live sessions (cwd)
waygraph browser start [--goto <url>]    # new headful session (about:blank by default)
waygraph browser attach <sessionId>      # terminal picker on existing session
waygraph browser stop <sessionId|--all>  # shut down when done
```

`browser start` always opens a **new** session. Check `browser sessions` before starting another.
Session control works as `browser …` or `auto …` with the same `<sessionId>`.

## The real loop

1. `browser goto <sessionId> <url>` / `browser click` / `browser type` to explore the real page.
2. `browser dom <sessionId> --mode full --selector <sel>` to read real structure before writing
   a selector - never guess a selector, confirm it against the real DOM first. `--mode aria`
   is faster for a first pass but can show stale/hidden responsive-duplicate content in some
   real apps (confirmed live: a hidden `lg:hidden` panel's heading text showed up in an aria
   snapshot even when scoped to `main`) - fall back to `--mode full` and check actual CSS
   classes/structure if aria output looks inconsistent with what a screenshot shows.
3. Once you recognize a real pattern (a login form, a list-item-with-action row, a modal),
   write the real Blocks for it - `*Sel` object first (grounded in the DOM you just read),
   then `Nav`/`Page`/`Method` Blocks, following `templates/scaffold`'s own folder convention
   (`(group)/<page-slug>/page.block.ts` + `nav.block.ts` + `methods/*.block.ts` + one `*.sel.ts`)
   so the result becomes part of the Waygraph Map, not a scattered one-off file.
4. `browser reload <sessionId>` to pick up the newly-written Block(s) without restarting.
5. Optionally narrate for a headful watcher: `browser highlight <sessionId> '{"rings":[...],"todos":[...]}'`
   Raw ops show **`Running (no Block): …`** in the bottom-left toast; Block runs show **`Running (Block): …`**.
6. Run the new Block for real via `browser send` - prove it works before moving to the next
   pattern, exactly like any other real Block.
7. Ask the user a clarifying question only when something genuinely can't be resolved from
   the DOM alone (is this instance local or published? does a downstream integration exist?)
   - don't ask about things `browser dom` can just answer.

## Real gotchas specific to cold-start authoring

- **`discoverGraph`'s per-file import errors are mostly silent.** A malformed newly-written
  Block file can simply vanish from the graph with no error printed anywhere obvious - if a
  Block you just wrote doesn't show up after `browser reload`, check `waygraph graph`'s own
  `skipped` list and the file's syntax directly, don't assume it just needs more time.
- **`defineAssertBlock` needs no `<In, Out>` generic to type-check** (`checkpoint: "X"` alone
  is enough for TypeScript to infer it) - but older/naive static-graph discovery logic may
  rely on parsing an explicit generic from source text. If a freshly-written
  `defineAssertBlock` Block is missing from `waygraph graph`'s edges (silently, no error),
  check whether this package's own `graph.ts` has the matching-marker fix for it, or add an
  explicit generic type argument as a workaround.
- **A `<p>`/text-based selector often needs scoping**, not just a class name - a sibling
  "chat list item" and "message preview" frequently share the exact same CSS classes in real
  apps, distinguished only by DOM position (first vs second child of a specific wrapper).
  Confirm via `browser dom --mode full` before assuming a class alone is unique enough.
- **Confirm a selector count, not just its first match**, when building anything the menu
  will expand into multiple live rows (an `instanceOptions`-driven Block) - `browser dom`'s
  default read can silently show only one match even when several exist; check the real
  page count (e.g. via a scoped debug script) before assuming a plain `.first()` is safe
  long-term. A `.first()`-shaped Block is a legitimate STARTING point for a page that only
  ever has one real row to act on - promote it to a mem-driven `defineMemNavBlock` /
  `defineEffectBlock` (see the `waygraph-pilot` skill and
  `examples/saucedemo/.../nav-item-detail.block.ts` for the real pattern) once a second real
  row genuinely exists to pick between, not before.
- **Prefer the real Pilot overlay over ad hoc status output** when driving a headful session
  someone might be watching - badge/panel on `about:blank` and after every navigation; raw
  ops toast **`Running (no Block): …`**. Point a human at the badge instead of re-inventing
  status reporting.
