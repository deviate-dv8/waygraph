# Engine features

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
  `.method(composed)` in a `map()` chain like any other.
- **`fastForwardComposeBlock(name, steps)`** is the same shape marked for wall-clock
  **fast-forward**: one opaque demo step that blitzes (no per-inner gate, no smooth cursor
  theater, Playwright `slowMo` off for that flow unless `WAYGRAPH_SLOWMO` is set) unless
  expanded. Put several FF units in one Flow to race past auth, then a heavy dashboard
  settle, then watch the interesting middle. `waygraph demo --ff-disabled` expands every FFCompose into its inner Blocks so a broken step is visible as
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
whether a project uses the [Waygraph Map](./map.md#waygraph-map) convention or the older freeform
folder style, since some real consumers of this package still use the latter.

### `map()` - a kind-checked, no-teleporting flow builder

TypeScript can check that each Block's `Out` matches the next one's `In`. It can **not** stop an agent (or a careless
human) from handing a flow a hand-rolled plain object that merely *looks* like a Block - TypeScript's
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
  .method(ClearCartBlock) // must be defineMethodBlock / defineEffectBlock / defineApiBlock
  .end(); // -> a real Flow<Out>; withBlockVerify still applies
```

Each step method is scoped to exactly the Block kind its name promises, checked against
the same `__waygraphKind`/`__waygraphSalt` runtime markers `waygraph check`/`graph`/`map`
already trust - a Block that didn't come from a real `define*Block` factory throws
immediately, naming the step and the factory it should have used, instead of silently
entering the chain. Give `homeOrigin` and `.gotoPage()`/`.gotoExternal()` also cross-check
each Nav/Page Block's own static `url` against it (skipped, honestly, for click-based or
mem-dependent nav - not statically checkable). The Checkpoint chain itself is
typechecked one step at a time, with no limit on length - there is no method on this
builder that can skip from one Checkpoint to an unrelated one without a real, kind-correct
Block in between, which is what "no teleporting" means here.

`map()` is not a new execution engine - the result is a real
`Flow`, so every Flow-level feature (Layouts, `withBlockVerify`, demo narration) works on it unchanged, and flows nest
with `.flow(sub, { reset })`. `import { map } from "waygraph"` is also available
standalone (`map(options)` ~= `new Engine(options).map(options)`) for a call site that
doesn't otherwise need its own `Engine` instance. **The one way to define a flow.**

### Traits beyond the page

A hand-written `Trait`'s `check(page, mem)` receives `mem` too, for the same-Checkpoint
case: an action that doesn't navigate at all (clicking "+" to bump a cart item's quantity,
say) has `In === Out`, which `map()` already accepts with no
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

### memStub - fake values for `requires`, opt-in per Flow

Hand-supplying `--data '{...}'` every run gets old fast for a `requires` key that's
genuinely arbitrary (a username, an email, a name) rather than something the run actually
depends on. `registerMemStub(key, fake)` registers a generator for one `MemKey` (bring your
own - Faker.js or anything else; waygraph takes no dependency on it); `engine.map({ memStub: true })`
opts that Flow into filling any `requires` key with no `--data` coverage from that registry
instead of failing preflight. A key with no registration still fails exactly as before -
this narrows the case that needs real input, it doesn't remove the guard:

```typescript
import { registerMemStub } from "waygraph";
import { faker } from "@faker-js/faker";

registerMemStub(LoginCreds.key, () => ({
  username: faker.internet.userName(),
  password: faker.internet.password(),
}));

export const demoLoginFlow = engine.map({ memStub: true }).start() /* … same steps as loginFlow … */.end();
```
```bash
waygraph run demoLoginFlow                 # zero --data - fills from the registry
waygraph run loginFlow --mem-stub          # same effect without a Flow-level wrapper -
                                            # --mem-stub / WAYGRAPH_MEM_STUB=1 force it
                                            # for one CLI call, opt-in or not
```
`--data` always wins for a key it actually covers - memStub only fills what's left over.
Live sessions (`auto`, `pilot`, `traverse`) load every `*.mem-stubs.ts` under `src/` and use those fakes as the
default for a Block's `requires`, so put `registerMemStub` calls in files with that name.
Registered by `MemKey` *identity*, not by name (matching `MemPage`'s own store): two keys
sharing a debug name never cross-contaminate. For a bare library `flow.run(mem)` call
outside the CLI, call `seedMemStub(mem, flow)` yourself before `run()` when
`flow.memStub` is true - `run()` never reads Flow flags itself, same as
`resetSession`/`title`/every other `with*` wrapper.

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
it. See [Recipes](./cli.md#recipes) for the surviving-tab and popup-capture patterns.

### NavBlock / ActionPage / waygraph check

`defineNavBlock({ name, checkpoint, url })` or
`defineNavClickBlock({ name, checkpoint, click })` builds a Block whose only possible
action is navigating. Prefer `defineNavClickBlock` for click-nav in app code;
`defineNavBlock` for `url` / `goto` deep links. Both accept a plain string or
`(mem) => string` / `(mem) => selector`. Generated `act()` is always exactly
`page.goto(url)` or `page.locator(click).click()`. For screen hubs that also register
methods, prefer `definePageBlock` (see [Block helpers](./block-helpers.md#block-helpers-page-method-sel)
below).

**`from` - a Nav that only exists after something else.** By default a Nav is reachable from
anywhere (`from: "*"` in the graph), so route finding (`auto --blocks`, pilot reach, `traverse`)
may jump straight to an in-app page from the login page without signing in. Pass `from` with
the Checkpoints it is valid from and the route goes through the steps that get you there:

```typescript
// src/states/auth.states.ts
export const SIGNED_IN = [Dashboard, CommandCenter, ProductionPlan] as const;

// any in-app nav
export const NavEquipmentNewBlock = defineNavBlock({
  name: "nav-equipment-new",
  checkpoint: EquipmentNew,
  url: "/equipment/new",
  from: SIGNED_IN,
});
```

The graph then has one edge per listed tag instead of `"*"`, so `waygraph auto --blocks LoginPage
EquipmentNew` runs the login Blocks first. Such a Nav is also a real move in `waygraph auto`'s
menu on the pages it names, and never a "Start here" option on an unknown page.

A regular `defineBlock` / `defineMethodBlock`'s `act()` receives `page` typed as
`ActionPage` - `goto`/`reload`/`goBack`/`goForward` are `@deprecated` there (editor
strike-through pointing at Nav/Page helpers). This is a soft, TypeScript-only signal:
nothing is blocked, nothing fails to build. `waygraph check [project]` is the
complementary whole-project sweep for contexts with no editor watching (CI, generated
code, an autonomous agent authoring Blocks) - it warns, never fails the process. It reads each Block file's calls from
the syntax tree, so a `page.goto` in a comment or a string is not a warning. Orphans are Blocks no flow plays, read at
runtime from every flow's `blocks()` (Page hubs and the Blocks a Page lists as `methods` are never orphans).

**`waygraph typecheck [project]`** runs `tsc --noEmit` then the same **bad-practice** scan
(multi-`.fill()` Methods, fill+click in one Method, empty `verify` on a transition Block or `defineAssertBlock`,
regex/XPath selectors, inline selectors next to a `*.sel.ts`, and hand-written UI: a Block, flow or shared stub that
builds or restyles page DOM or reaches into waygraph's overlay instead of using `ctx.ui`).
Practices warn only unless `tsc` fails; use `--no-practices` to skip the scan. Opt out per
file: `// waygraph-ignore-practices` or `// waygraph-ignore: multi-input, combined-action,
empty-verify, hand-written-ui`. Print full agent guidance: `waygraph --skill-convention`.

**Empty verify is the one that matters most for codegen'd Blocks.** A framework can enforce
that a check *exists* and stays structurally honest (typed, wired, right file) - it cannot
author the semantic content of that check, since only someone who knows what "success" means
for this specific app can write it. That's a correct place to draw the line, but it shifts
all the risk onto whether anything catches a Block left with a placeholder `verify: []` by
the time it ships - which would otherwise pass every static check, the orphan scan, and
`tsc`, and run green in CI forever, because an empty array isn't a wrong check, it's the
*absence* of one. `waygraph check`/`typecheck` now flag exactly that: a `defineMethodBlock`/
`defineEffectBlock` whose `In`/`Out` Checkpoints actually differ (a real transition, not a
self-loop like `fill-username`) with no `verify` key or a literal `verify: []`, and the same
for `defineAssertBlock` (whose entire job is checking). Silence it deliberately, the same as
any other practice warning, with `// waygraph-ignore: empty-verify` - e.g. when a downstream
`defineAssertBlock` right after it in the `.flow.ts` is what actually confirms the transition
(see `templates/scaffold`'s own `open-message.method.block.ts`, confirmed by
`AssertEmailContentBlock` right after it, not by its own `verify`).

### Demo narration

Automation rings are gray; authored stubs and `ctx.ui.slides` can use
`tone: "info" | "warning" | "danger" | "success"` (iconified captions), plus
`size: "sm" | "md" | "lg"` and `weight: "normal" | "bold"`. Flow episode defaults:
`map({ highlightStyle: { size, weight, tone? } })` (slot/fixture wins). Episode pacing:
`map({ demoPace: "fast" | "slow" | "normal" | "blitz" | number })` or a step's
`{ pace }` (`number <= 20` = scale vs normal, e.g. `0.5` / `2`; `> 20` =
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
- Network tab **mocking** - the demo overlay's network tab observes real traffic and
  `defineApiBlock` calls today, but can't yet intercept a request and serve a fabricated
  response (`page.route()`/`route.fulfill()`); see `ROADMAP.md`.
