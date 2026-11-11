---
name: waygraph-convention
description: Author or review waygraph Blocks/Flows under the consumer + Waygraph Map conventions - use when writing new Blocks, migrating folder layout, or answering "how should this project be organized," not when driving an already-built session (use waygraph-pilot / waygraph-blind-pilot for that).
---

Waygraph convention is how Blocks are *shaped and placed*, not how a live session is
driven. Print this skill, then write or rearrange files so `waygraph check` / `waygraph map`
stay clean. For operating an existing graph, use `--skill-pilot`. For cold-start authoring
against a live site, use `--skill-pilot-blind`.

## What this project is for

Waygraph is an opinionated Playwright, testing first: the app's features become readable, reusable Blocks, and the flows
read like scenarios a QA who doesn't write code can follow. When two ways of writing something both work, pick the one
that makes the flow read more like the scenario and the Block more reusable. Demos, sessions and automation reuse the
same Blocks; they never justify a Block or flow that is harder to read as a test.

## Agents work through waygraph, never around it

Everything an agent adds to a waygraph project is waygraph: Blocks in the map, flows in `src/flows/`, accounts, mem
stubs, a page's read, Expect Blocks, the config. No workarounds next to it: no script of your own that drives a browser,
no helper that pokes the page outside a Block, no runner of your own, no checks of your own with their own retries.
A workaround works today and is invisible tomorrow: `waygraph check`, the map, the demo, Waygraph Studio and the next agent
can't see it, so it rots, and the project slowly becomes a Playwright project with waygraph on the side.

A person may do things by hand (a one-off script, poking the app, a quick fix to get unblocked); that's their call,
and it isn't a pattern to copy. Code that's already there and isn't waygraph isn't permission either: don't extend it,
and when you touch it, move it to the convention or say it should be.

| A workaround | The waygraph way |
|---|---|
| A sign-in script (`chromium.launch()`, fill, click, read the cookie), a "saved session" Block, tokens in env | `account(name, { signIn, mem, ttl })` in `src/accounts/`, flows `map({ as })`; `ttl` keeps the session between runs |
| A runner of your own (`npx tsx run.ts`) that starts the app, loops over cases, runs them in parallel, retries | `waygraph test --flows` (`--workers`, `--retries`, `-g`), `webServer` in the config, `map({ input })` for cases |
| A check written as a function over `page` (`page.locator(...).textContent()` and compare) | The page's `read` gives it; the check is `Page.read.x.is(...)` / `.passes(...)`, or an Expect Block in the page's `_expects/` |
| A retry or polling helper (`settles`, `waitUntil`, a loop with `sleep`) | Nothing: verify retries every Trait; `{ settle: true }` on a step whose page keeps changing |
| A helper that drives the page outside a Block (`clickClear(page, sel)`, `pasteInto`, `setDateTime`) | A Method Block, one action, in the page's `_methods/`; a field that needs a special way of typing is that Block's `act` |
| Selectors in a check file or a test | The page's `_sel.ts` |
| Evidence written by hand (a `.log`, a results `.md`, screenshots copied around) | The run log (`.waygraph/runs/`), `screenshot: true` on a step, `--video`, Waygraph Studio, `--reporter` |
| A cast or a function over `MapBuilder` to share steps (`as MethodBlock<...>`, `(m: MapBuilder) => m...`) | `{ lands: X }` for a branch; `steps(Checkpoint, (m) => m...)` played with `.steps(part)` |
| Talking to the API with `fetch` in a test or a helper | An API Block (`defineApiBlock`) in `src/map/(api)/` |
| Waiting for an email with your own polling | The Mailpit / MailHog Blocks (`(external)/`) and `claimOnce` for a shared inbox |

When waygraph can't do what the task needs, stop and say so: what you needed, what waygraph lacks, and the smallest
thing that would let a Block or a flow do it (a new `ctx.ui` piece, a Trait, a setting). Don't build around it; a gap
reported is fixed once in waygraph, a gap worked around is copied into every project.

## Hard rules (not style preferences)

