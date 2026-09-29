# `src/map/`

The Waygraph Map: one folder per page, mirroring your app's real URLs. See the root
[`STRUCTURE.md`](../../STRUCTURE.md) for the full picture; this file is the local, one-screen
version for whoever is inside this directory.

## The fixed names, every page folder

| File | Kind | Job |
|---|---|---|
| `_nav.block.ts` | Nav | How to get here - `url` (goto) or `click` (in-app link). One per page. |
| `_page.block.ts` | Page | "You have arrived" - the hub other pages navigate to. One per page. |
| `_sel.ts` | data | Every selector this page's Blocks use, in one object. Never inline a selector when this file exists - `waygraph check` warns on it. |
| `_methods/` | folder | One file per action, one action per file (`add-item.effect.block.ts`, not one file with three `.fill()` calls). |

Never rename these, never combine them into one file, never add a `_selectors/` folder in
place of `_sel.ts` - one page, one selector file, same as every other page in the Map.

## `(group)` folders

A parenthesized folder (`(app_base)`, `(external)`) is organizational only - like a Next.js
route group. It groups pages by origin/base URL and never appears in a Checkpoint name or a
real URL. `waygraph map`/`waygraph check` fail loudly if a page folder's real URL stops
matching its own name - that's the point of this layout: drift becomes a build failure, not a
silent surprise months later.

## Adding a page

Copy an existing page folder, keep the four fixed names, update `_nav`/`_page`/`_sel` for the
new page, then add `_methods/` files for its actions. Don't invent a new folder shape - every
page in this Map looks the same on purpose.
