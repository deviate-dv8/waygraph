---
name: waygraph-convention
description: Author or review waygraph Blocks/Flows under the consumer + Waygraph Map conventions - use when writing new Blocks, migrating folder layout, or answering "how should this project be organized," not when driving an already-built session (use waygraph-pilot / waygraph-blind-pilot for that).
---

Waygraph convention is how Blocks are *shaped and placed*, not how a live session is
driven. Print this skill, then write or rearrange files so `waygraph check` / `waygraph map`
stay clean. For operating an existing graph, use `--skill-pilot`. For cold-start authoring
against a live site, use `--skill-pilot-blind`.

## Hard rules (not style preferences)

1. **One distinct action per Block.** Fill and submit are two Blocks. A login form is
   `fill-username` (self-loop) + `fill-password` (self-loop) + `submit-login` (transition),
   never one Method that "fills and logs in." Same split for checkout fields. Canonical
   shape: `examples/saucedemo/src/blocks/saucedemo-web/methods/`.
2. **Navigation only inside Nav.** `page.goto` / NavBlock `click` live in
   `defineNavBlock` / `defineNavClickBlock` only. Method/Effect `act` uses ActionPage
   (no goto) even when the app changes URL as a side effect of a button click.
3. **Selectors in `*Sel`, never inline.** DOM strings live in a `*Sel` next to the page
   (static + `(id) => …`). Mem keys store values, not selectors. `waygraph check` warns on
   inline selector literals in `Trait.visible` / `Trait.text`.
4. **Assert-only = `defineAssertBlock`.** Self-loop, no hand-written `act`/`resolve`. Pass
   an explicit type argument when it sits between two specifically-typed Blocks in a Flow.
   Not just static content or an action's result - it also names a *feature state* worth a
   Checkpoint of its own (a submit button greyed out until required fields are filled, a
   field error under one input, a stale "Save" re-enabling). `Trait.disabled(selector)` /
   `Trait.enabled(selector)` cover that directly; write a custom Trait only for a state
   condition neither one expresses.
5. **`requires` = externally supplied.** A key an earlier Block in the same chain produces
   is never listed under `requires` - preflight checks the whole chain up front. For a
   genuinely arbitrary key (a username, an email) that a demo/dev run shouldn't need
   hand-supplied every time, `registerMemStub(key, fake)` + `withMemStub(flow)` (or
   `--mem-stub`) fills it from a registry instead - a key with no registration still fails
   preflight exactly as before, so this narrows what needs real input, never removes the guard.
6. **Keep Checkpoints typed — never `Checkpoint<string>`.** Block helpers take concrete
   Checkpoint types from `src/states/` (e.g. `defineMethodBlock<LoginPage, LoginPage>`).
   Wildcard `Checkpoint<string>` compiles but kills graph honesty; `waygraph check` / `waygraph typecheck` warn.
   Same for `defineAssertBlock({…})` without an explicit type arg — use
   `defineAssertBlock<YourCheckpoint>({…})`.
7. **One input/action per Method Block.** No block that `.fill()`s two fields or `.fill()` + `.click()` in one
   `act()` — split like saucedemo login (`fill-username`, `fill-password`, `submit-login`). Opt out per file:
   `// waygraph-ignore: multi-input` or `// waygraph-ignore-practices`.
