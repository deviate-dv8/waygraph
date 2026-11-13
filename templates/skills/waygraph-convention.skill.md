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
| A check written as a function over `page` (`page.locator(...).textContent()` and compare) | The page's `read` gives it; the check is `Page.read.x.is(...)` / `Page.check(why, ({ x }) => ...)`, or an Expect Block in the page's `_expects/` |
| A retry or polling helper (`settles`, `waitUntil`, a loop with `sleep`) | Nothing: verify retries every Trait; `{ settle: true }` on a step whose page keeps changing |
| A helper that drives the page outside a Block (`clickClear(page, sel)`, `pasteInto`, `setDateTime`) | A Method Block, one action, in the page's `_methods/`; a field that needs a special way of typing is that Block's `act` |
| A selector prefix for a page in an iframe (`framed(Sel)`, `internal:control=enter-frame >> …`) | `frame: "#embed"` on the Page Block: its Blocks, checks and `read` see locators inside the frame |
| A step that dismisses a modal, banner or prompt that appears on any page (a sound prompt, cookies) | `interrupts` on the page that covers it: handled wherever it shows up, logged, never a step in a flow |
| A `fn` reader that fetches the app's API with the page's token | `ctx.page.api(path, pick)`, with `new Engine({ api: { baseUrl, headers } })` once |
| A Method made for one scenario (`fill-email-for-lockout`, a click that also checks a banner) | The general Method, the scenario's value in mem, the check in the step's `expect`; the page's `do` lists only actions a user has |
| A states file, or a `checkpoint()` + `export type` pair per page | `checkpoint: "Home"` on the Page Block; `to: "Dashboard"` names another page |
| A second copy of a page's selectors for its twin (embed / non-embed) | One `_sel.ts`; the twin is the same page with `frame` set |
| Selectors in a check file or a test | The page's `_sel.ts` |
| Evidence written by hand (a `.log`, a results `.md`, screenshots copied around) | The run log (`.waygraph/runs/`), `screenshot: true` on a step, `--video`, Waygraph Studio, `--reporter` |
| A cast or a function over `MapBuilder` to share steps (`as MethodBlock<...>`, `(m: MapBuilder) => m...`) | `{ lands: X }` for a branch; `steps(Checkpoint, (m) => m...)` played with `.steps(part)` |
| Talking to the API with `fetch` in a test or a helper | An API Block (`defineApiBlock`) in `src/map/(api)/` |
| Waiting for an email with your own polling | The Mailpit / MailHog Blocks (`(external)/`) and `claimOnce` for a shared inbox |

When waygraph can't do what the task needs, stop and say so: what you needed, what waygraph lacks, and the smallest
thing that would let a Block or a flow do it (a new `ctx.ui` piece, a Trait, a setting). Don't build around it; a gap
reported is fixed once in waygraph, a gap worked around is copied into every project.

## Hard rules (not style preferences)

0a. **Values the scenario chooses and no mem key fits are Method params**: `self.method((from, to) => ({ async act(p) { … } }))`, called
   `Board.do.drag(a, b)` in the flow. A value the page's size decides is computed inside `act` from the page, not a param.
