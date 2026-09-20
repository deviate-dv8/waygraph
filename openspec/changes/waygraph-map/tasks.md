## Status (read this first, always)

**PAUSED - superseded reasoning, do not implement as written.** After this proposal was
written, the user corrected the Router/Map split it was built on: "waygraph router is the
current setup we have today [an opinionated, folder-per-endpoint convention like Next.js/
Nuxt] ... waygraph map is like the folder opinion similar to what nextjs, nuxtjs ... this
makes it easier to create the waypack package ... the folders are literally the page
endpoint." This means Waygraph Map is not a separate JSON manifest a project maintains
alongside its Block files (this proposal's whole premise, below) - it is the *folder
structure itself*, once formalized/opinionated enough that folder layout mechanically *is*
the map, making a distributable "waypack" package trivial to produce from it. Router and Map
are much closer to being the same underlying idea (formalize the folder convention) than two
separate future pieces. This proposal's schema/helpers approach needs to be rethought against
that corrected picture before any of M1-M3 below is implemented - kept here, not deleted, as
a record of the wrong-then-corrected reasoning (matching this project's own convention of
preserving what was tried and why it changed, e.g. git tag
`waygraph-pilot-v1-logs-prettified`).

**Original status below, unchanged, for the record:**

**State: proposed, not yet implemented.** Phase 6c (partial - Map only, not Router) of the
"Agent-authoring tooling and Waygraph Pilot" roadmap. Builds on `waygraph-blind-pilot`
(Phase 6b, shipped), which explicitly left this exact dependency open rather than guessing at
it.

**This proposal itself was corrected once before any code was written**, the same discipline
this whole roadmap has repeatedly needed: a first draft assumed Waygraph Map was a read-only
export generated from already-written Blocks. Re-checking this project's own chat history
directly surfaced the only two real user mentions of it (quoted in full in proposal.md's Why
section), which say the opposite: Map is Blind Pilot's own working substrate, built up
*first*, that Block authoring happens *from* - not a report generated after Blocks already
exist. Corrected before any artifact was written on the wrong premise.

- [ ] Milestone 1 (M1) - Schema and pure data helpers
- [ ] Milestone 2 (M2) - `waygraph map init` CLI entry point
- [ ] Milestone 3 (M3) - In-repo proof and docs

---

## M1. Schema and pure data helpers

- [ ] M1.1 `src/map.ts`: `WaygraphMapEntry`/`WaygraphMap` types exactly as decided in
      design.md (`checkpoint` required, every other field optional; `patterns[].status:
      "confirmed" | "needs-review"`; `openQuestions: string[]`).
- [ ] M1.2 `loadMap(path: string): WaygraphMap` - returns `{ version: 1, entries: [] }` when
      the file doesn't exist yet (matching `AutoSession`'s own "tolerate zero state"
      precedent), parses and returns its contents otherwise. Throws loud on a file that
      exists but isn't valid JSON/doesn't match the schema shape - not a silent empty-Map
      fallback for a genuinely corrupt file.
- [ ] M1.3 `saveMap(path: string, map: WaygraphMap): void` - writes formatted JSON.
- [ ] M1.4 `upsertMapEntry(map: WaygraphMap, entry: WaygraphMapEntry): WaygraphMap` - returns
      a new `WaygraphMap` with `entry` replacing any existing entry sharing its `checkpoint`,
      or appended if none matches. Pure function - does not mutate its `map` argument.
- [ ] M1.5 Real tests (no browser, no session - pure data): a fresh `loadMap` on a
      nonexistent path returns an empty Map; `saveMap` then `loadMap` round-trips a Map with
      partial entries (only a URL, or only `openQuestions`) unchanged; `upsertMapEntry`
      replaces an existing entry by `checkpoint` and appends a new one; `loadMap` throws on a
      real malformed file (not valid JSON) rather than silently returning empty.

## M2. `waygraph map init` CLI entry point

- [ ] M2.1 New `map` sub-command in `src/cli.ts`: `waygraph map init [dir]` - writes
      `waygraph.map.json` (`{ version: 1, entries: [] }`) at the project root (`dir` or
      `process.cwd()`). `usage()` updated.
- [ ] M2.2 Refuses to overwrite an existing Map file - clear error, exit code 1, matching
      this codebase's established "fail loud, don't silently clobber" convention (per
      design.md's own citation of precedent).
- [ ] M2.3 Real tests: `map init` on a fresh directory creates a file `loadMap` reads back as
      a valid empty Map; running it again against the same directory fails loud without
      modifying the existing file's contents.

## M3. In-repo proof and docs

- [ ] M3.1 Proof runs against `templates/scaffold` (or a throwaway copy of it, matching
      `waygraph-blind-pilot`'s own per-test isolation precedent if the real scaffold
      directory shouldn't be mutated by a test run) - `map init`, then `upsertMapEntry`
      recording a partial entry with an open question, saved and reloaded, matching
      spec.md's own round-trip requirement.
- [ ] M3.2 `README.md`: new short section (or an extension of "Blind Pilot") introducing the
      Map file, its schema, and the honest gap - Blind Pilot's own exploration loop does not
      yet read from or write to it automatically; an agent driving Blind Pilot's primitives
      can call these helpers itself, but nothing in this package does so on its own yet.
- [ ] M3.3 `ROADMAP.md`: Phase 6c's Waygraph Map bullet updated from "vision only" to
      shipped, with the same honest gap stated plainly (schema/helpers exist; Blind Pilot
      itself is not yet wired to them). Waygraph Router remains explicitly vision-only - do
      not mark it done as a side effect of this change.
- [ ] M3.4 Full existing regression suite re-confirmed green after M1-M2 (same scope as
      `waygraph-blind-pilot`'s own M3.4 - every directory except the pre-existing, unrelated
      `tests/unit/` vitest gap). `npm run build` clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Wiring Blind Pilot's own exploration loop (`rawClick`/`rawType`/`rawGoto`/
      `reloadLibrary`) to actually read from/write to a Map as part of its own behavior,
      rather than only having the schema/helpers exist for an agent to call manually.
- [ ] Any code that compiles a Map entry into `.block.ts`/`*Sel`/mem-key source text.
- [ ] Waygraph Router.
- [ ] A standalone `waygraph@map` npm package.
- [ ] A real external-site proof.
