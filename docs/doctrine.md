# What Waygraph is

Waygraph is an **opinionated Playwright**, and it is **testing first** by design.

Its goal is to turn an app's features into **readable, reusable functions**: Blocks, one action each, grouped by the
page they act on. What you get out of it is a **properly structured end-to-end project**, whose flows read like
scenarios that a QA who doesn't write code can follow:

```ts
engine.map({ as: Planner })
  .gotoPage(Registry.nav)
  .method(Registry.do.searchFor)
  .method(Detail.do.archive)
  .method(Detail.do.confirmArchive);
```

> The planner opens the registry, searches for the machine, archives it and confirms.

## The test for every feature

Waygraph is testing first, so every change answers two questions before anything else:

1. **Does it make a flow read more like the scenario?** A person reading it should see the steps and what each one
   expects, not selectors, waits or plumbing.
2. **Does it make Blocks more reusable?** One action, written once, used by every flow that needs it, and true
   wherever it's used.

A feature that serves a demo, an agent or automation, but makes tests harder to read or Blocks harder to reuse, is
the wrong shape for it. Find another shape.

## The opinions

- **One action per Block.** Fill, click, submit: separate Blocks. A Block says where it starts and where it lands
  (Checkpoints), and TypeScript checks that a flow never skips between unrelated pages.
- **Pages are namespaces.** A page's Page Block names how to get there (`nav`) and what you can do there (`do`); a
  flow imports pages, not Blocks.
- **Each kind of check has one home.** A Block's `verify` is its fast must-pass check: it arrived where it says, and
  its action took effect. What a scenario *expects* is an assert: it only reads and judges, and never changes the page.
- **Data is named, never hidden.** What a run needs is a typed mem key; fake values come from mem stubs; what a page
  shows is a Read Block.
- **The flows are the tests.** `waygraph test` runs every flow; a spec file is only for what a flow can't say.
- **One way to write each thing.** No aliases, no old forms kept next to new ones; a codemod moves projects forward.

## What the same Blocks also give you

Because an app is described once, as pages and the actions between them, the same Blocks do more than test:

| | Today |
|---|---|
| **Demo videos** | `waygraph demo` plays a flow step by step, narrated, and records it |
| **Deterministic navigation** | `pilot reach` finds and plays a route to any page, checking every step |
| **An input-driven CLI for your app** | `waygraph auto` offers the actions possible from where you are, for people and scripts |
| **Agents** | a live session lets a coding agent drive the app through checked Blocks only |

Next, on the same foundation ([ROADMAP](https://github.com/deviate-dv8/waygraph/blob/main/ROADMAP.md)):

- **Virtual users** that use the app like a person would, through an MCP server over a live session.
- **Waygraph GUI**: the project's map, flows and runs in one app, including reading data out of pages (scraping) with
  Read Blocks.
- **More drivers.** Playwright only, until it is mastered.
