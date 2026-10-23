# src/ - where the code starts

Waygraph is an opinionated Playwright. **Blocks** are steps between **Checkpoints**; `map()` arranges Blocks into a
**Flow** (the timeline); the **engine** plays a Flow Block by Block with Playwright. `waygraph run` and `waygraph demo`
are two ways of playing the same steps: `run` plays them like a Playwright test, `demo` adds the waygraph UI around
each one.

A high-level tour with pictures is the Obsidian vault in `obsidian/` (open the folder as a vault; start at
`Start Here.md`). There are two places to start reading the code, one per side:

| You want to know... | Start at | It reads as |
|---|---|---|
| How a flow is built and run (authoring) | `engine/engine.ts` | Blocks (`block/`) between Checkpoints (`checkpoint/`) -> `map()` (`flow/map-builder.ts`) -> a Flow (`flow/flow.ts`) -> `runGraph` (`run/run.ts`): precondition, act, observe, resolve, verify |
| What `waygraph run` / `demo` does (running) | `cli/cli.ts` -> `runner/runner.ts` | parse the spec into steps (`runner/plan/plan.ts`) -> open a browser (`runner/session.ts`) -> one loop (`runner/play-steps.ts`) plays each step through the engine with a mode around it (`runner/modes/`) |

Every folder is one feature. Its main file is named after the folder and reads top to bottom; the other files in the
folder are its parts. Import from the file that declares a thing - there are no barrels (`src/index.ts`, the published
package API, is the only file that re-exports).

## The folders

```text
engine/           the engine (layer: engine - imports nothing outside engine/)
  engine.ts         Engine + map(): the authoring story
  checkpoint/       checkpoint.ts (the Checkpoint value), route.ts (a Block's from/to)
  block/            block.ts (Block, Instruction, defineBlock, withVerify, stubs), compose.ts, kinds/ (nav, page, method, effect, api)
  flow/             flow.ts (Flow, buildFlow, settings), map-builder.ts (map()), branch-regression.ts
  run/              run.ts (runGraph), connect.ts (joins Blocks), events.ts (run events), launch.ts, hooks.ts
  mem/              mem.ts (MemPage, keys), mem-stub.ts
  trait/            trait.ts (verify checks), selector.ts
  narration.ts, errors.ts, config.ts, locate.ts
runner/           waygraph run / demo, spawned inside the project (exported as waygraph/runner)
  runner.ts         plan -> session -> playSteps(mode)
  play-steps.ts     the one loop: seed mem, reset between episodes, mode.before, run the Block, mode.after / failed
  mode.ts           the Mode contract (before / after / failed / end) and PlayStep
  modes/            run.ts (no hooks), demo.ts (the stepper UI), report.ts (WAYGRAPH_JSON), branches.ts (--all-branches)
  plan/             plan.ts (spec -> steps), find.ts, spec.ts, seed-mem.ts
  options.ts, session.ts
demo/             everything the demo shows (layer: demo)
  stepper/          stepper.ts: the panels before / after each step, the Next gate, pacing, slides, demo log
  overlay/          overlay.ts: rings, cursor, banner, caption, todos, device stage, network tab; inpage/ (code that runs
                    in the page, self-contained); ui/ (shadow root + the real .css bundle); auto-chrome and pilot-* for live sessions
  narration/        narration.ts: plays a Block's ctx stubs into rings, todos, device, title; stub-ctx, pace, style, todo dock
live/             driving a running browser: auto-session/ (auto-session.ts), auto-session-ipc, browser, pilot, traverse/ (traverse.ts)
manifest/         manifest.ts: every Block, Flow and Checkpoint as JSON, from one scan (scan.ts, project.ts); maps.ts + pack.ts (map packages)
analysis/         graph, map-check, practices-check, check (validate, nav-escape, inline selectors), source (list / nav), coverage-gap
runtime/          config.ts (waygraph.config.ts), .env, browser launch, extensions, web server, video folder, run log, playwright config
cli/              cli.ts (the `waygraph <command>` dispatcher), commands/ (one file per command), flags, usage, run-chain (spawns the runner)
index.ts          the public API
```

