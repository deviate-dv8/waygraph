---
name: waygraph-convention
description: Author or review waygraph Blocks/Flows under the consumer + Waygraph Map conventions - use when writing new Blocks, migrating folder layout, or answering "how should this project be organized," not when driving an already-built session (use waygraph-pilot / waygraph-blind-pilot for that).
---

Waygraph convention is how Blocks are *shaped and placed*, not how a live session is
driven. Print this skill, then write or rearrange files so `waygraph check` / `waygraph map`
stay clean. For operating an existing graph, use `--skill-pilot`. For cold-start authoring
against a live site, use `--skill-pilot-blind`.

## Hard rules (not style preferences)

1. **One distinct action per Block.** Fill and submit are two Blocks. A login form is
   `fill-username` (self-loop) + `fill-password` (self-loop) + `submit-login` (transition),
   never one Method that "fills and logs in." Same split for checkout fields. Canonical
   shape: `examples/saucedemo/src/blocks/saucedemo-web/methods/`.
2. **Navigation only inside Nav.** `page.goto` / NavBlock `click` live in
   `defineNavBlock` / `defineNavClickBlock` only. Method/Effect `act` uses ActionPage
   (no goto) even when the app changes URL as a side effect of a button click.
   A Nav for a page that only exists after something else (every in-app page after sign-in)
   declares `from: [...]` with the Checkpoints it is valid from (a `SIGNED_IN` list in
   `src/states/`); without it, routing jumps there from anywhere, skipping sign-in.
3. **Selectors in `*Sel`, never inline.** DOM strings live in a `*Sel` next to the page - `_sel.ts`
   in the Map layout (one per page folder, next to `_nav`/`_page`/`_methods`), `<name>.sel.ts` in a
   freeform layout (one per concern) - never a fresh file-naming convention per project (`_sel.ts`,
   not `_selectors.ts` or a `_selectors/` folder). Mem keys store values, not selectors. `waygraph
   check` warns on inline selector literals in `Trait.visible` / `Trait.text`, and separately on any
   inline selector literal (`.locator("#x")`, `click: "#x"`) in a directory that already has a `_sel.ts`/`*.sel.ts`.
   **Plain CSS first, always.** An id, a class, or `[data-testid=…]` is the selector for
   almost everything real apps have - reach for that before anything else. Don't invent a
   regex/XPath match (`:has-text(/…/)`, `:text-matches(…)`, an XPath locator) for something a
   one-line class or id selector already targets uniquely; `waygraph check` flags this too.
   A regex/text match is for a genuinely unstable DOM with no stable attribute at all, not
   the default first move.
4. **Assert-only = `defineAssertBlock`.** Self-loop, no hand-written `act`/`resolve`. Pass
   an explicit type argument when it sits between two specifically-typed Blocks in a Flow.
   Not just static content or an action's result - it also names a *feature state* worth a
   Checkpoint of its own (a submit button greyed out until required fields are filled, a
   field error under one input, a stale "Save" re-enabling). Reach for a built-in Trait first: `Trait.text`,
   `contains`, `matches`, `value`, `attribute`, `absent`, `visible`, `disabled` / `enabled` (`text`, `contains` and `value`
   take a mem function for the expected value). A custom Trait returns `{ ok, saw }`, not a bare boolean, so its failure
   says what the page showed; never wrap a check in your own retry loop - verify already retries until `timeoutMs`.
   `Trait.disabled(selector)` /
   `Trait.enabled(selector)` cover that directly; write a custom Trait only for a state
   condition neither one expresses.
5. **`requires` = externally supplied.** A key an earlier Block in the same chain produces
   is never listed under `requires` - preflight checks the whole chain up front. For a
   genuinely arbitrary key (a username, an email) that a demo/dev run shouldn't need
   hand-supplied every time, `registerMemStub(key, fake)` + `memStub: true` on the flow (or
   `--mem-stub`) fills it from a registry instead - a key with no registration still fails
   preflight exactly as before, so this narrows what needs real input, never removes the guard.
   Data a run creates is made from `unique` (`registerMemStub(Signup.email, ({ unique }) => \`qa+${unique}@x.test\`)`),
   never a constant or `Date.now()`; what a flow creates is deleted in `.finally(DeleteApiBlock)`; a create that can
   meet an earlier run's data resolves to `Created` / `AlreadyExists` instead of failing. A failure that depended on its
   data reruns with `waygraph run <flow> --replay <runId>`.
   Put those `registerMemStub` calls in a `*.mem-stubs.ts` file (`src/states/demo.mem-stubs.ts`): live sessions (`auto`,
   `pilot`, `traverse`) load every one and use them as the default for a Block's `requires`.