00. **Start from `waygraph gen`, then fill in the TODOs.** `waygraph gen page <path> --read a,b --do x,y` writes the page, its
   `_sel.ts` (every selector `"TODO"`) and one `_methods/<key>.method.block.ts` per Method; `gen method <page> <key>` adds
   one (file, entry in the page's `do`, selector); `gen flow <page>/<name>`, `gen keys <ns> a,b`, `gen account <name>` the
   rest; `--shell` makes a page that covers its children. It never overwrites. `waygraph check` lists every selector still
   `"TODO"`. Write by hand only what gen can't, and in the same shape: a Method is **one file in `_methods/`**, a function of
   its page (`(self: PageHandle<"Login">) => self.method({ … })`) listed in the page's `do` (`fillEmail: fillEmail(self)`);
   inline `self.method` only for a one-liner.
0. **No method pollution: a Method is something a user can do on the page, not a step of one test.** A page's `do` is its
   menu: `waygraph auto`, Pilot and (later) an MCP server list it to whoever drives the page, so every Method there
   should make sense to someone who has never read your scenario. Never add a Method for the sake of a test: not
   `fill-email-for-lockout-case`, not `click-save-then-check-banner`, not one used by a single flow because that flow
   needed an odd shortcut. Write the general Method (`fill-email`, taking the value as a param), vary the scenario with
   the argument written on the step (`Login.do.fillEmail("a@b.c")`) and with the step's `expect`, and keep the scenario's own wording in the flow, in
   `description`s and in `stubBefore`/`stub`. A Method used by exactly one flow and no other is a smell: ask
   whether the page really offers that action, or whether the flow wants a mem value, a `lands` or an `expect`
   instead. If it really is a new action the page offers (a button nobody clicked yet), it is a Method.

1. **One distinct action per Block.** Fill and submit are two Blocks. A login form is
   `fill-username` (self-loop) + `fill-password` (self-loop) + `submit-login` (transition),
   never one Method that "fills and logs in." Same split for checkout fields: no Block `.fill()`s
   two fields or `.fill()`s and `.click()`s in one `act()` (`waygraph check`: `multi-input`,
   `combined-action`). Canonical shape: `node_modules/waygraph/examples/saucedemo/src/map/(shop)/_methods/`.
2. **Navigation only in a page's address or a Nav.** `page.goto` / `click` navigation live in a Page Block's `url`/`click`
   (or `route: "folder"`, the address of its folder) and in `defineNavBlock` for a move that isn't a page's own address.
   A Method's `act` uses ActionPage (no goto) even when the app changes URL as a side effect of a button click.
   A page that only exists after something else (every in-app page after sign-in) declares `from: [...]` with the
   Checkpoints it opens from (a `SIGNED_IN` list); without it, routing jumps there from anywhere, skipping sign-in.
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
   `expects`), Traits, and read checks (`Machine.status.is("Archived")`, `Catalog.check("why", ({ items }, mem) => ...)`).
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
   hand-supplied every time, the fake on the key (`keys("ns")<T>({ field: () => value })`) + `memStub: true` on the flow (or
   `--mem-stub`) fills it from a registry instead - a key with no registration still fails
   preflight exactly as before, so this narrows what needs real input, never removes the guard.
   Data a run creates is made from `unique` (`keys("signup")<{ email: string }>({ email: ({ unique }) => \`qa+${unique}@x.test\` })`),
   never a constant or `Date.now()`; what a flow creates is deleted in `.finally(DeleteApiBlock)`; a create that can
   meet an earlier run's data resolves to `Created` / `AlreadyExists` instead of failing. A failure that depended on its
   data reruns with `waygraph run <flow> --replay <runId>` (a per-run value, from `unique`, is made new again; the
   rest is replayed).
   Stubs sit on the keys (`keys("demo")<{ … }>({ credentials: () => … })` in `src/states/demo.mem-keys.ts`, one file, no
   `*.mem-stubs.ts`): `run`, `demo`, `test` and the live sessions load every `*.mem-keys.ts` themselves, so no flow or
   spec imports it. The scaffold's engine is
   `new Engine({ ...config, memStub: true })`: every flow fills missing keys from stubs, and `flow.run()` does it too, so a
   spec never calls `seedMemStub`.
6. **A page is its own Checkpoint**, with its own address; what changed on it is a field of its `read`, not another
   Checkpoint (`waygraph check` names one that only Methods reach with no address, or that has another page's).
   `definePageBlock({ name: "page-home", checkpoint: "Home", ... })` makes it: no states file, no `checkpoint()` /
   `export type` pair. `Home.checkpoint` is the value, for what must name it (a flow's `lands`, a Method in its own
   file). Where every flow begins is `Start` (`import { Start } from "waygraph"`): a Method that leads off a flow is
   `from: Start`, a sign-out goes `to: Start`; never write its tag. A Method written inside its page's `do` has the page
   as `from` and, unless `to` names another page by its name (`to: "Dashboard"`), as `to`. Mem keys: one namespace per
   area, its type's fields the keys, fake values as the optional second part -
   `export const ShopKeys = keys("shop")<{ credentials: Creds; selectedItem: Item }>({ credentials: () => … });`, used
   as `ShopKeys.credentials` (`requires`, `mem.get`). Older projects: `waygraph upgrade --codemod checkpoints`/`keys`.
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

- **Build flows with `map()`** (`engine.map().gotoPage(Page).method(Page.do.b, { pace, expect: [Page.expects.a] })`;
  `.gotoExternal` for another origin); it is the only way to build one. Flow settings (`memStub`, `expectedFailure`, `demoPace`, `sessionReset`, `as`) go in `map({ … })` before the chain
  and the chain itself is the flow: there is no closing call. The flow's title is `ctx.ui.title(...)` in a stub. **Nest flows with `.flow(sub, { reset: true })`**.
  `defineFlow`, `chainFlow` and the `with*` flow wrappers were removed in 0.16.0; `waygraph upgrade --codemod flows` converts them.
- **A flow imports one thing per page it visits: the page's Page Block.** `definePageBlock({ name: "page-home",
  checkpoint: "Home", url: "/home", read: (ctx) => ({ ... }), do: (page) => ({ addItem: page.method({ async act(p) { ... } }) }) })`
  exported as `HomePage`; the flow writes `.gotoPage(HomePage).method(HomePage.do.addItem)`, each typed as its own
  Block. A Method long enough for a file of its own takes `(page: PageHandle<"Home">)`, importing only that type. Imports use the project's
  `#config/`, `#map/`, `#states/` names (`import { HomePage } from "#map/(app_base)/home/_page.block"`), never a chain of
  `../`. No file is imported for its side effect (`import ".../_page.block.js"`, `import ".../x.mem-keys.js"`): the
  tools load Block, Page and stub files themselves. A Page Block's `expects: { saved: () => ExpectSavedBlock }` names what
  can be checked on the page, so `HomePage.expects.saved` comes from the same import. An older project moves onto pages
  with `waygraph upgrade --codemod pages` once each Page Block has its `url` and `do` / `expects`.
