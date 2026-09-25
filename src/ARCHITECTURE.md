# src/ architecture - which file owns what

Read this before editing. The rules at the bottom are enforced by `npm run check:structure`.

## Layers (imports point downward only)

```text
cli.ts ───────────── command line (flags, usage, subcommands)
runner/ ───────────── `waygraph run/demo/chain` execution (plain .js modules, exported as `waygraph/runner`)
auto-session*.ts, pilot*.ts, auto-explore*.ts, traverse-run.ts ─ live sessions / exploration
engine.ts ────────── Blocks, Flows, Engine, MapBuilder, with* wrappers, runGraph, preflight
highlights.ts ────── demo narration: stubs, todo dock, device presets, pace, ring CSS
graph.ts, map-check.ts, practices-check.ts, coverage-gap.ts ─ static analysis / lint
types.ts, trait.ts, mem-page.ts, mem-stub.ts ─ core types and small primitives (no upward imports)
index.ts ─────────── the public API: re-exports only; nothing inside src/ imports it
```

`types.ts` sits *below* `engine.ts` and `highlights.ts` in the module graph. Never import an
engine/highlights runtime symbol into it.

## Where to put new code

| You are adding... | It goes in |
|---|---|
| A new CLI subcommand | its own file (today: `cli.ts` `main()` switch; being split into `src/commands/`) |
| Demo overlay / step-mode behaviour | `src/runner/` - `overlay-install` (page UI), `step-panels`, `step-mode`, `rings`, `todo-dock`, `demo-log`, `seed-mem` (`--data`/`--mem-stub`). Read `CLI-STOMP-GUARD.md` first |
| A `with*(flow, ...)` wrapper | `engine.ts`, next to `withTitle`; add the field to `Flow` and its `withBlockVerify`/`modBlockVerify` re-wraps |
| A `define*Block` helper | `engine.ts` block-factory section; update `MapBuilder` types if it can appear in a map flow |
| A `Trait` | `trait.ts` (+ `Trait` object + `index.ts` export) |
| Highlight/todo/device/pace behaviour | `highlights.ts` |
| A new practice warning | `practices-check.ts` (kind, regex, label) + a fixture in `tests/fixtures/practices-check/` |
| A session command (`send`, `highlight`, ...) | `cli.ts` shared session block + `auto-session.ts` + IPC op in `auto-session-ipc.ts` |

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
