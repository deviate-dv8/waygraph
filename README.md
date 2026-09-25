# Waygraph

Write browser tests as a **graph of small, reusable steps** instead of one long script.
Built on Playwright. Every step says where it starts, where it ends, and how to confirm it
worked - so a whole app becomes something you (or an AI agent) can walk, check, and demo.

```typescript
// One Block = one action.  It says: start on LoginPage, end on LoggedIn, and prove it.
export const SubmitLoginBlock = defineMethodBlock<LoginPage, LoggedIn>({
  name: "submit-login",
  instruction: {
    async act(page) { await page.locator(LoginSel.button).click(); },
    resolve: () => checkpoint("LoggedIn"),
    verify: [Trait.url({ pathname: "/inventory.html" })],
  },
});

// A Flow = Blocks in order.
export const loginFlow = engine.defineFlow([start, NavLoginBlock, FillUsernameBlock, FillPasswordBlock, SubmitLoginBlock, end]);
```

## Try it in 60 seconds

```bash
npx waygraph try demo      # watch a full Sauce Demo checkout, step by step (nothing written to your folder)
```

## Start a project

```bash
npx waygraph init my-app
cd my-app
npm install && npx playwright install chromium
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
npx playwright install chromium
cd examples/saucedemo && npm install
npm test                             # 15 tests against the live site
npm run demo                         # watch the checkout flow with the step overlay
npm run auto                         # explore it by hand
```

## The four ideas

| Word | Meaning |
|---|---|
| **Checkpoint** | A named place the app can be: `LoginPage`, `LoggedIn`, `OrderComplete`. |
| **Block** | One action from one Checkpoint to another, with a `verify` that confirms it. |
| **Flow** | Blocks in order. Run it, demo it, or let `auto` pick the route. |
| **Mem** | Typed shared data for a run (`LoginCreds`, `SelectedItem`). |

Block kinds: **Nav** (go to a page), **Method** (one action), **Effect** (act on one row of a
list), **Assert** (confirm a state, e.g. a button is disabled), **Page** (a page's hub).

## Where files go: the Map

Use the **Waygraph Map**. Folders under `src/map/` mirror your app's URLs, one folder per page:

```text
src/map/(app)/checkout/
  _nav.block.ts       how to get here
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
| Explore by picking Blocks | `waygraph auto` |
| See the whole graph | `waygraph graph` |
| Lint your Blocks and folders | `waygraph check` / `waygraph typecheck` / `waygraph map` |
| Open a persistent browser for an agent | `waygraph browser start` |
| Highlight things on the live page | `waygraph browser highlight <id> "#login\|Login button\|warning"` |
| Set up coding-agent skills | `waygraph agent-dive --loop claude` |

`waygraph --help` lists everything.

## Learn more

- **[Docs site](https://deviate-dv8.github.io/waygraph/)** - guides and walkthroughs
- **[Full reference](./docs/REFERENCE.md)** - every feature in detail (long)
- **[Sauce Demo walkthrough](https://deviate-dv8.github.io/waygraph/saucedemo/)** - a worked example
- Agent skills: `waygraph --skill` prints them (pilot, blind-pilot, convention)

## Develop this package

```bash
git clone https://github.com/deviate-dv8/waygraph.git && cd waygraph
npm install && npm run build
npm run typecheck && npm test        # unit + Playwright suites
```

MIT
