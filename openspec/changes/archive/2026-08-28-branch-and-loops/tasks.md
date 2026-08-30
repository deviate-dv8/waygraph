## 1. Routing

- [x] 1.1 Add `next?(checkpoint: Out): Block<any, any> | null | undefined` to `Block` in `packages/core/src/types.ts`; verify existing Blocks (no `next`) still typecheck unchanged
- [x] 1.2 Implement `branch<In, Out>(block, routes)` in `packages/core/src/engine.ts` (exhaustive mapped type over `Out["__state"]`), attaching `next` without touching `instruction`; verify a `.ts` fixture confirms a missing route fails to compile
- [x] 1.3 Verify a unit test that `branch()` doesn't mutate or wrap the original Block's `act`/`resolve`/`verify` - only adds `next`

## 2. Iterating engine

- [x] 2.1 Rewrite `runGraph`'s body as a bounded loop: run `current`'s act/observe/resolve/verify, then `current = current.next?.(checkpoint)`, continue while `next` returns a Block, stop when it returns null/undefined; verify all 19 existing `@waygraph/core` tests still pass unmodified (no `next` means exactly one iteration, same as before)
- [x] 2.2 Add `maxSteps` parameter (default 5000) to `runGraph`; verify a unit test with a Block whose `next` always returns itself throws a named "exceeded N steps" error instead of hanging
- [x] 2.3 Verify a unit test that `branch()` correctly routes to different next Blocks depending on which tag was actually resolved (both branches of a real union Out)
- [x] 2.4 Verify a unit test that a self-loop (`next` returning the same Block) runs multiple times and terminates correctly once its own resolve reaches a tag with no route

## 3. Close-out

- [x] 3.1 `npm run typecheck` (whole workspace) passes with zero errors
- [x] 3.2 `npm test -w @waygraph/core` passes - all prior tests plus the new branch/loop tests
- [x] 3.3 Update `packages/core/README.md`'s "not yet implemented" list to remove `branch()`/`maxSteps`
