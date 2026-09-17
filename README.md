# Waygraph

A typed graph of reusable Blocks for driving a browser through E2E flows, in place of a
flat pile of ad hoc helper functions.

**Current:** `0.10.9` — demo carousel stepper (default), `--fast` / `--full`, Hide = compact `N / M`.

This repo is the `waygraph` npm package itself. The full live **Sauce Demo** example
(Page inventory hub, Effect Add/Remove, MemNav Open details, `waygraph auto`) ships
in-tree at [`examples/saucedemo`](./examples/saucedemo). `waygraph try demo` copies
[`templates/quickstart`](./templates/quickstart) (same Sauce Demo Blocks) into an OS
temp dir.

See [ROADMAP.md](./ROADMAP.md) for what's shipped, spec'd, and planned by version, and
`openspec/changes/` for the actual planning artifacts behind each roadmap item.

## Docs (GitHub Pages)

Browser docs (quick start, **demo / run**, **auto explore**, engine handout, consumer layout, deploy):

- **Published:** https://deviate-dv8.github.io/waygraph/ (workflow auto-enables Pages via `enablement: true`; manual Settings only if org policy blocks it)
- **Source:** [`docs/`](./docs/) — static HTML, no build step
- **Local preview:** `npm run docs:preview` → http://127.0.0.1:4173/
- **Deploy:** push to `main` touching `docs/**` runs [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) (`workflow_dispatch` also works)
- **Demo / run contract:** [`docs/demo.html`](./docs/demo.html) — `list` / `.flow.ts` path / export / flags
- **Auto explore:** [`docs/auto.html`](./docs/auto.html) — prefer `auto --cli` / `npm run auto:cli` (same menus as headed)
- **In-repo example:** [`examples/saucedemo`](./examples/saucedemo) — full Sauce Demo project
- **Convention showcase (Pages):** [`docs/saucedemo/`](./docs/saucedemo/) —
  https://deviate-dv8.github.io/waygraph/saucedemo/
- **Helpers (consumer copy):** [`examples/saucedemo/docs/HELPERS.md`](./examples/saucedemo/docs/HELPERS.md)

This README stays the in-repo API narrative; Pages is the same material for eyeballing and cross-mesh handoff.

## 0.9.0 — Page, Method, Sel

Runtime is still one type: `Block`. Helpers are TypeScript salt.

| Helper | Role | Typical file |
|--------|------|----------------|
| `definePageBlock` | Screen hub (checkpoint + `verify` + registered methods) | `*.page.block.ts` |
| `defineMethodBlock` | One-shot non-nav step (submit, upload, logout) | `methods/*.method.block.ts` |
| `defineEffectBlock` | Instance mutate + `instanceOptions` auto menu | `methods/*.effect.block.ts` |
| `defineNavBlock` / `defineNavClickBlock` | `goto` / click-nav | `nav-*.block.ts` |
| `defineMemNavBlock` | Nav + per-row `instanceOptions` | `nav-*.block.ts` |
| `defineActionBlock` | **Deprecated** alias of `defineMethodBlock` | — |

**Page hub:** one Checkpoint = this screen. Methods hang off the page for readability /
auto grouping. Arrival-only hubs omit `url`/`click` (previous Block already landed here).
Deep-link hubs pass `url` or `click` like a Nav.

**`methods/` folder** (was `actions/`): on-page work lives next to the route, not free-floating.

**`*Sel`:** DOM selectors only (static strings + `(id) => …` for item-no-1 style). Mem keys
store values (which item / upload queue), not selectors. `instanceOptions` scrapes the live
DOM into menu rows and `mem.set`s on pick; predefined methods seed mem from the flow instead.

```typescript
import { definePageBlock, Trait } from "waygraph";

export const InventorySel = {
  list: ".inventory_list",
  addBtn: (id: string) => `[data-test="add-to-cart-${id}"]`,
};

export const InventoryPage = definePageBlock({
  name: "page-inventory",
  checkpoint: "LoggedIn",
  verify: [
    Trait.url({ pathname: "/inventory.html" }),
    Trait.visible(InventorySel.list),
  ],
  methods: {
    addToCart: () => AddToCartBlock,
    removeFromCart: () => RemoveFromCartBlock,
    addAllToCart: () => AddAllToCartBlock,
    removeAllFromCart: () => RemoveAllFromCartBlock,
  },
});
```

Live reference: `examples/saucedemo/src/blocks/saucedemo-web/inventory/`
(`inventory.page.block.ts` + `methods/` + `InventorySel`). Bulk `add-all-to-cart` /
`remove-all-from-cart` are one menu row each (`from: "*"` — works after leave/return).


