# Project config

## Project config (`waygraph.config`, `.env`)

Three places can supply a project's `baseUrl`, checked in this order (first one found wins):

1. `WAYGRAPH_BASE_URL` - a real shell export, or one loaded from a `.env` file (next section).
2. A `waygraph.config.ts`/`.mts`/`.mjs`/`.js`/`.cjs` file in the project root:
   ```typescript
   import { defineConfig } from "waygraph";

   export default defineConfig({
     baseUrl: "http://127.0.0.1:4177",
   });
   ```
   `defineConfig` is a type-checking identity helper - `export default { baseUrl: "..." }` works identically without
   it. `.ts` works unmodified; no separate build/transpile step.

**Native `.env` support** - `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`
(`<mode>` = `--env <mode>` / `WAYGRAPH_ENV`, else `NODE_ENV`, else `"development"`) are auto-loaded from the project root before
`baseUrl` resolution runs, same layering Vite/Next use. No `dotenv` dependency - a small
built-in parser (`src/runtime/env-file.ts`), matching the "bring nothing, read what's already there"
approach memStub already takes with Faker. A real, already-exported shell env var always wins
over anything in a `.env` file - loading one only fills a gap, never silently overrides a
value you actually set. This replaces the hack of manually re-exporting an FE project's own
`.env` values, or duplicating them into `package.json`, just to get waygraph to see them.

### `config/waygraph.config.ts` replaces `playwright.config.ts`

The scaffold keeps all settings in one object, `config/waygraph.config.ts` (the project root works too).
`waygraph test` builds the test runner's config from it, so a project needs no `playwright.config.ts`:

```typescript
export default defineConfig({
  baseUrl: "http://localhost:3130",
  testDir: "tests",                       // default
  webServer: { command: "npm start", port: 3130 },
  extensions: ["hoppscotch"],
  playwright: { workers: 1, timeout: 180_000, use: { video: "on" } },   // merged over the defaults
});
```

Defaults: `fullyParallel`, `list` + `html` reporters, `trace: "retain-on-failure"`, `use.baseURL` from `baseUrl`
(`WAYGRAPH_BASE_URL` still wins). `webServer` is also started around `run`, `demo` and `auto`.
**Different environments.** The config can be a function that reads `.env` values, so one project points at
several base URLs:

```typescript
export default defineConfig(({ mode, env }) => ({
  baseUrl: env.BASE_URL,            // .env: BASE_URL=http://localhost:3000, .env.staging: BASE_URL=https://staging.example.com
  extensions: mode === "staging" ? [] : ["hoppscotch"],
}));
```

`waygraph test --env staging` (any command takes `--env <mode>`; or `WAYGRAPH_ENV=staging`) loads `.env`, `.env.local`,
`.env.staging`, `.env.staging.local` in that order, each overriding the one before; the default mode is `NODE_ENV`, else
`development`. A value exported in the shell always wins over every file, and `WAYGRAPH_BASE_URL` still overrides `baseUrl`.

**Run and demo settings.** Each command has its own section, over shared top-level defaults:

```typescript
export default defineConfig({
  slowMo: 100,                                   // shared by run and demo
  run:  { slowMo: 0, video: { viewport: "1280x720" } },
  demo: { pace: "fast", typingMs: 20, slowMo: 350, autoNext: true, video: { viewport: "1920x1080" } },
});
```