1. **One distinct action per Block.** Fill and submit are two Blocks. A login form is
   `fill-username` (self-loop) + `fill-password` (self-loop) + `submit-login` (transition),
   never one Method that "fills and logs in." Same split for checkout fields: no Block `.fill()`s
   two fields or `.fill()`s and `.click()`s in one `act()` (`waygraph check`: `multi-input`,
   `combined-action`). Canonical shape: `node_modules/waygraph/examples/saucedemo/src/blocks/saucedemo-web/methods/`.
2. **Navigation only inside Nav.** `page.goto` / NavBlock `click` live in
   `defineNavBlock` / `defineNavClickBlock` only. A Method's `act` uses ActionPage
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
4. **Two questions, two homes.** A Block's `verify` answers "did this step do what it says?" (it arrived where `resolve`
   said; its action took effect) - true in every flow that uses the Block, and what a live session uses to tell where it
   is. What a *scenario expects* (a toast's text, a row reading Down, an error message) is an **expectation**:
   `expect: [...]` on the Block when every use expects it (per outcome for a branching Block: `{ Saved: [...],
   Form: [...] }`), or on the step when only this scenario does. Expectations are Expect Blocks
   (`defineExpectBlock({ name, description, checkpoint, verify })`, in the page's `_expect/`, named on its Page Block's
   `expects`), Traits, and read checks (`Machine.status.is("Archived")`, `Catalog.items.passes((items, mem) => ...)`).
   **An expectation only reads**: no click, type, navigation or `mem.set` (it fails, naming the action) - an action a
   check needs is a Method step before it. They run together after `verify` and a failing step lists every one that
   didn't hold. A URL or "is visible" check is `verify`, not an expectation; a message or toast check is an expectation,
   not `verify`. An Expect Block also names a *feature state* worth a
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
   data reruns with `waygraph run <flow> --replay <runId>` (a per-run value, from `unique`, is made new again; the
   rest is replayed).
   Put those `registerMemStub` calls in a `*.mem-stubs.ts` file (`src/states/demo.mem-stubs.ts`): `run`, `demo`, `test`
   and the live sessions load every one themselves, so no flow or spec imports it. The scaffold's engine is
   `new Engine({ ...config, memStub: true })`: every flow fills missing keys from stubs, and `flow.run()` does it too, so a
   spec never calls `seedMemStub`.
6. **A Checkpoint is a page**, with its own address; what changed on it is a field of its `read`, not another
   Checkpoint (`waygraph check` names one that only Methods reach with no address, or that has another page's).
   **Checkpoints are values.** Where every flow begins is `Start` (`import { Start } from "waygraph"`): a Block
   that leads off a flow is `from: Start`, a sign-out goes `to: Start`; never write its tag. Declare the rest once in
   `src/states/`: `export const Home = checkpoint("Home");
   export type Home = typeof Home;` (a union: `export const HomeOrDocs = [Home, Docs] as const`). Blocks take
   the values, never tag strings or `<In, Out>` type arguments: `defineNavBlock({ checkpoint: Home, … })`,
   `defineExpectBlock({ checkpoint: Cart, … })`, `defineMethodBlock({ from: HomeOrDocs, to: Cart, … })`
   (leave `from` out for "from anywhere"; `resolve` is implied when `to` is one Checkpoint). The Block then carries its
   route at runtime, so `waygraph graph`, `auto` and the manifest read it exactly. Older projects:
   `waygraph upgrade --codemod checkpoints`.
   Mem keys likewise: one namespace per area, its type's fields the keys -
   `export const SaucedemoKeys = keys("saucedemo")<{ credentials: Creds; selectedItem: Item }>();`, used as
   `SaucedemoKeys.credentials` (`requires`, `mem.get`, `registerMemStub`). Older projects: `waygraph upgrade --codemod keys`.
7. **A transition never ships with an empty `verify`.** A framework can enforce that a check
   *exists*; it can't author the semantic content of one - only whoever knows what "success"
   means for this app can write it. That's the right line to draw, but it means an unfilled
   `verify: []` placeholder (codegen's honest way of not guessing) is indistinguishable from
   a Block that was never given real verification at all, and it passes `check`/`typecheck`/
   the orphan scan/`tsc` silently unless something is actually looking for it. Something is:
   `defineMethodBlock` where `In`/`Out` genuinely differ (a transition,
   not a self-loop) needs a non-empty `verify`, same for `defineExpectBlock`. Opt out only
   when the step's expectations are what actually confirm the transition - `// waygraph-ignore: empty-verify`.

8. **Never hand-write UI.** All demo UI goes through `ctx.ui` (`ring`, `caption`, `title`, `todos`, `slides`,
   `device`, `zoom`, `showNetworkTab`), chained where the flow uses the Block. Never build your own caption, highlight
   or banner in the page (`page.evaluate` + `document.createElement` / `innerHTML` / `.style`, `page.addStyleTag`),
   and never restyle or call waygraph's overlay (`#wg-*`, `.wg-*`, `window.__wg*`). It changes the page under test (an
   injected banner can cover a button, an injected style can hide a bug) and breaks silently when the overlay changes.
   If `ctx.ui` lacks something, say so and ask for it in waygraph - don't override. `waygraph check` flags it
   (`hand-written-ui`).

## Flows, stubs and config (the scaffold's shape)

- **Build flows with `map()`** (`engine.map().gotoPage(Page.nav).method(Page.do.b, { pace, expect: [Page.expects.a] })`;
  `.gotoExternal` for another origin); it is the only way to build one. Flow settings (`memStub`, `expectedFailure`, `demoPace`, `sessionReset`, `as`) go in `map({ … })` before the chain
  and the chain itself is the flow: there is no closing call. The flow's title is `ctx.ui.title(...)` in a stub. **Nest flows with `.flow(sub, { reset: true })`**.
  `defineFlow`, `chainFlow` and the `with*` flow wrappers were removed in 0.16.0; `waygraph upgrade --codemod flows` converts them.
- **A flow imports one thing per page it visits: the page's Page Block.** `definePageBlock({ checkpoint: Home, nav:
  NavHomeBlock, read: (ctx) => ({ ... }), do: () => ({ addItem: AddItemBlock }) })` exported as `HomePage`; the flow writes
  `.gotoPage(HomePage.nav).method(HomePage.do.addItem)`, each typed as its own Block. Imports use the project's
  `#config/`, `#map/`, `#states/` names (`import { HomePage } from "#map/(app_base)/home/_page.block"`), never a chain of
  `../`. No file is imported for its side effect (`import ".../_page.block.js"`, `import ".../x.mem-stubs.js"`): the
  tools load Block, Page and stub files themselves. A Page Block's `expects: { saved: () => ExpectSavedBlock }` names what
  can be checked on the page, so `HomePage.expects.saved` comes from the same import. An older project moves onto pages
  with `waygraph upgrade --codemod pages` once each Page Block has its `nav` and `methods` / `expects` records.