6. **Checkpoints are values.** Declare each once in `src/states/`: `export const Home = checkpoint("Home");
   export type Home = typeof Home;` (a union: `export const CanAddItem = [Home, CartEmpty] as const`). Blocks take
   the values, never tag strings or `<In, Out>` type arguments: `defineNavBlock({ checkpoint: Home, … })`,
   `defineAssertBlock({ checkpoint: ItemInCart, … })`, `defineMethodBlock({ from: CanAddItem, to: ItemInCart, … })`
   (leave `from` out for "from anywhere"; `resolve` is implied when `to` is one Checkpoint). The Block then carries its
   route at runtime, so `waygraph graph`, `auto` and the manifest read it exactly. Older projects:
   `waygraph upgrade --codemod checkpoints`.
7. **One input/action per Method Block.** No block that `.fill()`s two fields or `.fill()` + `.click()` in one
   `act()` — split like saucedemo login (`fill-username`, `fill-password`, `submit-login`). Opt out per file:
   `// waygraph-ignore: multi-input` or `// waygraph-ignore-practices`.
8. **A transition never ships with an empty `verify`.** A framework can enforce that a check
   *exists*; it can't author the semantic content of one - only whoever knows what "success"
   means for this app can write it. That's the right line to draw, but it means an unfilled
   `verify: []` placeholder (codegen's honest way of not guessing) is indistinguishable from
   a Block that was never given real verification at all, and it passes `check`/`typecheck`/
   the orphan scan/`tsc` silently unless something is actually looking for it. Something is:
   `defineMethodBlock`/`defineEffectBlock` where `In`/`Out` genuinely differ (a transition,
   not a self-loop) needs a non-empty `verify`, same for `defineAssertBlock`. Opt out only
   when a *different* Block right after it in the `.flow.ts` is what actually confirms the
   transition (e.g. an `AssertXBlock`) - `// waygraph-ignore: empty-verify`.

9. **Never hand-write UI.** All demo UI goes through `ctx.ui` (`ring`, `caption`, `title`, `todos`, `slides`,
   `device`, `zoom`, `showNetworkTab`), chained where the flow uses the Block. Never build your own caption, highlight
   or banner in the page (`page.evaluate` + `document.createElement` / `innerHTML` / `.style`, `page.addStyleTag`),
   and never restyle or call waygraph's overlay (`#wg-*`, `.wg-*`, `window.__wg*`). It changes the page under test (an
   injected banner can cover a button, an injected style can hide a bug) and breaks silently when the overlay changes.
   If `ctx.ui` lacks something, say so and ask for it in waygraph - don't override. `waygraph check` flags it
   (`hand-written-ui`).

## Flows, stubs and config (the scaffold's shape)

- **Build flows with `map()`** (`engine.map({ memStub }).start().gotoPage(Nav).method(B, { pace }).assert(A).end()`;
  `.gotoExternal` for another origin); it is the only way to build one. Flow settings (`memStub`, `expectedFailure`, `demoPace`, `sessionReset`, `as`) go in `map({ … })` before the chain
  and `.end()` takes nothing. The flow's title is `ctx.ui.title(...)` in a stub. **Nest flows with `.flow(sub, { reset: true })`**.
  `defineFlow`, `chainFlow` and the `with*` flow wrappers were removed in 0.16.0; `waygraph upgrade --codemod flows` converts them.
- **Flows are the tests.** `waygraph test --flows` runs every flow as a Playwright test (workers, retries, video,
  reports); `map({ viewport })` sizes one, `map({ exclusive: true })` runs one alone and last. A project-written batch
  runner (parallelism, retries, "run these alone", a verdict file) is a smell. Write a spec only for what a flow can't say.
- **Outages, slow networks and time zones are flow settings.** `map({ network: { faults: [{ url, status: 503 }] } })`,
  `map({ network: { throttle: "offline" | "slow-3g" } })`, `map({ timezone: "Asia/Tokyo" })`: set when the flow starts,
  put back when it ends. Hand-written `page.route` / CDP calls inside Blocks are a smell.
- **No fixed waits.** A step whose page keeps changing after it acts takes `{ settle: true }` in the flow
  (`.method(TypeSearchBlock, { settle: true })`); a check that needs the page to catch up is already retried by verify.
  `page.waitForTimeout(...)` in a Block, or a hand-written "wait until the rows stop changing" loop, is a smell.
