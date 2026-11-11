# Your project

A waygraph project has one shape. Every project puts the same things in the same places, so a person or an agent who
knows one project knows where to look in the next. This page is that shape, and the opinions behind it: each comes with
why, and with what holds you to it.

`npx waygraph init my-app` makes a small project in this shape that works offline: `npm test` passes as soon as it is
installed.

## The shape

```sh
my-app/
├── config/
│   └── waygraph.config.ts          # baseUrl, webServer, device, labels, demo; exports `engine`
├── src/
│   ├── accounts/                   # the people the app knows: account("planner", { signIn, mem, ttl })
│   ├── states/                     # Checkpoints (*.states.ts), mem keys (*.mem-keys.ts), mem stubs (*.mem-stubs.ts)
│   ├── map/                        # the app, page by page: folders are its addresses
│   │   ├── (app_base)/             # your app (a group: not part of any address)
│   │   │   ├── _layout.block.ts    # what every page in here shares: the top bar, the sidebar
│   │   │   ├── _sel.ts             # the layout's selectors
│   │   │   ├── home/               # the page at /home
│   │   │   └── platform/
│   │   │       ├── _layout.block.ts    # nested: what /platform/* pages also share
│   │   │       └── equipment/          # the page at /platform/equipment
│   │   └── (external)/             # other sites a flow visits: a mail catcher, a REST client
│   └── flows/                      # use cases: a folder per page, like src/map/
│       ├── auth/login/
│       │   ├── success.flow.ts     # one file per outcome: loginSuccessFlow
│       │   └── wrong-password.flow.ts
│       └── (user-stories)/         # stories across pages
├── tests/                          # Playwright specs, only for what a flow can't say
├── .env.example                    # what the config reads, blank and commented
└── .agents/skills/                 # how-to for coding agents
```

There is no `playwright.config.ts`: `waygraph test` builds it from `config/waygraph.config.ts`
([Config](../reference/config)).

## One page folder

Every page folder uses the same file names:

| File | Holds | Made with |
|---|---|---|
| `_nav.block.ts` | how to get to this page | `defineNavBlock` |
| `_page.block.ts` | the page: its `nav`, what you can do (`do`), what you can expect (`expects`), who can open it (`for`) | `definePageBlock` |
| `_sel.ts` | every selector this page uses | a plain object |
| `_read.block.ts` | what the page shows, as data | `defineReadBlock` |
| `_reads.ts` | the namespace that data is typed by | `reads("home")<{…}>()` |
| `_methods/` | one action per file: fill, click, submit | `defineMethodBlock` |
| `_expect/` | what a scenario can expect on this page, one per file | `defineExpectBlock` |

A leading `_` means "this page's own machinery". A folder name without one is a child page with its own address
segment. `_layout.block.ts` is the one file that isn't about one page: it's about every page under its folder
([Layouts](./layouts)).

## The opinions

