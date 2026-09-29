# src/ architecture - which file owns what

Read this before editing. The rules at the bottom are enforced by `npm run check:structure`.

## Layers (imports point downward only)

```text
cli.ts ───────────── ~100-line dispatcher: one `case` per subcommand
commands/*.ts, cli/*.ts ─ one file per subcommand; shared flag parsing, usage text, discovery helpers
runner/ ───────────── `waygraph run/demo/chain` execution; runner/inpage/*.js = code injected into the page (self-contained) (plain .js modules, exported as `waygraph/runner`)
auto-session.ts + auto-session/ (helpers, session) ─ the session class itself
session/ (auto-session-ipc, browser, pilot, auto-explore, auto-explore-run, block-inject, overlay-beacon) ─ live session spawn/control, explore, cross-project inject
traverse/ (run, coverage, lease) ─ live parallel graph exploration with session cloning (`waygraph traverse`)
core.ts + core/ ── barrel over core/{block,config,run-graph,flow,compose,engine,map-builder,locate,branch-regression,blocks/*}: Blocks, Flows, Engine, MapBuilder, with* wrappers, runGraph, preflight
highlights.ts + highlights/ (types, style, device, demo-pace, todo-dock, merge, stub-ctx, run-phase, css, shorthand) ── demo narration: stubs, todo dock, device presets, pace, ring CSS
ui/ ────────────── real .css overlay stylesheet built on Open Props, bundled by scripts/copy-ui-css.mjs into dist/ui/overlay.css and injected once by ui/shadow.ts - see src/ui/css/README.md; change a colour in ui/css/tokens.css, never inline
analysis/ (graph, map-check, practices-check, coverage-gap) ─ static analysis / lint
types.ts, trait.ts, mem-page.ts, mem-stub.ts, errors.ts ─ core types and small primitives (no upward imports)
index.ts ─────────── the public API: re-exports only; nothing inside src/ imports it
```

`types.ts` sits *below* `core.ts` and `highlights.ts` in the module graph. Never import a
core/highlights runtime symbol into it.

`core/engine.ts` (the `Engine` class) and `core/map-builder.ts` (`MapBuilder` + the standalone
`map()`) are two files, not one, despite being mutually referential at the type level:
`Engine.map()` builds a `MapBuilder`, and `MapBuilder.end()` calls back into `defineFlow`.
`MapBuilder` only depends on a plain `DefineFlowFn` function type, never on `Engine` the class -
that's what makes the split legal under the no-cycles rule. Don't reintroduce a direct
`Engine`/`MapBuilder` type dependency in either direction.

## Where to put new code

