# What `init` creates

`npx waygraph init my-app` gives you a small, fully offline project on the
**Waygraph Map** layout. Folders under `src/map/` mirror your
app's URLs: one folder = one page = one Checkpoint. `(group)` folders are
organizational only and never appear in a URL.

## The tree

```sh
.
├── package.json
├── src/
│   ├── map/
│   │   ├── (app_base)/                # your app (served on :4177 here)
│   │   │   ├── home/                  # URL /home.html
│   │   │   │   ├── _nav.block.ts      # how to get here
│   │   │   │   ├── _page.block.ts     # "you have arrived" hub
│   │   │   │   ├── _sel.ts            # every selector for this page
│   │   │   │   ├── home.html          # offline fixture page
│   │   │   │   └── _methods/          # one action per Block
│   │   │   └── docs/                  # a second page, same shape
│   │   └── (external)/mailpit/        # a different origin (mail catcher)
│   ├── states/                        # Checkpoint types + mem keys
│   └── flows/                         # example / shop / mail-verify
├── scripts/                           # local fixture server
└── tests/example.spec.ts
```

The underscore names (`_nav`, `_page`, `_sel`,
`_methods/`) are the same in every page folder, so anyone - or any agent -
knows where to look without asking.

## Using it

```sh
npm install
npx playwright install chromium
npm test               # green offline
npm run test:ui        # Playwright's interactive UI
npm run demo           # watch a flow with the step overlay
npm run auto           # explore by picking Blocks
npm run check          # lint your Blocks and folders
```

## What to do where

| Want to... | Look at |
|---|---|
| Add a page | Copy a folder under `src/map/`; keep the `_nav` / `_page` / `_sel` names |
| Add an action | One file in that page's `_methods/` |
| Confirm a state (button disabled, error shown) | `defineAssertBlock` with `Trait.disabled` / `Trait.enabled` |
| Wire steps together | `src/flows/*.flow.ts` |
| Keep folders honest | `waygraph map` fails if a folder stops matching its URL |

## Coding agents

```sh
npx waygraph agent-dive --loop claude      # also: opencode, cursor, vscode
```

Writes planner / author / healer agent files (and Claude skills) into the project so an
agent can dive an existing app into Blocks.

## Pointing it at your real app

1. Set `waygraph.baseUrl` in `package.json`; drop the `scripts/with-fixture.mjs` wrappers.
1. Rename `(app_base)/` to your app's group; make each folder match the real URL.
1. Run `waygraph map` - it tells you which folders don't match.

Rules: [The Map layout](./consumer) ·
Worked example: [Sauce Demo](./saucedemo/index).

