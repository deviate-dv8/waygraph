## Why

A real 2-tab zsign demo (register in one tab, a spawned MailHog tab clicks the real
verify link, a `target=_blank` popup ends up as the dashboard survivor) proved the engine
works across tabs - but exposed four ways tab lifecycle is all-or-nothing:

1. `runGraph` always opened its own fresh tab via `context.newPage()` and always closed it
   in `finally` - a flow could never drive an already-open page, so it could never be the
   surviving tab. Only viable workaround was a throwaway anchor page just to read its
   `context()`.
2. `spawnTab(entry, page, mem)` takes a `Page` only to read `.context()` off it - the
   `page` argument is a hack, not a real dependency.
3. Popups opened by a `target=_blank` click (MailHog rewrites every email link that way)
   are invisible to the engine - they live and die outside waygraph's knowledge.
4. Lifecycle had no `closeOnFinish` knob at all; a caller could not keep a page open, hand
   off to a specific tab, or get a page handle back from a run.

This change removes #1, #2 (by making the honest `runGraph` support additive) and #4. #3
stays as a documented recipe for now, not an engine feature - see design.md.

## What Changes

- New additive, optional `options` arg on `Flow.run(context, mem, options?)` and
  `runGraph(...)`:
  - `options.page`: drive this already-open page instead of `context.newPage()`.
  - `options.closeOnFinish`: `false` hands the driven page back (and, when given as the
    literal `false`, changes the return type to `{ result, page }`); default stays
    close-on-finish to match every pre-existing call.
  - Additive only: existing positional signatures and `spawnTab(entry, page, mem)`
    are unchanged, so ~20 existing call sites (`zsign-all` + `saucedemo` specs) keep
    compiling untouched.
- New `RunGraphOptions` type, exported from the package barrel.
- New spec file `flow-run-tab-options/spec.md` covering additivity, drive-existing-page,
  keep-page-open + handle return.
- README recipe (docs only, like the action-block resolution): "Capture a popup" -
   `context`-level `page` event armed before a click expected to open one `target=_blank`
  tab, stored in the caller's own handle variable. No engine API added for #3.

## Capabilities

### New Capabilities
- `flow-run-tab-options`: `Flow.run` / `runGraph` accept an optional-additive options arg
  to drive an existing page and/or keep the page open afterwards.

### Modified Capabilities
- `engine-flow-definition` (Flow): `run` gains an `options` overload; the no-options path
  is byte-for-byte unchanged.

## Impact

- `src/engine.ts` (mid) - additive `RunGraphOptions` + overloaded `run`/`runGraph`; the
  change is already implemented in the WIP diff and proven by `tests/flow-run-options.spec.ts`.
- `src/index.ts` (tiny) - export `RunGraphOptions`.
- `tests/flow-run-options.spec.ts` (new) - 3 tests: drive given page, keep + hand back,
  no-options unchanged.
- `README.md` (small) - popup-capture recipe under "Developing this package / recipes".
- No change to `spawnTab`, `connect`, `composeBlock`, `Engine`, `Start`, or any Block
  authoring surface.