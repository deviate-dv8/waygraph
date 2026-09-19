## Status (read this first, always)

**State: planned, not yet implemented.** Phase 6 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md` - the final phase. **This proposal was corrected mid-flight
before any code was written**: the first draft wrongly assumed Copilot had to run as a
sandboxed script embedded into an untrusted end-user page (no Playwright/CDP access), which
generated a long list of invented hard problems (cross-origin iframe access, synthetic-event
trust, a native-DOM compatibility shim). Corrected once `AutoSession`'s actual existing
surface was re-checked: Copilot is a launched Playwright session, exactly like every other
command in this roadmap, so none of that applies. Scope is now small - a plain-language
resolver plus thin narrate/agentic dispatch over `AutoSession`'s existing, already-proven
`currentSnapshot()`/`applyPick()`.

- [ ] Milestone 1 (M1) - Plain-language resolver
- [ ] Milestone 2 (M2) - Narrate mode
- [ ] Milestone 3 (M3) - Agentic mode
- [ ] Milestone 4 (M4) - `waygraph copilot` CLI entry point
- [ ] Milestone 5 (M5) - In-repo proof

---

## M1. Plain-language resolver

- [ ] M1.1 `src/copilot.ts`: `resolveAsk(snapshot: SessionSnapshot, ask: string):
      ResolvedAsk | null` - flattens `snapshot.sections` into the same reachable-edge list
      `printCliMenu` already iterates, scores each edge's `description` against `ask`.
- [ ] M1.2 Pick and justify the concrete scoring algorithm here (token-overlap/keyword
      similarity is the working assumption from design.md - confirm it's actually good
      enough against real Block descriptions from `examples/saucedemo`/`templates/scaffold`
      before committing, don't just assume) and the confidence threshold below which the
      resolver returns `null` instead of a weak best-of-a-bad-set match.
- [ ] M1.3 Real tests: an ask closely matching one reachable edge's description resolves to
      it; an edge that would match well but is not currently reachable (not in this
      snapshot) is never returned; a genuinely ambiguous/unmatched ask returns `null`, not a
      guess. Run against real `SessionSnapshot` data from a real `AutoSession` against
      `examples/saucedemo` or `templates/scaffold`, not a hand-built fixture snapshot only.

## M2. Narrate mode

- [ ] M2.1 Export `cycleHighlightRings`, `showRing`, and their small helper functions from
      `src/cli.ts` (currently private) - reuse, not reimplementation, per design.md's
      Decision.
- [ ] M2.2 `src/copilot.ts`: `narrate(session: AutoSession, resolved: ResolvedAsk):
      Promise<void>` - looks up the resolved edge's Block's `stubBefore` data (via
      `runStubPhase`, already built) and calls the exported ring-rendering primitives against
      the session's own live `page`, without calling `applyPick`.
- [ ] M2.3 Real test: after `narrate()` runs for a resolved edge, the target element is
      visibly highlighted on the real page, and the session's own `currentSnapshot().here` is
      unchanged (per spec.md's requirement) - run headful (`--non-headless`, from Phase 3)
      so the highlight is actually observable, not just headless-and-asserted-on-the-DOM.

## M3. Agentic mode

- [ ] M3.1 `src/copilot.ts`: `act(session: AutoSession, resolved: ResolvedAsk):
      Promise<ApplyPickResult>` - calls `session.applyPick(String(resolved.edge.index))`
      directly; no new execution logic.
- [ ] M3.2 Real test: agentic mode's result for a given ask is identical (same resulting
      Checkpoint, same trace shape) to manually calling `applyPick` with that same edge's
      index directly - proves this is genuinely the same path, not a parallel one that could
      drift.
- [ ] M3.3 Real test: a resolved edge whose Block uses a bespoke, hand-written Trait (e.g.
      this repo's own `assert-email-received`) works identically in both narrate and agentic
      mode to one using only built-in Trait factories - per spec.md's requirement that
      nothing here restricts which Block kinds work.

## M4. `waygraph copilot` CLI entry point

- [ ] M4.1 New `copilot` sub-command in `src/cli.ts` (`waygraph copilot ask "<text>" [--mode
      narrate|agentic] [--detach] [--non-headless] [...]`) - reuses Phase 1's existing
      session-control flag surface (check `usage()`'s current text for the established
      pattern before inventing new flag names) rather than a parallel set of options.
- [ ] M4.2 Wires `resolveAsk` + `narrate`/`act` to a real `AutoSession` (started the same way
      `auto --detach` already starts one) - reports a clear, real error (naming the ask) when
      resolution returns no confident match, rather than silently doing nothing.

## M5. In-repo proof

- [ ] M5.1 Pick `examples/saucedemo` or `templates/scaffold` (decide once M1-M4 make the
      integration shape concrete, record the reasoning here - same discipline this session
      used for the mail-verification example's own scope decision).
- [ ] M5.2 Real end-to-end demo: a real plain-language ask (e.g. "how do I add an item to my
      cart") against that example, narrate mode showing a real highlight on the real page,
      agentic mode actually completing the real action - both run and proven, not just one.
- [ ] M5.3 Honest status note (per spec.md's last requirement): this proof demonstrates the
      mechanism works in-repo; it does not satisfy `ROADMAP.md`'s original `1.0.0` criterion
      of "demoable on one real consumer" - that remains separate, later, unmet work.
- [ ] M5.4 `README.md`/`ROADMAP.md` updated: the capability, its reuse of Phase 1-5
      machinery, and the honest 1.0.0-gap note.
- [ ] M5.5 Full in-repo regression suite green; `npm run build`/`npx tsc --noEmit` clean.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] A smarter (embedding/LLM-assisted) plain-language matcher than deterministic text
      similarity.
- [ ] Embedding into a real external consumer application, and the associated `1.0.0`
      declaration this change alone does not complete.