- **UI on many pages is a layout, declared once.** A sidebar, top bar, user menu or breadcrumbs go in a
  `_layout.block.ts` (`defineLayout({ name, go: { plan: { to: ProductionPlan, click: SidebarSel.plan } }, do, read })`)
  in the folder of the pages they wrap: it covers every page in that folder and below, so a flow writes
  `.gotoPage(Sidebar.go.plan)` from any of them. `on: [Pages]` only when the app's layout doesn't follow its folders;
  `to: "parent"` for a link up, and `Trait.breadcrumbs(sel)` to check the trail. Never the same Nav or Method on each
  page, and never a list of pages on a Nav.
- **Two people (or the app and a helper) in one scenario are panes, one flow.** Declare each pane once as a value (`export const AdminPane = pane("admin", { as: Admin })`), then `map({ panes: [PlannerPane, AdminPane] })`, `.in(AdminPane)` before the admin's steps and `.in(PlannerPane)` to come back; `with: AppPane` for a second page of the same person (the mail catcher); `.close(pane)` to go back to one screen. Never two
  flows for one story, never a sign-out and sign-in in the middle. The same flow two ways (two accounts, devices or
  environments) is `--compare`, not a copy of the flow.
- **Who sees what is `for: [accounts]`** on the layout's link, the Method or the Page Block, beside what it's about. A
  role is the accounts that share a `for`; `waygraph test --flows` adds each account's access test, and `waygraph
  check` flags a flow `as` an account using what it isn't given. Never a role check written in a flow.
- **`screenshot: true` on a Page Block** takes the page's picture whenever a step lands there (on any other Block: once
  its step is done). Waygraph Studio shows each page's newest on its map and each step's on the run; put it on the pages a
  reader would want to see, not on every Block.
- **What a step's scenario expects goes on the step:** `.method(Detail.do.confirmArchive, { expect: [Registry.expects.archivedToast,
  Machine.status.is("Archived")] })`. A check on one value is `Key.is(value)` inline, not an Expect Block per value;
  write an Expect Block for a named check worth reusing, or one that needs selectors. `.assert()` steps are gone
  (`waygraph upgrade --codemod expect` folds them into the step before). `map({ expect: false })` for a setup flow.
- **One Block, many inputs: `.set(Key, value)` before the step.** `.set(Keys.search, (mem) => mem.get(Keys.machine).code)
  .method(RegistryPage.do.fillSearch)`; never one Fill Block per value (`fill-search-padded`, `fill-search-down-machine`).
- **The same steps in several flows are a part:** `export const logDisruption = steps(DisruptionLog, (m) => m.method(…).method(…))`,
  played with `.steps(logDisruption)`. A function over `MapBuilder` with a hand-written `type Start = MapBuilder<…>` is a smell.
- **Setup is steps, cleanup is `.finally`.** Data a flow needs is made first (`.flow(seedFlow)` of API Blocks), not taken
  from whatever the database holds; what it made is deleted in `.finally(DeleteApiBlock)`.
- **Flows are the tests.** `waygraph test --flows` runs every flow as a Playwright test (workers, retries, video,
  reports); `map({ device })` plays one on a device (`"mobile"`, `{ preset: "tablet", orientation: "landscape" }`; the config's `device` is every flow's default), `map({ exclusive: true })` runs one alone and last. A project-written batch
  runner (parallelism, retries, "run these alone", a verdict file) is a smell. Write a spec only for what a flow can't say.
- **What can pop up on any page is a layout's interrupt**, never a step in a flow: `defineLayout({ interrupts: { cookies: { when: "#cookie-banner", do: (page) => page.getByRole("button", { name: "Accept" }).click() } } })`. It is handled wherever it shows up while a step runs; the run log and the demo say so.
- **Every page has a `read`.** A page's `do` says what you can do there; its `read` says what it shows, as
  typed data: in the run log after every step that lands there, from `waygraph auto read` for an agent, and for a test
  without DOM queries. It lives on the page's `definePageBlock` (`read: (ctx) => ({ title: ctx.page.text(Sel.title) })`, types
  inferred, keys `Page.read.title`; what every page of a layout shows is the layout's `read`), never with mem stubs: mem is what a flow is
  given, a read is what the page shows. `waygraph check` lists pages without one. A check on what a page shows is
  `Catalog.items.passes((items) => items.length === 6)` or `Header.cartCount.is(1)`, not a selector count; its test
  also gets mem: `(items, mem) => items.some((i) => i.name === mem.get(Keys.item).name)` checks the page shows what the
  flow did.
- **Shared things are claimed, not raced for.** When parallel runs could pick the same thing (the newest email in a
  shared inbox, an account from a pool), take it with `claimOnce(name)`: true for one caller on the machine. A
  hand-rolled lock file is a smell.
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
- **Groups of flows are labels in the config** (`labels: { auth: ["src/flows/auth/**", "logoutFlow"] }`), run with
  `waygraph test --flows --label auth`. A new flow in a labelled folder joins its label; one elsewhere that belongs to a
  group gets its export name added to that label. Never keep a list of flows of your own (a script, a spec that imports
  them, a grep pattern in package.json).
- **A flow that starts signed in runs `as` an account, never re-implementing the login or injecting cookies.**
  `export const Planner = account("planner", { signIn: plannerSignInFlow })` in `src/accounts/`, then
  `engine.map({ as: Planner })`: the account signs in once per run and later flows reuse its session. A hand-made
  "saved session" Block, tokens passed through env variables, or a login repeated at the top of every flow is a smell.
  When one sign-in flow serves several people (a magic link, by email), the account says who:
  `account("leadership", { signIn: loginLeadershipFlow, mem: (m) => m.set(Keys.recipient, { email: "cesar@…" }) })`.
  Waygraph loads `src/accounts/`, so the sign-in flow played on its own (a demo) signs in as that person too.
  When the app signs people out after a while, give the account a `ttl` a little under it (`ttl: "15m"`): an older
  session signs in again, and a good one is saved so later runs and test workers reuse it. Never save a session by
  hand (`storageState` files, cookies in fixtures).
- **`src/flows/` holds use cases and mirrors the front end's endpoints**: a folder per page (`flows/auth/login/`) with one
  file per scenario named for its outcome (`success.flow.ts`, `wrong-password.flow.ts`, `empty-fields.flow.ts`), and
  `(user-stories)/` (any `(group)`) for flows that cross pages. Export names are `<page><Outcome>Flow`. Not one file per
  Block chain, not a flat folder of unrelated flows.
- **Blocks carry no stubs; the flow does.** Demo highlights are ctx stubs chained on the Block where the flow uses it:
  `AddItemBlock.stubAfter((ctx) => { ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "AC · item in cart" }); })`.
  That chained function is the only form: a Block's definition (its options or `instruction`) takes no stub, and a stub
  is never a slot map. A Block used twice gets one `const AddShown = AddItemBlock.stubAfter(...)`. A stub that throws
  fails its step in the demo, named.
- **The demo already says how each step went**, with no stub: its outcome card ticks each expectation (an Expect Block's
  `description`, so give every Expect Block one a QA reader understands) and lists what the page's `read` gives that
  changed. Narrate what that doesn't say; don't repeat it in a caption.
- **Captions and slides are spoken** in a recorded demo with a voice (`demo.voice` in the config): write them as a
  person would say them (a sentence, not a key name or a selector), and give each Block a `description` that reads
  aloud too (`steps: true` speaks it). Never add a second, spoken copy of a caption by hand.
- **Reading a value into `mem` happens in `act`** (`mem.set(Key, value)`), like Mailpit's `extract-email-link`.
  `observe` is only for a Block that branches (it feeds `resolve`); an empty `act(){}` plus an `observe` that
  writes `mem` is a misuse.
- **A flow about one outcome says so with `lands`, never a cast.** `.method(SubmitLoginBlock, { lands: InventoryPage })`
  types the flow from `InventoryPage` and fails the run if the Block lands elsewhere; `Block as unknown as MethodBlock<A, B>`
  (a `*-for-flow.ts` alias) hides the other outcome and never checks it (`waygraph upgrade --codemod lands` converts
  them). To follow every outcome, `.branch()`.
- **Fast-forward several steps with `.ffStart()` … `.ffEnd()`**, one step with `{ ff: true }`.
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
  extensions, playwright: {...} })`). The config file also exports `engine = new Engine({ ...config, memStub: true })`; flows `import { engine } from "#config/waygraph.config"`; a project needs no
  `playwright.config.ts` - `waygraph test` builds one from it (a project's own `playwright.config.*` is not read).
- **Another origin the test needs is a Map external** under `src/map/(external)/<tool>/`. For REST API
  tests, `(external)/hoppscotch` (list `extensions: ["hoppscotch"]` in the config) drives hoppscotch.io's client
  with the extension, so requests skip CORS: `set-method`, `set-url`, `set-headers`, `set-json-body`,
  `send-request`, `read-response-body` (Methods), and on its Page Block's `expects`: `status`, `response-body`, `response-header`.
- **Updating an older project:** `npm install waygraph@latest`, then `waygraph upgrade` (dry run) to see new
  and differing scaffold files; copy the paths you want with `--apply`. `waygraph upgrade --skills` refreshes these skills.

## Complete files (copy the shape, not the names)

A Nav: where a page is, and how you know you're there.

```ts
// src/map/(app)/inventory/_nav.block.ts
import { defineNavBlock, Trait } from "waygraph";
import { Inventory, SIGNED_IN } from "../../../states/shop.states.js";
import { InventorySel } from "./_sel.js";

export const NavInventoryBlock = defineNavBlock({
  name: "nav-inventory",
  description: "Opens the product list.",
  checkpoint: Inventory,
  url: "/inventory.html",          // or click: InventorySel.menuLink (defineNavClickBlock), or (mem) => `/item/${mem.get(ShopKeys.item).id}`
  from: SIGNED_IN,                 // only reachable after sign-in; leave out for "from anywhere"
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
});
```

A Method with two outcomes: `observe` looks, `resolve` names the Checkpoint from what `observe` returned (it gets no
page and no mem), `verify` checks the outcome it landed on.

```ts
export const SubmitLoginBlock = defineMethodBlock({
  name: "submit-login",
  description: "Submits the form; a wrong password stays on the login page.",
  from: LoginPage,
  to: [InventoryPage, LoginPage],
  instruction: {
    async act(page) {
      await page.locator(LoginSel.submit).click();
    },
    async observe(page) {
      return (await page.locator(LoginSel.error).isVisible()) ? "refused" : "in";
    },
    resolve: (seen) => (seen === "in" ? InventoryPage : LoginPage),
    verify: (out) => (out.__state === "InventoryPage" ? [Trait.url({ pathname: "/inventory.html" })] : [Trait.visible(LoginSel.error)]),
  },
});
```

A Method on one row of many: `requires` names the row's key in mem, and `instanceOptions` lists the rows for `auto` /
Pilot menus, each setting the key `act` reads.

```ts
export const AddToCartBlock = defineMethodBlock({
  name: "add-to-cart",
  from: Inventory,
  to: Inventory,                                     // the page stays the list; what changed is what it shows
  requires: [ShopKeys.selectedItem],
  instruction: {
    async act(page, _input, mem) {
      await page.locator(InventorySel.addBtn(mem.get(ShopKeys.selectedItem).id)).click();
    },
    verify: [
      Catalog.items.passes((items, mem) => items.some((i) => i.name === mem.get(ShopKeys.selectedItem).name && i.inCart), "the item in the cart"),
    ],
  },
  async instanceOptions(page): Promise<readonly WaygraphInstanceOption[]> {
    // { id, name } per live Add button; name as the page's `read` reads it, so verify can find the row
    const items = await collectAddableItems(page);
    return items.map((item) => ({ id: item.id, label: `Add ${item.name}`, key: ShopKeys.selectedItem, value: item, highlight: InventorySel.addBtn(item.id) }));
  },
});
```

An Expect Block, an API Block, and a page with a `read`:

```ts
// src/map/(app_base)/cart/_expect/checkout-gated.expect.block.ts - listed on CartPage's `expects`
export const ExpectCheckoutGatedBlock = defineExpectBlock({
  name: "expect-checkout-gated",
  description: "Checkout stays disabled while the cart is empty.",
  checkpoint: CartPage,
  verify: [Trait.disabled(CartSel.checkout)],                       // reads only: no click, no navigation
});

export const DeleteTestUserApiBlock = defineApiBlock({
  name: "delete-test-user",
  to: checkpoint("*"),                               // cleanup: lands where it started
  requires: [SignupKeys.email],
  method: "DELETE",
  call: ({ request, mem }) => request.delete(`/api/users/${encodeURIComponent(mem.get(SignupKeys.email))}`),
});

// _page.block.ts: the page says what it shows, and the keys of it exist as soon as it does
export const Inventory = definePageBlock({
  name: "page-inventory",
  checkpoint: InventoryPage,
  nav: NavInventoryBlock,
  read: (ctx) => ({
    items: ctx.page.list(InventorySel.card, (row) => ({
      name: row.text(InventorySel.name),
      price: row.number(InventorySel.price),
      inCart: row.visible(InventorySel.removeBtn),
    })),
  }),
  do: () => ({ addToCart: AddToCartBlock }),
  expects: (page) => ({ cartHasItems: page.read.items.passes((items) => items.some((i) => i.inCart), "an item in the cart") }),
});
// A Method that checks the page it belongs to writes verify as a function, so the two files can import each other:
//   verify: (): Trait[] => [Inventory.read.items.passes((items) => items.length > 0)]
```

Readers: `text`, `texts`, `number` (`"$1,299.00"` -> 1299), `attr`, `value`, `visible`, `count`,
`list(rowSel, (row) => ({ ... }))`, `table(sel, { field: "Column header" })`, `fn(async (page, mem) => ...)`.

A flow, narrated where it uses the Blocks:

```ts
// src/flows/inventory/add-item.flow.ts
import { engine } from "#config/waygraph.config";
import { StandardUser } from "#states/accounts";
import { ShopKeys } from "#states/shop.mem-keys";
import { InventoryPage } from "#map/(app_base)/inventory/_page.block";
import { CartPage } from "#map/(app_base)/cart/_page.block";
import { HeaderSel } from "#map/(app_base)/inventory/_sel";
import { EmptyCartApiBlock } from "#map/(api)/cart/empty.api.block";

const AddShown = InventoryPage.do.addToCart.stubAfter((ctx) => ctx.ui.ring("cart", { selector: HeaderSel.cart, label: "Item in cart", tag: "AC" }));

export const inventoryAddItemFlow = engine
  .map({ as: StandardUser, input: ShopKeys.selectedItem })
  .gotoPage(InventoryPage.nav.stubBefore((ctx) => ctx.ui.title("Add an item")))
  .method(AddShown)
  .gotoPage(CartPage.nav, {
    expect: [Cart.items.passes((items, mem) => items.some((i) => i.name === mem.get(ShopKeys.selectedItem).name), "the item in the cart")],
  })
  .finally(EmptyCartApiBlock);
```

Check an API Block's exact `call` signature and the helpers' options against the installed version's types
(`node_modules/waygraph/dist/index.d.ts`) rather than memory.

## Block kinds (file convention)

| Kind | File | Helper | `page.goto`? |
|------|------|--------|--------------|
| Page | `*.page.block.ts` / `_page.block.ts` | `definePageBlock` | Optional deep-link |
| Nav | `nav-*.block.ts` / `_nav.block.ts` | `defineNavBlock` / `defineNavClickBlock` | Yes (`url` XOR `click`) |
| Method | `*.method.block.ts` in `methods/` / `_methods/` | `defineMethodBlock` (one row of many: `requires` + `instanceOptions`) | No |
| Expect | `*.expect.block.ts` in `_expect/` (freeform: `expect/`) | `defineExpectBlock` (in an `expect: [...]`, never a step) | No |
| API | `*.api.block.ts` in `methods/` | `defineApiBlock({ from, to, call })` (a real HTTP request; `map().method(...)`) | No |

Methods on one row of many, in `waygraph auto` menus, need `instanceOptions` that scan the live DOM
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
npx waygraph studio               # the same in the browser (map, flows, runs), for a person to look at
npx waygraph map pack <group> # a src/map/ group with its own _states.ts/_keys.ts -> installable package
npm run typecheck             # when the consumer has it
```

Every `run`/`demo`/`test` also writes `.waygraph/runs/<runId>.jsonl` (step start/end/error, artifacts): read the
newest one to see which Block failed and with what error, instead of re-running.

`waygraph check` should report zero nav warnings. Orphan Blocks (not in any `.flow.ts`; a Page Block's
`nav`, methods and expectations never are) are still runnable in Pilot's live menu - orphan status only blocks
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

Worked freeform example: `node_modules/waygraph/examples/saucedemo` (`src/blocks/saucedemo-web/`); every Block kind,
accounts, reads and narration, against saucedemo.com. Docs: https://deviate-dv8.github.io/waygraph/guides/blocks
Agent personas (author/planner/healer): `npx waygraph agent-dive --loop claude`.
