## Context

`ROADMAP.md`'s Phase 6 bullet describes compiling a "client-safe static manifest," porting
`locate()`/`findBlockPath` to run "client-side," and two delivery modes. An earlier pass at
this proposal took that literally: a sandboxed script embedded into an arbitrary end-user
page, with no Playwright/CDP access at all. That assumption was wrong, and it's what
generated a long list of invented hard problems (cross-origin iframe access, synthetic-event
trust, a native-DOM compatibility shim for a dozen Playwright methods) that don't actually
apply here.

The corrected model, confirmed by re-reading what Phase 1 already built
(`src/auto-session.ts`): `AutoSession` is a **launched** Playwright session - exactly the
same execution model every other command in this whole roadmap already uses (`waygraph
auto`, `waygraph demo`, `waygraph auto --detach`). It already exposes `currentSnapshot()` (a
live, JSON-serializable menu of every reachable edge, each one already carrying that Block's
required `description` - confirmed directly in `SessionSnapshotEdge`) and `applyPick(raw)`
(already runs a real Block for real, end to end, proven by Phase 1's own test suite).
Nothing about resolving a plain-language ask and then either narrating or running the
matched edge requires stepping outside that already-proven session model. There is no
untrusted-browser sandbox to design around, because there is no untrusted browser - it's the
same Playwright/CDP session Phases 1-5 already run.

## Roadmap (why this slice, not the whole vision)

1. **This change** - the plain-language resolver, narrate mode (reusing existing highlight
   rendering), agentic mode (reusing `applyPick` as-is), a `waygraph pilot` CLI entry
   point, proven in-repo.
2. **Not in this change - a smarter (embedding/LLM-assisted) plain-language matcher.** A
   deterministic text-similarity baseline ships; nothing here forecloses a smarter matcher
   later, but this change does not require calling an external model to produce a working
   result.
3. **Not in this change - embedding into a real external consumer application.** Proof stays
   in-repo, matching Phases 4 and 5's own established precedent for the identical tension.
   Reaching `1.0.0`'s original "demoable on one real consumer" criterion is a separate, later,
   explicit step this change does not complete.
4. **Not a design question this change needs to answer at all (corrected from the earlier
   draft): how untrusted, sandboxed page-embedded JS would reach cross-origin content, or
   dispatch trusted-equivalent input.** That constraint only existed under the wrong
   architecture assumption; under the corrected one (a launched Playwright session), it does
   not arise, so there is nothing to solve or defer here.

## Goals / Non-Goals

**Goals:**
- A plain-language ask resolves to a real, reachable Checkpoint using data every Block
  already supplies (`description`), scoped correctly to what's actually reachable right now.
- Narrate mode gives a real, visible pointer to the real control that answers the ask, reusing
  already-authored, already-rendered highlight data and rendering code.
- Agentic mode runs the real Block for real, using the exact execution path Phase 1 already
  proved - no new or parallel execution mechanism.
- Every Block kind (built-in-Trait-factory-based or bespoke) works identically in both modes,
  since nothing here runs outside the same trusted Playwright session everything else does.

**Non-Goals (this change):**
- A smarter plain-language matcher than deterministic text similarity (see Roadmap above).
- Embedding into any real external consumer application (see Roadmap above).
- Anything related to running Block code inside an untrusted, non-Playwright browser context
  - not applicable under this corrected architecture, not a deferred problem, just not this.

## Decisions

**Pilot is a new, thin consumer of `AutoSession`'s existing public surface - almost.**
`currentSnapshot()` and `applyPick()` already do exactly what the resolver and agentic mode
each need, unmodified. Narrate mode needed two things `AutoSession` genuinely didn't expose
(a real gap, not anticipated here): direct access to the session's live `page` (its own
JSON-only surface deliberately hides Playwright objects) and a way to preview a named Block's
`stubBefore` data without running it (`applyPick` already computes this internally, but never
returned it). `AutoSession` gained two small, additive, read-only public methods -
`getPage()` and `peekStubBefore(blockName)` - neither changes any existing method's behavior,
confirmed by the full pre-existing `auto-session.spec.ts` suite passing unmodified. All
Pilot-specific logic (the resolver, mode dispatch) still lives in the separate `src/pilot.ts`
module, not inside `AutoSession` itself - `AutoSession` stays a generic, reusable session
primitive with a slightly larger read-only surface, not one coupled to Pilot's own concerns.

**The plain-language resolver is a small, deterministic text-similarity function, not a
call to an external model.** Every edge's `description` is already required, short,
human-written prose - a token-overlap/keyword-similarity score (the concrete algorithm
decided and justified in tasks.md, not assumed here) is enough to distinguish "add an item to
my cart" from "check out" from "sign in" reliably, without adding a network dependency or a
new required API key just to get a working baseline. A smarter matcher is a real, valid
future upgrade to the same interface, not something this change needs to build to be useful.

**Narrate mode ships its own small, self-contained ring renderer - not `src/cli.ts`'s,
despite the original plan to export and reuse it.** `cycleHighlightRings`/`showRing` do
exactly the right visual thing, but two real problems surfaced once actually wiring this up:
`src/cli.ts` runs `main().catch(...)` unconditionally at module load with no
`import.meta.url` guard, so importing anything from it would trigger the whole CLI's argument
dispatch as a side effect of loading a library module; and its ring renderer is deeply
coupled to CLI-only terminal-logging helpers (`demoLog`/`demoHighlight`/ANSI color codes) -
a different concern than page rendering. Untangling that cleanly would mean a wide extraction
across a dozen interdependent functions serving two purposes at once - real, but risky, work
this change didn't take on. `src/pilot.ts` instead ships a small (~60 line), purpose-built
CSS ring + label renderer with the same visual idea and zero `cli.ts` dependency or console
output of its own - documented as a deliberate deviation in the file's own header.

**Agentic mode is `applyPick`, not a new "act on this Block" primitive.** `AutoSession`
already runs a full act/resolve/verify cycle for real, updates `here`, and records a trace
step - everything agentic mode needs. Wrapping it in Pilot-specific language (`ask` ->
resolved edge -> `applyPick(String(edge.index))`) is the entire integration; there is no
separate execution path to design.

**A resolved-but-unreachable edge is a contradiction the resolver's own scoping prevents,
not a runtime case to handle.** Because the resolver only ever scores edges already present
in `currentSnapshot()` (which is itself already scoped to what's reachable from `here`), an
edge can never be "resolved" without also being reachable - no separate reachability check is
needed downstream of resolution.

## Risks / Trade-offs

- [Deterministic text-similarity matching will sometimes be wrong or unconfident on a
  genuinely ambiguous ask] -> Accepted for this change; "no confident match" is a real,
  correct outcome for a genuinely ambiguous ask, not a bug to eliminate here.
- [Proof stays in-repo, so this change alone does not satisfy `ROADMAP.md`'s own original
  `1.0.0` criterion ("demoable on one real consumer")] -> Stated plainly in spec.md and
  proposal.md rather than silently redefining what `1.0.0` means; reaching it is real,
  separate, later work.
- [Narrate mode's visibility depends on the session actually being headful/visible to
  whoever it's meant to help - a headless narrate run highlights nothing anyone can see] ->
  Not a new risk - Phase 3 already built `--non-headless` for exactly this; Pilot's CLI
  entry point exposes the same existing flag rather than inventing a new visibility control.
