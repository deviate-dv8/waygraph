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
waygraph browser                         # show browser subcommands
waygraph browser sessions                # list live sessions (cwd)
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
   write the real files for that page - see "What one page needs" below. Selectors first
   (grounded in the DOM you just read), then the Blocks, in the project's layout so the
   result becomes part of its map, not a scattered one-off file.
4. `browser reload <sessionId>` to pick up the newly-written Block(s) without restarting.
5. Optionally narrate for a headful watcher: `browser highlight <sessionId> '{"rings":[...],"todos":[...]}'`
   Raw ops show **`Running (no Block): …`** in the bottom-left toast; Block runs show **`Running (Block): …`**.
6. Run the new Block for real via `browser send` - prove it works before moving to the next
   pattern, exactly like any other real Block.
7. Ask the user a clarifying question only when something genuinely can't be resolved from
   the DOM alone (is this instance local or published? does a downstream integration exist?)
   - don't ask about things `browser dom` can just answer.

## What one page needs

In the Map layout (`src/map/(app)/<url segments>/`, the folder path = the page's URL; `waygraph map` checks it):

| File | Holds |
|------|-------|
| `_sel.ts` | `export const LoginSel = { username: "#user-name", submit: "[data-test=login]" } as const` - every selector the page's Blocks use |
| `_nav.block.ts` | `defineNavBlock({ name: "nav-login", checkpoint: LoginPage, url: "/login", verify: [Trait.visible(LoginSel.submit)] })` |
| `_page.block.ts` | `definePageBlock({ name: "page-login", checkpoint: LoginPage, verify: [...], methods: { fillUsername: () => FillUsernameBlock } })` - only when the page has methods to group |
| `_methods/<action>.method.block.ts` | one action each: `defineMethodBlock({ name, from, to, requires, instruction: { act, verify } })` |
| `_read.block.ts` + `_reads.ts` | what the page shows: `reads("login")<{ error: string }>()` and `defineReadBlock({ name, from: [LoginPage], instruction: { read: (ctx) => LoginRead({ error: ctx.page.text(LoginSel.error) }) } })` |

Shared across pages, in `src/states/`:

- `<area>.states.ts`: the Checkpoints, as values - `export const LoginPage = checkpoint("LoginPage"); export type LoginPage = typeof LoginPage;`
- `<area>.mem-keys.ts`: `export const AppKeys = keys("app")<{ credentials: { username: string; password: string } }>();`
- `<area>.mem-stubs.ts`: `registerMemStub(AppKeys.credentials, () => ({ username: "...", password: "..." }))` - the
  session uses it for any key `--data` didn't give, so a Block with `requires` runs. Say whose account it is, and
  remember a session run without `--data` signs in as it.

A freeform project (`src/blocks/<site>/<page>/`, `nav-*.block.ts`, `methods/`, `<page>.sel.ts`,
`<page>.read.block.ts`) keeps its layout; don't switch layouts partway. Full rules and complete files:
`--skill-convention`.

## Prove each Block before the next

```
waygraph browser reload <id>                 # loads the new files
waygraph browser send <id> nav-login         # runs it: the reply's here, read and lastRunNote say what happened
waygraph browser read <id>                   # the page's Read Block, if you wrote one
npx waygraph check . && npx waygraph map .   # no warnings, folders match URLs
```

A Block that lands on the wrong Checkpoint or fails its `verify` is wrong now, not later - fix it before writing the
next one. When a page is done, a flow that walks it (`src/flows/<page>/success.flow.ts`) turns it into a test.

## Real gotchas specific to cold-start authoring

- **A file that fails to import drops out of the graph.** If a Block you just wrote doesn't
  show up after `browser reload`, run `npx waygraph graph .` or `check .`: each prints
  `skip <file>: <error>` for a file it couldn't load (a typo, a bad import path, a Trait
  called wrong). Fix that before anything else.
- **Pass Checkpoint values** (`checkpoint: X`, `from: X, to: Y`) so a freshly-written Block shows up in the graph from its
  runtime route. The graph reads routes at runtime, never from source text.
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
  `defineEffectBlock` (see `--skill-convention`, and
  `node_modules/waygraph/examples/saucedemo/src/blocks/saucedemo-web/inventory/` for the real pattern) once a second
  real row genuinely exists to pick between, not before.
- **Prefer the real Pilot overlay over ad hoc status output** when driving a headful session
  someone might be watching - badge/panel on `about:blank` and after every navigation; raw
  ops toast **`Running (no Block): …`**. Point a human at the badge instead of re-inventing
  status reporting.
