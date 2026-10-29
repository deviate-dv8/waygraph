# src/ - where the code starts

Waygraph is an opinionated Playwright. **Blocks** are steps between **Checkpoints**; `map()` arranges Blocks into a
**Flow** (the timeline); the **engine** plays a Flow Block by Block with Playwright. `waygraph run` and `waygraph demo`
are two ways of playing the same steps: `run` plays them like a Playwright test, `demo` adds the waygraph UI around
each one.

The docs site (`docs/`) explains the features; this page is the code. There are two places to start reading it, one per
side:

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
  block/            block.ts (Block, Instruction, defineBlock, withVerify, stubs), some-block.ts (SomeBlock: any Block),
                    branch.ts, dialog.ts, action-page.ts,
                    compose.ts, kinds/ (nav, page, method, effect, api)
  flow/             flow.ts (Flow, buildFlow, settings), map-builder.ts (map()) + map-steps.ts (per-step checks) +
                    map-branch.ts, branch-regression.ts
  run/              run.ts (runGraph), connect.ts (joins Blocks), events.ts (run events), launch.ts, hooks.ts
  mem/              mem.ts (MemPage, keys), mem-stub.ts
  trait/            trait.ts (verify checks), selector.ts
  stub/             stub.ts (StubCtx: what a ctx stub can paint), ring.ts, todos.ts, viewport.ts, pace.ts
  env.ts (every WAYGRAPH_* variable), page-gone.ts, errors.ts, config.ts, locate.ts
runner/           waygraph run / demo, spawned inside the project (exported as waygraph/runner)
  runner.ts         plan -> session -> playSteps(mode)
  play-steps.ts     the one loop: seed mem, reset between episodes, mode.before, run the Block, mode.after / failed
  mode.ts           the Mode contract (before / after / failed / end) and PlayStep
  modes/            run.ts (no hooks), demo.ts (the stepper UI), report.ts (WAYGRAPH_JSON), branches.ts (--all-branches)
  plan/             plan.ts (spec -> steps), find.ts, spec.ts, seed-mem.ts
  options.ts, session.ts
demo/             everything the demo shows (layer: demo)
  stepper/          stepper.ts: around each step - panel-before.ts / panel-after.ts, step-panels.ts (failure panel), the Next
                    gate, pacing, slides, demo log
  overlay/          overlay.ts: rings, cursor, banner, caption, todos, device stage, network tab; inpage/ (code that runs
                    in the page, self-contained); ui/ (shadow root + the real .css bundle); locator-theater (the one fill/click
                    patch), reattach, beacon (overlay readiness); auto-chrome and pilot/ for the live sessions' overlay
  narration/        narration.ts: plays a Block's ctx stubs into rings, todos, device, title; stub-ctx, pace, style, todo dock
