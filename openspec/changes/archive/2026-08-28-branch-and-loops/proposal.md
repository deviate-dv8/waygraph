## Why

Every Block so far has a single output tag. Real flows branch (login succeeds vs. fails)
and sometimes repeat (poll until an email arrives, send N messages to test a rate limit).
Neither is expressible yet - `connect()` only accepts an exact tag match.

## What Changes

- `Block` gains an optional `next?(checkpoint: Out): Block<any, any> | null | undefined` -
  populated by `branch()`, left unset on plain/`connect()`-composed Blocks (unchanged,
  still terminal after one step - no behavior change for existing code).
- New `branch(block, routes)`: `routes` is an exhaustive mapped type over `Out`'s tags
  (missing a route is a compile error, same discipline as `connect()`'s tag matching).
  Attaches `next` to `block` without touching its `act`/`observe`/`resolve`/`verify`.
- `runGraph`/`Flow.run` become an iterating loop: run the current Block's full
  instruction, then follow `next` (if present) to the following Block, continuing until a
  Block has no `next`. A `next` pointing back to the same Block is a self-loop - the
  mechanism a repeating/polling Block uses, no separate "repeat" primitive needed.
- New `maxSteps` (default 5000) bounds the loop, throwing a named error past the limit -
  the one genuinely new safety mechanism, since nothing before this could loop at all.

## Capabilities

### New Capabilities
- `branching-and-loops`: `branch()`, self-loop routing, and the `maxSteps` safety cap.

### Modified Capabilities
- `waygraph-core`: `runGraph` becomes an iterating loop instead of a single pass (widening -
  a non-branching chain still runs exactly once, since it has no `next`).

## Impact

- `packages/core/src/types.ts` (`Block` gains `next`), `packages/core/src/engine.ts`
  (`branch()`, iterating `runGraph`, `maxSteps`).
- No change to `connect()`, `defineFlow`, `verify`, `MemPage` - all existing tests must
  still pass unmodified.
