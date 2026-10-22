# What `init` creates

`npx waygraph init my-app` gives you a small, fully offline project on the
**Waygraph Map** layout. Folders under `src/map/` mirror your
app's URLs: one folder = one page = one Checkpoint. `(group)` folders are
organizational only and never appear in a URL.

## The tree

```sh
.
├── package.json
├── .agents/skills/                    # waygraph skills for coding agents
├── config/waygraph.config.ts          # baseUrl, tests, extensions, webServer - no playwright.config
├── src/
│   ├── map/
│   │   ├── (app_base)/                # your app (opened via file:// here)
│   │   │   ├── home/                  # URL /home
│   │   │   │   ├── _nav.block.ts      # how to get here
│   │   │   │   ├── _page.block.ts     # "you have arrived" hub
│   │   │   │   ├── _sel.ts            # every selector for this page
│   │   │   │   ├── index.html         # offline fixture page
│   │   │   │   └── _methods/          # one action per Block
│   │   │   └── docs/                  # a second page, same shape
│   │   ├── (external)/mailpit/        # a different origin (mail catcher)
│   │   └── (external)/hoppscotch/     # REST client, needs the hoppscotch extension
│   ├── states/                        # Checkpoint types + mem keys
│   └── flows/                         # use cases: <page>/, (user-stories)/, (external)/<tool>/
└── tests/                             # example, mail-verify, hoppscotch specs
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

## Config

Everything the project needs to run lives in one object, `config/waygraph.config.ts`:

```ts
export default defineConfig({
  baseUrl: "http://localhost:3130",
  extensions: ["hoppscotch"],                      // browser extensions to load
  webServer: { command: "npm start", port: 3130 },  // started around test / run / demo / auto
  playwright: { workers: 1, timeout: 180_000 },     // merged over waygraph's test defaults
});
```

`waygraph test` builds the test runner's config from it, so a project has no `playwright.config.ts`.
Values can come from `.env` files: `baseUrl: env.BASE_URL`, with `waygraph test --env staging` loading `.env.staging`.
The file also exports `engine` (`new Engine(config)`), which every flow imports, so `baseUrl` and `extensions` also apply when a
flow launches its own browser.
An older project that still has one keeps working and gets a deprecation note.

## Testing a REST API

`(external)/hoppscotch/` drives hoppscotch.io's REST client through its browser extension, so requests
skip CORS and can hit `localhost`. Add `extensions: ["hoppscotch"]` to the config, then chain
`set-method`, `set-url`, `set-headers`, `set-query-params`, `set-bearer-token`, `set-json-body`,
`send-request`, `assert-status`, `read-response-body`, `assert-response-body` and the response-header
Blocks. See `src/flows/hoppscotch-*.flow.ts` and [the reference](./REFERENCE#testing-a-rest-api-through-hoppscotch).

## Updating an existing project

```sh
npm install waygraph@latest
npx waygraph upgrade                          # dry run: new + differing scaffold files
npx waygraph upgrade "src/map/(external)/hoppscotch" --apply
```

Only the paths you name are copied; differing files are replaced only with `--overwrite`.

## Flows are use cases

`src/flows/` mirrors the front end's endpoints like the map does, but holds the *stories* of a page, not its pieces:
one folder per page (`flows/auth/login/`), one file per scenario (`success`, `wrong-password`, `empty-fields`), so a page's
folder shows every way a user can go through it. A `(user-stories)/` folder (any `(group)` name) holds flows that cross pages:
checkout end to end, onboarding. A file is named for its outcome, and its export is `<page><Outcome>Flow`.
`src/flows/README.md` in the scaffold has the full convention.

## What to do where

| Want to... | Look at |
|---|---|
| Add a page | Copy a folder under `src/map/`; keep the `_nav` / `_page` / `_sel` names |
| Add an action | One file in that page's `_methods/` |
| Confirm a state (button disabled, error shown) | `defineAssertBlock` with `Trait.disabled` / `Trait.enabled` |
| Wire steps together | `src/flows/*.flow.ts`, built with `map({ memStub, … })`; nest one with `.flow(sub, { reset })` |
| Keep folders honest | `waygraph map` fails if a folder stops matching its URL |

## Coding agents

```sh
npx waygraph agent-dive --loop claude      # also: opencode, cursor, vscode
```

The skills themselves (`waygraph-convention`, `waygraph-pilot`, `waygraph-blind-pilot`) already ship in
`.agents/skills/`; `waygraph upgrade` keeps them current. `agent-dive` additionally writes planner / author / healer agent files (and Claude skills) into the project so an
agent can dive an existing app into Blocks.

## Pointing it at your real app

1. Change each `_nav.block.ts`'s `url` from the local `file://` path to a real one, and set a
   real `baseUrl` if your Nav Blocks use relative paths (`config/waygraph.config.ts`, a `.env`, or
   `package.json`'s `"waygraph"` field - see [Project config](./REFERENCE#project-config-waygraph-config-env)).
1. Rename `(app_base)/` to your app's group; make each folder match the real URL.
1. Run `waygraph map` - it tells you which folders don't match.

Rules: [The Map layout](./consumer) ·
Worked example: [Sauce Demo](./saucedemo/index).