| Opinion | Why | What holds you to it |
|---|---|---|
| **Folders under `src/map/` are the app's addresses.** `/platform/equipment` lives in `map/(app_base)/platform/equipment/`; `(group)` folders only organise. | The tree is the site map: nothing to keep in sync, and anyone who knows the app's URLs finds the page. | `waygraph map` fails on a folder that doesn't match its page's address |
| **A Checkpoint is a page**, a place with its own address. An item in the cart is what the page shows, not another Checkpoint. | Fewer, truer Checkpoints; flows check the state with `Key.is` | `waygraph check` names a Checkpoint that is a state of a page |
| **Every page has a Read Block.** | Runs, agents, tests and Waygraph UI read the page as data, not by parsing the DOM | `waygraph check` lists the pages no Read Block reads |
| **One action per Block, its selectors in `_sel.ts`.** | One Block, reused by every flow that needs it; a changed selector is changed once | `waygraph check`: a fill and a click in one Block, several inputs in one Block, an inline selector when a `_sel.ts` is there |
| **Navigation happens in Navs.** | The map knows every way between pages; a Method that navigates is a hidden edge | `waygraph check` warns on `page.goto` outside a Nav |
| **What every page shares is a layout**, in the folder of the pages it wraps. Never the same Nav on each page, never a list of pages on a Nav. | Declared once, where front-end developers look for it | a layout link from a page it doesn't cover fails before clicking |
| **Who sees what is `for: [accounts]`**, on the link, the Method or the page. | Access is written beside what it's about, and tested without a test | `waygraph test --flows` adds each account's access test; `waygraph check` flags a flow as an account using what it isn't given |
| **A flow that starts signed in runs `as` an account.** Never a login copied into each flow, never cookies by hand. | One sign-in, kept and reused across flows and workers | the account's session is kept for you; a hand-saved session has no reason to exist |
| **A flow imports pages, not Blocks**: `Page.nav`, `Page.do.x`, `Page.expects.y`. Imports use `#config/`, `#map/`, `#states/`. | A flow reads like the scenario; no `../../..` | TypeScript: a step must start where the last one ended |
| **`verify` is the Block's own check; `expect` is the scenario's.** Expectations only read. | A Block is true wherever it's used; a scenario says what it expects in one place | `waygraph check`: an arrival check in an Expect Block, an outcome in a Method's verify, an expectation that acts |
| **Flows are the tests**: a folder per page (mirroring `src/map/`), one file per outcome, exported as `<page><Outcome>Flow`; stories across pages in a `(group)`; groups of flows are labels in the config. | A page's folder shows every way through it; nothing to write twice; `--label auth` runs a feature | `waygraph test --flows` runs every exported flow; `waygraph check` warns about a label that covers no flow |
| **Data is named, never hidden**: a mem key per value, a mem stub for fake ones, `unique` for what must be new each run. | A run says what it was given and replays with it | `waygraph check` warns when a Block that creates something gets the same data every run |
| **No fixed waits, no retry loops, no hand-built demo UI.** | Traits already retry; the demo already narrates | `waygraph check`: a retry loop by hand, hand-written overlay UI |
| **Nothing is imported for its side effect.** | The tools load Blocks, pages, stubs, accounts and layouts themselves | the tools find them by name and folder |

