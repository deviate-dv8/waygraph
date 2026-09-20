# waygraph-map Specification

## Purpose
An opinionated, Next.js/Nuxt-style folder convention where a project's own directory
structure mechanically is its map - not a separate schema file a project generates,
maintains, or can let drift out of sync with its actual Blocks. Requires zero new engine
code: every existing command already discovers Blocks by walking the filesystem for
`.block.ts` files, independent of folder naming or depth.

## Requirements

### Requirement: The convention is folder-per-Checkpoint, with purely organizational groups
A project following this convention SHALL organize its Blocks as one folder per Checkpoint
under a top-level `(group)/` directory, where `(group)` is purely organizational (does not
affect the Checkpoint tag or any runtime behavior) and each Checkpoint's own folder contains
its arrival Block (`page.block.ts`), its navigation Block (`nav.block.ts`), and its actions
(`methods/*.block.ts`), mirroring today's freeform convention's own Block kinds under fixed,
predictable file names instead of developer-chosen ones.

#### Scenario: A Checkpoint's Blocks are locatable from its folder path alone
- **WHEN** a project follows this convention for a Checkpoint named `Dashboard` under group
  `(base_app)`
- **THEN** its arrival Block SHALL be at `(base_app)/dashboard/page.block.ts`, its navigation
  Block at `(base_app)/dashboard/nav.block.ts`, and its actions under
  `(base_app)/dashboard/methods/`

#### Scenario: A `(group)` folder never appears in any Checkpoint tag or resolved state
- **WHEN** Blocks under two different `(group)/` folders are discovered
- **THEN** neither group's own name SHALL appear in any Checkpoint tag - groups organize
  files on disk only

### Requirement: Existing tooling works against the convention with zero new code
`discoverGraph`, `loadBlockLibrary`, and every command built on them (`waygraph graph`,
`waygraph auto`, `waygraph check`, `waygraph pilot start`, `waygraph auto reach`, ...) SHALL
work correctly against a project following this convention without any modification, because
Block discovery already depends only on the `.block.ts` filename pattern, never on folder
structure.

#### Scenario: `waygraph graph` against a convention-following project needs no new code path
- **WHEN** `waygraph graph` runs against a project organized under this convention
- **THEN** it SHALL produce a correct graph (every Checkpoint/edge discovered) using the
  exact same `discoverGraph` code path used for a freeform-organized project - no
  convention-specific branch

### Requirement: Loading a second project's Blocks needs no separate manifest step
A project (the "waypack" consumer) that takes a convention-following project's Blocks as a
plain dependency (e.g. a `file:` reference, matching `examples/saucedemo`'s own existing
`"waygraph": "file:../.."` precedent) SHALL be immediately understandable by `waygraph graph`
run directly against the loaded package's own path - no separate manifest, index, or schema
file needs to exist or be generated for this to work.

#### Scenario: A second project understands a loaded convention-following project immediately
- **WHEN** a project depends on a convention-following project's Block folder as a plain
  file dependency, with no additional manifest of any kind
- **THEN** `waygraph graph` run against the loaded package's own path (e.g.
  `node_modules/<loaded-package>`) SHALL correctly discover the loaded project's full
  Checkpoint/edge structure

#### Scenario: A live session also works against a deeply nested loaded path
- **WHEN** the loaded package's path is deep enough (e.g. through a consumer project's own
  `node_modules/<pkg>` path) that its absolute length would exceed the OS's AF_UNIX socket
  path limit (~108 bytes on Linux) were the session socket to live under it
- **THEN** a `--detach` session (`auto --cli --detach`, and therefore `pilot start`, which
  also spawns one) SHALL still start and be driveable normally - session sockets live in a
  short, fixed location (`os.tmpdir()/waygraph-auto/`) independent of the project's own
  nesting depth, a real fix found and applied while proving this requirement, not a
  limitation left standing

### Requirement: No schema file, load/save helper, or `map init` command is introduced
This capability SHALL NOT introduce a JSON (or other) manifest format, any function that
loads/saves such a manifest, or a `waygraph map init`-style CLI command. An earlier draft of
this proposal took exactly this shape and was superseded before implementation - this
requirement exists specifically to prevent it from being silently reintroduced.

#### Scenario: No exported function reads or writes a Map manifest file
- **WHEN** this capability's public surface (any new exports from this change) is inspected
- **THEN** none of it SHALL read or write a separate manifest file describing a project's
  Checkpoint/edge structure

### Requirement: Proof is scoped to an in-repo example, and Blind Pilot's own authoring is unchanged
This capability's own proof SHALL demonstrate the convention working end to end (a real
demonstrative scaffold, plus a second project loading it as a plain dependency) against
in-repo examples, not a real external consumer. It SHALL NOT claim that `waygraph-blind-pilot`
itself now authors into this convention - that remains separate, later, unscoped work, and
Blind Pilot continues writing plain files exactly as already shipped.

#### Scenario: Status reporting does not overstate what changed
- **WHEN** this capability is reported as implemented
- **THEN** the report SHALL state plainly that Blind Pilot's own authoring behavior is
  unchanged, and that this capability proves the convention works, not that anything
  currently generates Blocks following it automatically
