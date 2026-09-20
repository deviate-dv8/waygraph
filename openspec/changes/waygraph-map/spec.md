# waygraph-map Specification

## Purpose
A structured, incrementally-writable JSON record of what a Blind Pilot session has
discovered about a project - the substrate Blind Pilot works from *before and while*
authoring real Blocks, not a report generated from Blocks that already exist. Provides only
data read/write helpers; generates no `.block.ts`/`*Sel`/mem-key source text itself.

## Requirements

### Requirement: The Map schema records what has been discovered, per Checkpoint
A `WaygraphMap` SHALL be a collection of `WaygraphMapEntry` records, one per discovered
Checkpoint, each capturing: how to reach it (a nav mechanism/URL, when known), selectors
recognized on it, recognized method/effect patterns (each carrying a
`status: "confirmed" | "needs-review"`), and a free-form list of open questions the agent
could not resolve from the DOM alone.

#### Scenario: An entry can exist before a Checkpoint is fully understood
- **WHEN** an agent has only recognized a page's URL/nav mechanism but nothing else about it
  yet
- **THEN** a `WaygraphMapEntry` for it SHALL be a valid, saveable record with its other
  fields empty or absent - the schema does not require full information before an entry can
  exist

#### Scenario: An open question survives a save/load round trip
- **WHEN** an entry's `openQuestions` list is set (e.g. "is this mail catcher local or
  published?") and the Map is saved then reloaded
- **THEN** that same open question SHALL still be present, unchanged, on reload

### Requirement: Load/save/update helpers are pure data operations
`loadMap`, `saveMap`, and `upsertMapEntry` SHALL only read, write, or merge `WaygraphMap`
data. None of them SHALL generate, write, or otherwise produce `.block.ts`, `*Sel`, or
mem-key source text, and none SHALL depend on a live browser session, Playwright, or any
`AutoSession` state.

#### Scenario: upsertMapEntry merges without a live session
- **WHEN** `upsertMapEntry` is called with a `WaygraphMap` and a new/updated entry, with no
  browser or session involved at all
- **THEN** it SHALL return an updated `WaygraphMap` reflecting the merge, purely as a data
  transformation

#### Scenario: No exported function returns Block source text
- **WHEN** this capability's public surface is inspected
- **THEN** none of it SHALL take a `WaygraphMapEntry` and return `.block.ts`/`*Sel`/mem-key
  source text, or write such a file itself - matching `waygraph-blind-pilot`'s own
  unmodified "generates no Block content" requirement

### Requirement: `waygraph map init` scaffolds an empty Map at the conventional location
Running `waygraph map init [dir]` against a `templates/scaffold`-based project SHALL create
an empty, valid `WaygraphMap` file at the conventional location if one does not already
exist, and SHALL fail loud (not silently overwrite) if one already does.

#### Scenario: init on a fresh project creates a valid empty Map
- **WHEN** `waygraph map init` runs against a project with no existing Map file
- **THEN** a new file SHALL exist afterward, loadable via `loadMap` as a valid, empty
  `WaygraphMap`

#### Scenario: init refuses to overwrite an existing Map
- **WHEN** `waygraph map init` runs against a project that already has a Map file
- **THEN** it SHALL exit with a clear error and SHALL NOT modify the existing file

### Requirement: The Map is additive documentation, not a replacement for NAV.md/SITE-MAP.md
Introducing a Map file SHALL NOT require removing or restructuring `templates/scaffold`'s
existing `NAV.md`/`SITE-MAP.md` prose docs. The Map is a separate, machine-readable working
file Blind Pilot itself reads and writes; the existing prose docs remain the human-facing
reference they already are.

#### Scenario: A project can have both a Map file and its existing NAV.md unchanged
- **WHEN** a Map file is introduced into a `templates/scaffold`-based project
- **THEN** the project's existing `NAV.md`/`SITE-MAP.md` files SHALL remain valid and
  unmodified by this capability

### Requirement: Proof is scoped to an in-repo example, and the underlying vision is stated as underspecified
This capability's own proof SHALL demonstrate the schema/helpers and `map init` working
end to end against `templates/scaffold`, not a real external consumer. Status reporting
SHALL state plainly that the exact schema and the choice not to build a standalone
`waygraph@map` package are a chosen, minimal reading of a genuinely underspecified user
vision - not a fully certain one - and that wiring Blind Pilot itself to read from/write to
a Map (rather than only having the schema exist) remains separate, later, unscoped work.

#### Scenario: Status reporting states the interpretation is a choice, not a certainty
- **WHEN** this capability is reported as implemented
- **THEN** the report SHALL name the schema/location decisions as a chosen interpretation of
  an underspecified vision, and SHALL state that Blind Pilot's own code does not yet read
  from or write to a Map as part of its own exploration loop
