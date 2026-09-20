## Context

`waygraph-blind-pilot`'s own design.md deliberately left this open rather than guessing:
"whether Waygraph Map should be the actual [Block-authoring] target instead [of plain files]
is a real design question for whenever this phase is picked up." Re-checking this project's
own chat history directly (not re-deriving from memory) surfaced the only two real mentions
of Waygraph Map, both cited in proposal.md's Why section - correcting an initial wrong
reading (read-only export) toward the right one (Blind Pilot's own working substrate, built
up first, that Block authoring happens *from*).

`templates/scaffold` already has a real, working precedent for the shape of information a
Map needs to hold: `NAV.md` (a hand-written, per-namespace table of Nav-to / Page hub /
Methods-Effects / States-mem-keys) and `SITE-MAP.md` (a folder-to-URL table). Both are prose,
written once by a developer, never updated programmatically. Waygraph Map is the
machine-readable, incrementally-writable equivalent - not a new kind of information, a new
representation of the same kind `NAV.md` already captures by hand.

## Roadmap (why this slice, not the whole vision)

1. **This change** - the `WaygraphMap`/`WaygraphMapEntry` schema, `loadMap`/`saveMap`/
   `upsertMapEntry` (pure data helpers), and `waygraph map init` to scaffold one. Proven
   in-repo against `templates/scaffold`.
2. **Not in this change - wiring Blind Pilot's own exploration loop to read/write a Map.**
   `waygraph-blind-pilot`'s shipped code (`rawClick`/`rawType`/`rawGoto`/`reloadLibrary`, the
   CLI verbs) is unchanged by this proposal. An agent driving those primitives *could* now
   also call `upsertMapEntry`/`saveMap` as it explores, but nothing in this package's own
   code does that automatically yet - that integration (deciding exactly when/what an agent
   should record, and whether any of that becomes a built-in behavior vs. staying entirely
   the driving agent's own judgment call) is real, separate, later work, stated honestly
   rather than silently assumed done.
3. **Not in this change - compiling a Map entry into `.block.ts` source.** Matches
   `waygraph-blind-pilot`'s own unmodified requirement: this package generates no Block
   content. An agent authoring a Block reads the Map for context, the same way it would read
   any other note file - no new "compiler" is built.
4. **Not in this change - Waygraph Router**, an unrelated, opinionated folder convention.
5. **Not in this change - a standalone `waygraph@map` npm package.** The user's own words
   ("maybe waygraph@map package stuffs?") floated this as a possibility, not a requirement.
   Nothing yet demonstrates a second, independent consumer of Map data outside this package's
   own `templates/scaffold` convention - splitting it into its own package now would be
   speculative versioning/publishing overhead with no real second user. The schema/helpers
   ship from this package's own `src/map.ts` instead; a real future consumer is grounds to
   reconsider, not something to design around preemptively.
6. **Not in this change - embedding into any real external site.** Proof stays in-repo,
   matching every prior phase's own established precedent for the identical tension.

## Goals / Non-Goals

**Goals:**
- A Map can represent partial, in-progress knowledge (an entry with only a URL known, or
  only open questions and nothing else) - Blind Pilot builds this up incrementally, not all
  at once.
- Load/save/update are pure data operations with no Playwright/browser/session dependency,
  so they're trivially testable and usable outside a live session (e.g. inspecting a Map
  file after the fact).
- `templates/scaffold`'s existing `NAV.md`/`SITE-MAP.md` are untouched - the Map is additive.

**Non-Goals (this change):**
- Wiring Blind Pilot's own code to actually call these helpers during exploration (see
  Roadmap above).
- Compiling a Map entry into Block source text (see Roadmap above - stays the driving
  agent's own job, unchanged).
- Waygraph Router, a standalone `waygraph@map` package, or any real external-site proof (see
  Roadmap above).

## Decisions

**One Map file per project, at a fixed, discoverable location - `waygraph.map.json` at the
project root** (sibling to `package.json`), not one per namespace like `NAV.md`. Blind
Pilot's whole premise is starting from nothing project-wide, not one namespace at a time - a
single file matches that, and matches the existing `.waygraph-auto/` session-directory
convention of a fixed, predictable project-root location an agent doesn't need to be told
about.

**Schema is a flat list of entries, one per Checkpoint, not a nested tree.**
```ts
export interface WaygraphMapEntry {
  checkpoint: string;
  nav?: { kind: "url" | "click"; value: string };
  selectors?: Record<string, string>;
  patterns?: Array<{
    name: string;
    kind: "method" | "effect" | "assert";
    status: "confirmed" | "needs-review";
    note?: string;
  }>;
  openQuestions?: string[];
}

export interface WaygraphMap {
  version: 1;
  entries: WaygraphMapEntry[];
}
```
Every field past `checkpoint` is optional - directly satisfying spec.md's "an entry can
exist before a Checkpoint is fully understood" requirement. `patterns[].status` mirrors the
"confirmed vs. needs-review" distinction implicit in the user's own scenario (the agent
states what it thinks a pattern is, but some things - like which mail-catcher convention
applies - need the human's confirmation first). `openQuestions` is deliberately a plain
string list, not a structured Q&A protocol - the user's own scenario is an ordinary
conversation ("is this local or published? does it support maildrop.cc?"), not a form.

**`loadMap`/`saveMap`/`upsertMapEntry` are the entire runtime surface - no class, no
session coupling.** `loadMap(path): WaygraphMap` (returns an empty Map if the file doesn't
exist yet, matching `AutoSession`'s own "tolerate zero state" precedent from
`waygraph-blind-pilot`), `saveMap(path, map): void`, `upsertMapEntry(map, entry):
WaygraphMap` (replaces the entry with matching `checkpoint`, or appends). Plain functions
over plain data - consistent with `src/graph.ts`'s own `discoverGraph`/`findOrphanBlocks`
shape, not a new architectural pattern.

**`waygraph map init` writes `{ version: 1, entries: [] }` and refuses to overwrite an
existing file.** Matches `spec.md`'s own requirement and this codebase's established
"fail loud, don't silently clobber" convention (e.g. `rm-feature-worktree.sh`'s own refusal
pattern in the workspace-level tooling, `defineAssertBlock`'s missing-`requires` gap being
surfaced rather than silently working around it).

## Risks / Trade-offs

- [The schema is a best guess at what Blind Pilot will actually need to record, made before
  Blind Pilot's own code is wired to use it] -> Accepted and stated honestly (spec.md's own
  last requirement) - real usage once Blind Pilot is wired to it may reveal fields that don't
  fit, which is a real, expected follow-up, not a design failure to avoid pre-emptively.
- [Not building a standalone `waygraph@map` package now might mean a real rename/extraction
  later if a second consumer appears] -> Accepted - extracting a package later, once a real
  second consumer justifies it, is normal, low-cost refactoring; publishing one now on
  spec alone would be real, wasted packaging/versioning overhead with no user.
- [This change alone doesn't make Blind Pilot actually use the Map - someone reading
  ROADMAP.md casually could mistake "Waygraph Map exists" for "Blind Pilot is Map-aware"] ->
  Mitigated by spec.md's own explicit requirement to state this gap plainly in status
  reporting, not just here.
