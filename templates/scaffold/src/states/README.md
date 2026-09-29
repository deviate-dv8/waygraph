# `src/states/`

Checkpoint types and Mem keys - the typed vocabulary every Block in `src/map/` is written
against. Nothing here drives the browser; this is pure data shape.

- `*.states.ts` - `type X = Checkpoint<"X">` declarations. One per real app state
  (`LoginPage`, `LoggedIn`), never `Checkpoint<string>` (a wildcard - `waygraph check` warns
  on it; a Block should say exactly which states it moves between).
- `*.mem-keys.ts` - `key<T>("...")` / `keyGroup<T>("...")` declarations. A Mem key stores a
  *value* a Block needs (credentials, a selected row's id) - never a selector (those live in
  `_sel.ts` next to the page) and never something a Block could instead read straight off the
  live page.

Add a new Checkpoint or Mem key here before writing the Block that needs it - Blocks import
from this directory, this directory never imports from `src/map/`.
