# Waygraph

A typed graph of reusable Blocks for driving a browser through E2E flows, in place of a
flat pile of ad hoc helper functions.

Not yet `1.0.0` - breaking changes between minor versions are expected. See
[ROADMAP.md](./ROADMAP.md) for what's shipped, spec'd, and planned, and
`openspec/specs/` for the current merged spec behind each capability
(`openspec/changes/archive/` holds the historical planning artifacts once a change ships).

This repo is the `waygraph` npm package itself. The full live **Sauce Demo** example
(Page inventory hub, Effect Add/Remove, MemNav Open details, `waygraph auto`) ships
in-tree at [`examples/saucedemo`](./examples/saucedemo). `waygraph try demo` copies
[`templates/quickstart`](./templates/quickstart) (same Sauce Demo Blocks) into an OS
temp dir.

## Docs (GitHub Pages)

Browser docs (quick start, **demo / run**, **auto explore**, engine handout, consumer
layout, deploy):

- **Published:** https://deviate-dv8.github.io/waygraph/ (workflow auto-enables Pages via
  `enablement: true`; manual Settings only if org policy blocks it)
- **Source:** [`docs/`](./docs/) - static HTML, no build step
- **Local preview:** `npm run docs:preview` -> http://127.0.0.1:4173/
- **Deploy:** push to `main` touching `docs/**` runs
  [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) (`workflow_dispatch` also
  works)
- **Demo / run contract:** [`docs/demo.html`](./docs/demo.html) - `list` / `.flow.ts` path
  / export / flags
- **Auto explore:** [`docs/auto.html`](./docs/auto.html) - prefer `auto --cli` /
  `npm run auto:cli` (same menus as headed)
- **In-repo example:** [`examples/saucedemo`](./examples/saucedemo) - full Sauce Demo
  project
- **Convention showcase (Pages):** [`docs/saucedemo/`](./docs/saucedemo/) -
  https://deviate-dv8.github.io/waygraph/saucedemo/
- **Helpers (consumer copy):** [`examples/saucedemo/docs/HELPERS.md`](./examples/saucedemo/docs/HELPERS.md)

This README stays the in-repo API narrative; Pages is the same material for eyeballing and
cross-mesh handoff.

## Install

```bash
npm install waygraph @playwright/test
```

