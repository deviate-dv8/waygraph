# Waygraph

An **opinionated Playwright**, testing first. Your app's features become readable, reusable functions
(Blocks), and the result is a structured end-to-end project whose flows read like scenarios a non-technical QA can
follow. The same Blocks also record demo videos, navigate deterministically and let agents drive your app.
[What Waygraph is](https://deviate-dv8.github.io/waygraph/doctrine).

```typescript
// One Block = one action.  It says: start on LoginPage, end on InventoryPage, and prove it.
export const SubmitLoginBlock = defineMethodBlock({
  name: "submit-login",
  from: LoginPage,
  to: InventoryPage,
  async act(page) { await page.locator(LoginSel.button).click(); },
  verify: [Trait.url({ pathname: "/inventory.html" })],
});

// A Flow = Blocks in order.
export const loginFlow = engine
  .map()
  .gotoPage(NavLoginBlock)
  .method(FillUsernameBlock)
  .method(FillPasswordBlock)
  .method(SubmitLoginBlock);
```

## Try it in 60 seconds

```bash
npx waygraph try demo      # watch a full Sauce Demo checkout, step by step (nothing written to your folder)
```

## Start a project

```bash
npx waygraph init my-app
cd my-app
npm install && npx waygraph install   # what the config requires: the browser, and anything else it names
npm test                   # green immediately, fully offline
npm run test:ui            # same tests in Playwright's interactive UI
npm run auto               # explore the app by picking Blocks in a browser
```

Already have a repo? `npm install waygraph @playwright/test`.

## Run the Sauce Demo example

The full example (`examples/saucedemo`) is a real project against saucedemo.com.

```bash
git clone https://github.com/deviate-dv8/waygraph.git
cd waygraph
npm install && npm run build         # the example uses this checkout of waygraph
cd examples/saucedemo && npm install && npx waygraph install
npm test                             # 15 tests against the live site
npm run demo                         # watch the checkout flow with the step overlay
npm run auto                         # explore it by hand
```

## The four ideas

| Word | Meaning |
|---|---|
| **Checkpoint** | A named place the app can be: `LoginPage`, `InventoryPage`, `OrderComplete`. |
| **Block** | One action from one Checkpoint to another, with a `verify` that confirms it. |
| **Flow** | Blocks in order. Run it, demo it, or let `auto` pick the route. |
| **Mem** | Typed shared data for a run (`LoginCreds`, `SelectedItem`). |

Block kinds: **Nav** (go to a page), **Method** (one action, on the page or on one row of a
list), **Expect** (what a scenario expects, e.g. a button is disabled: it only reads), **Page** (a page's hub).

## Where files go: the Map

Use the **Waygraph Map**. Folders under `src/map/` mirror your app's URLs, one folder per page:

```text
src/map/(app)/checkout/
  _page.block.ts      "you've arrived"
  _sel.ts             every selector for this page
  _methods/           one action per file
```

`waygraph map` fails if a folder stops matching its real URL, so the graph can't quietly go
stale. `waygraph init` scaffolds this layout. A plainer, freeform layout (any folders, any
names) still works and is fine for small projects, but the Map is where the tooling is going.

## Commands you'll use

| Do this | Command |
|---|---|
| Run tests / UI mode / open last report | `waygraph test` / `waygraph test ui` / `waygraph test report` |
| Run a flow | `waygraph run shopFlow --data '{...}'` (or `--mem-stub`) |
| Watch a flow with narration | `waygraph demo shopFlow` |
| See the project in the browser: map, flows, runs, play a flow (beta) | `waygraph studio` |
| Explore by picking Blocks | `waygraph auto` |
| See the whole graph | `waygraph graph` |
| Lint your Blocks and folders | `waygraph check` / `waygraph typecheck` / `waygraph map` |
| Open a persistent browser for an agent | `waygraph browser start` |
| Read what the page shows, as JSON (beta: a page's `read`) | `waygraph pilot read <id> [path]` |
| Highlight things on the live page | `waygraph browser highlight <id> "#login\|Login button\|warning"` |
| Set up coding-agent skills | `waygraph agent-dive --loop claude` |

`waygraph --help` lists everything.

## Learn more

- **[Docs site](https://deviate-dv8.github.io/waygraph/)** - guides and walkthroughs
- **[Guides](https://deviate-dv8.github.io/waygraph/guides/project)** - one topic per page: Blocks, flows, what a page shows, data, checks, demo, testing, agents
- **[Reference](https://deviate-dv8.github.io/waygraph/reference/)** - every command, setting and variable
- **[Page objects and waygraph](https://deviate-dv8.github.io/waygraph/page-objects)** - what waygraph adds to a page object model, measured side by side, and how to adopt it one flow at a time
- **[Environment variables](./docs/env.md)** - every `WAYGRAPH_*` variable · **[Removed in 0.16.0](./docs/deprecated.md)** - each old form and what replaces it (`waygraph upgrade --codemod flows|checkpoints|keys` converts a project)
- **[Sauce Demo walkthrough](https://deviate-dv8.github.io/waygraph/saucedemo/)** - a worked example
- Agent skills: `waygraph --skill` prints them (pilot, blind-pilot, convention)

## Develop this package

```bash
git clone https://github.com/deviate-dv8/waygraph.git && cd waygraph
npm install && npm ci --prefix studio && npm run build
npm run studio                           # Waygraph Studio on the Sauce Demo example, from this checkout
npm run typecheck && npm test        # unit + Playwright suites
```

Working on waygraph: [`AGENTS.md`](./AGENTS.md) (the rules, how to verify) and
[`src/ARCHITECTURE.md`](./src/ARCHITECTURE.md) (where the code starts).

## Status: alpha

> [!WARNING]
> Waygraph is an alpha build. Its syntax may still change in major ways between releases, and a release can remove
> API (each removal is listed in [what was removed](./docs/deprecated.md); `waygraph upgrade --codemod` converts most
> of it). For now we recommend staying on 0.16.0:
>
> ```bash
> npm install --save-exact waygraph@0.16.0
> ```

MIT