8. **A transition never ships with an empty `verify`.** A framework can enforce that a check
   *exists*; it can't author the semantic content of one - only whoever knows what "success"
   means for this app can write it. That's the right line to draw, but it means an unfilled
   `verify: []` placeholder (codegen's honest way of not guessing) is indistinguishable from
   a Block that was never given real verification at all, and it passes `check`/`typecheck`/
   the orphan scan/`tsc` silently unless something is actually looking for it. Something is:
   `defineMethodBlock`/`defineEffectBlock` where `In`/`Out` genuinely differ (a transition,
   not a self-loop) needs a non-empty `verify`, same for `defineAssertBlock`. Opt out only
   when a *different* Block right after it in the `.flow.ts` is what actually confirms the
   transition (e.g. an `AssertXBlock`) - `// waygraph-ignore: empty-verify`.

## Block kinds (file convention)

| Kind | File | Helper | `page.goto`? |
|------|------|--------|--------------|
| Page | `*.page.block.ts` / `_page.block.ts` | `definePageBlock` | Optional deep-link |
| Nav | `nav-*.block.ts` / `_nav.block.ts` | `defineNavBlock` / `defineNavClickBlock` | Yes (`url` XOR `click`) |
| Effect | `*.effect.block.ts` in `methods/` / `_methods/` | `defineEffectBlock` | No |
| Method | `*.method.block.ts` in `methods/` / `_methods/` | `defineMethodBlock` | No |
| Assert | with Method/Effect peers | `defineAssertBlock` | No |

Effects that appear in `waygraph auto` menus need `instanceOptions` that scan the live DOM
(or mem) for labeled rows.

## Two layouts (same Block kinds)

**Freeform ("manual mode")** - still valid; real consumers depend on it:

```text
src/blocks/<site>/                 # THIS FOLDER IS URL "/"
  nav-login.block.ts
  methods/fill-username.method.block.ts
  inventory/                       # /inventory.html
    inventory.page.block.ts
    methods/add-to-cart.effect.block.ts
```

Folders mirror real app routes (Next.js `app/` page routes). Do **not** invent parallel
families like `root/`, `landing/`, or `shell/nav/` that are not real URLs. `/` lives at the
namespace root.

**Waygraph Map** - forced convention when `src/map/` exists:

```text
src/map/
  (app_base)/                      # organizational group only - never part of a Checkpoint tag
    dashboard/                     # must verbatim-match the real URL path (/dashboard)
      _page.block.ts
      _nav.block.ts
      _sel.ts
      _methods/click-widget.block.ts
  (external)/                      # cross-origin (mailpit, etc.) - same shape
    docs/
      _page.block.ts
      _nav.block.ts
      _sel.ts
```

- `(group)` parentheses and leading-underscore segments (`_methods/`, `_page…`) are
  **not** URL segments. `waygraph map` excludes them when checking folder-vs-URL.
- A bare non-underscore folder always means a real child Checkpoint/URL segment.
- Prefer `map()` over a hand-assembled `defineFlow([start, ...])` when wiring Map Blocks -
  it rejects Blocks that didn't come from a real factory (no silent teleporting).

Mail / external tools: under `*-external/<tool>/` or `map/(external)/<tool>/`, never under
the site's `*-web/` tree. Browser-driven (DOM / iframe Traits), not the catcher's REST API.

## Verify before you call it done

```bash
npx waygraph check .          # orphans + nav-escape + inline-selector + bad-practice warnings
npx waygraph typecheck .      # tsc --noEmit + bad-practice warnings (npm run typecheck)
npx waygraph check --no-practices .   # skip bad-practice scan only
npx waygraph map .            # exit 1 if src/map/ folder path != real static url
npx waygraph validate .       # every .flow.ts loads
npx waygraph graph .          # nodes/edges/skipped/orphans - counts should make sense
npm run typecheck             # when the consumer has it
```

`waygraph check` should report zero nav warnings. Orphan Blocks (not in any `.flow.ts`)
are still runnable in Pilot's live menu - orphan status only blocks
`auto --blocks <From> <To>` pathfinding.

**Static tools above only find gaps in Blocks that already exist.** A real link/button on
the live page with *no Block written for it at all* has nothing in source for `check`/
`graph` to scan - the only way to find that is to actually run the app. Every live
`auto`/`browser`/`pilot` session watches the real page and warns (once per element) on
anything with no matching Block:

```text
[waygraph] unmapped nav link on this page: /settings - no NavBlock covers this URL; add defineNavBlock
[waygraph] unmapped button on this page: #save-draft - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock
```

Read them back with `auto console <sessionId>` (same channel as real console/network
errors) - see `--skill-pilot`'s "Coverage gaps on the live page" section for the full
detection rules (same-origin `<a href>` only, visible clickables only, one warning per
element per session).

## Related skills (print via CLI)

```bash
npx waygraph --skill                 # list
npx waygraph --skill-pilot           # drive an existing Block graph
npx waygraph --skill-pilot-blind     # cold-start: raw ops + author Blocks as you go
npx waygraph --skill-convention      # this file
```

Worked freeform example: `examples/saucedemo/docs/CONVENTION.md`.
Map design history: `openspec/changes/waygraph-map/`.
Agent personas (author/planner/healer): `npx waygraph agent-dive --loop claude`.
