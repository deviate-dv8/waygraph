## Why

`ROADMAP.md`'s "Agent-authoring tooling and Waygraph Copilot" section documents two real
defect classes found this session by running `waygraph check` against real pre-skill
consumer projects, not hypotheticals: a Method that silently drives an entire multi-step
wizard (clear storage, reload, then a bounded retry loop) inside one opaque Block - the
"teleporting" / multi-action-per-Block anti-pattern - and a second project with **98 orphan
Blocks** (built, never wired into a `defineFlow`, invisible to `auto`/`traverse`). A further
convergent finding: that same project also has **40+ near-identical self-loop
`assert-*.method.block.ts` files**, each hand-writing the same `act`/`resolve` boilerplate
around a `verify` array of raw inline selector strings - the exact `*Sel` gap this session's
own `examples/saucedemo` cleanup fixed, at larger scale and higher risk (long compound
Playwright chain-locators, not simple ids).

This is Phase 4 of that roadmap: closing the gap between "we found these defect classes" and
"the agent skill that generates Block code actually avoids them," plus giving the 40+-file
pattern real engine sugar instead of leaving every author to hand-write the same three lines
forty more times.

## What Changes

- New `defineAssertBlock(options)` in `src/engine.ts` (exported from `src/index.ts`): sugar
  over `defineMethodBlock<Checkpoint<string>, Checkpoint<string>>` for the self-loop-only
  "pure assertion" shape - a name, a `checkpoint` tag, an optional `waitForHeading` shorthand
  (the `act` every one of those 40+ files hand-writes: wait for a heading, then let `verify`
  do the real work), and a `verify` array. `resolve` is generated internally from the one
  `checkpoint` tag given, closing the copy/rename footgun where a hand-restated checkpoint
  string can silently drift wrong across a duplicated file.
- `waygraph check` gains a second, independent warning (alongside its existing nav-escape
  sweep): a Block's `verify` array containing an inline literal selector string (a bare
  string argument to `Trait.visible(...)`/`Trait.text(...)`, not an identifier) is flagged,
  naming the file - the same text-scoped-to-one-file scanning technique the existing
  nav-escape check already uses, not a new analysis class.
- `templates/agents/waygraph-author.agent.md` gains: an explicit "one distinct action per
  Block" hard rule (the exact rule that would have caught the wizard-walking anti-pattern
  above), pointing at `examples/saucedemo`'s own fill-username/fill-password/submit-login
  split as the canonical example; and an orphan-Block self-gate in its "Verify locally"
  section - the agent must run `waygraph check .` and confirm zero orphan Blocks (not just
  typecheck/build) before calling itself done.
- `templates/agents/waygraph-planner.agent.md` gains a "blind mode" workflow section for
  when there is no frontend source to read - using the already-shipped Phase 1-3 tools
  (`auto --cli --detach`/`send`/`status`/`dom`/`trace`) to discover the app's real structure
  instead of "read the app router."
- Proof is scoped honestly to what this repo can actually verify: the two real consumer
  projects this evidence came from are separate, external projects, not fixtures in this
  repo's own test suite, and are explicitly out of scope to edit (per this session's own
  established boundary against embedding company-specific project references and work in
  this package's own repo). Proof instead exercises the new rules/tooling against
  `examples/saucedemo` and/or a scratch fixture inside this repo: a `defineAssertBlock`
  built from the pattern, a deliberately-inlined-selector Block to prove the new `waygraph
  check` warning fires, and confirmation that `waygraph-author.agent.md`'s own new
  self-gate instructions describe a real, runnable command sequence.

## Capabilities

### New Capabilities
- `waygraph-agent-skill-hardening`: a `defineAssertBlock` engine helper, a `*Sel`-enforcement
  warning in `waygraph check`, and hardened agent-skill instructions (one-action-per-Block,
  orphan-Block self-gate, blind-mode discovery workflow) that together close the defect
  classes this roadmap phase exists to prevent.

## Impact

- `src/engine.ts` (small) - `defineAssertBlock`, `AssertBlockOptions` type.
- `src/index.ts` (tiny) - export `defineAssertBlock`, `AssertBlockOptions`.
- `src/cli.ts` (small) - second warning class inside the existing `check` command's file
  walk, alongside the existing nav-escape scan.
- `templates/agents/waygraph-author.agent.md` - new hard rule + updated "Verify locally".
- `templates/agents/waygraph-planner.agent.md` - new "blind mode" section.
- `tests/` - new spec(s) covering `defineAssertBlock`'s generated `act`/`resolve` and the new
  `check` warning (fires on an inline selector, silent on a `*Sel`-referencing one).
- `README.md` / `examples/saucedemo/docs/HELPERS.md` - document `defineAssertBlock` alongside
  the existing Page/Method/Effect/Nav helper table.
- No change to `waygraph-auto`'s session/RPC surface (Phases 1-3), `waygraph-demo`, or
  `waygraph-traverse`. Does not touch any external consumer project.
