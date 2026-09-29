---
layout: home
hero:
  name: Waygraph
  tagline: Write browser tests as a graph of small, reusable steps instead of one long script. Built on Playwright.
  actions:
    - theme: brand
      text: Quick start
      link: /quickstart
    - theme: alt
      text: What init creates
      link: /scaffold
    - theme: alt
      text: GitHub
      link: https://github.com/deviate-dv8/waygraph
---

## Start here

### 1 · Just look

Watch a full checkout on Sauce Demo, step by step. Nothing is written to your folder.

```sh
npx waygraph try demo
```

### 2 · Start a project

A working, fully offline project: tests pass immediately.

```sh
npx waygraph init my-app
cd my-app
npm install
npx playwright install chromium
npm test
```

### 3 · Run the Sauce Demo

The full example project, against the live site.

```sh
git clone https://github.com/deviate-dv8/waygraph.git
cd waygraph
npm install && npm run build
npx playwright install chromium
cd examples/saucedemo && npm install
npm test
```

[More on the example →](/quickstart#saucedemo)

## The four ideas

| | |
|---|---|
| **Checkpoint** | A named place the app can be: `LoginPage`, `LoggedIn`. |
| **Block** | One action from one Checkpoint to another, with a `verify` that confirms it. |
| **Flow** | Blocks in order. Run it, demo it, or let `auto` pick the route. |
| **Mem** | Typed shared data for a run: credentials, the selected item. |

## Where files go

Use the **[Waygraph Map](/consumer)**: folders under `src/map/` mirror your app's URLs, one folder
per page, and `waygraph map` fails if a folder stops matching its real URL. That's what
`waygraph init` gives you. A plainer freeform layout still works for small projects; the Map is
where the tooling is headed.

## Guides

### Learn

- **[Quick start](/quickstart)** — Install, your first Block and Flow, the Sauce Demo example.
- **[What `init` creates](/scaffold)** — The scaffold's folder layout, explained.
- **[Sauce Demo walkthrough](/saucedemo/)** — A worked example of the Map layout.
- **[The Map layout](/consumer)** — Folders that mirror your app's URLs.

### Use

- **[Run and demo flows](/demo)** — `run`, `demo`, and their flags.
- **[Explore with `auto`](/auto)** — Pick Blocks by hand, in a browser or the terminal.
- **[Demo narration](/highlights)** — Highlights, checklists, and captions in a demo.

### Reference

- **[Engine handout](/handout)** — The core model in one page.
- **[Full reference](https://github.com/deviate-dv8/waygraph/blob/main/docs/REFERENCE.md)** — Every feature in detail (long).
- **[Preview these docs](/deploy)** — Run this site locally or deploy it.
