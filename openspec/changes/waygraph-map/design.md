## Context

This proposal replaces its own first draft, superseded before any of its code was written
(full record in `tasks.md`'s Status section and `proposal.md`'s Why). The first draft
designed Map as a separate `waygraph.map.json` file - a real, working-but-wrong reading of
two ambiguous chat mentions. Re-checking those mentions against a third, later, more explicit
message resolved the ambiguity the other direction: Map is the *folder structure itself*,
once opinionated enough that the structure alone mechanically encodes a project's Checkpoint
graph - not a hand-maintained (or even auto-generated) file describing it separately.

Two facts were verified directly before choosing this shape, not assumed:

- `walkDir` (`src/graph.ts`) recurses through any directory tree, matching only the
  `.block.ts` filename pattern - folder naming/depth is already invisible to every existing
  command. A Block's own exported properties (`name`, `__waygraphKind`, `instruction`)
  entirely determine its identity; the file path is used only for diagnostics
  (`relFile` in `SkippedBlock`/`OrphanBlock`, etc.).
- `examples/saucedemo`'s own `package.json` already declares `"waygraph": "file:../.."` - a
  plain file dependency, no publish/registry step - proving the "load a waygraph package"
  half of the user's own vision already has a working, in-repo precedent for how loading
  works, before this proposal adds anything.

Together these mean the opinionated convention needs **zero new engine code** - it's a
naming/organization convention this proposal documents and demonstrates, not a feature it
implements.

## Roadmap (why this slice, not the whole vision)

1. **This change** - document the convention, build one demonstrative scaffold proving
   existing tooling works against it unmodified, and prove a second project can load it and
   immediately understand its structure with zero extra steps.
2. **Not in this change - Blind Pilot authoring into this convention.** Blind Pilot
   (shipped, `waygraph-blind-pilot`) still writes plain files wherever it's pointed, exactly
   as already proven. Whether/how it should default to this convention when starting a
   project from scratch is real, separate, later work - this change proves the convention is
   viable to author into, not that anything currently does so automatically.
3. **Not in this change - a lint rule enforcing folder-name-matches-Checkpoint-tag.** A real,
   valuable follow-up (catching a folder/tag drift early), but not required for this
   proposal's own core claim (the convention works, mechanically, today) to be true.
4. **Not in this change - a real external-site proof, or a standalone `waypack` publishing
   tool.** "waypack" as a *name* for the packaging goal is the user's own; nothing in this
   change builds a bespoke packaging mechanism - it proves the existing `file:`-dependency
   mechanism (already used by `examples/saucedemo`) is already sufficient, which is a
   materially smaller claim than "build a new package format," and the honest one this
   change can actually prove in-repo.

## Goals / Non-Goals

**Goals:**
- The convention is fully specified (group folders, one Checkpoint per page-slug folder,
  fixed file names per Block kind) and demonstrated against real, already-shipped tooling.
- No new schema, manifest, or load/save code - the folder structure carries all the
  information the first (superseded) draft tried to duplicate into a separate file.
- Loading a convention-following project into another (a "waypack" consumer) is proven with
  the exact mechanism this codebase already uses for this (`file:` dependencies), not a new
  one.

**Non-Goals (this change):**
- Blind Pilot authoring into this convention automatically (see Roadmap above).
- A lint rule, a real external-site proof, or a bespoke packaging tool (see Roadmap above).

## Decisions

