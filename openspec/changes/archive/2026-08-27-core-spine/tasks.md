## 1. Package setup

- [x] 1.1 Init `package.json` (name `waygraph`, private, ESM, TypeScript) with `@playwright/test` as a peer dependency and `typescript` as a dev dependency; verify `npm install` succeeds with no errors
- [x] 1.2 Add `tsconfig.json` with `strict: true` and no implicit `any`; verify `npx tsc --noEmit` runs cleanly on an empty `src/`
- [x] 1.3 Create `src/core/` directory and a `src/index.ts` barrel file; verify the file tree matches the layout in the beta design (`core/types.ts`, `core/mem-page.ts`, `core/engine.ts`)
- [x] 1.4 Add `npm test` wired to a test runner (Playwright's own `@playwright/test` runner is sufficient - no separate framework needed); verify `npm test` invokes the configured runner correctly (Playwright's runner exits non-zero with "No tests found" on an empty suite by design - confirmed that's the only error with zero test files present, not a config/crash error)

## 2. Checkpoint and typed memory

- [x] 2.1 Implement `Checkpoint<Tag extends string>` in `src/core/types.ts` exactly as `{ readonly __state: Tag }`; verify a `.ts` fixture confirms two Checkpoints with the same literal tag are assignable to each other and a mismatched tag is a compile error
- [x] 2.2 Implement `MemKey<T>` and `key<T>()` in `src/core/mem-page.ts` per design.md (phantom field, never assigned); verify `mem.get(someKey)` infers the correct type with no cast, checked via a `.ts` fixture
- [x] 2.3 Implement `MemPage` (`get`, `set`, `update`) keyed by `MemKey` object identity; verify a unit test that `get` after `set` returns the exact value written
- [x] 2.4 Verify a unit test that `get` on a key that was never `set` throws an error whose message includes that key's `name`

## 3. Instruction, Block, and connect()

- [x] 3.1 Implement the `Instruction<In, Out, Observed>` interface in `src/core/types.ts` with `act` (required), `observe` (optional), `resolve` (required, receiving only `observed` - no `page` or `mem` parameter); verify a `.ts` fixture confirms `resolve`'s implementation has no `page`/`mem` identifiers in scope (a reference to either is a compile error)
- [x] 3.2 Implement `Block<In, Out>` as `{ name: string; instruction: Instruction<In, Out, any> }`; verify a fixture Block compiles with only `act` + `resolve` (no `observe`)
- [x] 3.3 Implement `connect<A, B, C>(a: Block<A, B>, b: Block<B, C>): Block<A, C>` in `src/core/types.ts`; verify a unit test that running the composed Block's `act`/`resolve` in sequence produces `b`'s output, and a `.ts` fixture confirms connecting Blocks with mismatched tags is a compile error
- [x] 3.4 Verify a unit test that a Block with no `observe` still produces a valid output Checkpoint when run

## 4. The engine

- [x] 4.1 Implement `runGraph<TOut>(entry, terminals, context, mem)` in `src/core/engine.ts` per design.md: create the page, run `entry`'s full instruction (`act` → `observe?` → `resolve`) once, close the page in `finally`. No `next`/loop yet - `connect()` already pre-composes the whole chain into `entry` as one Block, and branching (which would need a loop) is out of scope for this change per design.md Non-Goals; verify a unit test using a fake `BrowserContext`/`Page` double confirms the page is created before `act` runs and closed exactly once afterward (including when a step throws)
- [x] 4.2 Verify a unit test that `runGraph` returns the terminal Checkpoint value (not `void`, not a fixed placeholder tag) once a registered terminal tag is reached
- [x] 4.3 Verify an integration test, run against a real Playwright browser and a local static HTML fixture (e.g. a two-field form served from a `data:` URL or a tiny fixture server), that a 3-Block chain (`goto` → `fill` → `submit`, each a Tier-0 Block with only `act`+`resolve`) drives the real page and `runGraph` returns the expected terminal Checkpoint

## 5. Close-out

- [x] 5.1 Verify `npx tsc --noEmit` passes with zero errors across the whole `src/` tree
- [x] 5.2 Verify `npm test` passes, covering every scenario listed in `specs/waygraph-core/spec.md`
- [x] 5.3 Write a short `README.md` at the package root showing the Tier-0 example from tasks 4.3, and noting that branching/traits/guardrails/spawnTab are tracked as separate follow-up OpenSpec changes, not yet implemented