## Getting started (pick one)

| Goal | Command |
|------|---------|
| Watch Sauce Demo step-through (temp dir only) | `npx waygraph try demo` |
| Interactive explore (Add/Remove/Open details from live page) | `cd examples/saucedemo && npm i && npx waygraph auto` |
| Scaffold a new **offline** project (green `npm test` on a `data:` URL) | `npx create-waygraph my-app` **or** `npx waygraph init my-app` |
| Add waygraph to an existing repo | `npm install waygraph @playwright/test` |

**Scaffold is not hidden inside waygraph alone** - the offline starter also ships as
[`create-waygraph`](https://github.com/deviate-dv8/create-waygraph) on npm (same template as
`waygraph init` since 0.7.5). Use whichever entry you already have: `npx create-waygraph my-app`
when reading the GitHub Pages docs, or `npx waygraph init my-app` when the CLI is already
installed. After either:

```bash
cd my-app && npm install && npx playwright install chromium && npm test
```

`try demo` is different: live saucedemo.com, step-through **Sign In → Shop & Checkout →
blocked Viewer login**, then headless tests. Permanent full example:
[`examples/saucedemo`](./examples/saucedemo). Offline empty scaffold: `init` /
`create-waygraph`.

```bash
# From this checkout, after npm run build:
cd examples/saucedemo && npm install && npx playwright install chromium
npm test                  # live Playwright suite
npm run auto              # headed interactive explore
npm run demo:step         # stepper (manual Next)
npm run demo:autoplay     # stepper with Auto-advance
```


## Install

```bash
npm install waygraph @playwright/test
```

`@playwright/test` is a peer dependency, not bundled - you bring your own version (`^1.40.0`
or later) since it's also what drives the rest of your test suite. Requires Node 22+ (uses
`URL`/`URLPattern` from `@types/node` for `Trait.url`'s type checking).

## Quick start

A Block wraps one `act`/`resolve` step (add `observe`/`verify` once you need them); a `Flow`
chains several into a run:

```typescript
import { Engine, start, end, MemPage, key, checkpoint, Trait } from "waygraph";
import type { Block, Checkpoint, Start } from "waygraph";

type LoggedIn = Checkpoint<"LoggedIn">;

const Username = key<string>("username");

const Login: Block<Start, LoggedIn> = {
  name: "login",
  instruction: {
    async act(page, _input, mem) {
      await page.goto("https://example.com/login");
      await page.getByLabel("Username").fill(mem.get(Username));
      await page.getByRole("button", { name: "Sign in" }).click();
    },
    resolve: () => checkpoint("LoggedIn"),
    verify: [Trait.url({ pathname: "/dashboard" })],
  },
};

const mem = new MemPage();
mem.set(Username, "alice");

const flow = new Engine().defineFlow([start, Login, end]);
const result = await flow.run(mem); // Engine launches its own browser
// result === { __state: "LoggedIn" }
```

Inside an existing `@playwright/test` file, reuse its `context` fixture instead of having the
Engine launch its own browser: `await flow.run(context, mem)`.

