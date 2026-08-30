## Why

Core spine code lived in a flat `src/` with no package boundary of its own, and
`type-tests/` was a name nobody liked. Pure restructuring, no behavior change.

## What Changes

- Convert to an npm workspaces monorepo: root `package.json` gains `workspaces:
  ["packages/*"]`.
- Move `src/core/*` into `packages/core/src/*` (flattened - `core` is now the package
  itself, not a subfolder inside it) as its own package, `@waygraph/core`, with its
  own `package.json`, `build`/`typecheck`/`test` scripts, and a real `dist/index.js`
  entrypoint.
- Rename `type-tests/` to `typecheck/`, moved under `packages/core/`.
- Move `tests/`, `tsconfig.json`, `playwright.config.ts` under `packages/core/`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none - no spec-level behavior changes; `skip_specs: true` set in `.openspec.yaml`)

## Impact

- Every existing file under `src/`, `tests/`, `type-tests/` moves; import paths inside
  them update to match. No public API behavior changes - same exports, same tests,
  same passing assertions, just repackaged.