**The convention reuses today's Block *kinds* under fixed file names, rather than inventing
new Block helpers.** `page.block.ts` (a `definePageBlock` arrival hub, same helper as today's
`*.page.block.ts`), `nav.block.ts` (`defineNavBlock`, same as today's `nav-*.block.ts`),
`methods/*.block.ts` (`defineMethodBlock`/`defineEffectBlock`/etc., same as today's
`methods/*.method.block.ts`), `<slug>.sel.ts` (same convention as today's `*-sel.ts`). The
only thing this convention changes is *where* files live and what they're named - never what
kind of Block helper authors them or how they execute. This is deliberate: it means an
existing, freeform-organized project can adopt the convention incrementally, folder by
folder, without touching a single Block's own implementation.

**`(group)` folders are purely cosmetic, exactly like Next.js's own route groups.** Nothing
in `discoverGraph`/`loadBlockLibrary` reads or cares about a path segment wrapped in
parentheses specifically - this is a human-organizational convention only (separating,
e.g., a project's own authenticated app pages from its `(external)` cross-origin tooling,
matching the already-established `*-external/` namespacing precedent from
`waygraph-mail-adapters`), not something this change teaches any tool to special-case.

**No new "compile the convention into a graph" step is built, because none is needed.** The
first draft's `waygraph.map.json` would have needed exactly this - a step to keep the file in
sync with reality. This design's entire value is that `discoverGraph` already *is* that step,
running fresh every time, incapable of drifting out of sync because there's nothing separate
to drift from.

**Proof uses a `file:` dependency, matching `examples/saucedemo`'s own precedent, not a new
packaging mechanism.** "waypack" names the user's own goal (a project's Blocks being loadable
by another), not a request for this change to build a new distribution format - the honest,
smallest proof of that goal reuses what already demonstrably works in this repo today.

**Session sockets moved out of the project directory, to a short fixed location - a real
bug fix required to make the M3 proof actually true, not a pre-existing design choice.**
`auto --cli --detach` (and `pilot start`, which spawns one internally) used to put a session's
Unix socket at `<projectDir>/.waygraph-auto/<sessionId>.sock` - fine for a normal project, but
a real, reproducible failure (`listen EINVAL`) once `projectDir` is nested deep enough (a
package loaded through a consumer's own `node_modules/<pkg>` path is a realistic way to hit
this) that the absolute socket path exceeds the OS's AF_UNIX `sun_path` limit
(~108 bytes on Linux - confirmed via direct reproduction, 147 characters in the failing case).
Fixed in `src/auto-session-ipc.ts`: sockets now live at
`os.tmpdir()/waygraph-auto/<sessionId>.sock` - short and constant regardless of how deep the
real project is nested. Session *metadata* (`.waygraph-auto/<id>.json`, still under the
project directory, discoverable per-project) is untouched - only the socket moved, and only
the socket had the OS-level length constraint in the first place. `sessionId`'s own existing
randomness (8 hex chars, `generateSessionId()`) already made per-project collisions
negligible; sharing one flat directory across every project on the machine doesn't
meaningfully change that.

## Risks / Trade-offs

- [The convention is documented and demonstrated, but nothing enforces it - a project could
  drift away from the folder-matches-Checkpoint convention with no warning] -> Accepted;
  a lint rule is real, valuable, explicitly deferred follow-up (see Roadmap), not required
  for this change's own claim.
- [This is the second full rewrite of this proposal before any code shipped] -> Stated
  plainly in `tasks.md`'s own Status section, matching this session's established practice of
  recording a wrong-then-corrected reading rather than quietly overwriting it.
- ["waypack" as a real, named, publishable package format remains unbuilt - this change only
  proves the plain `file:`-dependency mechanism already suffices for the same goal] -> Honest
  scope-narrowing, stated directly rather than silently substituted; a real packaging tool is
  separate, later work if the plain mechanism ever proves insufficient.
- [A real bug found while proving M3, fixed rather than left standing: `auto --cli --detach`
  (and therefore `pilot start`) used to fail with `listen EINVAL` when the target project's
  absolute path was long enough to exceed the OS's AF_UNIX socket path limit
  (~108 bytes on Linux) - concretely hit driving a live session against a package loaded
  through a consumer project's own `node_modules/<pkg>` path] -> Fixed (see Decisions below)
  by moving session sockets to a short, fixed location, independent of project nesting depth.
  `waygraph graph` (no socket involved) was never affected and remains this change's own M3
  proof mechanism regardless.
