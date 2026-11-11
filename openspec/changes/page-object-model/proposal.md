## Why

waygraph's model is right (pages are states, Blocks are moves, flows are scenarios) but a developer or agent learns too many
*kinds* for one idea. To describe one page you touch Nav, Page, Method, Expect and Read Blocks, plus `_sel.ts`,
`_reads.ts`, mem keys and stubs. Three vocabularies overlap: a check can be a `Trait`, a `Key.is` or an Expect Block; what a
page shows can be a Read Block or a Trait on a selector. The folder structure already mirrors the app's addresses
(Next/Nuxt), yet each page still declares its Nav. Structure is carried by file names TypeScript can't check. Pages whose
state is in the URL (`?tab=`, `[id]`) need hand-written address functions. Sudden overlays (a cookie banner, "session
expired") have no home. Goal: closer to the page object model, fewer kinds, everything a typed value, nothing declared twice.

## What Changes (staged: each stage ships on its own, with a codemod, and leaves a project working)

- **Stage 1: the page object.** `definePage({ checkpoint, nav, read, expects, do })`: `read: (ctx) => ({...})` returns what the
  page shows (types inferred); `expects: (page) => ({...})` are named checks over its fields and Traits;
  `do: (page) => ({...})` are its moves. The page is passed in, so no `() => Block` per entry and no import cycle. Read Blocks,
  `_reads.ts`, Expect Blocks and `_expect/` go; `Key.is`/`.passes` stay as the way a field becomes a Trait; one check concept
  (Trait), two places (`verify`, `expect`). The key carries its stub (`key("credentials", { stub })`): `*.mem-stubs.ts` goes.
- **Stage 2: nav from the folder, typed params.** The address comes from where the page lives (`[id]`, Next/Nuxt style), so the
  Nav Block goes; `Page.go({ id, tab })` builds it. `params` (path) and `query` (state in the URL) are typed; a query is a
  state field of the page (read, checked, set by a `setQuery` move), not another Checkpoint. Arrival is verified from path
  and any query given.
- **Stage 3: interrupts.** `defineLayout({ interrupts: { cookieBanner: { when: Sel.banner, do: dismiss } } })`: when the element
  shows up, the handler runs and the step retries (Playwright's `addLocatorHandler`). Each firing is in the run log and shown in
  the demo, so a surprise isn't a silent retry.
- **Stage 4: Methods without `instruction`.** `defineMethod({ name, from, to, act, verify, precondition, lands? })`: the wrapper
  goes; `observe` + `resolve` become one optional `lands`.
- **Also (own changes, listed for fit):** `block-capabilities` (`play`, `shows`), `qa-network-and-api-view`, `api-requests-and-races`.

## Capabilities
### New Capabilities
- `page-object`: the page object, generated nav and typed params, interrupts, Methods without `instruction`.
### Modified Capabilities
<!-- Read Blocks, Expect Blocks and Nav Blocks as kinds are removed -->

## Impact
- **Engine:** `engine/block/kinds/` (page, method; nav, expect and read removed), `engine/read/`, mem keys; scan, manifest, graph, Studio (pages with state, moves, checks; "Reads" by page), the convention skill and every guide; four codemods (`reads`, `nav`, `instructions`, `stubs`).
- **Parity:** one page and panes alike; everything typed values, no new name conventions.
- **Docs:** the lifecycle guide stays the reference for when each part runs.
