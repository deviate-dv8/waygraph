## Status (read this first, always)

**State: proposed (corrected twice), not yet implemented.** Phase 6c of the
"Agent-authoring tooling and Waygraph Pilot" roadmap. Builds on `waygraph-blind-pilot`
(Phase 6b, shipped), which explicitly left this exact dependency open rather than guessing.

**This proposal has been rewritten twice, both times before any of its own code shipped -
read both corrections before touching it again:**

**Correction 1:** a first draft assumed Waygraph Map was a read-only export generated from
already-written Blocks. Re-checking this project's own chat history directly surfaced the
only two real user mentions of it at the time, which said the opposite: Map is Blind Pilot's
own working substrate, built up *first*, that Block authoring happens *from*.

**Correction 2 (this rewrite):** that "working substrate" reading was itself still wrong -
it designed Map as a separate `waygraph.map.json` file with `loadMap`/`saveMap`/
`upsertMapEntry` helpers and a `waygraph map init` command. A third, later, more explicit
user message resolved a real tension between two chat mentions that looked contradictory:
Router was originally described with literal Next.js App-Router syntax
(`(base_app)/dashboard/page.ts`), but a later message called "Router" *"the current setup we
have today"* and described "Map" using that same Next.js-folder-convention language instead.
Reading the later message as authoritative: **Waygraph Map is the opinionated folder
structure itself** - `(group)/<page-slug>/page.block.ts` + `nav.block.ts` +
`methods/*.block.ts`, one Checkpoint per folder - not a schema file describing a project
separately from its own Blocks. Verified directly before choosing this shape: `discoverGraph`/
`loadBlockLibrary` (`src/graph.ts`'s `walkDir`) already recurse through any folder structure,
matching only the `.block.ts` filename pattern - folder naming/depth is already 100% cosmetic
to every existing command. The whole M1/M2 JSON-schema milestone set below this line, from
the first correction, is **fully superseded and not being implemented** - kept only as the
historical record of what was tried and rejected twice, matching this project's own
established practice (e.g. git tag `waygraph-pilot-v1-logs-prettified`) of preserving wrong
turns rather than silently erasing them.

- [ ] Milestone 1 (M1) - Document the convention
- [ ] Milestone 2 (M2) - Demonstrative scaffold, proven against existing tooling
- [ ] Milestone 3 (M3) - "waypack" loading proof
- [ ] Milestone 4 (M4) - Docs

---

## M1. Document the convention

- [ ] M1.1 Written specification of the folder convention (in `README.md`, per M4 below):
      `(group)/<page-slug>/page.block.ts` (arrival hub, `definePageBlock` - same helper as
      today's `*.page.block.ts`), `nav.block.ts` (`defineNavBlock` - same as today's
      `nav-*.block.ts`), `methods/*.block.ts` (`defineMethodBlock`/`defineEffectBlock`/etc. -
      same as today's `methods/*.method.block.ts`), `<page-slug>.sel.ts` (same convention as
      today's `*-sel.ts`). `(group)` folders (e.g. `(base_app)`, `(external)`, matching the
      user's own example and the already-established `*-external/` namespacing precedent from
      `waygraph-mail-adapters`) are purely organizational - never part of any Checkpoint tag.
- [ ] M1.2 State plainly, in the same doc: this changes *where files live and what they're
      named*, never *what kind of Block helper authors them or how they execute* - an
      existing freeform-organized project can adopt the convention incrementally, folder by
      folder, without touching a single Block's own implementation.

## M2. Demonstrative scaffold, proven against existing tooling

- [ ] M2.1 One new in-repo example organized under the convention (e.g.
      `examples/routed-demo/` or similar - small, a handful of Checkpoints, enough to prove
      the shape, not a realistic full site) - reusing an existing example's own Block *logic*
      where reasonable (e.g. mirroring `templates/scaffold`'s demo-web fixture) so this is
      about proving the *folder shape* works, not re-authoring new Block behavior from
      scratch.
- [ ] M2.2 Real tests: `waygraph graph` against this example produces a correct graph (every
      Checkpoint/edge discovered) via the exact same `discoverGraph` code path a
      freeform-organized project already uses - no convention-specific branch exists to test
      separately, because none exists. `waygraph auto`/`waygraph pilot start`/`waygraph auto
      reach` also proven to work against it unmodified, at least one real end-to-end
      navigation sequence.

## M3. "waypack" loading proof

- [ ] M3.1 A second, separate project directory depends on M2's example as a plain `file:`
      dependency - the exact mechanism `examples/saucedemo`'s own `"waygraph":
      "file:../.."` already uses (matching precedent, not inventing a new one).
- [ ] M3.2 Real test: `waygraph graph`/`pilot start` run against the consuming project
      correctly discovers the loaded project's full Checkpoint/edge structure - no manifest,
      index, or schema file involved at any point. This is the concrete proof of "agents can
      run an empty waygraph, load a waygraph package, and understand more" - achieved with
      zero new code, only the convention plus tooling that already existed before this change.

## M4. Docs

- [ ] M4.1 `README.md`: new "Waygraph Map" section - the convention's exact file layout
      (M1.1), the "no new schema, the folder structure is the map" framing, and the M2/M3
      proofs referenced concretely (not just asserted).
- [ ] M4.2 `ROADMAP.md`: Phase 6c's Waygraph Map bullet updated from "vision only" to
      shipped, stating plainly that Blind Pilot's own authoring behavior is unchanged (it
      still writes plain files wherever it's pointed) - this change proves the convention is
      viable to author into and load from, not that anything currently generates Blocks
      following it automatically. Waygraph Router's own bullet updated to reflect that it is
      not a separate future build - it names the role today's freeform convention already
      fills - rather than left implying a still-unbuilt, differently-shaped feature.
- [ ] M4.3 Full existing regression suite re-confirmed green after M2/M3 (same scope as
      `waygraph-blind-pilot`'s own M3.4 - every directory except the pre-existing, unrelated
      `tests/unit/` vitest gap). `npm run build` clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Wiring Blind Pilot's own exploration loop to author into this convention by default
      (or at all) - it continues writing plain files wherever pointed, unchanged.
- [ ] A lint rule enforcing that a folder's Checkpoint tag matches its own page-slug - real,
      valuable, deferred; not required for this change's own core claim.
- [ ] A real external-site proof.
- [ ] A standalone, publishable `waypack` package format/tool beyond the plain
      `file:`-dependency mechanism this change proves already suffices for the same goal.

---

## Superseded (Correction 1's plan - NOT being implemented, kept for the record only)

The milestones below designed a separate `waygraph.map.json` schema/helpers module and a
`waygraph map init` CLI command. Superseded by Correction 2 above before any of this was
written. Left here, unchecked, only so a future reader can see exactly what was tried and
rejected rather than having to reconstruct it from git history alone.

- [ ] (superseded) `src/map.ts`: `WaygraphMapEntry`/`WaygraphMap` types, `loadMap`/`saveMap`/
      `upsertMapEntry` pure data helpers.
- [ ] (superseded) `waygraph map init [dir]` CLI command scaffolding an empty Map file.
- [ ] (superseded) Real tests for the above, and in-repo proof against `templates/scaffold`.