## Layers (enforced by `npm run check:structure`)

| Layer | May import |
|---|---|
| `engine` | engine |
| `manifest` | engine, manifest |
| `analysis` | engine, manifest, analysis |
| `runtime` | engine, runtime |
| `demo` | engine, runtime, demo |
| `live` | engine, manifest, analysis, runtime, demo, live |
| `cli` (cli/, runner/) and `index.ts` | anything |

The engine never imports the demo or runtime: the demo plugs in through `engine/run/hooks.ts` (the network panel) and
the runtime through `engine/run/launch.ts` (`runtime/launch.ts`, loaded by `index.ts`, registers the full launcher).
`Engine.map()` builds a `MapBuilder`, and `MapBuilder.end()` calls back through a plain `BuildFlowFn`, so `engine.ts` and
`map-builder.ts` never import each other.

## Where to put new code

| You are adding... | It goes in |
|---|---|
| A new way to play steps (another mode) | a file in `runner/modes/` returning a `Mode`, picked in `runner/runner.ts` |
| Something the demo shows before / after a step | `demo/stepper/before.ts` / `after.ts`, called from `stepper.ts` |
| A CLI subcommand | `cli/commands/<name>.ts` exporting `<name>Case(args)`, one `case` in `cli/cli.ts`, its lines in `cli/usage.ts` |
| A CLI flag for run / demo | `cli/flags.ts` (sets a WAYGRAPH_* variable) and `runner/options.ts` (reads it) + `cli/usage.ts` |
| A flow setting (`map({ … })`) | `MapBuilderOptions` in `engine/flow/map-builder.ts`, `FlowSettings` / `withSettings` in `engine/flow/flow.ts`, the field on `Flow` |
| A `define*Block` helper | `engine/block/kinds/<kind>.ts`; its step method in `map-builder.ts` if it can appear in a flow |
| A `Trait` | `engine/trait/trait.ts` (+ the `Trait` object + an `index.ts` export) |
| A session command (`send`, `highlight`, ...) | `cli/commands/session.ts` + `live/auto-session/auto-session.ts` + an IPC op in `live/auto-session-ipc.ts` |
| Highlight / todo / device / pace behaviour | `demo/narration/<topic>.ts` |
| Overlay colours, ring, cursor, banner, dock CSS | real `.css` in `demo/overlay/ui/css/` (see its README), bundled into `dist/demo/overlay/ui/overlay.css` |
| A ring on any surface | `demo/overlay/inpage/core.ts`'s `__wgPaintRingAt` - the one ring painter for demo, auto and pilot |
| A practice warning | `analysis/practices-check.ts` + a fixture in `tests/fixtures/practices-check/` |
| An engine error | `engine/errors.ts`: a `WG_<AREA>_<WHAT>` code with its where / means / fix; never reuse a shipped code |

## Rules

Enforced: no file over 800 lines, no import cycles, the layer table above, no re-exports outside `src/index.ts`.
Adding an `index.ts` export changes the public API: update `tests/unit/api-surface.snapshot.json` deliberately.

By convention:
- Code that runs inside `page.evaluate` (`demo/overlay/inpage/`) must be self-contained and is run from `tsc` output,
  never tsx/esbuild (its `__name` helper breaks serialization). In-page globals are typed in `demo/overlay/ui/shadow-globals.d.ts`.
- All overlay UI lives in one open shadow root (`#wg-root`, `demo/overlay/ui/shadow.ts`); in-page code uses
  `__wgById / __wgQ / __wgQA / __wgAdd / __wgCss`. CSS for the host page (the device stage) is `HOST_CSS` in `demo/overlay/overlay-css.ts`.
- The runner is spawned inside the target project, so `waygraph/runner` and Playwright resolve from the project's own
  install (two Playwright copies in one process is a hard error). Read `CLI-STOMP-GUARD.md` before changing the stepper.
- Never mix a move with an edit in one commit.
