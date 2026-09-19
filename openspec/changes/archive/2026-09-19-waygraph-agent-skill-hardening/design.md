## Context

`ROADMAP.md`'s "Agent-authoring tooling and Waygraph Copilot" section documents the evidence
this phase closes out: two real pre-skill consumer projects, audited this session with
`waygraph check`, showed (a) a Method that clears storage, reloads, and drives a bounded
retry loop through several rail steps inside one opaque `act()` - the multi-action-per-Block
anti-pattern - and (b) 98 orphan Blocks never wired into a `defineFlow`. A further pass over
the same evidence found 40+ near-identical self-loop `assert-*.method.block.ts` files, each
hand-writing the same `act`/`resolve` boilerplate around a `verify` array of raw inline
selector strings - zero use of the `*Sel` convention this session's own `examples/saucedemo`
cleanup applied consistently (`CartSel`/`CheckoutInfoSel`/`CheckoutOverviewSel`/
`ItemDetailSel`).

Read before writing this spec: `src/engine.ts`'s existing `definePageBlock`/`defineMethodBlock`
(the exact construction pattern `defineAssertBlock` mirrors), `src/cli.ts`'s existing `check`
command (`checkCommand`, `NAV_METHOD_CALLS`, `printOrphanReport` - the exact file-scoped
text-scan technique the new Sel-enforcement warning reuses), and both
`templates/agents/waygraph-author.agent.md` and `waygraph-planner.agent.md` in full.

## Roadmap (why this slice, not the whole vision)

1. **This change** - `defineAssertBlock`, the `*Sel`-enforcement `check` warning, and the
   agent-skill hardening itself.
2. **Not in this change** - the `maildrop.cc` external-mail adapter (Phase 5).
3. **Not in this change** - Waygraph Copilot itself (Phase 6).
4. **Explicitly never in scope** - editing the two external consumer projects this evidence
   came from. They are separate, real projects outside this repository; this change closes
   the gap in *this package's own* tooling and agent-skill instructions so a *future* run of
   the skill against any project (including those) does better, not by going and fixing
   those projects' existing files directly.

## Goals / Non-Goals

**Goals:**
- An agent following `waygraph-author.agent.md` from this point forward is structurally
  steered away from both defect classes: the multi-action rule is explicit, and the
  self-gate catches the orphan case before the agent calls itself done.
- The 40+-file boilerplate pattern gets real sugar (`defineAssertBlock`) instead of every
  future author hand-writing the same three lines again, with the copy/rename footgun closed
  (one `checkpoint` field, not a duplicated string).
- The `*Sel` convention becomes partially machine-checked, not just documented convention -
  `waygraph check` can now catch the exact pattern found at scale.

**Non-Goals (this change):**
- Anything from Phase 5 or 6.
- A fully precise, AST-aware selector-usage checker - matching the existing nav-escape
  check's own accepted bluntness (text-scoped regex over one file, not an import-graph or
  syntax-tree analysis) is the deliberate bar here, not a new analysis class.
- Retrofitting any existing project's Blocks (this repo's own or external) to
  `defineAssertBlock` - a real, valuable follow-up once this ships, not part of shipping it.
- Making the orphan-Block or inline-selector checks build-failing. Both stay warnings,
  matching the existing nav-escape check's own severity - the self-gate lives in the agent's
  own instructions (it must not report done with warnings present), not in the tool's exit
  code.

## Decisions

**`defineAssertBlock` takes a flat options object with `checkpoint: string`, mirroring
`definePageBlock`'s exact construction pattern rather than inventing a new shape.**
`definePageBlock` already demonstrates the pattern this needs: flat options in, `defineBlock`
built internally with a generated `resolve: () => checkpoint(options.checkpoint)`. Reusing
that exact shape (rather than, say, accepting a full `Instruction` object with the caller
still writing `resolve` themselves) is what actually closes the copy/rename footgun - the
Checkpoint tag has exactly one place to be stated.

**`waitForHeading` is a named shorthand, not a generic `act` override.** Every one of the
40+ files found does the identical `await page.getByRole("heading", { name: "..." }).waitFor()`
before its `verify` array does the real work. Naming that exact shape as one string option
covers the pattern actually found without inventing a general escape hatch that would let
`defineAssertBlock` grow back into an arbitrary-`act()` Block - if a real case genuinely needs
more than "wait for a heading, then assert," that is a sign it should not be
`defineAssertBlock` in the first place (it is not a self-loop-only assertion anymore).

**The `*Sel`-enforcement check reuses the nav-escape check's own bluntness, not a new
analysis class.** `nav-block-and-check`'s own design.md already accepted a known blind spot
(navigation hidden behind a shared helper) rather than building import-graph analysis
speculatively - "solving it well needs real examples of the failure mode first." The same
principle applies here: a regex over one Block file's own source text for
`Trait.visible("literal")`/`Trait.text("literal", ...)` (and the free-function equivalents)
catches the pattern actually found (40+ files, all in this exact shape) without a new,
heavier checking mechanism. `Trait.url(...)` is deliberately excluded - it takes a
`URLPatternInit`, never a DOM selector, so a literal there is not the pattern this warns
about.

**The orphan-Block gate is enforced in the agent's own instructions, not by making `check`
fail the build.** `waygraph check`'s orphan report already exists and already prints a clear
count; this change does not change its severity (still a warning, still exit code 0) because
other tooling already depends on that (`chain auto`'s own `requireNoOrphans` is the actual
build-failing gate, used deliberately only where orphans structurally block path-finding).
Instead, `waygraph-author.agent.md`'s own text is what treats a nonzero orphan count as
not-done - the right place for an authoring-workflow policy, not a global tool behavior
change that would affect every existing consumer of `check`.

**Proof stays inside this repository.** The two consumer projects this evidence came from are
real, separate, external projects - out of scope to edit per this session's own established
boundary (this package's own docs/roadmap/specs stay free of company-specific project
references and this session does not perform work inside those projects). Proof exercises
the same tooling and rules against `examples/saucedemo` and/or a scratch fixture inside this
repo instead - honestly labeled as demonstrating the mechanism works, not as re-verifying the
original two projects' own Block libraries improved (that would require a separate, later
session actually re-running the hardened skill against them).

## Risks / Trade-offs

- [The inline-selector regex could false-positive on a Block that has a genuine, one-off
  reason to inline a selector, or false-negative on a selector built via string
  concatenation/template literals] -> Accepted, matching the nav-escape check's own accepted
  blind spot (documented limitation, not silently glossed over) - revisit only if a real
  missed/false case turns up in practice.
- [`defineAssertBlock`'s `waitForHeading` shorthand won't fit every real assertion Block's
  arrival-detection need] -> A Block that needs something else stays a plain
  `defineMethodBlock` - `defineAssertBlock` is additive sugar for the common case, never the
  only way to write a self-loop assertion.
- [Hardening the agent-skill *instructions* does not retroactively fix any Blocks already
  generated by an agent following the old instructions] -> Explicitly out of scope (see
  Non-Goals) - a real, separate follow-up once this ships.
