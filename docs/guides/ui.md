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
(`npm install waygraph@latest`). The map's addresses (a site map, one level per part of the address) and page
screenshots need 0.16.16 or later in the project; on an older one the pages hang from where flows reach them.

It prints the address (`http://localhost:9294`, or the next free port; `--port N` picks one). Ctrl-C stops it, and a
flow it's still playing, with its browser.

The project is the folder you name, or the one the current folder is in: the nearest folder, here or above, with a
`waygraph.config.*` (in it or in `config/`) or a `package.json` that depends on waygraph.

## What it shows

| Page | Shows |
|---|---|
| **Map** | a site map: each site at the top (the base url's host, and every other site a page's address names: a payment provider, a mail catcher), its pages below by their addresses, one level per part of the address (a folder for each part no page has: `auth/`, `platform/`, then `plant/`, so `/platform/plant/lines` sits three levels in), dashed lines labelled with the Navs that open them, each with its newest [screenshot](./blocks#screenshots) when one was taken. Every move between pages is an arrow labelled with the Blocks that make it. Each Block on a line is a badge with its whole name, beside the page the line goes into (labels meeting at one page stack, and the map leaves room for them: a label never covers a box), in its kind's colour (Nav blue, Method grey, API green; the key is in the map's bottom bar). Beside it, the site map as a folder tree: uncheck a site, a folder or a page to leave it off the map, or keep one branch with **only** (say, just `platform/plant/equipment`); your browser remembers the choice for the project. The tree minimizes to a **Pages** button (with how many pages the map shows), and back. Each page says how many flows pass through it, and how many of those failed their newest run, and lists what it shows: the fields its [Read Blocks](./reads) read, by namespace, the yes/no ones highlighted as the states the page can be in (`login.linkSent`, `login.canSubmit`), which flows check with `Key.is` instead of a Checkpoint of their own; each box is as tall as its list, and the layout makes room for it. Click a page: its screenshot, addresses and how its flows' newest runs went (failing, passing, not run), then, most telling first, what it shows (its [Read Blocks](./reads)' fields, the yes/no states first), what you can do there, the ways in, where it leads, what's expected there (its Expect Blocks, what's promised on arrival), the selectors its Blocks read, and its flows last (each one that lands there, may land there (a step with several outcomes that ends the flow) or does something there, failing first; a run with no flow named, a test calling `flow.run`, counts for the flow whose steps it played). Open a Block in a list for its checks, its selectors and its code; the panel widens (the arrows in its corner) to read code |
| **Flows** | every flow by its folder, failing first, with its steps, expectations and newest run; filter by failing, passing or not run, or find one by a step; open one for its steps on a canvas, each with what it [expects](./checks#expect-what-the-scenario-expects), and its recent runs |
| **Blocks** | every Block by the folder it lives in, with its kind, route (`from` → `to`) and what it requires; open one for what it checks (before acting and on arrival, and what it promises wherever it's used), the selector entries it reads, its code (the lines that define it, from its file), and the flows that use it; and from the newest runs, how often it ran and failed, how long it takes, and what it did to the address: **navigates** (its step ended on another path: a submit that redirects, a click a single-page app routes) or **changes the address** (it stayed on its page but changed the query or hash: a tab or a filter kept in the url). Also its Read Blocks (each field and its type), its selectors (every entry of its selector files, with the Blocks that read each) and its mem keys (who requires each, and the value the newest run used). Checks, selectors and code need waygraph 0.16.19 or later in the project |
| **Runs** | every run from the [run log](../reference/run-log): each step passed or failed, how long it took, the address it ended on, its screenshot when one was taken, what the flow expected after it; a failed step opens with what its check wanted and what it saw. Next to **Run** and **Demo** on a flow, **Record video** and **Show the browser** (off: headless) say how it plays, kept in your browser; its recent runs have a download for each video. A run recorded with `--video` has **Video**: it plays in the page, and **Download video** saves it; a run with a Playwright trace has **Trace** to download (open it with `npx playwright show-trace`) |
| **Project** | the project's waygraph commands as buttons, run with its own waygraph from its folder, one at a time, with their output (check, validate, typecheck, map, graph, list, nav, manifest, test, test --flows, upgrade, install; the ones that change files, `upgrade --skills` and the codemods, ask first); **Stop** ends one and what it started. And its [config](../reference/config): what it resolves to, or the file as written (waygraph 0.16.18 or later in the project) |
| **Playwright** | Playwright's UI mode over your flows (`waygraph test --flows --ui`), inside the app: **Open Playwright UI** starts it, every flow is a test you can run, watch and step through (its trace, actions and page snapshots); **Stop** ends it and its browsers. On a flow, **Playwright UI** opens it with only that flow (**Show all flows** goes back to every one) |

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
(`waygraph demo`), **Playwright UI** opens it as a Playwright test on the Playwright page. **verify only** skips the expectations (`--no-expect`). On a run of one flow, **Run again** or **Demo again** plays it
with the mem that run was seeded with (`--replay`; what the run made new, a name from `unique`, is made new again).

The run's page follows it step by step; a step that fails opens as it happens. Every page shows what's playing, with
**Stop**, which ends the flow and its browser. One flow plays at a time.

It plays with the project's own waygraph, the same as you would from a terminal, and writes the same run log.

## Settings

The gear at the bottom of the sidebar. Kept in your browser.

| Setting | Default | Does |
|---|---|---|
| Sidebar | every page | which pages the sidebar shows (a hidden one still opens by its address) |
| Demo: Auto-advance | on | a demo started here moves on from each step by itself (`--auto-next`); off, it waits for Next (`--no-auto-next`). The step panel's own switch still changes it while the demo plays |

## What it reads

Nothing it shows is stored anywhere else: the map and flows come from [`waygraph manifest`](../reference/run-log#the-manifest),
read through the project's own install, and the runs from `.waygraph/runs/`. It never changes the project's files. A
manifest older than 30 seconds is still shown at once while a new one is read (the refresh button in the sidebar waits
for a new one), and a page loads when you point at its link, so moving between pages doesn't wait on either.