| You are adding... | It goes in |
|---|---|
| A new CLI subcommand | `src/commands/<name>.ts` exporting `<name>Case(args, command)`, plus one `case` line in `cli.ts` and its lines in `cli/usage.ts` |
| A new CLI flag for run/demo | `cli/flags.ts` (`RunFlags`, `parseRunFlags`, `applyRunFlags`) + `cli/usage.ts` |
| A session command (`send`, `highlight`, ...) | `commands/session.ts` + `auto-session.ts` + IPC op in `auto-session-ipc.ts` |
| Demo overlay / step-mode behaviour | `src/runner/` - `overlay-install` (page UI), `step-panels`, `step-mode`, `rings`, `todo-dock`, `demo-log`, `seed-mem` (`--data`/`--mem-stub`). Read `CLI-STOMP-GUARD.md` first |
| A `with*(flow, ...)` wrapper | `core/flow.ts`, next to `withTitle`; add the field to `Flow` and its `withBlockVerify`/`modBlockVerify` re-wraps |
| A `define*Block` helper | `core/blocks/<kind>.ts`; update `MapBuilder` types if it can appear in a map flow |
| A `MapBuilder` step/routing method | `core/map-builder.ts` next to `.method()`/`.branch()`; `.branch()`'s routes are functions handed a fresh `MapBuilder` seeded at the branch's own Checkpoint, not a ready-made `Flow` (a `Flow` always starts at `S`). Every step method also takes `opts?: MapStepOpts` for the inline `{ ff: true }` flag - see `appendStep`'s own comment for the auto-open/auto-close rules |
| An `Engine` method (`defineFlow`/`map`) | `core/engine.ts` - keep it depending only on `DefineFlowFn`/`MapBuilderOptions` (types) from `map-builder.ts`, never a value-level import of `MapBuilder` beyond that |
| Regression-running a `.branch()` tree | `core/branch-regression.ts` (`branchRoutes`/`collectBranchFlows`/`runBranchRegression`) - clones the real session (storageState + URL) at each branch point so every route runs from a genuine copy of the live state; `cloneSession: false` opts out to one shared session. `__wgBranch` is an ordinary enumerable field so `with*` spreads carry it. CLI: `waygraph run --blocks <flow> --all-branches[--shared-session]` (wired in `runner/main.js`'s `runAllBranchesMode`) |
| A `Trait` | `trait.ts` (+ `Trait` object + `index.ts` export) |
| Overlay colours / ring, cursor, banner, dock CSS | real `.css` in `src/ui/css/` (see its README) - built on Open Props, bundled into `dist/ui/overlay.css`, injected once into the Shadow DOM by `ui/shadow.ts` |
| A highlight ring on ANY surface | `runner/inpage/core.js`'s `__wgPaintRingAt(ringId, labelId, box, label, tone, style)` + `runner/rings.js`'s `showRingAt`/`hideRingAt`/`removeRingAt` (Node-side) - the ONE ring implementation. `#wg-ring`/`#wg-ring-label` (demo/auto's singleton "current action" ring, via `showRing`/`__wgPositionRing`) and Pilot's several simultaneous fixture rings (`#wg-fx-ring-<n>`, via `showPilotFixtures`) both paint through it - don't add a third, surface-specific ring painter |
| Highlight/todo/device/pace behaviour | `highlights/<topic>.ts` |
| A new practice warning | `practices-check.ts` (kind, regex, label) + a fixture in `tests/fixtures/practices-check/` |
| A selector helper (`css`/`byText`/`byRole`) | `selector.ts` - thin string builders only, no new selector type; a full generated `*Sel` registry is backlogged |
| An engine error a caller might need to branch on / look up | `errors.ts` - add a `WG_<AREA>_<WHAT>` code + its `where`/`means`/`fix` entry, `throw new WaygraphError(code, message)` at the real throw site. Never reuse or repurpose a shipped code. |

## Rules (enforced)

1. **No `src/` file over 800 lines.** A few legacy files are on a shrinking ratchet in
   `scripts/check-structure.mjs`; lower the number when you shrink one, never raise it.
2. **No circular value imports.** Import from the module that owns the symbol, never from
   `./index.js` (the barrel) inside `src/`.
3. **`index.ts` is re-exports only.** Adding an export changes the public API: update
   `tests/unit/api-surface.snapshot.json` deliberately.

## Rules (by convention)

- One concern per file. If a new function doesn't fit an existing file's concern, make a new file.
- Don't append to a barrel. Add a module, then re-export it.
- Code that runs inside `page.evaluate` must be self-contained (no closure over module scope) and
  is executed from `tsc` output, never tsx/esbuild (its `__name` helper breaks serialization).
- Never mix a move with an edit in one commit.

## The runner (how `waygraph run/demo` executes)

`cli.ts` writes a 2-line bootstrap into the *target project* and spawns it, so `waygraph/runner`
(and the engine + Playwright it imports) resolve from the project's own install - never the CLI's
copy (two Playwright copies in one process is a hard error). Runner modules are plain `.js`
(no type-check yet); `scripts/copy-runner.mjs` copies them to `dist/runner/` after `tsc`. They
were moved verbatim out of a 6,000-line template string, so they're ripe for typing one module at
a time. No shared mutable module state: safe to edit one module in isolation.

## Overlay DOM lives in a shadow root

All overlay UI (rings, banner, panels, docks, cursor, pilot badge) is mounted in one open shadow root
(`#wg-root`, see `ui/shadow.ts`). In in-page overlay code use `__wgById / __wgQ / __wgQA / __wgAdd / __wgCss`
instead of `document.getElementById / querySelector / documentElement.appendChild / addStyleTag`.
Lookups fall back to the light DOM. CSS that must style the HOST page (device-stage `html`/`#wg-device-shell`)
goes in `HOST_CSS` (runner/overlay-css.js), everything else in the shadow-mounted `RING_CSS`.
Playwright locators (`#wg-panel`, ...) pierce open shadow roots, so specs keep working.