live/             driving a running browser, one folder per surface:
  auto/             auto.ts: `waygraph auto`, the explore loop; explore.ts (library, live menu), menu.ts (panel / terminal
                    picker), mem.ts (--data, mem stubs)
  auto-session/     auto-session.ts: a detached session (`browser start`); ipc.ts (socket server/client, spawn), files.ts
                    (metadata, sockets, stop), start.ts, open-browser.ts, inspect.ts (dom, storage), console.ts, helpers
  pilot/            pilot.ts: `pilot start` (session + graph + snapshot in one call); panel.ts (its overlay panel)
  traverse/         traverse.ts: `waygraph traverse`, the graph crawl; worker.ts (one worker's walk), coverage, lease
manifest/         manifest.ts: every Block, Flow and Checkpoint as JSON, from one scan (scan.ts, project.ts); maps.ts + pack.ts (map packages)
analysis/         graph, map-check, practices-check, check (validate, nav-escape, inline selectors), flow-source (list / nav), coverage-gap
runtime/          waygraph-config.ts (config/waygraph.config.ts), .env, full-launch + browser, extensions, web server, video folder,
                  run log, playwright config, global-flag (--config / --env)
cli/              cli.ts (the `waygraph <command>` dispatcher), commands/ (one file per command; session.ts hands browser.ts,
                  pilot.ts and session-ops.ts their parts), args (parseArgs tables), flags, usage, run-chain (spawns the runner)
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
the runtime through `engine/run/launch.ts` (`runtime/full-launch.ts`, loaded by `index.ts`, registers the full launcher).
`Engine.map()` builds a `MapBuilder`, and `MapBuilder.end()` calls back through a plain `BuildFlowFn`, so `engine.ts` and
`map-builder.ts` never import each other.

## Where to put new code

| You are adding... | It goes in |
|---|---|
| A new way to play steps (another mode) | a file in `runner/modes/` returning a `Mode`, picked in `runner/runner.ts` |
| Something the demo shows before / after a step | `demo/stepper/before.ts` / `after.ts`, called from `stepper.ts` |
| A CLI subcommand | `cli/commands/<name>.ts` exporting `<name>Case(args)` with its flags in an option table read by `parseCommand` (`cli/args.ts`), one `case` in `cli/cli.ts`, its lines in `cli/usage.ts` |
| A CLI flag for run / demo | a row in `RUN_OPTIONS` (`cli/flags.ts`: parsed and printed in the help from there), the variable it sets in `engine/env.ts`'s registry, and `runner/options.ts` reads it |
| A flow setting (`map({ … })`) | `MapBuilderOptions` in `engine/flow/map-builder.ts`, `FlowSettings` / `withSettings` in `engine/flow/flow.ts`, the field on `Flow` |
| A `define*Block` helper | `engine/block/kinds/<kind>.ts`; its step method in `map-builder.ts` if it can appear in a flow |
| A `Trait` | `engine/trait/trait.ts` (+ the `Trait` object + an `index.ts` export) |
| A session command (`send`, `highlight`, ...) | `cli/commands/session-ops.ts` + `live/auto-session/auto-session.ts` + an IPC op in `live/auto-session/ipc.ts` |
| Something a ctx stub can do (`ctx.<method>`) | its type in `engine/stub/stub.ts` (and `ring.ts` / `todos.ts` / `viewport.ts` / `pace.ts` for its data), its body in `demo/narration/stub-ctx.ts`; a `--codemod flows` rule in `cli/commands/codemod-stubs.ts` if it replaces an old form |
| Highlight / todo / device / pace behaviour | `demo/narration/<topic>.ts` |
| A `WAYGRAPH_*` variable | a row in `engine/env.ts` (its meaning; `docs/env.md` is generated from it), read with `envString` / `envFlag` / `envNumber` |
| Overlay markup (a panel, a badge) | in-page code that builds it with `__wgEl` / `__wgSet` / `__wgSvg` (`demo/overlay/ui/shadow.ts`); never an HTML string |
| Showing what a fill / click touches on a new surface | a `LocatorTheater` registered with `setLocatorTheater(page, theater)` (`demo/overlay/locator-theater.ts`); the demo's is `demo/stepper/interaction-patch.ts`, auto's is `demo/overlay/auto-chrome.ts` |
| A page call whose failure is expected | `.catch(ignorePageGone)` (the page went away) or `.catch(ignoreTimeout)` (a probe) from `engine/page-gone.ts` |
| Overlay colours, ring, cursor, banner, dock CSS | real `.css` in `demo/overlay/ui/css/` (see its README), bundled into `dist/demo/overlay/ui/overlay.css` |
| Keeping an overlay through navigation (redirects, reloads) | `demo/overlay/reattach.ts`: register the surface's repaint with `keepOverlayOnNavigation(page, repaint)`; demo, auto and pilot all do |
| A ring on any surface | `demo/overlay/inpage/core.ts`'s `__wgPaintRingAt` - the one ring painter for demo, auto and pilot |
| A new piece of overlay chrome (a chip, a panel, a toast) | give it an id, add the id to `SLOT_OF` in `demo/overlay/ui/shadow.ts` (which slot) and, if it shares a slot, an `order` in `ui/css/layout.css`; add it with `__wgAdd(el)`. Never `position: fixed` (check:structure rejects it outside the anchored stage) |
| A practice warning | `analysis/practices-check.ts` + a fixture in `tests/fixtures/practices-check/` |
| An engine error | `engine/errors.ts`: a `WG_<AREA>_<WHAT>` code with its where / means / fix; never reuse a shipped code |

## What a viewer (Waygraph UI) reads

Three sources, all public and typed; a viewer never reaches into internals:

| Source | What it gives | Where |
|---|---|---|
| The manifest (version 2) | the graph: Checkpoints (nodes), Blocks (edges, with kind, route, Mem keys), Flows (paths), Read Blocks (what each node can show, field shapes) | `buildManifest(projectDir)` / `waygraph manifest`, `manifest/manifest.ts` |
| Run events / run logs | what happened: each run's steps, their timing and errors, `step:read` (what each node showed), artifacts; one run id per call chain, so concurrent runs never mix | `onRunEvent`, `.waygraph/runs/*.jsonl`, `engine/run/events.ts` |
| The session protocol | live sessions: `hello`, `status`, `send`, `reach`, `read`, and `subscribe` (the live feed of events and snapshots) | `SessionRequest` / `SessionStreamMessage`, `requestSession`, `subscribeSession`, `live/auto-session/protocol.ts` |

One worker process per project: a project's Mem stubs and Read Blocks register in module-level registries, and runs read
their settings from `WAYGRAPH_*` env (per process). So a viewer that runs flows itself starts one worker process per
project (as the CLI's runner does), and never loads two projects into one process.

## Rules

Enforced: no file over 500 lines, no import cycles, the layer table above, no re-exports outside the package entries
(`src/index.ts`), no module that runs a call at import time (entries call `install…()` explicitly), no HTML
strings written into the page, `WAYGRAPH_*` variables only through `engine/env.ts` (its registry generates `docs/env.md`), no `.catch(() => {})` in Node
code (`engine/page-gone.ts`: `ignorePageGone` when the page went away, `ignoreTimeout` for a probe), no `any`, and no
non-null assertion (`x!`) in `engine/`. "Any Block, whatever its route" is `SomeBlock` (`engine/block/some-block.ts`):
every `Block<In, Out>` is one, so the runner, the graph and the tools hold Blocks without `any`; a route is checked
where it is written (`map()`, `composeBlock`'s and `connect`'s signatures) and joined with `joinSteps` /
`composeSteps` / `runSteps` after that. The overlay's in-page bridge (`window.__wg*` and its
payloads) is typed in `demo/overlay/ui/shadow-globals.d.ts`; the Node-side `page.__wg*` state in `demo/types.ts`.
Adding an `index.ts` export changes the public API: update `tests/unit/api-surface.snapshot.json` deliberately.

By convention:
- Code that runs inside `page.evaluate` (`demo/overlay/inpage/`) must be self-contained and is run from `tsc` output,
  never tsx/esbuild (its `__name` helper breaks serialization). In-page globals are typed in `demo/overlay/ui/shadow-globals.d.ts`.
- All overlay UI lives in one open shadow root (`#wg-root`, `demo/overlay/ui/shadow.ts`), inside one fixed layer, `#wg-ui`
  (`ui/css/layout.css`): its stage holds what follows a target (ring, label, cursor, veil, swipe), and its chrome is
  eight slots (top / middle / bottom row, left / center / right) where everything else stacks with a gap instead of
  overlapping. `__wgAdd(el)` puts an element in its slot (by id and `data-pos`); after changing `data-pos`, call
  `__wgAdd(el)` again before measuring it. One z-index scale, inside `#wg-ui` (`ui/css/theme.css`). In-page code uses
  `__wgById / __wgQ / __wgQA / __wgAdd`, and builds elements with `__wgEl / __wgSet / __wgIcon`: text is always a
  text node, never parsed as HTML (`check:structure` rejects `innerHTML` and the other HTML sinks).
- The overlay's look: one stylesheet, `demo/overlay/ui/css/` through Tailwind (`scripts/build-ui-css.mjs`). An element's
  look is Tailwind utilities where the builder makes it (`class: "material rounded-panel px-3"`); its states, keyframes
  and the slot layout are the component files there. Colours, type, radii and shadows are macOS tokens in `theme.css`
  (light and dark; `demo.appearance` pins one); icons are Phosphor, generated into `ui/icons.ts` (`npm run icons`).
  `check:structure` rejects a written colour, a stock palette class and a glyph used as an icon. `npm run storybook`
  shows every piece (`stories/`), painted by the real builders. CSS for the page itself (the device stage) is
  `ui/css/host.css`.
- The runner is spawned inside the target project, so `waygraph/runner` and Playwright resolve from the project's own
  install (two Playwright copies in one process is a hard error).
- The stepper keeps: Hide (`localStorage['wg-panel-hidden']`) across steps, Next on a collapsed panel, the todo dock
  outside `#wg-panel` (so Hide and `--mini` never hide it), and a `data-wg-ready` stamp on every modal root
  (`assertWgOverlayReady`, `tests/cli/overlay-beacon.spec.ts`).
- Never mix a move with an edit in one commit.
