# src/ architecture - which file owns what

Read this before editing. The rules at the bottom are enforced by `npm run check:structure`.

## Layers (imports point downward only)

```text
cli.ts ───────────── ~100-line dispatcher: one `case` per subcommand
commands/*.ts, cli/*.ts ─ one file per subcommand; shared flag parsing, usage text, discovery helpers
runner/ ───────────── `waygraph run/demo/chain` execution; runner/inpage/*.js = code injected into the page (self-contained) (plain .js modules, exported as `waygraph/runner`)
auto-session.ts + auto-session/ (helpers, session), auto-session-ipc.ts, pilot*.ts, auto-explore*.ts, traverse-run.ts ─ live sessions / exploration
engine.ts + engine/ ── barrel over engine/{core,config,run-graph,flow,compose,engine-class,locate,blocks/*}: Blocks, Flows, Engine, MapBuilder, with* wrappers, runGraph, preflight
highlights.ts ────── demo narration: stubs, todo dock, device presets, pace, ring CSS
ui/ ────────────── overlay design tokens (tokens.ts) + CSS components (ring, cursor, banner) composed per surface (compose.ts); change a colour here, never inline
graph.ts, map-check.ts, practices-check.ts, coverage-gap.ts ─ static analysis / lint
types.ts, trait.ts, mem-page.ts, mem-stub.ts ─ core types and small primitives (no upward imports)
index.ts ─────────── the public API: re-exports only; nothing inside src/ imports it
```

`types.ts` sits *below* `engine.ts` and `highlights.ts` in the module graph. Never import an
engine/highlights runtime symbol into it.

## Where to put new code

| You are adding... | It goes in |
|---|---|
| A new CLI subcommand | `src/commands/<name>.ts` exporting `<name>Case(args, command)`, plus one `case` line in `cli.ts` and its lines in `cli/usage.ts` |
| A new CLI flag for run/demo | `cli/flags.ts` (`RunFlags`, `parseRunFlags`, `applyRunFlags`) + `cli/usage.ts` |
| A session command (`send`, `highlight`, ...) | `commands/session.ts` + `auto-session.ts` + IPC op in `auto-session-ipc.ts` |
| Demo overlay / step-mode behaviour | `src/runner/` - `overlay-install` (page UI), `step-panels`, `step-mode`, `rings`, `todo-dock`, `demo-log`, `seed-mem` (`--data`/`--mem-stub`). Read `CLI-STOMP-GUARD.md` first |
| A `with*(flow, ...)` wrapper | `engine/flow.ts`, next to `withTitle`; add the field to `Flow` and its `withBlockVerify`/`modBlockVerify` re-wraps |
| A `define*Block` helper | `engine/blocks/<kind>.ts`; update `MapBuilder` types if it can appear in a map flow |
| A `MapBuilder` step/routing method | `engine/engine-class.ts` next to `.method()`/`.branch()`; `.branch()`'s routes are functions handed a fresh `MapBuilder` seeded at the branch's own Checkpoint, not a ready-made `Flow` (a `Flow` always starts at `S`) |
| A `Trait` | `trait.ts` (+ `Trait` object + `index.ts` export) |
| Overlay colours / ring, cursor, banner, dock CSS | real `.css` in `src/ui/css/` (see its README) - built on Open Props, bundled into `dist/ui/overlay.css`, injected once into the Shadow DOM by `ui/shadow.ts` |
| Highlight/todo/device/pace behaviour | `highlights/<topic>.ts` |
| A new practice warning | `practices-check.ts` (kind, regex, label) + a fixture in `tests/fixtures/practices-check/` |

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