- **UI on many pages is a page that covers them, declared once.** A sidebar, top bar, user menu or breadcrumbs go on the
  Page Block of the folder they wrap: `definePageBlock({ name, checkpoint: "Dashboard", covers: "children", links: (self) => ({
  plan: self.link({ to: "Plan", click: SidebarSel.plan }) }), read, interrupts, opens })`. Everything it declares is
  valid on every covered page, so a flow writes `.gotoPage(Dashboard.links.plan)` from any of them. `covers: ["A", "B"]`
  names pages when the app's shell doesn't follow its folders; leave out `checkpoint` for a shell that is no page;
  `to: "parent"` for a link up, and `Trait.breadcrumbs(sel)` to check the trail. Page names in `to` and `covers` complete from `src/waygraph-pages.d.ts` (`waygraph types`, rewritten by `typecheck`/`check`; commit it), so a typo is a compile error. There is no separate layout kind
  (`defineLayout` is deprecated). Never the same Nav or Method on each page, and never a list of pages on a Nav.
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
- **What the app is (signed in, a cart with items) is a state: a boolean mem key declared `state(false)` in the project's `keys(...)`.** A page `needs: [Keys.signedIn]` (a shell's `needs` covers its pages), the Method that logs in `sets: [[Keys.signedIn, true]]` (a function of where it landed for two outcomes), the logout link `sets: [[Keys.signedIn, false]]`, and an account's `mem` sets the states it brings. Never a second Checkpoint for "logged in" and "logged out" versions of a page.
- **Several Methods of one page: `.on(Page, (p) => p.fill("x").submit())`**, each call its own step (`.with({ expect, settle })`, `.stub(...)` after it); not a `.method(Page.do.…)` line each.
- **One Method, many inputs: the value is a param, written on the step.** `self.method((text: string) => ({ async act(p) { await p.locator(Sel.search).fill(text); } }))`
  in the page, `.method(RegistryPage.do.fillSearch("MCH-0111"))` in the flow: typed, inline, and no mem key to declare
  for a value only this step uses. Never one Method per value (`fill-search-padded`, `fill-search-markup`). Mem is for
  what a run *carries* between steps and accounts (`--data`, a seeded id, `mem.set` in `act`); `.set(key, fn)` only when
  the value is worked out from mem at run time.
- **The same steps in several flows are a part:** `export const logDisruption = steps(DisruptionLog, (m) => m.method(…).method(…))`,
  played with `.steps(logDisruption)`. A function over `MapBuilder` with a hand-written `type Start = MapBuilder<…>` is a smell.
- **Setup is steps, cleanup is `.finally`.** Data a flow needs is made first (`.flow(seedFlow)` of API Blocks), not taken
  from whatever the database holds; what it made is deleted in `.finally(DeleteApiBlock)`.
- **Flows are the tests.** `waygraph test --flows` runs every flow as a Playwright test (workers, retries, video,
  reports); `map({ device })` plays one on a device (`"mobile"`, `{ preset: "tablet", orientation: "landscape" }`; the config's `device` is every flow's default), `map({ exclusive: true })` runs one alone and last. A project-written batch
  runner (parallelism, retries, "run these alone", a verdict file) is a smell. Write a spec only for what a flow can't say.