- **One flow per scenario, not per data case.** A flow that runs the same steps over different data declares
  `map({ input: CaseKey })` and is given `--input <json | @file>` (an array plays it once per item) or
  `.flow(sub, { input })`; a step only some cases need takes `{ when: (mem) => … }`. Exports like `r0`, `r0b`,
  `r1` … that differ by data, or data read from an env variable at load time, are a smell.
- **A flow that starts signed in runs `as` an account, never re-implementing the login or injecting cookies.**
  `export const Planner = account("planner", { signIn: plannerSignInFlow })` in `src/accounts/`, then
  `engine.map({ as: Planner })`: the account signs in once per run and later flows reuse its session. A hand-made
  "saved session" Block, tokens passed through env variables, or a login repeated at the top of every flow is a smell.
- **`src/flows/` holds use cases and mirrors the front end's endpoints**: a folder per page (`flows/auth/login/`) with one
  file per scenario named for its outcome (`success.flow.ts`, `wrong-password.flow.ts`, `empty-fields.flow.ts`), and
  `(user-stories)/` (any `(group)`) for flows that cross pages. Export names are `<page><Outcome>Flow`. Not one file per
  Block chain, not a flat folder of unrelated flows.
- **Blocks carry no stubs; the flow does.** Demo highlights are ctx stubs chained on the Block where the flow uses it:
  `AddItemBlock.stubAfter((ctx) => { ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "AC · item in cart" }); })`.
  That chained function is the only form: a Block's definition (its options or `instruction`) takes no stub, and a stub
  is never a slot map. A Block used twice gets one `const AddShown = AddItemBlock.stubAfter(...)`. A stub that throws
  fails its step in the demo, named.
- **Reading a value into `mem` happens in `act`** (`mem.set(Key, value)`), like Mailpit's `extract-email-link`.
  `observe` is only for a Block that branches (it feeds `resolve`); an empty `act(){}` plus an `observe` that
  writes `mem` is a misuse.
- **A flow about one outcome says so with `lands`, never a cast.** `.method(SubmitLoginBlock, { lands: LoggedIn })`
  types the flow from `LoggedIn` and fails the run if the Block lands elsewhere; `Block as unknown as MethodBlock<A, B>`
  (a `*-for-flow.ts` alias) hides the other outcome and never checks it. To follow every outcome, `.branch()`.
- **Narrate a fast-forwarded step on the step itself.** Stubs chained on Blocks inside an `{ ff: true }` window run
  when the unit plays (todos, title, caption; no rings). A do-nothing Block added only to paint the dock is a smell.
- **Demo pace is a map option or config, never a wrapper.** `.method(SetBearerTokenBlock, { pace: "blitz" })` speeds one step,
  `map({ demoPace: "fast" })` a flow, `demo: { pace, typingMs, slowMo }` in the config the whole project.
- **Per-environment values** (a different `baseUrl` for staging) come from `.env` files read in the config function:
  `defineConfig(({ env }) => ({ baseUrl: env.BASE_URL }))`; `--env staging` loads `.env.staging`. Never edit the config to switch.
- **More than one config** (staging, another app) is another file, `config/waygraph.<name>.config.ts`, chosen with `--config <name>`.
  The engine a config exports, and every engine in a flow, follows the selected config.
- **A browser dialog (`confirm`, `beforeunload`) is answered with `withDialog(block, { accept, into })`**, not inside the
  Block's `act`; the click Block stays a plain click.
