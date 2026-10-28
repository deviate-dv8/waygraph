# `src/states/`

Checkpoint types and Mem keys - the typed vocabulary every Block in `src/map/` is written
against. Nothing here drives the browser; this is pure data shape.

- `*.states.ts` - Checkpoint values: `export const X = checkpoint("X"); export type X = typeof X;`. One per real app state
  (`LoginPage`, `LoggedIn`), never `Checkpoint<string>` (a wildcard - `waygraph check` warns
  on it; a Block should say exactly which states it moves between).
- `*.mem-keys.ts` - `keys("demo")<{ selectedItem: { id: string; name: string } }>()`: one namespace, its fields the keys. A Mem key stores a
  *value* a Block needs (credentials, a selected row's id) - never a selector (those live in
  `_sel.ts` next to the page) and never something a Block could instead read straight off the
  live page.

Add a new Checkpoint or Mem key here before writing the Block that needs it - Blocks import
from this directory, this directory never imports from `src/map/`.

A tool on another origin (`src/map/(external)/mailpit/`, `.../hoppscotch/`) keeps its own Checkpoints and keys in its
folder (`_states.ts`, `_keys.ts`) instead, so the folder can be packed and reused: `waygraph map pack mailpit`.
