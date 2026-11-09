# Waygraph UI

The project in the browser, drawn by hand: its pages and the Blocks between them, its flows step by step with what
each step expects, its runs, and a button to play any flow.

> [!WARNING]
> **Beta.** What its pages show and where things sit can change from one version to the next. It only reads your
> project and plays its flows; it never changes your files.

```sh
npx waygraph ui            # in the project, or any folder inside it
npx waygraph ui ../shop    # another project
```

It comes with waygraph (0.16.13 and later) and needs Node 24 or newer, like the rest of waygraph: nothing else to
install. In a project, `npx waygraph ui` runs the project's own waygraph; on an older one, update it first
(`npm install waygraph@latest`).

It prints the address (`http://localhost:9294`, or the next free port; `--port N` picks one). Ctrl-C stops it, and a
flow it's still playing, with its browser.

The project is the folder you name, or the one the current folder is in: the nearest folder, here or above, with a
`waygraph.config.*` (in it or in `config/`) or a `package.json` that depends on waygraph.

## What it shows

| Page | Shows |
|---|---|
| **Map** | a site map: each site at the top (the base url's host, and every other site a page's address names: a payment provider, a mail catcher), its pages below by their addresses, dashed lines labelled with the Navs that open them, each with its newest [screenshot](./blocks#screenshots) when one was taken. Every move between pages is an arrow labelled with the Blocks that make it. Each Block on a line is a badge with its whole name, in its kind's colour (Nav blue, Method grey, Effect amber, API green; the key is in the map's bottom bar). Each page says how many flows pass through it, and how many of those failed their newest run. Click a page: its screenshot, its addresses, its flows (each one that lands there, may land there (a step with several outcomes that ends the flow) or does something there, with its newest run's outcome; a run with no flow named, a test calling `flow.run`, counts for the flow whose steps it played), the ways in, what you can do there, its Expect Blocks, where it leads, what it promises on arrival, and what its [Read Block](./reads) reads |
| **Flows** | every flow as a card; open one for its steps on a canvas, each with what it [expects](./checks#expect-what-the-scenario-expects), and its recent runs |
| **Runs** | every run from the [run log](../reference/run-log): each step passed or failed, how long it took, the address it ended on, its screenshot when one was taken, what the flow expected after it; a failed step opens with what its check wanted and what it saw |
| **Playwright** | Playwright's UI mode over your flows (`waygraph test --flows --ui`), inside the app: **Open Playwright UI** starts it, every flow is a test you can run, watch and step through (its trace, actions and page snapshots); **Stop** ends it and its browsers |

The map reads left to right by default (each depth a column, a long run of pages in a grid); the switch in its bottom
bar lays it out top down, and your browser remembers the choice. Its shapes follow flowchart's: a site is a terminator
(round ends), a page a process (a rectangle). On a flow or a run, a step that goes to a page (a Nav or Page step) is a
terminator, an API call an input / output (a parallelogram), a fast-forward a predefined process (a box with side
bars), any other step a process.

A page's address comes from the Navs that open it (a url built from mem shows as a pattern: `/requests/:id`) and from
the `Trait.url` its Blocks verify on arrival. A page with no address of its own (a state of another page: an item in the
cart) sits under the page whose move reaches it. Pages in a row follow the order your flows visit them.

## Playing a flow

On a flow: **Run** plays it in the background (`waygraph run`), **Demo** opens a browser with the step panel
(`waygraph demo`). **verify only** skips the expectations (`--no-expect`). On a run of one flow, **Run again** or **Demo again** plays it
with the mem that run was seeded with (`--replay`).

The run's page follows it step by step; a step that fails opens as it happens. Every page shows what's playing, with
**Stop**, which ends the flow and its browser. One flow plays at a time.

It plays with the project's own waygraph, the same as you would from a terminal, and writes the same run log.

## Settings

The gear at the bottom of the sidebar. Kept in your browser.

| Setting | Default | Does |
|---|---|---|
| Demo: Auto-advance | on | a demo started here moves on from each step by itself (`--auto-next`); off, it waits for Next (`--no-auto-next`). The step panel's own switch still changes it while the demo plays |

## What it reads

Nothing it shows is stored anywhere else: the map and flows come from [`waygraph manifest`](../reference/run-log#the-manifest),
read through the project's own install, and the runs from `.waygraph/runs/`. It never changes the project's files.