- **Project settings live in `config/waygraph.config.ts`** (`defineConfig({ baseUrl, testDir, webServer,
  extensions, playwright: {...} })`). The config file also exports `engine = new Engine(config)`; flows `import { engine } from "../../config/waygraph.config.js"`; a project needs no
  `playwright.config.ts` - `waygraph test` builds one from it (a project's own `playwright.config.*` is not read).
- **Another origin the test needs is a Map external** under `src/map/(external)/<tool>/`. For REST API
  tests, `(external)/hoppscotch` (list `extensions: ["hoppscotch"]` in the config) drives hoppscotch.io's client
  with the extension, so requests skip CORS: `set-method`, `set-url`, `set-headers`, `set-json-body`,
  `send-request`, `assert-status`, `read-response-body`, `assert-response-body`.
- **Updating an older project:** `npm install waygraph@latest`, then `waygraph upgrade` (dry run) to see new
  and differing scaffold files; copy the paths you want with `--apply`. `waygraph upgrade --skills` refreshes these skills.

## Block kinds (file convention)

| Kind | File | Helper | `page.goto`? |
|------|------|--------|--------------|
| Page | `*.page.block.ts` / `_page.block.ts` | `definePageBlock` | Optional deep-link |
| Nav | `nav-*.block.ts` / `_nav.block.ts` | `defineNavBlock` / `defineNavClickBlock` | Yes (`url` XOR `click`) |
| Effect | `*.effect.block.ts` in `methods/` / `_methods/` | `defineEffectBlock` | No |
| Method | `*.method.block.ts` in `methods/` / `_methods/` | `defineMethodBlock` | No |
| Assert | with Method/Effect peers | `defineAssertBlock` | No |
| API | `*.api.block.ts` in `methods/` | `defineApiBlock({ from, to, call })` (a real HTTP request; `map().method(...)`) | No |

Effects that appear in `waygraph auto` menus need `instanceOptions` that scan the live DOM
(or mem) for labeled rows.

## Two layouts (same Block kinds)

**Freeform ("manual mode")** - still valid; real consumers depend on it:

```text
src/blocks/<site>/                 # THIS FOLDER IS URL "/"
  nav-login.block.ts
  methods/fill-username.method.block.ts
  inventory/                       # /inventory.html
    inventory.page.block.ts
    methods/add-to-cart.effect.block.ts
```

Folders mirror real app routes (Next.js `app/` page routes). Do **not** invent parallel
families like `root/`, `landing/`, or `shell/nav/` that are not real URLs. `/` lives at the
namespace root.

**Waygraph Map** - forced convention when `src/map/` exists:

```text
src/map/
  (app_base)/                      # organizational group only - never part of a Checkpoint tag
    dashboard/                     # must verbatim-match the real URL path (/dashboard)
      _page.block.ts
      _nav.block.ts
      _sel.ts
      _methods/click-widget.block.ts
  (external)/                      # cross-origin (mailpit, etc.) - same shape
    docs/
      _page.block.ts
      _nav.block.ts
      _sel.ts
```

- `(group)` parentheses and leading-underscore segments (`_methods/`, `_page…`) are
  **not** URL segments. `waygraph map` excludes them when checking folder-vs-URL.
- A bare non-underscore folder always means a real child Checkpoint/URL segment.
- `map()` rejects Blocks that didn't come from a real factory (no silent teleporting).

Mail / external tools: under `*-external/<tool>/` or `map/(external)/<tool>/`, never under
the site's `*-web/` tree. Browser-driven (DOM / iframe Traits), not the catcher's REST API.

## Verify before you call it done

```bash
npx waygraph check .          # orphans + nav-escape + inline-selector + bad-practice warnings
npx waygraph typecheck .      # tsc --noEmit + bad-practice warnings (npm run typecheck)
npx waygraph check --no-practices .   # skip bad-practice scan only
npx waygraph map .            # exit 1 if src/map/ folder path != real static url
npx waygraph validate .       # every .flow.ts loads
npx waygraph graph .          # nodes/edges/skipped/orphans - counts should make sense
npx waygraph manifest .       # JSON of every Block (kind, from/to, requires), Flow and Checkpoint
npx waygraph map pack <group> # a src/map/ group with its own _states.ts/_keys.ts -> installable package
npm run typecheck             # when the consumer has it
```

Every `run`/`demo`/`test` also writes `.waygraph/runs/<runId>.jsonl` (step start/end/error, artifacts): read the
newest one to see which Block failed and with what error, instead of re-running.

`waygraph check` should report zero nav warnings. Orphan Blocks (not in any `.flow.ts`)
are still runnable in Pilot's live menu - orphan status only blocks
`auto --blocks <From> <To>` pathfinding.

**Static tools above only find gaps in Blocks that already exist.** A real link/button on
the live page with *no Block written for it at all* has nothing in source for `check`/
`graph` to scan - the only way to find that is to actually run the app. Every live
`auto`/`browser`/`pilot` session watches the real page and warns (once per element) on
anything with no matching Block:

```text
[waygraph] unmapped nav link on this page: /settings - no NavBlock covers this URL; add defineNavBlock
[waygraph] unmapped button on this page: #save-draft - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock
```

Read them back with `auto console <sessionId>` (same channel as real console/network
errors) - see `--skill-pilot`'s "Coverage gaps on the live page" section for the full
detection rules (same-origin `<a href>` only, visible clickables only, one warning per
element per session).

## Related skills (print via CLI)

```bash
npx waygraph --skill                 # list
npx waygraph --skill-pilot           # drive an existing Block graph
npx waygraph --skill-pilot-blind     # cold-start: raw ops + author Blocks as you go
npx waygraph --skill-convention      # this file
```

Worked freeform example: `examples/saucedemo/docs/CONVENTION.md`.
Map design history: `openspec/changes/waygraph-map/`.
Agent personas (author/planner/healer): `npx waygraph agent-dive --loop claude`.
