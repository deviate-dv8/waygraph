# Waygraph UI

The project in the browser, drawn by hand: its pages and the Blocks between them, its flows step by step with what
each step expects, its runs, and a button to play any flow.

```sh
npx waygraph ui            # in the project, or any folder inside it
npx waygraph ui ../shop    # another project
```

It prints the address (`http://localhost:3333`, or the next free port; `--port N` picks one). Ctrl-C stops it, and a
flow it's still playing, with its browser.

The project is the folder you name, or the one the current folder is in: the nearest folder, here or above, with a
`waygraph.config.*` (in it or in `config/`) or a `package.json` that depends on waygraph.

## What it shows

| Page | Shows |
|---|---|
| **Map** | every page (Checkpoint) as a box, every move between pages as an arrow labelled with the Blocks that make it. Click a page: the ways in, what you can do there, its Expect Blocks, where it leads, what it promises on arrival, and what its [Read Block](./reads) reads |
| **Flows** | every flow as a card; open one for its steps on a canvas, each with what it [expects](./checks#expect-what-the-scenario-expects), and its recent runs |
| **Runs** | every run from the [run log](../reference/run-log): each step passed or failed, how long it took, what the flow expected after it; a failed step opens with what its check wanted and what it saw |

## Playing a flow

On a flow: **Run** plays it in the background (`waygraph run`), **Demo** opens a browser with the step panel
(`waygraph demo`). **verify only** skips the expectations (`--no-expect`). On a run of one flow, **Play again** plays it
with the mem that run was seeded with (`--replay`).

The run's page follows it step by step; a step that fails opens as it happens. Every page shows what's playing, with
**Stop**, which ends the flow and its browser. One flow plays at a time.

It plays with the project's own waygraph, the same as you would from a terminal, and writes the same run log.

## What it reads

Nothing it shows is stored anywhere else: the map and flows come from [`waygraph manifest`](../reference/run-log#the-manifest),
read through the project's own install, and the runs from `.waygraph/runs/`. It never changes the project's files.

Needs Node 24 or newer, like the rest of waygraph.
