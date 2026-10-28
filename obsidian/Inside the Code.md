---
tags:
  - waygraph
  - code
aliases:
  - Source layout
  - Where the code starts
---

# Inside the code

> [!tip] Where it starts
> - **Building flows** (what a project author touches): `src/engine/engine.ts`
> - **Running them** (`waygraph run` / `demo`): `src/cli/cli.ts` -> `src/runner/runner.ts`

Each folder is one feature with a main file named after it, readable top to bottom; the other files are its parts.
No barrels: things are imported from the file that declares them.

| Folder | Main file | What it is | Notes |
|---|---|---|---|
| `engine/` | `engine.ts` | [[The Engine]]: Checkpoints, Blocks, Flows, runGraph | imports nothing outside itself |
| `engine/checkpoint/` | `checkpoint.ts` | [[Checkpoints]] | |
| `engine/block/` | `block.ts` | [[Blocks]]; `kinds/` = nav, page, method, effect, api; `some-block.ts` = any Block, as the runner holds it | |
| `engine/flow/` | `flow.ts` | [[Flows]]; `map-builder.ts` = `map()` | |
| `engine/run/` | `run.ts` | the per-Block sequence, run events | |
| `engine/mem/`, `engine/trait/` | `mem.ts`, `trait.ts` | [[Mem]], verify checks | |
| `engine/stub/` | `stub.ts` | what a ctx stub can paint ([[Demo UI]]): rings, todos, device, pace | |
| `engine/env.ts`, `engine/page-gone.ts` | | every `WAYGRAPH_*` variable; the only errors a page call may ignore | |
| `runner/` | `runner.ts` | [[Playing a Flow]]: plan -> session -> one loop with a mode | `modes/` = run, demo, report, branches |
| `demo/` | `stepper/stepper.ts` | [[Demo UI]]: stepper, overlay, narration | |
| `live/` | `auto/auto.ts`, `auto-session/auto-session.ts`, `pilot/pilot.ts`, `traverse/traverse.ts` | [[Live Sessions]]: one folder per surface | |
| `manifest/` | `manifest.ts` | the project scan and [[What Waygraph Writes#The manifest]] | also map packages |
| `analysis/` | | graph, lint checks, map check | |
| `runtime/` | `waygraph-config.ts` | the config file, `.env`, browser launch, run log | |
| `cli/` | `cli.ts` | `waygraph <command>`; `commands/` = one file per command | |

Layer rule (checked by `npm run check:structure`): the engine depends on nothing; the demo on the engine; live
sessions on everything below them; the CLI and runner on anything.

The full map with "where to put new code": `src/ARCHITECTURE.md` in the repo.