- **What can pop up on any page is an interrupt of the page that covers it**, never a step in a flow: `definePageBlock({ covers: "children", interrupts: { cookies: { when: "#cookie-banner", do: (page) => page.getByRole("button", { name: "Accept" }).click() } } })`. It is handled wherever it shows up while a step runs; the run log and the demo say so.
- **Every page has a `read`.** A page's `do` says what you can do there; its `read` says what it shows, as
  typed data: in the run log after every step that lands there, from `waygraph auto read` for an agent, and for a test
  without DOM queries. It lives on the page's `definePageBlock` (`read: (ctx) => ({ title: ctx.page.text(Sel.title) })`, types
  inferred, keys `Page.read.title`; what every page a shell covers shows is the shell's `read`), never with mem stubs: mem is what a flow is
  given, a read is what the page shows. `waygraph check` lists pages without one. A check on what a page shows is
  `Catalog.check("6 products", ({ items }) => items.length === 6)` or `Header.cartCount.is(1)`, not a selector count; its test
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
- **A flow says what it is**: `engine.map({ title, description, labels: ["smoke"] })`; `waygraph check` names flows without a description.
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
  `AddItemBlock.stub((ctx) => { ctx.ui.ring("cart", { selector: DemoSel.cartCount, label: "AC · item in cart" }); })`.
  That chained function is the only form: a Block's definition (its options) takes no stub, and a stub
  is never a slot map. A Block used twice gets one `const AddShown = AddItemBlock.stub(...)`. A stub that throws
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

A page opens itself: where it is and how you know you're there. (A Nav Block is for a move that isn't a page's own address.)

```ts
// src/map/(app)/inventory/_page.block.ts
import { definePageBlock, Trait } from "waygraph";
import { Inventory, SIGNED_IN } from "../../../states/shop.states.js";
import { InventorySel } from "./_sel.js";

export const InventoryPage = definePageBlock({
  name: "page-inventory",
  description: "The product list.",
  checkpoint: Inventory,
  url: "/inventory.html",          // or click: InventorySel.menuLink, or (mem) => `/item/${mem.get(ShopKeys.item).id}`
  from: SIGNED_IN,                 // only reachable after sign-in; leave out for "from anywhere"
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
  // read, do and expects: below
});
```

A Method with two outcomes: `lands` looks at the page and names the Checkpoint it reached, `verify` checks the outcome it
landed on.

```ts
export const SubmitLoginBlock = defineMethodBlock({
  name: "submit-login",
  description: "Submits the form; a wrong password stays on the login page.",
  from: LoginPage,
  to: [InventoryPage, LoginPage],
  async act(page) {
    await page.locator(LoginSel.submit).click();
  },
  async lands(page) {
    return (await page.locator(LoginSel.error).isVisible()) ? LoginPage : InventoryPage;
  },
  verify: (out) => (out.__state === "InventoryPage" ? [Trait.url({ pathname: "/inventory.html" })] : [Trait.visible(LoginSel.error)]),
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
  async act(page, _input, mem) {
    await page.locator(InventorySel.addBtn(mem.get(ShopKeys.selectedItem).id)).click();
  },
  verify: (): Trait[] => [
    Inventory.check("the item in the cart", ({ items }, mem) => items.some((i) => i.name === mem.get(ShopKeys.selectedItem).name && i.inCart)),
  ],
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
  url: "/inventory",
  read: (ctx) => ({
    items: ctx.page.list(InventorySel.card, (row) => ({
      name: row.text(InventorySel.name),
      price: row.number(InventorySel.price),
      inCart: row.visible(InventorySel.removeBtn),
    })),
  }),
  do: () => ({ addToCart: AddToCartBlock }),
  expects: (page) => ({ cartHasItems: page.check("an item in the cart", ({ items }) => items.some((i) => i.inCart)) }),
});
// A Method that checks the page it belongs to writes verify as a function, so the two files can import each other:
//   verify: (): Trait[] => [Inventory.check("items listed", ({ items }) => items.length > 0)]
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

const AddShown = InventoryPage.do.addToCart.stub((ctx) => ctx.ui.ring("cart", { selector: HeaderSel.cart, label: "Item in cart", tag: "AC" }));

export const inventoryAddItemFlow = engine
  .map({ as: StandardUser, input: ShopKeys.selectedItem })
  .gotoPage(InventoryPage.stubBefore((ctx) => ctx.ui.title("Add an item")))
  .method(AddShown)
  .gotoPage(CartPage, {
    expect: [Cart.check("the item in the cart", ({ items }, mem) => items.some((i) => i.name === mem.get(ShopKeys.selectedItem).name))],
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
      _sel.ts
      _methods/click-widget.block.ts
  (external)/                      # cross-origin (mailpit, etc.) - same shape
    docs/
      _page.block.ts
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
npx waygraph check --network latest   # a run's HTTP calls: duplicates, N+1, slow, large, failed (the run log's step:call)
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
methods and expectations never are) are still runnable in Pilot's live menu - orphan status only blocks
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

Worked example: `node_modules/waygraph/examples/saucedemo` (`src/map/(shop)/`, the shape above); pages, Methods, a shell,
accounts, reads, API Blocks and narration, against saucedemo.com. Docs: https://deviate-dv8.github.io/waygraph/guides/blocks
Agent personas (author/planner/healer): `npx waygraph agent-dive --loop claude`.