**Status:** `Checkpoint`, `MemPage`, `Instruction`/`Block` (`act`/`observe`/`resolve`/`verify`),
`connect()`, `Trait`, `Engine.defineFlow([start, ...blocks, end])`, and `branch()`/self-loops
with a `maxSteps` safety cap. A Block's output type is the only contract the next Block can
rely on, `resolve` is structurally incapable of touching the browser or shared memory,
`verify` runs only after `resolve` has already decided (confirms or fails loud, never
redirects), `branch()` attaches routing to a Block - including back to itself - without ever
touching that Block's own phases, a Block's `requires: MemKey[]` gets checked by
`preflight()` (built into `runGraph`) before a tab even opens - a missing credential fails
in milliseconds, not after several real browser actions already ran - and `new Engine({ headless, browserName, slowMo })` configures a browser the Engine
launches and owns itself: `flow.run(mem)` (no context) uses it, and `flow.run(mem, {
...overrides })` overrides it per call - so one module-level `Flow`, imported by many
specs, doesn't force every caller into the same settings. `flow.run(context, mem)` still
works exactly as before and ignores all of this, since that context is already launched.
`withVerify(block, verify)` decorates any existing Block with different confirmation - same
`act`/`resolve`, same routing - without that Block needing to have been authored as a
parameterized factory (`withVerify(LoginBlock, [])` is the "I only care that I navigated
this far, no DOM check" case). Built-in Trait factories are reachable two ways - as free
functions (`urlMatches`, `textEquals`, `visible`) or, for autocomplete discoverability,
off `Trait.` itself (`Trait.url`, `Trait.text`, `Trait.visible` - the exact same functions,
just findable by typing `Trait.` without needing to already know their names). `Trait.url`
takes a structured `URLPatternInit` (`{ pathname, hostname, search, hash, ... }`, the same
shape the standard `URLPattern` Web API takes), not a hand-written regex - whichever
components you leave out default to "match anything," so `Trait.url({ pathname:
"/inventory.html" })` already ignores whatever query params a hybrid SPA tacks on, with no
separate flag needed for that. A hand-written `Trait` isn't limited to the page, either - its
`check(page, mem)` receives `mem` too, for the same-Checkpoint case: an action that doesn't
navigate anywhere at all (clicking "+" to bump a cart item's quantity, say) has `In === Out`,
which `defineBlock`/`defineFlow` already accept with no special-casing - `act()` updates `mem`
alongside the real click (`mem.set(Quantity, mem.get(Quantity) + 1)`), and a bespoke `verify`
Trait confirms the page's own displayed value actually matches what `mem` now expects
(`shown === String(mem.get(Quantity))`), not just that *some* number is showing. `resolve()`
itself stays exactly as pure as ever - it never sees `mem`, only `verify` does. `verify` only
ever confirms what a Block itself just did, though - nothing previously checked whether the
page was STILL there by the time the NEXT Block's `act()` starts. A `precondition` (same
`Trait[]`/`(input) => Trait[]` shape as `verify`, checked automatically by `connect()`/
`runGraph` right before `act()` runs, never called directly) closes that gap: a session
timeout, a redirect, an interstitial popup - anything that changes the page in the moment
between one Block finishing and the next one starting - fails loud with a clear "trait X
failed before Y," instead of a confusing error deep inside `act()` trying to click something
that's no longer there. Once Blocks are composed into a `Flow`, `flow.withBlockVerify`/
`flow.modBlockVerify` patch one Block's verify from outside - a spec that only imports the
finished flow, addressed by the Block reference (preferred), its name, or its numeric
position in the flow - without editing the flow's own file. `composeBlock(name, steps)`
chains several Blocks into one named unit the same way `connect()` already does - the
multi-step-form case (a government form with several stepper pages, say), which is
naturally "one feature" but still wants each step's own real `verify` independently
overridable, not one giant Block with no per-step confirmation. `composedBlock.withStepVerify`/
`modStepVerify` patch one step from outside, addressed the same three ways
`withBlockVerify`/`modBlockVerify` already are - a `composeBlock` result is a plain Block,
so it drops straight into `defineFlow([start, ..., composed, ..., end])` like any other.
`fastForwardComposeBlock(name, steps)` is the same shape marked for **demo pacing**: one
opaque step (no per-inner gate) unless `waygraph demo --ff-expand`. Saucedemo
`checkoutFlow` uses `ff-owner-auth` for the login prefix; `loginFlow` stays expanded for
Sign In narration. Traverse (later) reuses FF as a seed prefix - see
`docs/proposals/traverse-ffcompose-rfc.md`.
`spawnTab(entry, page, mem)` drives a genuinely separate second tab through its own
Block/Flow, in the same browser context an existing `page` already belongs to - the
pattern `observe()` could already reach for (it's the only phase allowed to touch
`page.context()`), now a named, discoverable, tested primitive instead of something
you'd have to already know to hand-roll. `flow.run(context, mem, options)` also accepts a
trailing optional options object - additively, so `flow.run(context, mem)` still behaves
byte-for-byte as before: `options.page` drives that already-open page instead of opening
a fresh tab (the run won't close a page you handed it unless you say so), and
`options.closeOnFinish: false` leaves the run's page open and returns `{ result, page }`
so the caller can keep driving it - hands a run tab back instead of losing it. See
"Recipes" for capture-on-popup, which stays a documented pattern until a second real use
case promotes it to an engine API.
`defineNavBlock({ name, checkpoint, url })` or `defineNavClickBlock({ name, checkpoint, click })`
builds a Block whose only possible action is navigating. Prefer `defineNavClickBlock` for
click-nav in app code; `defineNavBlock` for `url` / `goto` deep links. Both accept a plain
string or `(mem) => string` / `(mem) => selector`. Generated `act()` is always exactly
`page.goto(url)` or `page.locator(click).click()`. For screen hubs that also register
methods, prefer `definePageBlock` (see **0.9.0 — Page, Method, Sel** above). A regular
`defineBlock` / `defineMethodBlock`'s `act()` receives `page` typed as `ActionPage` —
`goto`/`reload`/`goBack`/`goForward` are `@deprecated` there (editor strike-through pointing
at Nav/Page helpers). `waygraph check [project]` is the complementary whole-project sweep
for contexts with no editor watching (CI, generated code).
`new Engine({ browsers: { chromium, firefox, webkit } })` overrides which `BrowserType`
actually launches for a `mem`-only run, per browser name - waygraph is deliberately "just
an opinionated Playwright," so a stealth-patched or otherwise customized launcher (e.g.
`playwright-extra` plus a stealth plugin) drops in unmodified, since those already expose
the same `.launch()` shape as Playwright's own `chromium`/`firefox`/`webkit`.

See **Getting started** above for `try demo`, `create-waygraph`, and `waygraph init`.
Both scaffold commands emit the same offline tree (route-shaped `demo-web/` +
`methods/`, stubs, fixtures, one YAP slide). Layout:
[`docs/scaffold.html`](./docs/scaffold.html) · `templates/scaffold/STRUCTURE.md`.

**Consumer layout (Next.js App Router):** block folders mirror `app/` page routes (`/`
at the namespace root; no invented `landing/`/`root/`; sidebar = chrome + edges). See
[`docs/consumer.html`](./docs/consumer.html) and mesh handout
`WAYGRAPH-CONSUMER-CONVENTION.md` - separate from this package API doc.

Deliberately **not yet implemented** (tracked on the project board):
- Interstitials/Watchers - background overlay handling (cookie banners, popups).
- Split `requires` (externally-supplied vs producedBy) recovery hints.
- Federated multi-package pool of waygraphs.

**Available now:** `waygraph auto [project]` is the **interactive explore** loop:
`locate()` reads where you are, lists runnable Blocks from the graph, you pick one
(headful panel or `--cli` terminal menu), repeat. Static graph export (old JSON /
Mermaid) is `waygraph graph [project]` (`--mermaid`). Unattended JSON execution is
`chain` + `WAYGRAPH_JSON=1`.

**Friendly demo / run / auto (0.10.5 — flows are files):**

| Want | Command |
|------|---------|
| List flows | `waygraph list` → `src/flows/shop.flow.ts  shopFlow` |
| Run by file | `waygraph run src/flows/shop.flow.ts --data '{…}'` |
| Same via `auto` | `waygraph auto src/flows/shop.flow.ts --data '{…}'` |
| Run by export | `waygraph run --blocks shopFlow` |
| Manual watch | `waygraph demo src/flows/shop.flow.ts` |
| Auto-advance | `waygraph demo --blocks shopFlow --auto-next` (nav auto-hides strip) |
| Fast / full strip | `waygraph demo … --fast` (shorter gates; keeps cursor) · `--full` (classic chips; default = carousel) |
| QA watch + record | `waygraph demo --blocks shopFlow --auto-play-video` |
| Ad-hoc Blocks | `waygraph run --blocks "login then nav-cart" --data '{…}'` |
| Headed execute | `waygraph run --blocks shopFlow --non-headless --video` |
| Explore | `waygraph auto` / `waygraph auto --cli` |
| Path-find | `waygraph auto --blocks LoginPage OrderComplete` |

`--blocks` / positional accepts a Flow export, a `.flow.ts` path, or `"a then b"`.
`auto <file.flow.ts>` **runs** that flow (same as `run`); bare `auto` still explores.
`--auto-next` (alias `--autoplay`) = panel Auto-advance. `--auto-play-video` is **demo only**.
`chain` remains a compat alias for `run --blocks` / `auto --blocks`.

## Example

Two Tier-0 Blocks (only `act` + `resolve`, no branching), each confirmed with `verify`
after the fact rather than asserting mid-`observe`, defined as a flow and run against a
real page:

```typescript
import { Engine, start, end, MemPage, key, checkpoint } from "waygraph";
import type { Block, Checkpoint, Start } from "waygraph";

type FormLoaded = Checkpoint<"FormLoaded">;
type Submitted = Checkpoint<"Submitted">;

const EmailKey = key<string>("form.email");
const PasswordKey = key<string>("form.password");

const GotoForm: Block<Start, FormLoaded> = {
  name: "goto-form",
  instruction: {
    async act(page) {
      await page.goto("https://example.com/login");
    },
    resolve: () => checkpoint("FormLoaded"),
  },
};

const FillAndSubmit: Block<FormLoaded, Submitted> = {
  name: "fill-and-submit",
  instruction: {
    async act(page, _input, mem) {
      await page.getByPlaceholder("Email").fill(mem.get(EmailKey));
      await page.getByPlaceholder("Password").fill(mem.get(PasswordKey));
      await page.getByRole("button", { name: "Submit" }).click();
    },
    resolve: () => checkpoint("Submitted"),
    verify: [
      {
        name: "submitted-heading-shown",
        check: async (page) => {
          await page.getByRole("heading", { name: "Submitted" }).waitFor();
          return true;
        },
      },
    ],
  },
};

const mem = new MemPage();
mem.set(EmailKey, "alice@test.com");
mem.set(PasswordKey, "hunter2");

const engine = new Engine();
const flow = engine.defineFlow([start, GotoForm, FillAndSubmit, end]);
const result = await flow.run(context, mem);
// result === { __state: "Submitted" }
```

See `tests/define-flow.spec.ts` here, and `examples/saucedemo/tests/checkout-flow.spec.ts`
(a real multi-Block flow against live saucedemo.com), for this running for real. The
lower-level `connect()`/`runGraph()` still exist and are what `defineFlow` builds on -
reach for them directly only if you need a shape `defineFlow`'s array can't express yet.

## Recipes

### Detect / drive the surviving tab after a run

The default run closes the page it opened, and a page you hand in via `options.page`
survives. For a flow that must BE the surviving tab after it returns (an interactive demo,
a hand-back to a caller), ask for the page back explicitly:

```typescript
const { result, page } = await registerFlow.run(context, mem, { closeOnFinish: false });
// `result.__state` reached the terminal Checkpoint; `page` is still open where the
// flow left it - the caller keeps driving it, and closes it whenever IT is done.
```

### Capture a popup (`target=_blank` click)

Frameworks and email UIs routinely rewrite links to `target="_blank"`, so a click that
"should navigate" actually opens a second, engine-invisible tab. Until a second real use
case promotes this to an engine API, capture it in userland with a context-level page
event armed before the click that is expected to open exactly one popup:

```typescript
let popup: Page | undefined;
context.once("page", (p) => { popup = p; });
await linkHandle.click();          // the block that causes the popup (e.g. the
                                   // MailHog email's real verify link)
if (popup) {
  await popup.waitForLoadState();  // fully loaded before calling into the engine
  await verifyLinkFlow.run(context, mem, { page: popup, closeOnFinish: false });
  // popup is now the caller's page - close it when done, or leave it as the
  // surviving tab of a demo.
}
```

`context.once` (not `.on`) guarantees a second stray popup won't re-fire the handler and
clobber your handle; if a page truly can open more than one popup, this recipe needs to
collect them instead. The popup is a normal Playwright `Page` from the same context, so
anything `Flow.run(context, mem, { page })` can drive is available to keep driving here,
and `closeOnFinish: false` hands it back into your ownership instead of the run closing
it out from under you.

## Developing this package

```bash
git clone git@github.com:deviate-dv8/waygraph.git
cd waygraph
npm install
npm run typecheck   # tsc --noEmit
npm run test        # playwright test
npm run build       # tsc -p tsconfig.build.json, emits dist/
```

## Layout

```
package.json              the "waygraph" npm package itself (0.9.0+)
src/
  types.ts                 Checkpoint, Instruction, Block, connect()
  mem-page.ts               MemKey, key(), MemPage
  trait.ts                   Trait (type + discoverable Trait.url/.text/.visible), runVerify()
  engine.ts                   runGraph(), definePageBlock, defineMethodBlock, Engine, …
  graph.ts                     discoverGraph, orphans, paths
  auto-explore.ts              waygraph auto menu
  index.ts                     public barrel
examples/saucedemo/         live Sauce Demo (Page + methods/ + Sel)
templates/quickstart/       try demo / init template (mirrors sauce)
docs/                       GitHub Pages static HTML
typecheck/                 compile-time-only fixtures
tests/                      runtime unit + integration tests (@playwright/test)
tsconfig.json                base config
tsconfig.build.json          emits to dist/
```

In-package Sauce Demo: [`examples/saucedemo`](./examples/saucedemo). Other consumer
experiments (e.g. zsign-app integration) may still live in a sibling workspace folder and
depend on this package via `"waygraph": "file:../waygraph"` during local dev (see that
project's own `.npmrc` - `install-links=true` is required there, or npm will symlink
instead of copy and pull this package's own `node_modules` in through the symlink, causing
a duplicate-Playwright-installation error).
