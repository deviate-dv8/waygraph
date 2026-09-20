## Why

`ROADMAP.md`'s Phase 6c names Waygraph Map, and `waygraph-blind-pilot`'s own design.md
(Roadmap item 3) explicitly left it as an open dependency rather than guessing at it:
"Blind Pilot as shipped writes plain `.block.ts` files directly; whether Waygraph Map should
be the actual target instead is a real design question for whenever this phase is picked up."

**This proposal was almost built on a wrong reading of that dependency**, caught only by
re-checking this project's own chat history directly rather than re-deriving it from memory
(the user's own standing instruction, given exactly to prevent this class of mistake). The
two real mentions of Waygraph Map in this whole project's history, verbatim:

1. *"...the waygraph blind pilot, which auto create from navigating the webiste. should
   utliize first on the waygraph map this is only availble on the scaffold thing. maybe
   waygraph@map package stuffs?"*
2. *"...ok i know this pattern is login, stuff then go writes some mem blocks. asks me is
   this a fucking local or published, does it support maildrop.cc? balh blah blah. get info.
   update the blocks using hte waygraph map."*

The corrected reading, confirmed directly with the user: **Waygraph Map is not a read-only
export generated from already-written Blocks.** It is Blind Pilot's own working substrate -
built up *first*, while exploring, as a structured record of what's been discovered
(recognized patterns, checkpoints, selectors, open questions like "is this mail catcher local
or published") - and real Block authoring happens *from* that record afterward, not before
it. Scoped explicitly to `templates/scaffold`'s own conventions ("only available on the
scaffold thing"), named as a distributable package (working name `waygraph@map` or
`waygraph/map`).

**What this proposal deliberately does NOT do, and why:** design a Block-execution engine
that runs directly off Map data instead of real `.block.ts` source. `AutoSession`/
`loadBlockLibrary` only know how to import real TypeScript Block files - a parallel
Map-native interpreter would be a large, speculative expansion of exactly the kind this
project's own history has repeatedly rejected once evidence corrected it (a discarded
HTTP mail-adapter, a discarded sandboxed-runtime Pilot design, a discarded one-ask-to-one-edge
resolver - each time the fix was reusing an already-proven mechanism, not building a new
parallel one). The smaller, justified interpretation this proposal takes instead: Waygraph
Map is a structured JSON file Blind Pilot reads and writes incrementally during exploration
(discovered checkpoints/selectors, recognized-pattern notes, open questions to ask the
human) - real Block authoring still means writing real `.block.ts`/`*Sel`/mem-keys files
afterward, informed by what's in the Map, not replaced by it. This keeps
`waygraph-blind-pilot`'s own already-shipped requirement ("this capability generates no Block
content") fully intact - Map manipulation is structured note-taking, not code generation.

**Honest, stated uncertainty, not resolved by assumption:** this is the chosen, minimal
reading of a genuinely underspecified user vision (the user's own words: "just yapping"),
not a fully certain one. Real open questions this proposal answers with a concrete, reasoned
default rather than leaving unaddressed: the exact JSON schema and file location (below), and
whether "`waygraph@map`" is a real separate npm package or a data format within this package
(this proposal treats it as the latter - a schema/helpers shipped from this package, scoped
to `templates/scaffold` - since nothing yet demonstrates a second, independent consumer that
would justify a standalone package).

`templates/scaffold` already has a hand-written precedent for exactly this shape of
information - `NAV.md` (nav-to / page hub / methods-effects / states-mem-keys tables, one per
namespace) and `SITE-MAP.md` (folder-to-URL table) - both prose, not data. Waygraph Map is
the machine-readable, incrementally-writable equivalent of `NAV.md`'s own table structure,
not a new kind of information.

## What Changes

- **New: a Waygraph Map JSON schema and its TypeScript types** (`WaygraphMap`,
  `WaygraphMapEntry`) - one entry per discovered Checkpoint, capturing what Blind Pilot has
  learned about it: how to reach it (nav mechanism/URL), recognized selectors, recognized
  method/effect patterns (each with a `status: "confirmed" | "needs-review"`), and free-form
  `openQuestions` (e.g. "is this mail catcher local or published?") - the structured
  equivalent of `NAV.md`'s own tables.
- **New: minimal load/save/update helpers** (`loadMap(path)`, `saveMap(path, map)`,
  `upsertMapEntry(map, entry)`) - pure data read/write, no Block-content generation. These
  are the entire new runtime surface; nothing here writes `.block.ts`/`*Sel`/mem-key files.
- **New: `waygraph map init [dir]`** - scaffolds an empty Map file at the conventional
  location inside a `templates/scaffold`-based project (below).
- **Not built:** any code that turns a Map entry into `.block.ts` source text. Authoring the
  actual Block, informed by the Map, remains the driving agent's own job - unchanged from
  `waygraph-blind-pilot`'s own shipped scope, not a boundary this proposal is allowed to
  quietly move.
- **Not built:** Waygraph Router (a separate, unrelated, opinionated folder convention).
- **Not built:** a standalone `waygraph@map` npm package - the schema/helpers ship from this
  package instead, since no second consumer yet justifies a separate one (see Roadmap in
  design.md for the honest reasoning).

## Capabilities

### New Capabilities
- `waygraph-map`: a structured, incrementally-writable JSON record of what a Blind Pilot
  session has discovered about a project, read/written via a minimal set of pure helpers -
  the substrate Blind Pilot works from before and while authoring real Blocks, not a report
  generated after the fact.

## Impact

- New module (e.g. `src/map.ts`): `WaygraphMap`/`WaygraphMapEntry` types, `loadMap`/
  `saveMap`/`upsertMapEntry`.
- `src/cli.ts`: new `map init [dir]` sub-command.
- `templates/scaffold/`: documents the conventional Map file location and its relationship
  to `NAV.md`/`SITE-MAP.md` (the Map supersedes neither - `NAV.md` stays the human-facing
  doc; the Map is Blind Pilot's own working file).
- Does not touch `waygraph-blind-pilot`'s own shipped code (`rawClick`/`rawType`/`rawGoto`/
  `reloadLibrary`, the CLI verbs) - this proposal adds a data substrate those primitives can
  be used alongside, not a modification to them.
- Does not touch Waygraph Router, or any real external-site proof - stays in-repo, matching
  every prior phase's own established precedent for the identical tension.
