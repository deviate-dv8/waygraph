## 1. Trait and verify

- [x] 1.1 Add `Trait` interface (`{ name: string; check(page, mem): Promise<boolean> }`) to `packages/core/src/trait.ts`; verify it exports cleanly
- [x] 1.2 Add `verify?: Trait[]` to `Instruction` in `packages/core/src/types.ts`; verify a Block compiles with and without `verify`
- [x] 1.3 Wire verify execution into `runGraph` in `packages/core/src/engine.ts`, run once right after `resolve`, throwing an error naming the failing Trait and the Block; verify a unit test with a failing Trait throws an error containing both names, and a passing-Traits run proceeds normally
- [x] 1.4 Verify a unit test that verify's Traits cannot change which Checkpoint the run proceeds with (resolve's output is used regardless of verify's result, until/unless a Trait fails and aborts the run)

## 2. Engine, start/end, defineFlow

- [x] 2.1 Export `start` and `end` as `Symbol` sentinel values from `packages/core/src/engine.ts`
- [x] 2.2 Implement `Flow<In, Out>` (`{ run(context, mem): Promise<Out> }`)
- [x] 2.3 Implement `Engine` class with `defineFlow`, overloaded for chains of 1 through 6 Blocks (`[typeof start, Block<A,B>, end]` through `[typeof start, Block<A,B>, Block<B,C>, ..., Block<E,F>, end]`), composing the array via `connect()` internally; verify a `.ts` fixture confirms a broken adjacency in a `defineFlow` array fails to compile (mirroring the existing `connect()` type-test)
- [x] 2.4 Make `runGraph`'s `terminals` parameter optional; when omitted, skip the "not a registered terminal" check entirely; verify a unit test that omitting it lets any resolved Checkpoint through, and passing a `Set` still validates as before
- [x] 2.5 Implement `Flow.run()` using `runGraph` with `terminals` omitted; verify a unit test that a `defineFlow`-built Flow runs its Blocks in order and returns the last Block's output Checkpoint
- [x] 2.6 Export `Engine`, `Flow`, `start`, `end`, `Trait` from `packages/core/src/index.ts`

## 3. Rewrite the saucedemo proof-of-concept correctly

- [x] 3.1 Rewrite `project/saucedemo/tests/checkout-flow.spec.ts`'s four Blocks: move every `expect()`/assertion currently inside `observe` into `verify` instead; drop `observe` entirely from any Block that no longer needs it (none of the four actually branch, so none need evidence-gathering - only post-hoc confirmation)
- [x] 3.2 Rewrite the test itself to use `new Engine().defineFlow([start, LoginBlock, AddToCartBlock, CheckoutInfoBlock, FinishOrderBlock, end])` and `flow.run(context, mem)`, replacing the hand-nested `connect()`/`runGraph()` calls
- [x] 3.3 Verify the rewritten test passes against the real, live saucedemo.com (not a mock) - same real-site proof as before, now exercising `verify` and `defineFlow` for real

## 4. Close-out

- [x] 4.1 `npm run typecheck` (whole workspace) passes with zero errors
- [x] 4.2 `npm test` (whole workspace) passes - `@waygraph/core`'s existing 13 tests plus the rewritten saucedemo test
- [x] 4.3 Update `packages/core`'s `README.md` example to use `Engine.defineFlow` and `verify` instead of raw `connect()`/`runGraph()`
