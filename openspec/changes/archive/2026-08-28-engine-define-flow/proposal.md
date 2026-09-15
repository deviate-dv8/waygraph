## Why

`core-spine` shipped the mechanics (`connect()`, `runGraph()`) but not the two pieces that
make Waygraph feel like Waygraph instead of plain Playwright with extra typing: a
declarative way to define a flow (`Engine.defineFlow([start, ...blocks, end])`, from the
original design), and `verify`/`Trait` - the post-resolve confirmation phase. Without
`verify`, the saucedemo proof-of-concept ended up stuffing `expect()` calls into `observe`,
which is exactly the phase-conflation the four-phase lifecycle was designed to prevent.

## What Changes

- New `Trait` primitive (`{ name, check(page, mem): Promise<boolean> }`) and `verify?:
  Trait[]` on `Instruction` - checked once, right after `resolve`, naming the failing trait
  and Block if a check fails.
- New `Engine` class with `defineFlow(blocks)`, returning a `Flow<In, Out>` with `.run(context,
  mem)`. `start`/`end` are real exported sentinel values, used to bookend a flow definition.
- `defineFlow` composes the array via the existing `connect()` internally (no new runtime
  chaining logic) and is typed via overloads for chains of 1-6 Blocks, each overload
  reusing the exact `Block<A,B>` pairwise-tag-matching `connect()` already relies on.
- `runGraph`'s `terminals` parameter becomes optional - omitting it skips the terminal-tag
  check, which `Flow.run()` relies on internally (a `defineFlow`-built chain has exactly one
  reachable outcome by construction, no branching exists yet, so there is nothing to
  validate against).
- Rewrite the saucedemo proof-of-concept's four Blocks to use `verify` instead of stuffing
  assertions into `observe`; none of them end up needing `observe` at all.

## Capabilities

### New Capabilities
- `engine-flow-definition`: `Engine`/`defineFlow`/`start`/`end`/`Flow` - declarative,
  type-checked flow composition and execution.
- `verify-trait`: the `Trait` primitive and `verify` phase - post-resolve, named,
  composable assertions.

### Modified Capabilities
- `waygraph-core`: `runGraph`'s `terminals` parameter becomes optional (widening, not
  breaking - existing callers passing a `Set` are unaffected).

## Impact

- `packages/core/src/types.ts` (`Instruction` gains `verify`), `packages/core/src/trait.ts`
  (new), `packages/core/src/engine.ts` (`Engine`, `start`, `end`, `Flow`, `runGraph`
  signature widened), `packages/core/src/index.ts` (new exports).
- `project/saucedemo/tests/checkout-flow.spec.ts` rewritten to use `Engine.defineFlow` and
  `verify` instead of raw `connect()`/`runGraph` and `observe`-as-assertion.
