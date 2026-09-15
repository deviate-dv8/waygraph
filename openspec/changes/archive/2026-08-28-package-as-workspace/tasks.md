## 1. Workspace scaffolding

- [x] 1.1 Create `packages/core/` directory tree (`src/`, `typecheck/`, `tests/`); verify directories exist
- [x] 1.2 Write root `package.json` with `workspaces: ["packages/*"]` and delegating `build`/`typecheck`/`test` scripts; remove root-level `src/`/`tests`/`type-tests` dependencies fields (they move to the package)
- [x] 1.3 Write `packages/core/package.json` as `@waygraph/core` with `main`/`types`/`exports` pointing at `dist/`, and its own `build`/`typecheck`/`test` scripts

## 2. Move and rewrite source

- [x] 2.1 Move `src/core/types.ts`, `mem-page.ts`, `engine.ts` to `packages/core/src/`; verify no other file still references the old `src/core/` path
- [x] 2.2 Rewrite `packages/core/src/index.ts` as a real barrel exporting `Checkpoint`, `Instruction`, `Block`, `connect`, `MemKey`, `key`, `MemPage`, `runGraph`
- [x] 2.3 Move `tsconfig.json` and `playwright.config.ts` to `packages/core/`; add `packages/core/tsconfig.build.json` (extends base, `include: src/**/*.ts` only, sets `outDir`/`rootDir`/`declaration`)

## 3. Move and rewrite tests

- [x] 3.1 Move `type-tests/*.ts` to `packages/core/typecheck/*.ts`, updating relative imports for the flattened `src/` layout
- [x] 3.2 Move `tests/*.ts` to `packages/core/tests/*.ts`, updating relative imports for the flattened `src/` layout

## 4. Verify

- [x] 4.1 `npm install` from the workspace root succeeds
- [x] 4.2 `npm run typecheck -w @waygraph/core` passes with zero errors
- [x] 4.3 `npm test -w @waygraph/core` passes all 13 existing tests
- [x] 4.4 `npm run build -w @waygraph/core` produces `packages/core/dist/index.js` and `index.d.ts`
- [x] 4.5 Update root `README.md` for the new package layout and paths
