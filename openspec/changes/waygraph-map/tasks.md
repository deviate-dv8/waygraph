## Status (read this first, always)

**State: implemented and verified (M1-M4), corrected twice before any code shipped.** Phase
6c of the "Agent-authoring tooling and Waygraph Pilot" roadmap. Builds on
`waygraph-blind-pilot` (Phase 6b, shipped), which explicitly left this exact dependency open
rather than guessing. Also updated `templates/scaffold` itself (per direct user request mid
-implementation) - real `waygraph init` users now see both authoring modes out of the box,
not just the in-repo `examples/` proof.

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

- [x] Milestone 1 (M1) - Document the convention
- [x] Milestone 2 (M2) - Demonstrative scaffold, proven against existing tooling
- [x] Milestone 3 (M3) - "waypack" loading proof
- [x] Milestone 4 (M4) - Docs (also: templates/scaffold itself, per direct user request)

---

## M1. Document the convention

- [x] M1.1 Written specification of the folder convention (in `README.md`, per M4 below):
      `(group)/<page-slug>/page.block.ts` (arrival hub, `definePageBlock` - same helper as
      today's `*.page.block.ts`), `nav.block.ts` (`defineNavBlock` - same as today's
      `nav-*.block.ts`), `methods/*.block.ts` (`defineMethodBlock`/`defineEffectBlock`/etc. -
      same as today's `methods/*.method.block.ts`), `<page-slug>.sel.ts` (same convention as
      today's `*-sel.ts`). `(group)` folders (e.g. `(base_app)`, `(external)`, matching the
      user's own example and the already-established `*-external/` namespacing precedent from
      `waygraph-mail-adapters`) are purely organizational - never part of any Checkpoint tag.
- [x] M1.2 State plainly, in the same doc: this changes *where files live and what they're
      named*, never *what kind of Block helper authors them or how they execute* - an
      existing freeform-organized project can adopt the convention incrementally, folder by
      folder, without touching a single Block's own implementation.

## M2. Demonstrative scaffold, proven against existing tooling

- [x] M2.1 `examples/routed-demo/` - two Checkpoints (`Dashboard` under `(base_app)/`, `Docs`
      under `(external)/`), a real offline fixture server (mirroring
      `templates/scaffold`'s own `scripts/fixture-server.mjs`/`with-fixture.mjs` exactly), a
      real click-driven Method (`click-widget`), and a `routes/routed-demo.flow.ts` wiring
      both Nav Blocks + the Method so nothing is an orphan.
- [x] M2.2 Real tests (`examples/routed-demo/tests/routed-demo.spec.ts`), both passing live:
      `waygraph graph` discovers both Checkpoints and all 3 edges via the exact same
      `discoverGraph` code path a freeform-organized project already uses - confirmed by
      direct inspection of its real output (`(base_app)/dashboard/...`,
      `(external)/docs/...` file paths, zero orphans, zero skipped); a real detached session
      (`auto --cli --detach`) reaches `Dashboard`, runs a real click (`click-widget`,
      confirmed via the fixture page's own DOM update), and `auto reach <sessionId> "Docs"`
      runs the real `nav-docs` route in one call, reaching `Docs` for real - proving
      `waygraph-pilot`'s own M5 capability also works unmodified against this convention.

## M3. "waypack" loading proof

- [x] M3.1 `examples/routed-demo-consumer/` depends on M2's example as a plain `file:`
      dependency (`"waygraph-example-routed-demo": "file:../routed-demo"`) - the same
      mechanism `examples/saucedemo`'s own `"waygraph": "file:../.."` already uses for the
      core package, now proven for loading *another project's Blocks*, not just the engine.
- [x] M3.2 Real proof: `waygraph graph node_modules/waygraph-example-routed-demo` run from
      the consumer's own directory correctly discovers the loaded project's full
      Checkpoint/edge structure - confirmed by direct inspection of the real output, byte
      -for-byte the same graph as M2.2's own. No manifest, index, or schema file involved at
      any point. **Real, honest finding along the way, not silently worked around**: running
      a *live* `--detach` session (`auto --cli --detach`) against that same nested
      `node_modules/<pkg>` path failed with `listen EINVAL` - the resulting absolute path
      (147 characters in the reproduction) exceeds the OS's AF_UNIX socket path limit
      (~108 bytes on Linux). `waygraph graph` uses no socket and is unaffected - it remains
      this task's actual proof mechanism, matching spec.md's own requirement wording (which
      was corrected to state this limitation explicitly rather than overclaim `pilot start`
      also works through an arbitrarily deep loaded path).
      This is the concrete proof of "agents can run an empty waygraph, load a waygraph
      package, and understand more" - achieved with zero new code, only the convention plus
      tooling that already existed before this change.

## M4. Docs

- [x] M4.1 `README.md`: new "Waygraph Map" section - the convention's exact file layout
      (M1.1), the "no new schema, the folder structure is the map" framing, and the M2/M3
      proofs referenced concretely (not just asserted).
- [x] M4.2 `ROADMAP.md`: Phase 6c's Waygraph Map bullet updated from "vision only" to
      shipped, stating plainly that Blind Pilot's own authoring behavior is unchanged (it
      still writes plain files wherever it's pointed) - this change proves the convention is
      viable to author into and load from, not that anything currently generates Blocks
      following it automatically. Waygraph Router's own bullet updated to reflect that it is
      not a separate future build - it names the role today's freeform convention already
      fills - rather than left implying a still-unbuilt, differently-shaped feature.
- [x] M4.3 Full existing regression suite re-confirmed green after M2/M3 (same scope as
      `waygraph-blind-pilot`'s own M3.4 - every directory except the pre-existing, unrelated
      `tests/unit/` vitest gap). `npm run build` clean.
- [x] M4.4 (added mid-implementation, direct user request: "the scaffold should now support
      the map method") `templates/scaffold/` itself updated, not just `examples/` - a new
      `src/routes/(external)/docs/` folder (`page.block.ts`/`nav.block.ts`/`docs.sel.ts`,
      fixed names per the convention) and `src/flows/routes-demo.flow.ts` proving `nav-home`
      (manual mode, `src/blocks/`) and `nav-docs` (Map convention, `src/routes/`) compose in
      one real flow - confirmed via `waygraph check` (zero orphans), `waygraph graph` (both
      Checkpoints discovered), `npx tsc --noEmit` (clean), and a real live
      `waygraph run --blocks routesDemoFlow` reaching `Docs` for real.
      `STRUCTURE.md` updated with the new tree entries and a "Two authoring modes" section.

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