`@playwright/test` is a peer dependency, not bundled - you bring your own version
(`^1.40.0` or later) since it's also what drives the rest of your test suite. Requires
Node 22+ (uses `URL`/`URLPattern` from `@types/node` for `Trait.url`'s type checking).

## Core concepts

- **`Checkpoint<Tag>`** - a state identified solely by its string tag. Carries no data.
- **`MemPage`** / **`MemKey<T>`** - typed shared memory across a run, keyed by object
  identity (`key<T>("debug-name")`), not by name string.
- **`Block<In, Out>`** - one step: `act(page, input, mem)` does the work,
  `resolve()` decides the resulting Checkpoint (never touches the page or mem),
  `verify` (optional) confirms the page actually matches what `resolve()` claimed.
- **`Trait`** - a named, independently-reportable check (`{ name, check(page, mem) }`).
  Built-in factories: `Trait.url` / `Trait.text` / `Trait.visible` (also importable as
  free functions `urlMatches` / `textEquals` / `visible`).
- **`Flow`** - several Blocks chained with `Engine().defineFlow([start, ...blocks, end])`,
  run with `flow.run(mem)` (Engine launches its own browser) or `flow.run(context, mem)`
  (reuse an existing `@playwright/test` `context` fixture).

## Quick start

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

Inside an existing `@playwright/test` file, reuse its `context` fixture instead of having
the Engine launch its own browser: `await flow.run(context, mem)`.

See `tests/define-flow.spec.ts` here, and
`examples/saucedemo/tests/checkout-flow.spec.ts` (a real multi-Block flow against live
saucedemo.com), for this running for real. The lower-level `connect()`/`runGraph()` still
exist and are what `defineFlow` builds on - reach for them directly only if you need a
shape `defineFlow`'s array can't express yet.

## Engine features

A Block's output type is the only contract the next Block can rely on. `resolve` is
structurally incapable of touching the browser or shared memory. `verify` runs only after
`resolve` has already decided (confirms or fails loud, never redirects).

### Routing and composition

- **`branch()`** attaches routing to a Block - including back to itself (self-loops) -
  without ever touching that Block's own phases. A `maxSteps` safety cap keeps a routing
  bug from hanging a run forever.
- **`withVerify(block, verify)`** decorates any existing Block with different
  confirmation, same `act`/`resolve`, same routing - without that Block needing to have
  been authored as a parameterized factory (`withVerify(LoginBlock, [])` is the "I only
  care that I navigated this far, no DOM check" case).
- **`flow.withBlockVerify` / `flow.modBlockVerify`** patch one Block's verify from
  outside a finished `Flow` - addressed by the Block reference (preferred), its name, or
  its numeric position - without editing the flow's own file.
- **`composeBlock(name, steps)`** chains several Blocks into one named unit, the same way
  `connect()` already does - useful for a multi-step form that's naturally "one feature"
  but still wants each step's own real `verify` independently overridable, not one giant
  Block with no per-step confirmation. `composedBlock.withStepVerify` / `modStepVerify`
  patch one step from outside, addressed the same three ways as `withBlockVerify`. A
  `composeBlock` result is a plain Block, so it drops straight into
  `defineFlow([start, ..., composed, ..., end])` like any other.
- **`fastForwardComposeBlock(name, steps)`** is the same shape marked for wall-clock
  **fast-forward**: one opaque demo step that blitzes (no per-inner gate, no smooth cursor
  theater, Playwright `slowMo` off for that flow unless `WAYGRAPH_SLOWMO` is set) unless
  expanded. Put several FF units in one Flow to race past auth, then a heavy dashboard
  settle, then watch the interesting middle. `waygraph demo --ff-disabled` (alias
  `--no-ff`) expands every FFCompose into its inner Blocks so a broken step is visible as
  its own panel row; former FF inners keep blitz pacing so wall-clock stays comparable.
  `--ff-expand` is the older expand-only flag (same flatten).

### Cross-cutting Layouts (`defineLayout`)

Real, direct request this responds to: persistent chrome (a sidebar, say) that's supposed
to stay on screen across most of an app shouldn't need its own `Trait` copy-pasted into
every single Checkpoint's `verify` - one missed copy and a regression silently ships. A
**Layout** is a `verify` that's enforced automatically, by Checkpoint tag, wherever it
applies - not once per Block:

```ts
import { defineLayout, Engine } from "waygraph";

const AppShellLayout = defineLayout({
  name: "AppShell",
  // string[] of exact Checkpoint tags, or a (tag) => boolean predicate for a
  // broader match (e.g. "every Checkpoint except the signed-out ones")
  appliesTo: ["AppHome", "Chats", "Notifications", "Settings"],
  verify: [Trait.visible(AppShellSel.sidebar)],
});

const engine = new Engine({ layouts: [AppShellLayout] });
```

Every `Flow` this `Engine` defines - **and every intermediate Checkpoint inside it**, not
just the final one - runs `AppShellLayout.verify` automatically whenever it resolves to a
tag `appliesTo` matches, alongside that Block's own `verify`. `runGraph`/`Flow.run` also
take `{ layouts }` directly (`RunGraphOptions.layouts`), for driving a Layout outside an
`Engine`-owned Flow (e.g. `waygraph auto`'s own runtime pathfinding).

Deliberately matched by Checkpoint tag, never by folder path - a Layout works identically
whether a project uses the [Waygraph Map](#waygraph-map) convention or the older freeform
folder style, since some real consumers of this package still use the latter.

### `map()` - a kind-checked, no-teleporting flow builder

`Engine.defineFlow([start, ...blocks, end])` already typechecks that each Block's `Out`
matches the next one's `In`. It does **not** stop an agent (or a careless human) from
handing it a hand-rolled plain object that merely *looks* like a Block - TypeScript's
structural typing can't tell a real `defineNavBlock(...)` output from a copy-pasted
object literal with the right shape. That gap is exactly what broke down in real
consumer projects: agents editing/hand-composing Blocks into ad hoc shapes, a "locks"
convention tried and still bypassed. `map()` closes it with an actual runtime check, not
just a convention:

```ts
import { Engine } from "waygraph";

const engine = new Engine();
const flow = engine
  .map({ homeOrigin: "https://app.example.com" })
  .start()
  .gotoPage(NavHomeBlock) // must be defineNavBlock / defineMemNavBlock / definePageBlock
  .assert(AssertHelloBlock) // must be defineAssertBlock
  .gotoExternal(NavMailpitBlock) // same kind requirement, plus the INVERSE origin check
  .method(ClearCartBlock) // must be defineMethodBlock / defineActionBlock / defineEffectBlock
  .end(); // -> a real Flow<Out> - withBlockVerify/withTitle/withHighlightFixtures/etc. all still apply
```

Each step method is scoped to exactly the Block kind its name promises, checked against
the same `__waygraphKind`/`__waygraphSalt` runtime markers `waygraph check`/`graph`/`map`
already trust - a Block that didn't come from a real `define*Block` factory throws
immediately, naming the step and the factory it should have used, instead of silently
entering the chain. Give `homeOrigin` and `.gotoPage()`/`.gotoExternal()` also cross-check
each Nav/Page Block's own static `url` against it (skipped, honestly, for click-based or
mem-dependent nav - not statically checkable). The Checkpoint chain itself is still
typechecked exactly like `defineFlow`'s own tuple overloads - there is no method on this
builder that can skip from one Checkpoint to an unrelated one without a real, kind-correct
Block in between, which is what "no teleporting" means here.

`map()` is sugar over `defineFlow`, not a new execution engine - the result is a real
`Flow`, so every existing Flow-level feature (Layouts, `withBlockVerify`, demo narration,
`chainFlow`) works on it unchanged. `import { map } from "waygraph"` is also available
standalone (`map(options)` ~= `new Engine(options).map(options)`) for a call site that
doesn't otherwise need its own `Engine` instance. **Recommended for new projects** over
hand-assembled `defineFlow([start, ...])` arrays - the freeform array form still works
and isn't going away (real consumers on the older folder convention depend on it), but
`map()` is the one that actually stops a broken/hacked Block from entering a flow
unnoticed.

### Traits beyond the page

A hand-written `Trait`'s `check(page, mem)` receives `mem` too, for the same-Checkpoint
case: an action that doesn't navigate at all (clicking "+" to bump a cart item's quantity,
say) has `In === Out`, which `defineBlock`/`defineFlow` already accept with no
special-casing - `act()` updates `mem` alongside the real click, and a bespoke `verify`
Trait confirms the page's own displayed value actually matches what `mem` now expects, not
just that *some* number is showing. `resolve()` itself stays exactly as pure as ever - it
never sees `mem`, only `verify` does.

`Trait.url` takes a structured `URLPatternInit` (`{ pathname, hostname, search, hash, ... }`,
the same shape the standard `URLPattern` Web API takes), not a hand-written regex -
whichever components you leave out default to "match anything," so
`Trait.url({ pathname: "/inventory.html" })` already ignores whatever query params a
hybrid SPA tacks on, with no separate flag needed for that.

### `precondition` - confirming the page is *still* there

`verify` only ever confirms what a Block itself just did - nothing previously checked
whether the page was still there by the time the next Block's `act()` starts. A
`precondition` (same `Trait[]` / `(input) => Trait[]` shape as `verify`, checked
automatically by `connect()`/`runGraph` right before `act()` runs, never called directly)
closes that gap: a session timeout, a redirect, an interstitial popup - anything that
changes the page in the moment between one Block finishing and the next one starting -
fails loud with a clear "trait X failed before Y," instead of a confusing error deep
inside `act()` trying to click something that's no longer there.

### `requires` and `preflight()`

A Block's `requires: MemKey[]` gets checked by `preflight()` (built into `runGraph`)
before a tab even opens - a missing credential fails in milliseconds, not after several
real browser actions already ran.

### Engine config and pluggable browsers

`new Engine({ headless, browserName, slowMo })` configures a browser the Engine launches
and owns itself: `flow.run(mem)` (no context) uses it, and
`flow.run(mem, { ...overrides })` overrides it per call - so one module-level `Flow`,
imported by many specs, doesn't force every caller into the same settings.
`flow.run(context, mem)` still works exactly as before and ignores all of this, since that
context is already launched.

`new Engine({ browsers: { chromium, firefox, webkit } })` overrides which `BrowserType`
actually launches for a `mem`-only run, per browser name - waygraph is deliberately "just
an opinionated Playwright," so a stealth-patched or otherwise customized launcher (e.g.
`playwright-extra` plus a stealth plugin) drops in unmodified, since those already expose
the same `.launch()` shape as Playwright's own `chromium`/`firefox`/`webkit`.

### Driving an existing page / tabs

`spawnTab(entry, page, mem)` drives a genuinely separate second tab through its own
Block/Flow, in the same browser context an existing `page` already belongs to - the
pattern `observe()` could already reach for (it's the only phase allowed to touch
`page.context()`), now a named, discoverable, tested primitive.

`flow.run(context, mem, options)` also accepts a trailing optional options object -
additively, so `flow.run(context, mem)` still behaves byte-for-byte as before:
`options.page` drives that already-open page instead of opening a fresh tab (the run
won't close a page you handed it unless you say so), and `options.closeOnFinish: false`
leaves the run's page open and returns `{ result, page }` so the caller can keep driving
it. See [Recipes](#recipes) for the surviving-tab and popup-capture patterns.

### NavBlock / ActionPage / waygraph check

`defineNavBlock({ name, checkpoint, url })` or
`defineNavClickBlock({ name, checkpoint, click })` builds a Block whose only possible
action is navigating. Prefer `defineNavClickBlock` for click-nav in app code;
`defineNavBlock` for `url` / `goto` deep links. Both accept a plain string or
`(mem) => string` / `(mem) => selector`. Generated `act()` is always exactly
`page.goto(url)` or `page.locator(click).click()`. For screen hubs that also register
methods, prefer `definePageBlock` (see [Block helpers](#block-helpers-page-method-sel)
below).

A regular `defineBlock` / `defineMethodBlock`'s `act()` receives `page` typed as
`ActionPage` - `goto`/`reload`/`goBack`/`goForward` are `@deprecated` there (editor
strike-through pointing at Nav/Page helpers). This is a soft, TypeScript-only signal:
nothing is blocked, nothing fails to build. `waygraph check [project]` is the
complementary whole-project sweep for contexts with no editor watching (CI, generated
code, an autonomous agent authoring Blocks) - it warns, never fails the process.

**`waygraph typecheck [project]`** runs `tsc --noEmit` then the same **bad-practice** scan
(wildcard `Checkpoint<string>`, assert blocks missing type args, multi-`.fill()` Methods,
fill+click in one Method). Practices warn only unless `tsc` fails; use `--no-practices` to
skip the scan. Opt out per file: `// waygraph-ignore-practices` or
`// waygraph-ignore: multi-input, combined-action`. Print full agent guidance:
`waygraph --skill-convention`.

### Demo narration

Automation rings are gray; authored stubs/slides can use
`tone: "info" | "warning" | "danger" | "success"` (iconified captions), plus
`size: "sm" | "md" | "lg"` and `weight: "normal" | "bold"`. Flow episode defaults:
`withHighlightStyle(flow, { size, weight, tone? })` (slot/fixture wins). Episode pacing:
`withDemoPace(flow, "fast" | "slow" | "normal" | "blitz" | number)` or
`withBlockPace(block, ...)` (`number <= 20` = scale vs normal, e.g. `0.5` / `2`; `> 20` =
absolute ms, e.g. `4500`). FFCompose stays blitz. Living objectives:
`docs/proposals/OBJECTIVES.md`.

### Graph traversal

`waygraph traverse` walks the Block graph. `--parallel N` (default `--session clone`)
bootstraps one context, forks N workers with `storageState` + mem snapshot, partitions
edges by hash, and claims via in-process edge leases (audit trail under
`.waygraph-traverse/`). `--session inherit` is refused when `parallel > 1`. It writes
`.waygraph-traverse/coverage.json` and prints `[Coverage edges=H/T ratio=R%...]`;
`--min-edge-coverage 80%` fails the suite with exit 2 when the ratio is below the gate
(even if every worker leaf-PASSed). `--coverage-out PATH` / `--no-coverage-report` adjust
the JSON. See `docs/proposals/traverse-ffcompose-rfc.md`.

### Not yet implemented

Tracked on the project board / roadmap, not in this package today:

- Interstitials/Watchers - background overlay handling (cookie banners, popups).
- Split `requires` (externally-supplied vs producedBy) recovery hints.
- Federated multi-package pool of waygraphs.

## Block helpers (Page, Method, Sel)

Runtime is still one type: `Block`. Helpers are TypeScript salt.

| Helper | Role | Typical file |
|--------|------|----------------|
| `definePageBlock` | Screen hub (checkpoint + `verify` + registered methods) | `*.page.block.ts` |
| `defineMethodBlock` | One-shot non-nav step, exactly one action (submit, upload, logout) | `methods/*.method.block.ts` |
| `defineAssertBlock` | Self-loop-only assertion (no state change) - `verify` only | `methods/*.method.block.ts` |
| `defineEffectBlock` | Instance mutate + `instanceOptions` auto menu | `methods/*.effect.block.ts` |
| `defineNavBlock` / `defineNavClickBlock` | `goto` / click-nav | `nav-*.block.ts` |
| `defineMemNavBlock` | Nav + per-row `instanceOptions` | `nav-*.block.ts` |
| `defineActionBlock` | Deprecated alias of `defineMethodBlock` | - |

**Page hub:** one Checkpoint = this screen. Methods hang off the page for readability /
auto grouping. Arrival-only hubs omit `url`/`click` (previous Block already landed here).
Deep-link hubs pass `url` or `click` like a Nav.

**One distinct action per Block - hard rule.** A Method that fills form fields *and*
submits, or that drives several steps inside one `act()`, is wrong even if it "works" -
split it into atomic Blocks (a login form is `fill-username` + `fill-password` +
`submit-login`, never one Block doing all three; see `examples/saucedemo`'s own
`saucedemo-web/methods/` for the real split). A Block that only asserts something on the
current page, with no state change, is `defineAssertBlock({ name, checkpoint, verify,
waitForHeading?, requires? })` - self-loop and `resolve` are generated for you, so there's no
hand-written `act`/`resolve` to accidentally make do two things. It also accepts
`stubBefore`/`stubAfter`/`stubOnError`/`slides`, the same narration fields every other
Block helper takes, so converting a hand-written assertion Method loses no demo/highlight
fixture data. `requires` (declare it whenever a mem-aware Trait reads a mem key the caller
must supply externally - see the mail example below) lets preflight catch a missing input
before the flow ever runs, the same as every other Block helper:

```typescript
export const AssertInventoryHeaderBlock = defineAssertBlock({
  name: "assert-inventory-header",
  checkpoint: "LoggedIn",
  waitForHeading: "Products",
  verify: [Trait.visible(InventorySel.list)],
});
```

`waygraph check` warns when a `verify` array inlines a literal selector string
(`Trait.visible("#some-id")`) instead of referencing a `*Sel` object - the exact pattern
`defineAssertBlock` exists to make easy to avoid.

**Give `defineAssertBlock` an explicit type argument when it sits mid-chain.** Without one,
`Out` defaults to wildcard `Checkpoint<string>` on both sides - harmless when the assert is
the last real Block before `end` (nothing downstream needs it narrower), but a `defineFlow`
array's tuple typing breaks once a wildcard Block is sandwiched between two
specifically-typed ones. Write `defineAssertBlock<LoggedIn>({ ..., checkpoint: "LoggedIn",
... })` any time the assert has a real Block after it, not just before.

**An assert Block can check the *result* of an action, not just static page state.** Since
`Trait.check(page, mem)` receives mem as well as the page, an assert placed right after a
Method/Effect can confirm what that specific action actually did - not a duplicate of that
Block's own inline `verify`, a genuinely separate, nameable QA checkpoint:

```typescript
const removeButtonVisibleForSelectedItem: Trait = {
  name: "remove-button-visible-for-selected-item",
  async check(page, mem) {
    const { id } = mem.get(SelectedItem.key); // what add-item just acted on
    return page.locator(RemoveBtnSel(id)).isVisible();
  },
};

export const AssertItemAddedBlock = defineAssertBlock<ItemInCart>({
  name: "assert-item-added",
  checkpoint: "ItemInCart",
  verify: [removeButtonVisibleForSelectedItem, Trait.text(CartCountSel, "1")],
});

// wired right after the action it checks:
engine.defineFlow([start, NavHomeBlock, AddItemBlock, AssertItemAddedBlock, ClearCartBlock, end])
```

Live reference: `templates/scaffold/src/map/(app_base)/home/_methods/assert-item-added.method.block.ts`,
wired into `shop.flow.ts`.

**An assert Block also names a feature *state*, not just a result or static content.** A
submit button greyed out until required fields are filled, a "Save" button re-enabling
after a successful edit, a field-level validation error appearing under one specific input
- these are conditions the UI is *in*, worth a nameable Checkpoint of their own the same way
`AssertItemAddedBlock` names "did add-item work." There's no built-in `Trait.disabled` -
write the state check as a custom Trait against the real DOM condition (`isDisabled()`, a
class, an `aria-disabled` attribute - whatever the app actually uses), the same pattern as
`removeButtonVisibleForSelectedItem` above:

```typescript
const submitGatedUntilFieldsComplete: Trait = {
  name: "submit-gated-until-fields-complete",
  async check(page) {
    return page.locator(CheckoutSel.submitButton).isDisabled();
  },
};

export const AssertSubmitGatedBlock = defineAssertBlock<CheckoutInfoPage>({
  name: "assert-submit-gated",
  checkpoint: "CheckoutInfoPage",
  verify: [submitGatedUntilFieldsComplete],
});

// wired right after the fields that gate it, before the ones that clear the gate:
engine.defineFlow([start, NavCheckoutInfoBlock, AssertSubmitGatedBlock, FillFirstNameBlock, ...])
```

Same rule as any other assert Block: give it an explicit type argument when it sits
mid-chain (see above), and keep the selector in a `*Sel` object, never inlined in the Trait.

**`methods/` folder:** on-page work lives next to the route, not free-floating.

**`*Sel`:** DOM selectors only (static strings + `(id) => ...` for item-no-1 style). Mem
keys store values (which item / upload queue), not selectors. `instanceOptions` scrapes the
live DOM into menu rows and `mem.set`s on pick; predefined methods seed mem from the flow
instead.

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
`remove-all-from-cart` are one menu row each (`from: "*"` - works after leave/return).

## Mail adapters (cross-origin, browser-driven)

For flows driven by an email (signup confirmation, password reset, a magic link), the
convention is **not** a REST/HTTP client to the mail catcher - it's more Blocks, pointed at
the catcher's own web UI (MailHog, MailDev, Mailpit all ship one) as a real, separate,
cross-origin page. This needs zero new engine surface: a `NavBlock` navigates there like any
other page, `MethodBlock`s read the DOM with ordinary `page.locator`/`page.frameLocator`
calls, and a final `NavBlock` carries the extracted link back into the app under test.
Convergent, real-world evidence for this exact shape: independently, more than one real
consumer project settled on it rather than a REST client.

**Keep it in its own `*-external/<tool>/` folder, never mixed into your app's own Blocks** -
it's a different origin, driving a different site:

```typescript
// demo-external/mailpit/nav-mailpit-inbox.block.ts
export const NavMailpitInboxBlock = defineNavBlock<MailpitInbox>({
  name: "nav-mailpit-inbox",
  checkpoint: "MailpitInbox",
  url: () => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025",
  verify: [Trait.url({ pathname: "/" })],
});

// demo-external/mailpit/methods/open-message.method.block.ts
export const OpenMessageBlock = defineMethodBlock<MailpitInbox, MailpitMessageOpen>({
  name: "open-message",
  requires: [ExpectedRecipient.key], // externally supplied - avoids picking the wrong inbox row
  instruction: {
    async act(page, _in, mem) {
      const { email } = mem.get(ExpectedRecipient.key);
      await page.locator(MailpitSel.messageRow, { hasText: email }).first().click();
      await page.waitForURL(/\/view\//);
    },
    resolve: () => checkpoint("MailpitMessageOpen"),
  },
});

// demo-external/mailpit/methods/extract-email-link.method.block.ts
// Named for what it does, not for one scenario - see "reusable across
// scenarios" below for why.
export const ExtractEmailLinkBlock = defineMethodBlock<MailpitMessageOpen, MailpitMessageOpen>({
  name: "extract-email-link",
  requires: [ExpectedLinkPattern], // which link in the body to follow - externally supplied
  instruction: {
    async act(page, _in, mem) {
      const pattern = mem.get(ExpectedLinkPattern);
      const link = page.frameLocator(MailpitSel.previewIframe).locator(`a[href*="${pattern}"]`).first();
      const href = await link.getAttribute("href");
      if (!href) throw new Error(`no link matching "${pattern}" found`);
      mem.set(EmailLink({ url: href }));
    },
    resolve: () => checkpoint("MailpitMessageOpen"),
  },
});

// demo-web/nav-verification-link.block.ts - back into the app, no `requires` (see below)
export const NavVerificationLinkBlock = defineNavBlock<HomeVerified>({
  name: "nav-verification-link",
  checkpoint: "HomeVerified",
  url: (mem) => mem.get(EmailLink.key).url,
  verify: [Trait.visible(DemoSel.verifiedBanner)],
});
```

Four atomic Blocks, each doing exactly one thing - `open-message` and `extract-email-link`
stay separate Methods for the same reason `fill-username`/`submit-login` do in the Sauce
Demo example: reading the link and navigating to it are two distinct actions, so they are
two distinct Blocks (`nav-verification-link` does the actual navigation).

Note `nav-verification-link` deliberately does **not** declare `requires: [EmailLink.key]` -
`requires` means "the caller must seed this externally before the flow starts" (preflight
checks a whole chain's requires up front), and this key is instead produced by
`extract-email-link` earlier in the very same chain. Declaring it as a requirement would make
preflight reject the run before it ever gets a chance to produce it - `requires` is only for
keys a caller truly must supply from outside the chain (like `ExpectedRecipient` above).

Live reference, proven end to end against a real, throwaway Mailpit container:
`templates/scaffold/src/map/(external)/mailpit/` + `src/flows/mail-verify.flow.ts` +
`tests/mail-verify.spec.ts`.

### Reusable across scenarios: mem-driven, not one Block per email

The natural instinct once you have a signup-verification flow is to want a matching set of
Blocks for password reset, then another for a magic link, and so on - N scenarios, N Block
sets. That's the wrong axis to scale on. `open-message`, `extract-email-link`, and the two
assert Blocks below are already scenario-agnostic: **only mem varies per run, never the
Blocks**:

| Mem key | Answers |
|---|---|
| `ExpectedRecipient` | Which inbox row to open |
| `ExpectedLinkPattern` | Which link in the body to follow (a real email often has more than one - "report abuse" and the real link both present) |
| `ExpectedEmailContent` | What the body is supposed to say |

The same four Blocks (`assert-email-received`, `open-message`, `assert-email-content`,
`extract-email-link`) run a signup-verification check and a password-reset check identically
- just with different mem, in `templates/scaffold/tests/mail-verify.spec.ts`:

```typescript
mem.set(ExpectedRecipient({ email: "demo-user@example.com" }));
mem.set(ExpectedLinkPattern, "verified=1");
mem.set(ExpectedEmailContent, "Please confirm your email address...");
await mailVerifyFlow.run(context, mem); // signup verification

mem.set(ExpectedRecipient({ email: "password-reset-user@example.com" }));
mem.set(ExpectedLinkPattern, "verified=1"); // picks the real link, not the "report abuse" decoy also in the body
mem.set(ExpectedEmailContent, "We received a request to reset your password.");
await mailVerifyFlow.run(context, mem); // same flow, same Blocks, different email entirely
```

Naming matters here: a Block named `extract-verification-link` would wrongly imply it only
ever handles verification emails - once a Block's behavior is mem-driven, its name should
describe the mechanism (`extract-email-link`), not one scenario that happens to use it.

A **mail-provider page hub** ties it together, the same `definePageBlock` pattern used
everywhere else - one page, several reusable methods, each pulling its specifics from mem:

```typescript
export const MailpitInboxPageBlock = definePageBlock<MailpitInbox>({
  name: "page-mailpit-inbox",
  checkpoint: "MailpitInbox",
  verify: [Trait.url({ pathname: "/" })],
  methods: {
    assertEmailReceived: () => AssertEmailReceivedBlock,
    openMessage: () => OpenMessageBlock,
    assertEmailContent: () => AssertEmailContentBlock,
    extractEmailLink: () => ExtractEmailLinkBlock,
  },
});
```

### QA-rich: does the email exist, and does it say the right thing

Two more assert Blocks slot into the same chain, both mem-driven, both proven to fail loud
(not silently pass) on a real negative case - no email arrived, and an email arrived with
the wrong copy:

```typescript
// "Did the email even arrive" - doesn't open/consume it, safe to check before deciding to.
// A mem-aware Trait: the selector depends on the expected recipient, so it
// can't be a static Trait.visible(...) string - check(page, mem) already gets mem.
const emailReceived: Trait = {
  name: "email-received",
  async check(page, mem) {
    const { email } = mem.get(ExpectedRecipient.key);
    try {
      await page.locator(MailpitSel.messageRow, { hasText: email }).first().waitFor({
        state: "visible",
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  },
};
export const AssertEmailReceivedBlock = defineAssertBlock<MailpitInbox>({
  name: "assert-email-received",
  checkpoint: "MailpitInbox",
  requires: [ExpectedRecipient.key],
  verify: [emailReceived],
});

// "Does the email say what it's supposed to" - reads the body content, not
// just whether a link exists. The expected text comes from mem too (same
// reuse reasoning as above) via another bespoke mem-aware Trait, since
// Trait.frameContains's own factory bakes its expected string in at
// Block-definition time, not runtime.
const bodyContainsExpectedText: Trait = {
  name: "body-contains-expected-text",
  async check(page, mem) {
    const expected = mem.get(ExpectedEmailContent);
    const text = await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent();
    return (text ?? "").includes(expected);
  },
};
export const AssertEmailContentBlock = defineAssertBlock<MailpitMessageOpen>({
  name: "assert-email-content",
  checkpoint: "MailpitMessageOpen",
  requires: [ExpectedEmailContent],
  verify: [bodyContainsExpectedText],
});
```

`Trait.frameVisible(frameSelector, innerSelector)` / `Trait.frameText(frameSelector,
innerSelector, expected)` (exact match) / `Trait.frameContains(frameSelector, innerSelector,
expected)` (substring match, for a *fixed* known expected string) mirror
`Trait.visible`/`Trait.text` exactly, scoped to a frame - reusable for any iframe content,
not just mail; reach for a bespoke mem-aware Trait instead when the expected value itself
needs to vary per run, as both examples above do. Wired into the chain right where they
belong:

```typescript
engine.defineFlow([
  start, NavMailpitInboxBlock, AssertEmailReceivedBlock, OpenMessageBlock,
  AssertEmailContentBlock, ExtractEmailLinkBlock, NavVerificationLinkBlock, end,
])
```

### Where this shows up in `waygraph auto`

A `NavBlock` always has wildcard `In` (`from: "*"` in the static graph), so it's reasonable to
wonder whether `nav-mailpit-inbox` clutters the live picker on every single screen. It
doesn't - `waygraph auto`'s menu builder already special-cases exactly this
(`src/auto-explore.ts`, `buildExploreMenu`): a URL-based Nav is excluded from the interactive
menu once you're on a known screen, offered only as a "Start here" bootstrap option. The
static graph still keeps the `from: "*"` edge for `waygraph graph`/`findBlockPath`/`traverse`,
so `waygraph auto --blocks "<AppCheckpoint> MailpitInbox"` can still route there deliberately -
it's just never suggested unprompted. The tested, recommended way to actually use this is an
authored flow/chain (`someAppFlow then mailVerifyFlow`), exactly like `mailVerifyFlow` itself.

## Waygraph Pilot

Bootstraps a real, persistent, inspectable browser session for an **agent** to discover and
drive toward a natural-language goal it plans itself - not a tool that resolves one ask to one
Block internally. A real request is a multi-step task ("log in and buy the backpack for me",
"make a signature draft request") that needs an agent reasoning over a sequence of Blocks, not
a single best-matching edge. Comparable in shape to a browser-use-style agent, but the action
space is constrained to this project's own pre-verified Blocks (each with a real resolve/verify
already checked) instead of freeform DOM/pixel guessing - narrower, but far more accurate and
deterministic.

### auto vs browser vs pilot

| Layer | Command | What it is |
|-------|---------|------------|
| **auto** | `waygraph auto` | Interactive explore (picker / `--cli` menu). **Not** a persistent agent browser. |
| **browser** | `waygraph browser start` | New persistent Playwright session — **headful by default**, **about:blank by default**. |
| **pilot** | `waygraph pilot start` | Bootstrap only: `browser start` + whole-project `graph` + starting `snapshot` in one JSON payload. Does not plan or act. |

Session control (`send`, `status`, `highlight`, `dom`, …) works on **`auto`**, **`browser`**, and
**`pilot`** — same socket, same session id. Prefer the `browser`/`pilot` prefix when driving a
detached session; `auto` remains for the interactive picker and legacy `--cli --detach`.

**Session lifecycle is explicit** — list what's live before opening another:

```bash
waygraph browser                         # show browser subcommands
waygraph browser sessions [--json]       # list live sessions; --json for agents
waygraph browser start                   # always opens a new session
waygraph browser stop <sessionId>        # shut one down
waygraph browser stop --all              # shut every session for this project
waygraph browser attach <sessionId>        # terminal picker on an existing session
waygraph pilot attach <sessionId>          # graph + snapshot, no new browser
```

```bash
waygraph pilot start
# {"sessionId":"bb65d74c","socketPath":"...","headless":false,"graph":{...},"snapshot":{...}}
```

`pilot start` is one round trip for agents that need the whole graph immediately. For browser-only
work (no graph payload), use `browser start`. `auto --cli --detach` still works but is the older
explore entry point — prefer `browser start` for agent-driven sessions.

From a live session, drive one pick at a time:

```bash
waygraph browser status <sessionId>              # read the current menu (no side effects)
waygraph browser send <sessionId> "<pick>"       # run one pick, get the resulting menu back
waygraph browser dom <sessionId>                 # inspect the live DOM/ARIA tree
waygraph browser trace <sessionId>               # read the Checkpoint/Block history so far
waygraph browser reach <sessionId> <Checkpoint>  # run a whole multi-step route in one call
waygraph browser resync <sessionId>              # force here to re-detect from the real page
```

(`auto …` and `pilot …` accept the same subcommands with the same `<sessionId>`.)

Worked example (run for real against `examples/saucedemo`, no new execution code involved): an
agent gets a plain request - "log me in and buy the backpack" - reads the graph and the starting
`status`, reasons out login -> add-to-cart -> cart -> checkout info -> submit -> finish as the
route to `OrderComplete`, then drives it by repeatedly reading each `status`/`send` response and
picking the next index itself. The browser stays open the whole time; the user can watch it, or
check the final tab afterward.

**`auto reach <sessionId> <Checkpoint>`** runs a whole route in one call instead of one
`send` per step - real, reported pain for any non-trivial task on a rich graph ("the entire
prompts of the day" for one manual walkthrough). It path-finds via the same BFS `auto --blocks
<From> <To>` already uses, then runs each step directly against the session's own live
page/mem, verifying every step actually lands where its own graph edge promised (not just that
it ran without throwing - a Block can legitimately resolve elsewhere, e.g. a login submission
staying put after bad auth). **Real, stated limitation, not silently papered over:** for a
target only reachable by crossing a wildcard (`from: "*"`) edge whose real DOM precondition
depends on same-Checkpoint setup (e.g. filling form fields before a submit), neither `reach`
nor the already-shipped `auto --blocks` can safely route there automatically - both fail loud
within a bounded time (a real Playwright click/wait timeout) rather than silently guessing
wrong or hanging. Full design history - three rejected approaches, a real correctness bug this
change's own tests caught, and this limitation confirmed by direct reproduction - is in
`openspec/changes/waygraph-pilot/tasks.md`'s own M5 section.

**`auto resync <sessionId>`** - `here` is only ever updated by an action the session itself
ran (`send`/`reach` set it from a Block's own resolved Checkpoint; the raw `click`/`type`/
`goto` primitives null it because *they* just changed the page). Anything that changes the
page *outside* the session - a human clicking around in a visible `--non-headless` session
someone is co-driving, for instance - leaves `here` silently stale, since `send`/`reach` only
ever re-detect when the position is already unknown, never to double-check a known one.
`resync` forces that re-detection unconditionally, right now, against whatever the real page
actually shows. Doesn't crash or corrupt anything if you never need it - it's a real, found
gap (confirmed by reading the exact code path, `src/auto-session.ts`'s `currentMenu()`), fixed
outright rather than left as a caveat.

**Coverage gaps `waygraph check`/`graph` can't see, because there's no Block to scan yet.**
Static tools only find gaps in Blocks that already exist - a real link or button on the live
page with *no Block written for it at all* has nothing in source to catch it. Every live
`auto`/`browser`/`pilot` session watches the real page instead and warns (once per element,
via `console.warn`) on a same-origin `<a href>` no `defineNavBlock` covers, or a visible
`button`/`[role=button]`/submit input no Method/NavClick Block selector matches:

```text
[waygraph] unmapped nav link on this page: /settings - no NavBlock covers this URL; add defineNavBlock
[waygraph] unmapped button on this page: #save-draft - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock
```

Read them back with `auto console <sessionId>` - the same channel real console/network errors
already come through, not a separate command (`src/coverage-gap.ts`, wired into every session
in `src/auto-session.ts`).

**On-page indicator.** A headful (`--non-headless`) session looks like an ordinary browser
tab otherwise - no sign anything is driving it, which matters once a human might be watching
or co-driving the same visible session. Every session injects a small badge (bottom-right
corner: `Waygraph Pilot - session <id> - <Checkpoint>`) that click-expands into a panel
listing the current live menu's real edges (block name, kind, target Checkpoint,
description) - the same data `auto status` returns, rendered in the page itself. The overlay
shell is installed via `context.addInitScript`, so it **persists on `about:blank`** and
survives `goto` navigations (browser start defaults to blank; pilot navigates when a base URL
exists). Headful sessions paint the badge immediately on start — no need to call `status`
first. Bottom-left activity toasts label raw primitives as **`Running (no Block): …`**
(click/type/goto/upload outside the Block library); Block runs stay **`Running (Block): …`**.
Both refresh automatically after every `send`/`reach`/`reload`/`resync`/raw action.
Self-contained (`src/pilot-overlay.ts`), not built on `waygraph demo`'s own panel/banner
system.

**Pilot itself does no planning, resolving, narrating, or acting** - `pilotStart`'s only job is
starting the session and handing back its graph in one round trip; see `src/pilot.ts`. An
earlier shape (`pilot ask "<text>"`, a deterministic ask-to-one-edge text matcher) was built,
shipped, and then explicitly rejected as not matching this goal - preserved for reference at git
tag `waygraph-pilot-v1-logs-prettified`, not on any active branch.

**Honest scope, not silently redefined:** this capability's own proof runs against an in-repo
example (`examples/saucedemo`), not a real external consumer application - it demonstrates the
mechanism works, not the "demoable on one real consumer" bar `ROADMAP.md` sets for `1.0.0`,
which remains separate, later, unmet work. Live reference: `tests/pilot/pilot.spec.ts` (the
library function) and `tests/cli/pilot.spec.ts` (the real CLI), both proven against live
saucedemo.com.

## Blind Pilot (cold start, zero Blocks)

Waygraph Pilot above assumes a Block library already exists. Blind Pilot is the opposite
case: a session on a site nobody has described to this package yet. `AutoSession`/`auto --cli
--detach` already tolerate a project directory with **zero** `.block.ts` files (no crash,
`here` just stays `null`), so an agent can open a real session and start exploring cold with
no new code at all - `auto dom <sessionId>` already gives real DOM/ARIA visibility
independent of any Block library.

What's actually new here is two primitives an agent needs to go from "exploring" to "building
a Block library incrementally":

```bash
waygraph auto click <sessionId> "<selector>"          # act before any Block covers this
waygraph auto type <sessionId> "<selector>" "<text>"  # same, for a real input
waygraph auto goto <sessionId> "<url>"                # navigate the real live page
waygraph auto reload <sessionId>                      # pick up a Block just written to disk,
                                                       # without restarting the session
```

`click`/`type`/`goto` each re-detect the session's Checkpoint afterward (the same detection
`send`/`status` already use) and return a fresh snapshot - a selector matching nothing is a
reported failure naming it, not a silent no-op. `reload` re-discovers the project's Block
library/graph from disk in place, leaving the live page, mem, and current Checkpoint
untouched - so a Block an agent just wrote to disk becomes immediately runnable via the
session's existing `send`, without relaunching the browser.

**This package writes no Block content.** The driving agent recognizes a pattern ("this is a
login form") and writes the `.block.ts`/`*Sel`/mem-keys files itself, using the conventions
documented above - the same way it would write any other source file. Worked example (proven
end to end in `tests/cli/auto-session-blind-pilot.spec.ts` against an in-repo synthetic
fixture, `tests/fixtures/blind-pilot-site/`): start a session with zero Blocks, explore via
`dom`/`click`/`goto`, write one real `defineNavBlock` to disk, `reload`, then `send` it -
reaching the real Checkpoint it declares, proving it's genuinely driveable, not just visible.

**Two real gotchas found while proving this, worth knowing before debugging a silent
failure:** a `.block.ts` file that throws on import (e.g. a malformed Trait call) vanishes
from the graph with no error printed anywhere - `discoverGraph`'s per-file import errors are
mostly swallowed silently, so "reload did nothing" can mean a real mistake in the file just
written, not a package bug. And a Block not wired into any `.flow.ts` (`waygraph graph`'s own
"orphan" warning) is still fully visible and runnable in a live session's menu - orphan status
only affects `auto --blocks <From> <To>` path-finding, not `auto`'s own menu.

**Honest scope:** Blind Pilot does not currently author into the Waygraph Map convention
below by default - it still writes plain files wherever it's pointed. Proof stays against an
in-repo synthetic fixture, not a real external site.

## Waygraph Map

An opinionated, Next.js/Nuxt-style folder convention where a project's own directory
structure mechanically *is* its map - not a separate schema file to generate, maintain, or
let drift out of sync. Needs zero new engine code: `discoverGraph`/`loadBlockLibrary` already
recurse through any folder structure, matching only the `.block.ts` filename pattern - folder
naming and depth are already 100% cosmetic to every existing command.

```text
src/map/
  (app_base)/              # the landing/base group - purely organizational, never part of
    dashboard/              # any Checkpoint tag. One folder per Checkpoint - "Dashboard"
      _page.block.ts         # arrival hub (definePageBlock) - fixed name, every folder
      _nav.block.ts           # navigation (defineNavBlock) - fixed name, every folder
      _sel.ts                  # selectors for this Checkpoint - fixed name, every folder
      _methods/                 # this Checkpoint's own action Blocks - fixed name, every
        click-widget.block.ts    # folder. Contents keep their own descriptive names -
  (external)/                     # only the folder itself is fixed.
    docs/                    # a genuinely cross-origin group, same shape - "Docs"
      _page.block.ts
      _nav.block.ts
      _sel.ts
```

**Not just a naming preference - a forced convention.** Folder nesting under `map/(group)/`
must **verbatim-match** the real site's own URL path segments, `(group)` parens excluded
(purely organizational, same as a Next.js route group): `/app/chats` lives at
`map/(app_base)/app/chats/`, never `map/(auth)/chats/` for a fabricated grouping that was
never a real `/auth/*` URL. `waygraph map [project]` (see [CLI reference](#cli-reference))
enforces this mechanically and exits 1 on a mismatch - don't rely on review alone. Same Block
helpers as today's freeform "manual mode" (`definePageBlock`/`defineNavBlock`/
`defineMethodBlock`/etc.) either way - Map only changes *where files live and what they're
named*, never what kind of Block authors them or how they execute. A project adopts it
incrementally, folder by folder. Prefer [`map()`](#map---a-kind-checked-no-teleporting-flow-builder)
over a hand-assembled `defineFlow([start, ...])` array when wiring these Blocks into a Flow -
it's the one that can't silently accept a Block that didn't come from a real factory.

**Leading underscore = this Checkpoint's own fixed machinery, never a route segment.**
`_nav.block.ts`/`_page.block.ts`/`_sel.ts`/`_methods/` (same private-folder idea as Next.js's
own `_folder` convention) mark "this belongs to the endpoint whose folder it's directly in,"
so a bare (non-underscore, non-`(group)`) folder name always means a real child
Checkpoint/URL segment - `_methods/` can never be mistaken for a sibling endpoint folder the
way a bare `methods/` structurally could be, since only ONE of those two readings is
mechanically distinguishable at a glance. `waygraph map`'s own folder-vs-URL comparison
excludes underscore segments the same way it excludes `(group)` ones - `_methods/foo.block.ts`
compares against the URL as if `_methods/` weren't there at all. Individual files inside
`_methods/` keep their own descriptive names (`join-pool.method.block.ts`, not
`_join-pool...`) - they're hand-authored per-project content, not fixed convention names; the
`_methods/` folder boundary alone already marks the whole subtree as non-route.

**"waypack" - loading another project's Blocks needs no separate manifest either.** A second
project depending on a Map-convention project as a plain `file:` dependency (the same
mechanism `examples/saucedemo`'s own `"waygraph": "file:../.."` already uses) is immediately
understandable: `waygraph graph node_modules/<loaded-package>` correctly discovers its full
Checkpoint/edge structure, with nothing generated or maintained separately. Proven end to end
in `examples/routed-demo-consumer/` against `examples/routed-demo/`.

**A real bug this proof surfaced, fixed, not left as a caveat:** a *live* `--detach` session
against a package loaded through a consumer project's own deeply nested `node_modules/<pkg>`
path used to fail with `listen EINVAL` - the session's Unix socket lived under the project
directory, and that absolute path could exceed the OS's AF_UNIX limit (~108 bytes on Linux).
Fixed: session sockets now live in a short, fixed location (`os.tmpdir()/waygraph-auto/`),
independent of how deeply the project itself is nested - confirmed against the exact
previously-failing path (`auto --cli --detach`, `auto reach`, and quit all working normally).
Session metadata (`.waygraph-auto/<id>.json`, discoverable per-project) is unaffected - only
the socket moved.

Full design history (why "Router" isn't a separate thing to build, two prior wrong readings
of this before landing here, and everything above stated as requirements) in
`openspec/changes/waygraph-map/`.

## Migrating from freeform ("router") to Waygraph Map

"Router" isn't a separate mode to turn off - it's this project's own name for today's
freeform, folder-organized style (`src/blocks/<slug>/`, any nesting, any file names).
Migrating means moving those files under `src/map/(group)/<page-slug>/` with verbatim
URL-matching names, nothing more - no engine change, no new Block helpers, no flag to flip.
Do it incrementally: the two styles coexist in the same project (and even the same Flow) with
no special-casing, since `discoverGraph`/`loadBlockLibrary` only ever match the `.block.ts`
filename pattern, never folder depth or naming.

1. **List every real URL your NavBlocks/PageBlocks already navigate to.** For each one with a
   static string `url`, note its real path. For each one that's `click`-based (no `url` field
   at all) or a dynamic `(mem) => string` function, note that too - neither is statically
   checkable by `waygraph map`, so they can go wherever makes sense; only a literal string
   `url` is verified.
2. **Pick your group(s).** `(app_base)/` for the landing/base app (organizational only, never
   part of a Checkpoint tag); `(external)/` for genuinely cross-origin Blocks (mail tools,
   third-party embeds) - verify with the real URL, not the folder's own current name, since a
   folder can already be mis-grouped (a real bug this session found: a project's own
   `(external)/docs/` was actually same-origin the whole time).
3. **Create `src/map/(group)/<verbatim-url-segments>/` per Checkpoint**, `git mv` each
   Block/Sel file in, and rename the fixed ones: `nav.block.ts` -> `_nav.block.ts`,
   `page.block.ts` -> `_page.block.ts`, your selector file -> `_sel.ts` (drops its slug - now a
   fully fixed name), `methods/` -> `_methods/` (contents keep their own names unchanged).
   **Two Checkpoints sharing one real URL** (a DOM-state distinction, not a URL one - e.g. a
   "joined" vs "not joined" variant of the same page) can't both use the bare fixed names in
   one folder; give each pair a slug prefix instead (`app-home._nav.block.ts` /
   `in-pool._nav.block.ts`, or similar) rather than nesting either under its own subfolder
   (that would add a folder segment the real URL doesn't have, and fail step 5).
4. **A dynamic per-instance URL** (a real chat/order/ticket id, not a fixed route) - if it's
   currently a plain string constant, wrap it as `url: () => thatConstant` instead. A bare
   string is always treated as a real, checkable static route; a function is correctly treated
   as dynamic/non-canonical and skipped, matching how you'd actually navigate a real instance of
   it in practice anyway.
5. **Fix every import** the moves break (states/mem-key paths change depth; sibling
   nav/page/methods imports need their new `_`-prefixed names) - let the compiler do this for
   you: `tsc --noEmit` if the project has one, otherwise `waygraph check [project]` and
   `waygraph graph [project]` (both do real dynamic imports of every Block file and report
   import failures by name) are just as effective a proof.
6. **Run `waygraph map [project]`.** Exit 0 / "0 violations" is the actual finish line - not a
   subjective review. A remaining violation names the exact file, its real folder path, and the
   real URL it doesn't match; fix the folder, not the check.
7. **Diff `waygraph graph`'s node/edge/skipped/orphan counts against before the move.** A pure
   migration changes zero Block behavior - if a count changed, something broke in transit
   (a bad import silently dropped a Block from discovery is the usual cause), not something to
   wave off as "close enough."

Once the folder structure is settled, prefer building/rebuilding Flows over these Blocks with
[`map()`](#map---a-kind-checked-no-teleporting-flow-builder) instead of a hand-assembled
`defineFlow([start, ...])` array - it's the one that can't silently accept a Block that isn't
really a Nav/Page/Assert/Method from this package's own factories.

## Getting started (pick one)

| Goal | Command |
|------|---------|
| Watch Sauce Demo step-through (temp dir only) | `npx waygraph try demo` |
| Interactive explore (Add/Remove/Open details from live page) | `cd examples/saucedemo && npm i && npx waygraph auto` |
| Scaffold a new **offline** project (green `npm test` on local fixture `:4177`) | `npx waygraph init my-app` |
| Install coding-agent defs for diving an app into Blocks | `npx waygraph agent-dive --loop claude` (also `opencode` / `cursor` / `vscode`) |
| Print a packaged agent skill to stdout | `npx waygraph --skill` (list) / `--skill-pilot` / `--skill-pilot-blind` / `--skill-convention` |
| Add waygraph to an existing repo | `npm install waygraph @playwright/test` |

```bash
npx waygraph init my-app
cd my-app && npm install && npx playwright install chromium && npm test
```

`try demo` is different: live saucedemo.com, step-through **Sign In -> Shop & Checkout ->
blocked Viewer login**, then headless tests. Permanent full example:
[`examples/saucedemo`](./examples/saucedemo). Offline empty scaffold: `init`.

**`create-waygraph` (npm) is deprecated** - it was the identical `init` template shipped as
a second package for no real benefit. Use `npx waygraph init my-app` instead.

```bash
# From this checkout, after npm run build:
cd examples/saucedemo && npm install && npx playwright install chromium
npm test                  # live Playwright suite
npm run auto              # headed interactive explore
npm run demo:step         # stepper (manual Next)
npm run demo:autoplay     # stepper with Auto-advance
```

Both scaffold commands emit the same offline tree (route-shaped `demo-web/` + `methods/`,
stubs, fixtures, one YAP slide). Layout: [`docs/scaffold.html`](./docs/scaffold.html) ·
`templates/scaffold/STRUCTURE.md`.

**Consumer layout (Next.js App Router):** block folders mirror `app/` page routes (`/` at
the namespace root; no invented `landing/`/`root/`; sidebar = chrome + edges). See
[`docs/consumer.html`](./docs/consumer.html). A separate mesh handout
(`WAYGRAPH-CONSUMER-CONVENTION.md`) covers the same convention outside this repo - not
part of this package's own tree.

## CLI reference

`waygraph auto [project]` is the **interactive explore** loop: `locate()` reads where you
are, lists runnable Blocks from the graph, you pick one (headful panel or `--cli` terminal
menu), repeat. Static graph export (old JSON / Mermaid) is `waygraph graph [project]`
(`--mermaid`). Unattended JSON execution is `run` + `WAYGRAPH_JSON=1`.

**`--cli` session control:** `waygraph auto --cli` on its own is a blocking terminal loop -
fine for a person, awkward for an agent that needs to inspect state between picks or send
one command at a time without guessing a whole input sequence upfront. `--detach` runs that
same session as a background socket server instead (session identity under
`.waygraph-auto/` in the target project, mirroring `.waygraph-traverse/`'s convention);
`auto send <sessionId> "<pick>"` and `auto status <sessionId>` are non-interactive
request/response calls against it (no TTY needed), and `auto attach <sessionId>` reopens an
interactive terminal against an already-running session. `send q`/`send quit` ends the
session and cleans up its socket/metadata. `--detach` defaults to headless;
`--non-headless` (the same flag `run`/`demo` already use) launches a real visible browser
window while the session stays driven entirely through `send`/`status`/`attach`/`dom` - not
a new picker UI, and the existing page-embedded headful panel (bare `waygraph auto`, no
`--cli`) is untouched either way.

**Session history:** `auto trace <sessionId>` returns a Checkpoint/Block-level record of
what the session actually did - Block name, Checkpoint before/after, and (when the Block
authors them) its resolved `stubBefore`/`stubAfter`/`stubOnError` demo-narration fixtures
(the same highlight/todo/device data `waygraph demo`'s own lifecycle logging computes via
`runStubPhase`, reused here since it's pure data with no browser side effects). Deliberately
not a raw action recorder - no clicks/fills, only the same Block-level resolution the rest of
the engine already reasons about, capped at the last 500 steps.

**Reading the live page:** `auto dom <sessionId>` gives an agent driving a session read-only
visibility into the actual page, without reading the target project's frontend source.
Default `--mode aria` returns Playwright's AI-oriented accessibility snapshot
(`ariaSnapshotJSON({ mode: "ai" })`) - small and usually enough to find "the Username
textbox" or "the Login button." `--mode full` returns a bounded raw DOM subtree
(tag/attributes/text/children - useful when you need actual CSS classes or data-attributes
`aria` can't see), hard-capped on depth/node count/text length and marked `truncated: true`
whenever a cap is hit, since this is read by an LLM, not a human. `--selector <sel>` scopes
either mode to one element's subtree instead of the whole page - a modifier on the mode, not
a third mode.

**Agent bootstrap:** `waygraph pilot start` starts a `--detach` session and reads back the
whole project graph in one call, so an agent can begin planning a multi-step request
immediately - see "Waygraph Pilot" above for the full picture.

**Cold start (zero Blocks):** `auto click/type/goto <sessionId>` act on the live page even
when no Block covers that action yet, and `auto reload <sessionId>` picks up a Block just
written to disk without restarting the session - see "Blind Pilot" above.

**`waygraph test [...args]`** is a thin wrapper around the project's own `@playwright/test`
suite - it forwards to the local `node_modules/.bin/playwright` (falling back to
`npx playwright` if the project hasn't installed it locally yet), so `waygraph test` behaves
exactly like `playwright test`, and anything after it (`--grep`, a spec path, `--headed`, …)
passes straight through. `waygraph test ui` (or `waygraph test --ui`) launches Playwright's
interactive UI Mode the same way. Scaffolded projects (`waygraph init`) wire this up as
`npm test` / `npm run test:ui`, and ship `trace: "retain-on-failure"` plus
the `html` reporter in `playwright.config.ts`, so a failing `waygraph test` already has a
trace waiting - `waygraph test report` opens the HTML report, and
`waygraph test show-trace <trace.zip>` opens one trace directly (both forward to Playwright's
own `show-report`/`show-trace`, which live outside `playwright test`, so they're handled
before the `test` forward rather than passed through it).

Flows are files (0.10.5+):

| Want | Command |
|------|---------|
| List flows | `waygraph list` -> `src/flows/shop.flow.ts  shopFlow` |
| Run by file | `waygraph run src/flows/shop.flow.ts --data '{...}'` |
| Same via `auto` | `waygraph auto src/flows/shop.flow.ts --data '{...}'` |
| Run by export | `waygraph run --blocks shopFlow` |
| Manual watch | `waygraph demo src/flows/shop.flow.ts` |
| Auto-advance | `waygraph demo --blocks shopFlow --auto-next` (nav auto-hides strip) |
| Fast / full strip | `waygraph demo ... --fast` (shorter gates; keeps cursor) · `--full` (classic chips; default = carousel) |
| Todo dock UX | `waygraph demo ... --todo-smart` (default) · `--todo-full` (no compact/collision/behind) |
| QA watch + record | `waygraph demo --blocks shopFlow --auto-play-video` |
| Ad-hoc Blocks | `waygraph run --blocks "login then nav-cart" --data '{...}'` |
| Headed execute | `waygraph run --blocks shopFlow --non-headless --video` |
| Explore | `waygraph auto` / `waygraph auto --cli` |
| Browser command reference | `waygraph browser` |
| List live browser sessions | `waygraph browser sessions [--json]` |
| Open a new persistent browser | `waygraph browser start` (headful, about:blank by default) |
| Stop a browser session | `waygraph browser stop <sessionId>` / `stop --all` |
| Pilot bootstrap (browser + graph + snapshot) | `waygraph pilot start` |
| Attach to existing session (graph only) | `waygraph pilot attach <sessionId>` |
| Path-find | `waygraph auto --blocks LoginPage OrderComplete` |
| Run `--cli` as a background session (legacy) | `waygraph auto --cli --detach` -> `{sessionId, socketPath}` |
| Drive a detached session (no TTY) | `waygraph browser send <sessionId> "<pick>"` -> JSON state |
| Read a detached session's state | `waygraph browser status <sessionId>` (no side effects) |
| Reattach a terminal to a detached session | `waygraph browser attach <sessionId>` |
| Read the live page (aria, small/default) | `waygraph auto dom <sessionId>` |
| Read the live page (raw DOM, bounded) | `waygraph auto dom <sessionId> --mode full` |
| Scope either to one element | `waygraph auto dom <sessionId> --selector ".inventory_list"` |
| Detached session with a real visible browser | `waygraph auto --cli --detach --non-headless` |
| Read the session's Checkpoint/Block history | `waygraph auto trace <sessionId>` |
| Read real console/network errors + coverage-gap warnings | `waygraph auto console <sessionId>` |
| Read localStorage/sessionStorage + service workers | `waygraph auto storage <sessionId>` |
| Whole-project nav-escape + inline-selector + orphan sweep | `waygraph check [project]` |
| `tsc --noEmit` + bad-practice warnings | `waygraph typecheck [project]` (`--no-practices` to skip scan) |
| Waygraph Map enforcement (verbatim url-vs-folder, exits 1 on a violation) | `waygraph map [project]` |
| Graph crawl | `waygraph traverse [project] --parallel N --min-edge-coverage 80%` |
| Coding-agent defs | `waygraph agent-dive --loop claude` |
| Print packaged skills | `waygraph --skill` / `--skill-pilot` / `--skill-pilot-blind` / `--skill-convention` |
| One-shot temp-dir demo | `waygraph try demo` / `waygraph try auto` / `waygraph try auto:cli` |
| Run the project's `@playwright/test` suite | `waygraph test` |
| Same suite, Playwright's interactive UI Mode | `waygraph test ui` (or `--ui`) |
| Open the last HTML report | `waygraph test report` |
| Open one trace in the trace viewer | `waygraph test show-trace <trace.zip>` |

`--blocks` / positional accepts a Flow export, a `.flow.ts` path, or `"a then b"`.
`auto <file.flow.ts>` **runs** that flow (same as `run`); bare `auto` still explores.
`--auto-next` (alias `--autoplay`) = panel Auto-advance. `--auto-play-video` is **demo
only**. `chain` remains a compat alias for `run --blocks` / `auto --blocks`.

### Todo dock UI (demo, 0.15.8+)

Long FR/AC checklists used to bury highlight rings. **Smart defaults are on:**

| Behavior | Default | Opt out |
|----------|---------|---------|
| Compact fold (~5 rows around current; hover expands; `+N more`) | on | `ctx.todoDockFull()` / `ctx.todoDockUi({ compact: false })` / `--todo-full` / `WAYGRAPH_TODO_UI=full` |
| Collision flip (dock L/R when a ring overlaps) | on | `ctx.todoDockUi({ collision: false })` / `WAYGRAPH_TODO_COLLISION=0` |
| Behind ring (dim + lower z-index while a ring is up) | on | `ctx.todoDockUi({ behindRing: false })` / `WAYGRAPH_TODO_BEHIND=0` |

Per-knob env also: `WAYGRAPH_TODO_COMPACT`, `WAYGRAPH_TODO_CAP` (default 5),
`WAYGRAPH_TODO_EXPAND_CAP` (default 14). Author API: `ctx.todoDockUi({ ... })`.
Pilot `auto highlight` accepts the same knobs as `todoUi` on the JSON body.

Run `waygraph --help` (or any subcommand with no args) for the full flag reference kept
in `src/cli.ts`'s own `usage()` - that's the source of truth for flags, this table is the
scannable summary.

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

## Recipes

### Detect / drive the surviving tab after a run

The default run closes the page it opened, and a page you hand in via `options.page`
survives. For a flow that must BE the surviving tab after it returns (an interactive
demo, a hand-back to a caller), ask for the page back explicitly:

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
npm run typecheck   # waygraph typecheck . (tsc --noEmit + practice warnings)
npm run test        # node --test tests/unit + playwright test
npm run test:ui     # playwright test --ui
npm run build       # tsc -p tsconfig.build.json, emits dist/
```

### Blind-agent overlay gate (anti-blank)

Every live modal (`#wg-panel`, `#wg-banner`, `#wg-auto-panel`, `#wg-todo-dock`) stamps
`data-wg-ui` / `data-wg-modal` / `data-wg-ready="1"`. Do **not** claim the stepper works
unless one of these passes:

```bash
# Playwright helper (exported from waygraph)
import { assertWgOverlayReady } from "waygraph";
await assertWgOverlayReady(page); // throws on blank / opacity-0 / missing stamp

# Live demo prove (exit 0 = painted, exit 2 = blank)
WAYGRAPH_PROVE_EXIT=1 WAYGRAPH_PROVE_SHOT=/tmp/wg.png \
  waygraph demo --blocks loginFlow --data '...'
# stderr: WAYGRAPH_PROVE {"ok":true,"beacons":[...],"readyAttr":"1"}
```

Tests: `tests/cli/overlay-beacon.spec.ts`. Helpers: `src/overlay-beacon.ts`. Rules for
touching the stepper/overlay chrome itself: `src/CLI-STOMP-GUARD.md`.

## Layout

```
package.json              the "waygraph" npm package itself
src/
  types.ts                 Checkpoint, Instruction, Block, connect()
  mem-page.ts               MemKey, key(), MemPage
  trait.ts                   Trait (type + discoverable Trait.url/.text/.visible), runVerify()
  engine.ts                   runGraph(), definePageBlock, defineMethodBlock, Engine, ...
  graph.ts                     discoverGraph, orphans, paths
  auto-explore.ts               waygraph auto menu building
  auto-explore-run.ts            waygraph auto interactive loop (headful + --cli)
  highlights.ts                  stub/fixture/slide/todo-dock/device narration types + helpers
  step-overlay.ts                 demo step overlay chrome (panel, ring, cursor)
  overlay-beacon.ts                blind-agent overlay readiness beacons
  traverse-run.ts                   waygraph traverse crawl (serial/parallel)
  traverse-coverage.ts               traverse coverage report + CI gate
  traverse-lease.ts                  traverse edge lease coordinator
  blocks-select.ts                   shared --blocks glob/regex/bare grammar
  agent-dive.ts                      waygraph agent-dive coding-agent scaffolding
  cli.ts                             waygraph CLI entrypoint (all subcommands)
  index.ts                           public barrel
examples/saucedemo/         live Sauce Demo (Page + methods/ + Sel)
templates/quickstart/       try demo / init template (mirrors sauce)
templates/scaffold/         offline waygraph init scaffold template
templates/agents/           waygraph agent-dive coding-agent definitions
docs/                       GitHub Pages static HTML + docs/proposals/ RFCs
openspec/                   spec-driven planning: specs/ (current), changes/ (in-flight),
                            changes/archive/ (shipped)
tests/                      runtime unit + integration tests (@playwright/test)
tsconfig.json                base config
tsconfig.build.json          emits to dist/
```

In-package Sauce Demo: [`examples/saucedemo`](./examples/saucedemo). Other consumer
experiments may still live in a sibling workspace folder and depend on this package via
`"waygraph": "file:../waygraph"` during local dev (see that
project's own `.npmrc` - `install-links=true` is required there, or npm will symlink
instead of copy and pull this package's own `node_modules` in through the symlink, causing
a duplicate-Playwright-installation error).