`waygraph check` only warns; `waygraph map` and TypeScript fail. In CI run all three ([Testing](./testing#in-ci)).

## Imports

`package.json` gives the project's folders short names (Node's own
[subpath imports](https://nodejs.org/api/packages.html#subpath-imports), which TypeScript and the test runner resolve
too):

```json
"imports": { "#config/*": "./config/*.ts", "#states/*": "./src/states/*.ts", "#map/*": "./src/map/*.ts" }
```

```ts
import { engine } from "#config/waygraph.config";
import { HomePage } from "#map/(app_base)/home/_page.block";
import { TopBar } from "#map/(app_base)/_layout.block";
```

## Flows are use cases

`src/flows/` follows the pages too, but it holds the *stories*, not the parts: a folder per page, one file per outcome.

| Path | Holds | Export |
|---|---|---|
| `flows/auth/login/success.flow.ts` | one page, one outcome | `loginSuccessFlow` |
| `flows/auth/login/wrong-password.flow.ts` | the same page, another outcome | `loginWrongPasswordFlow` |
| `flows/(user-stories)/checkout.flow.ts` | a story across pages | `checkoutFlow` |

A page's folder shows every way a user can go through that page; the manifest and Waygraph UI read the use case from
the path (the page, then the outcome).

```ts
// config/waygraph.config.ts
labels: { auth: ["src/flows/auth/**"], checkout: ["src/flows/checkout/**", "checkoutFlow"] }
```

`waygraph test --label auth` runs a feature; a flow's labels are its tags in Playwright's reports and in Waygraph UI.

## What to do where

| I want to... | Do this |
|---|---|
| add a page | copy a page folder, keep the `_` names, match the address |
| add an action | one file in that page's `_methods/` |
| add something every page has (a menu, a sidebar) | a `_layout.block.ts` in the folder of the pages it wraps ([Layouts](./layouts)) |
| say only some people see it | `for: [Planner]` on it ([Layouts and access](./layouts#who-sees-what-for)) |
| check a state (disabled button, error shown) | `Key.is` on the page's Read Block, or an Expect Block in `_expect/`, in a step's `expect` ([Checks](./checks)) |
| say what a page shows | its `_read.block.ts` ([Read Blocks](./reads)) |
| sign in as someone | an account in `src/accounts/`, then `map({ as: Planner })` ([Flows](./flows#accounts)) |
| string steps together | a file in `src/flows/<page>/`, named for its outcome ([Flows](./flows)) |
| give a flow data | a mem key and a mem stub in `src/states/` ([Data](./data)) |
| run a feature's flows | a label in the config, then `waygraph test --label <it>` ([Testing](./testing#labels)) |
| see all of it | `waygraph ui` ([Waygraph UI](./ui)) |
| keep folders honest | `waygraph map` |
| reuse a tool's pages in another project | `waygraph map pack <group>` ([The Map](../reference/map#map-packages)) |

## Pointing it at your real app

1. Set `baseUrl` in `config/waygraph.config.ts` (or `BASE_URL` in `.env`).
2. Change each `_nav.block.ts`'s `url` to the real path.
3. Rename `(app_base)/` and its folders to match your app's addresses.
4. Run `waygraph map`: it lists every folder that doesn't match.

## A new machine, a new teammate

The config is the list of what the project needs on a machine. After `npm install`, one command sets it all up:

```sh
npm install
npx waygraph install
```

| From the config | `waygraph install` |
|---|---|
| always | Chromium, with the project's own Playwright (the version its tests run) |
| `playwright.use.browserName`, `playwright.projects` | each browser they name |
| `extensions` | the browser extensions, into waygraph's cache |
| `demo.voice` | the voice's model (`kokoroVoice()`: a Python environment and ~350 MB, once per machine) |
| what those read | listed in `.env.example` and `.env`, blank and commented (`# OPENAI_API_KEY=`) |

What it can't install, it checks and names at the end (ffmpeg for a voice-over, a voice whose setup failed) and exits
1; the rest is still set up. It does only what's missing, so run it again whenever the config changes or after
`npm install waygraph@latest`; `--update` fetches everything again, and `--with-deps` also installs the browsers'
system packages (Linux CI). Downloads are shared by every project on the machine (`~/.cache/waygraph`,
`~/.cache/ms-playwright`), and installing one project's browsers never removes another's.

## Keeping it up to date

```sh
npm install waygraph@latest
npx waygraph install                                  # what the new version needs (a newer browser, voice model)
npx waygraph upgrade                                  # dry run: lists new and changed scaffold files
npx waygraph upgrade "src/map/(external)/hoppscotch" --apply
npx waygraph upgrade --skills                         # refresh .agents/skills
npx waygraph upgrade --codemod keys                   # rewrite code a release changed (see Deprecated)
npx waygraph upgrade --codemod lands                  # `Block as MethodBlock<A, B>` casts -> .method(Block, { lands: B })
npx waygraph upgrade --codemod ff                     # { ff: true } on step after step -> .ffStart() ... .ffEnd()
npx waygraph upgrade --codemod chain                  # drops .start() and .end(): the chain is the flow
npx waygraph upgrade --codemod pages                  # a flow's Block imports -> its pages' Page.nav / Page.do.x
npx waygraph upgrade --codemod expect                 # Assert Blocks and .assert() steps -> Expect Blocks in each step's expect: [...]
```

`upgrade` copies only the paths you name, and replaces a file that differs only with `--overwrite`.

## A freeform layout

A small project can skip `src/map/`: any `*.block.ts` anywhere under `src/` is loaded, and a `_layout.block.ts` covers
the pages in its folder the same way. The [Sauce Demo example](../saucedemo/) uses `src/blocks/saucedemo-web/<page>/`
like that. It gives up what the Map gives (`waygraph map` can't hold folders to addresses), so it's for trying things;
moving to the Map later only moves files: [migrating](../reference/map#migrating-from-freeform-router-to-waygraph-map).