`demo.appearance` pins the overlay to `"light"` or `"dark"` (by default it follows the system's setting), so every
recording looks the same whichever machine makes it.

`demo.pace` is the default pace for flows and steps that set none (`"fast"`, `"slow"`, `"blitz"`, or a multiplier);
`demo.speeds` defines the named paces as multipliers of normal dwell and gate time (defaults `{ blitz: 0.05, fast: 0.33, slow: 2 }`, lower is faster), e.g. `speeds: { fast: 0.5 }`. `demo.typingMs` is the typing animation in ms per character (`0` types instantly). In `demo`, `slowMo` is waygraph's own
pause after each action, applied once per action and not per keystroke, so a step's pace can remove it; in `run` it is
Playwright's `slowMo`. A single step takes `{ pace }` in the map: `.method(SetBearerTokenBlock, { pace: "blitz" })`, which
skips that step's typing animation and its pause. A flow takes `map({ demoPace })`.

Run settings can be defaults in the config, applied only when no flag, shell variable or `.env` value sets them:
`video: { dir, viewport }`, `slowMo`, `headed`, `demo: { autoNext, fast, appearance }`. `extensions`, `video`, `slowMo`, `headed`, `demo`,
`webServer` and `testDir` are waygraph's own; only the `playwright: {…}` block is Playwright's (browser extensions are not a
Playwright config option at all - waygraph launches a persistent context for them).

**Videos.** `--video` saves recordings to `<Downloads>/waygraph-videos/<project>` by default. Set `video.dir` in the config
(absolute, `~/…`, or relative to the project) or `WAYGRAPH_VIDEO_DIR` to put them elsewhere; `--video <dir>` wins over both.
"Downloads" is `~/Downloads` on macOS and Windows and `XDG_DOWNLOAD_DIR` on Linux. Without a Downloads folder (a server, a
container) or on CI the default is the project's `.waygraph-videos/`. waygraph checks the folder is writable first: on macOS the
first write into Downloads can trigger a one-time permission prompt for your terminal, and if it is refused waygraph warns and
saves in the project instead.

**Several configs.** A project can keep more than one: `config/waygraph.staging.config.ts` next to the default, chosen with
`waygraph test --config staging` (any command takes `--config <name|path>`, or set `WAYGRAPH_CONFIG`). The chosen config
replaces the default for everything: `baseUrl`, `extensions`, `webServer`, the `playwright` block, `run` / `demo`. A second
config can build on the first: `defineConfig({ ...base, baseUrl: "https://staging.example.com" })`. Each config file may export
its own `engine`; and an engine built from any config still follows the selected one for the browser it launches itself, so a
flow's static `import { engine }` does not pin the run to the default config.

Flows pass the same object to the Engine, so it is imported rather than read out of band:
the config file exports `export const engine = new Engine(config)`, and flows `import { engine } from "../../config/waygraph.config.js"`. The Engine uses
`baseUrl` and `extensions` for the browser it launches itself (`flow.run(mem)`); `waygraph test`, `run`, `demo`
and `auto` read the file too, for everything else.
A project's own `playwright.config.*` is not read (removed in 0.16.0); `waygraph upgrade` points one out so its settings
can move into `config/waygraph.config.ts`.
Editor integrations that look for a `playwright.config.ts` (the VS Code Playwright extension) won't find one; use `waygraph test` or `npm test`.

### Browser dialogs

A `confirm()`, `alert()`, `prompt()` or `beforeunload` freezes the page until it is answered, so the answer is
armed around the Block's action rather than written into it: `withDialog(CancelBlock, { accept: true, into: LeaveWarning })`
(`accept: false` dismisses; `into` keeps the dialog's text in `mem` for an assert Block to check).

### Flows: `map()` is the one way to define them

A flow is built with `engine.map()`. Its run settings go in `map({ … })`, before the chain (`memStub`, `expectedFailure`,
`demoPace`, `highlightStyle`, `sessionReset`, `as`, `input`, `homeOrigin`); `.end()` takes nothing. `sessionReset: true` says the flow wants a fresh
browser session when it runs after another one, in a CLI chain (`waygraph run "a then b"`) or nested with `.flow()`. The flow's title and narration are ctx stubs chained on
the Block where they apply (`ctx.ui.title(…)` names the flow from that step on), and a step's pace is its `{ pace }` option:

```typescript
const AddShown = AddItemBlock.stubAfter((ctx) => {
  ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "AC · item in cart", tag: "AC", duration: true });
});

export const shopFlow = engine
  .map({ memStub: true })
  .start()
  .gotoPage(NavHomeBlock.stubBefore((ctx) => ctx.ui.title("Shop")))
  .method(AddShown)
  .method(ClearCartBlock, { pace: "blitz" })
  .end();
```

**Accounts.** A flow that starts as someone signed in says who with `as`. An account is a name and the flow that signs
it in:

```typescript
// src/accounts/accounts.ts
export const StandardUser = account("standard-user", { signIn: loginFlow });

// src/flows/cart-as-account.flow.ts
export const cartAsAccountFlow = engine
  .map({ as: StandardUser, memStub: true })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock)
  .end();
```

The flow's first step is `sign-in-as-standard-user`: it clears the session, then restores the one kept since that
account's first sign-in in this process (cookies, and each origin's localStorage), or runs the account's sign-in flow
now and keeps what it leaves. So a chain or a test run signs each account in once, and a flow as an account has no login
steps of its own. The sign-in flow's steps run inside that step (the run log nests them under it; the demo plays them).
The step `requires` whatever the sign-in flow reads from mem, so preflight and `memStub` cover its credentials.
`forgetSessions()` drops every kept session. Sessions are kept per process, not on disk.

**Input: one flow for many cases.** A flow that runs the same steps over different data declares its input, a MemKey,
instead of one export per case:

```typescript
export const addItemFlow = engine
  .map({ as: StandardUser, input: SelectedItem.key, memStub: true })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock)
  .gotoPage(NavCartBlock)
  .end();
```

```bash
waygraph run addItemFlow --input '{"id":"sauce-labs-onesie","name":"Sauce Labs Onesie"}'
waygraph run addItemFlow --input @cases/items.json     # an array: the flow once per item, one episode each
```

The input is required by the flow's first step, so preflight asks for it, and `--data`, a mem stub and `--replay`
cover it like any key. In code, `.flow(addItemFlow, { input: item })` plays it with that input, once per call.

**A step whose page keeps changing after it acts** (a debounced search, a list rendered in bursts) takes `settle`:
`.method(TypeSearchBlock, { settle: true })` waits, after the step acts and before it is checked, for the page to load
and then not change for 300 ms (at most 5 s); `{ settle: { quietMs: 600, maxMs: 8000 } }` tunes it. It replaces a
fixed `page.waitForTimeout(...)`, which is either too short on a slow run or wasted time on a fast one.

**A step that only some cases need** takes `when`: `.method(SetJsonBodyBlock, { when: (mem) => mem.get(Case).body !==
undefined })` plays only when it returns true; otherwise the step ends at once where it started, without acting or
verifying. `when` is offered only on a step that stays on its Checkpoint (filling an optional field), so a skipped
step can't leave the flow somewhere its next step doesn't start.

**Nesting flows** is a step too: `.flow(sub, { reset })` runs another flow's steps inline, in the same page, browser and `mem`.
`{ reset: true }` (default: the sub-flow's own `sessionReset`) clears cookies and storage right before the sub-flow, for a second user that must start fresh:

```typescript
export const showcase = engine
  .map()
  .start()
  .flow(ownerFlow)
  .flow(viewerFlow, { reset: true })
  .end();
```

Removed in 0.16.0: `defineFlow([start, …, end])`, `chainFlow` and the `with*` flow wrappers (`withTitle`, `withMemStub`,
`withSessionReset`, `withDemoPace`, `withHighlightStyle`, `withExpectedFailure`, `withHighlightFixtures`, `withBlockPace`,
`withStubBefore|After|OnError`). `waygraph upgrade --codemod flows` rewrites a project onto
`map()`: it reads each Block's kind to pick the step, folds wrappers into `map({ … })`, moves a title into
`ctx.ui.title(…)` on the first step, and lists anything it can't convert (a Block not made by a factory, a
`withHighlightFixtures` map) with the fix. The same pass moves ctx stubs onto their one form: `ctx.ui.todos([...])` with
`todoId` / `todoTitle` / `todoStyle` / `todoPos` / `todoIndex` becomes `ctx.ui.todos(id, items, { title, style, pos, index })`,
and the method aliases become the names they stood for (`banner` -> `title`, `clearDevice` -> `hideDevice`, ...).

### Browser extensions

```typescript
export default defineConfig({
  extensions: ["hoppscotch", "./my-extension"],
});
```

Each entry is a known name (`hoppscotch`), a Chrome Web Store id, a path to an unpacked extension,
or `{ id, sha256 }` to pin the download. Store extensions are fetched on first use into
`$WAYGRAPH_CACHE_DIR` (default `~/.cache/waygraph/extensions`) and never replaced silently;
`waygraph extensions install [--update]` fetches or refreshes them ahead of time.
`WAYGRAPH_EXTENSIONS` (comma-separated unpacked directories) overrides the config.

Limits, because Chromium only loads extensions into a persistent profile:
- Chromium only, and Playwright's own build - `CHROME_PATH` is ignored while extensions are on.
- They load in the context waygraph launches (`run`, `demo`, `auto`, `pilot`, `Flow.run(mem)`),
  not in a Playwright test's `context` fixture, and not in `traverse` or `--all-branches`.
- A store extension keeps its store id (waygraph pins the `.crx`'s key in the manifest), so its requests carry a
  stable `Origin`, e.g. `chrome-extension://amknoiejhlmhancpahfcfcfhllgkpbld` for Hoppscotch. An API that checks
  `Origin` on writes (better-auth's `trustedOrigins`) can allow that one origin. Extensions cached by an older
  waygraph have a path-derived id; `waygraph extensions install --update` refetches them.
- An extension runs with its manifest permissions on every page of the run (Hoppscotch's asks for
  `<all_urls>` and cookies). Only list ones you trust, and pin `sha256` in shared configs.

### Testing a REST API through Hoppscotch

The scaffold's `(external)/hoppscotch` map drives Hoppscotch's REST client through its extension,
so requests skip CORS and can hit `localhost` APIs. Chain the blocks you need and set their `mem`
keys (`flows/hoppscotch-get`, `-post` and `-auth` are working examples):

| Block | Reads from `mem` |
|---|---|
| `set-method` | `RequestMethod` (`"POST"`, `"PUT"`, ...) |
| `set-url` | `RequestUrl` |
| `set-headers` | `RequestHeaders` (`{ name: value }`) |
| `set-query-params` | `RequestParams` (`{ name: value }`) |
| `set-bearer-token` | `RequestBearerToken` |
| `set-json-body` | `RequestBody` (JSON text) |
| `send-request` | - |
| `assert-status` | `ExpectedStatus` |
| `read-response-headers` | writes `ResponseHeaders` (lower-cased names) |
| `assert-response-header` | `ExpectedResponseHeader({ name, value })` |
| `read-response-body` | writes `ResponseBody` |
| `assert-response-body` | `ExpectedResponseText` (substring, whitespace ignored) |

Not covered yet: other auth types (Basic, API key, OAuth), form/multipart bodies, non-JSON content types.

### Updating an existing project

`npm install waygraph@latest` updates the framework, but the scaffold files copied at `init` stay as they were.
`waygraph upgrade [project]` compares the project with the scaffold shipped in the installed waygraph and lists
**new** files, **differing** files and a stale `waygraph` dependency. It is a dry run until you pass `--apply`.
Only the paths you name are copied (a real project usually deletes parts of the demo), and differing files are
replaced only with `--overwrite`; `--diff` prints what changed. For example:

```
waygraph upgrade "src/map/(external)/hoppscotch" src/flows --apply
```

`waygraph upgrade --skills` refreshes the agent skills in `.agents/skills` to the installed waygraph's (they are waygraph's own text, so it overwrites them). Shared files such as `src/states/*.ts` usually differ too, so review them with `--diff` and merge by hand.
