## Why

`ROADMAP.md`'s Phase 6c names Waygraph Map. This proposal has already been corrected once
(see `tasks.md`'s own Status section for the full record): a first draft designed Map as a
separate `waygraph.map.json` file Blind Pilot would read and write as its own working notes.
That was superseded by re-reading the user's own words more carefully, and this session's
resulting reply below reconciles a real tension between two of the user's messages that
looked contradictory at first:

- Earlier in this project's history, "Waygraph Router" was described with literal Next.js
  App-Router syntax: *"an opinionated folder structure in waygraph just like nextjs. like
  there is (base_app), (external) something. and (baseapp)/dashboard/, it has /dashboard/
  page.ts thing."*
- Later: *"waygraph router is the current setup we have today. waygraph map is like the
  folder opinon similar to what nextjs,nuxtjs. with their endpoitns. this makes it easier to
  create the waypack package im hoping for... the fodlers are literally the page endpoint."*

Read together, not as a contradiction: the *name* attached to "the opinionated Next.js-style
folder convention" moved from "Router" to "Map" between messages - this proposal treats the
second, later message as authoritative. **Waygraph Map is an opinionated, mechanically
-parseable folder convention** (`(group)/<page>/page.block.ts`, `nav.block.ts`,
`methods/*.block.ts`, one Checkpoint per folder) - not a separate schema file a project
maintains alongside its Blocks. "Waygraph Router" isn't a separate thing to build; it's the
user's own name for the role today's freeform, folder-organized "manual mode" already fills.
"waypack" is the actual goal this unblocks: a distributable package of a project's Blocks
that another agent can load and immediately understand, because the folder structure it
loads *is* the map - "agents can run an empty waygraph, load a waygraph package, and they
can understand more and navigate the website."

**Verified before writing this design, not assumed:** `discoverGraph`/`loadBlockLibrary`
(`src/graph.ts`'s `walkDir`) already recurse through any directory structure, matching files
purely by the `.block.ts` filename pattern - folder depth and naming are already 100%
cosmetic to every existing command (`auto`, `graph`, `check`, `pilot start`, `auto reach`,
...). A Block's identity comes entirely from its own exported properties (`name`,
`__waygraphKind`, `instruction`), never from its file path except for diagnostics. **This
means the opinionated folder convention needs zero new engine code to work** - it is purely
an authoring/naming convention layered on top of machinery that already works, the same kind
of "verify what already exists before building" finding that shaped every prior phase this
session (`AutoSession` tolerating zero Blocks, `auto --blocks`'s own pathfinding, etc.).

## What Changes

- **New: the Waygraph Map folder convention, documented** - `src/routes/(group)/<page-slug>/
  page.block.ts` (arrival/hub, the folder-convention equivalent of today's `*.page.block.ts`),
  `nav.block.ts` (today's `nav-*.block.ts`), `methods/<action>.block.ts` (today's
  `methods/*.method.block.ts`), `<page-slug>.sel.ts` (today's `*-sel.ts`). `(group)` is purely
  organizational (parens, Next.js route-group style - does not affect the Checkpoint tag),
  matching the user's own `(base_app)`/`(external)` example. Recommends, but does not enforce
  by new validation code, that a folder's Checkpoint tag matches its own page-slug.
- **New: one demonstrative scaffold** showing the convention end to end, proving
  `discoverGraph`/`waygraph graph`/`waygraph auto`/`waygraph pilot start`/`auto reach` all
  already work against it unmodified - no new parsing/discovery code, because none is needed
  (verified above).
- **New: a real "waypack" proof** - a second project loads the first (as a plain `file:`
  dependency/directory copy, the same mechanism `examples/saucedemo`'s own `"waygraph":
  "file:../.."` already uses), and `waygraph graph`/`pilot start` against it immediately
  understands the loaded project's full structure - no separate manifest step, no schema
  file, because the folder structure it just loaded already *is* the map.
- **Not built:** any new JSON schema, load/save helper module, or `map init` CLI command -
  the entire premise of this proposal's own first (superseded) draft. Removed, not layered
  alongside the new approach.
- **Not built:** wiring Blind Pilot to *author into* this convention automatically. Blind
  Pilot still writes plain files itself (unchanged, per `waygraph-blind-pilot`'s own shipped
  scope) - which convention it follows when doing so is real, separate, later work.
- **Not built:** any new validation/lint rule enforcing folder-name-matches-Checkpoint-tag.
  A real, valuable follow-up, not required for this proposal's own claim (the convention
  works and is mechanically walkable today) to be true.

## Capabilities

### New Capabilities
- `waygraph-map`: an opinionated, documented, Next.js/Nuxt-style folder convention where a
  project's own directory structure mechanically is its map - no separate artifact to
  generate, maintain, or let drift out of sync - proven to work against every existing
  command with zero new engine code, and proven to make loading a second project's Block
  library ("waypack") immediately understandable with the same existing tooling.

## Impact

- One new documented convention (in `README.md`, cross-referenced from `ROADMAP.md`'s Phase
  6c section) - no new `src/` module.
- One new demonstrative example/scaffold directory proving the convention against real,
  already-shipped tooling.
- Does not touch `waygraph-pilot`'s or `waygraph-blind-pilot`'s own shipped code.
- Supersedes this proposal's own first draft entirely (the `waygraph.map.json` schema/
  helpers/`map init` command) - that draft is not implemented alongside this one; it is
  replaced by it. Full record of why in `tasks.md`'s Status section and the archived first
  draft's own git history (this proposal was corrected before any of its own code was
  written, so there is no removal commit the way `waygraph-pilot`'s v1 needed one).
