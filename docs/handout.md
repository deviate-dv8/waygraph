# Engine handout

Package API summary for product meshes. Prefer the package README if this page and
the repo diverge. Not v1.0 - minors may break until then.

Mirrored from shared mesh handout · tip tracks package `0.10.9`

## Core model

**Everything is a Block.**
`defineNavBlock`, `defineEffectBlock`, and
`defineBlock` are TypeScript salt - they force a useful authoring
shape. At runtime the engine only sees `Block`.

| Concept | Role |
|---|---|
| `checkpoint("Name")` | A state value (and type) Blocks move between |
| `Block` / `defineBlock` | One act (+ optional observe/verify) + resolve |
| `NavBlock` / `defineNavBlock` | Navigation-only salt (`url` XOR `click`) |
| `EffectBlock` / `defineEffectBlock` | Instance-menu salt (add/remove/toggle via mem + `instanceOptions`) |
| `MemPage` + `keys()` | Typed shared memory across the run |
| `Trait` | verify after resolve; precondition before act |
| `Engine` + `map()` | `engine.map().start()…end()` -> runnable Flow |
| `Flow.run` | `run(mem)` owns browser, or `run(context, mem)` |

## Navigation belongs in defineNavBlock

```sh
import { defineNavBlock, Trait } from "waygraph";

const NavDocuments = defineNavBlock({
name: "nav-documents",
checkpoint: DocumentsList,
click: "nav >> text=Documents",
verify: [Trait.url({ pathname: "/dashboard/documents" })],
});

const NavDeepLink = defineNavBlock({
name: "nav-share",
checkpoint: ShareView,
url: (mem) => `/share/${mem.get(ShareToken)}`,
});
```

Exactly one of `url` | `click`. Inside regular Blocks,
`page` is typed as `ActionPage` - `goto` /
`reload` / history APIs are deprecated (editor strike-through; builds still pass).

## CLI

Primary verbs (0.10+). Full contract: [Demo / run](./demo).
Project path optional.

```sh
npx waygraph list                            # file → export
npx waygraph auto src/flows/shop.flow.ts --data '{…}'  # run by file
npx waygraph auto --cli --data '{…}'     # explore: terminal menu first
npx waygraph auto                        # explore: headed panel (same menus)
npx waygraph auto --blocks LoginPage OrderComplete
npx waygraph demo src/flows/shop.flow.ts             # watch by file
npx waygraph demo --blocks shopFlow --auto-next
npx waygraph demo --blocks shopFlow --auto-play-video   # QA
npx waygraph run  src/flows/shop.flow.ts --data '{…}'
npx waygraph run  --blocks "a then b" --data '{…}'
npx waygraph run  --blocks shopFlow --non-headless --video
npx waygraph try demo | try auto | try auto:cli
npx waygraph check | graph --mermaid | init my-app
```

Unattended JSON: `run` + `WAYGRAPH_JSON=1`.

## Pluggable browsers

```sh
const engine = new Engine({
browsers: { chromium: stealthChromium },
headless: true,
});
```

Same `.launch()` shape as Playwright. Puppeteer is out of scope.

## Multi-episode demos

```ts
// flows nest as steps; reset starts the next user fresh
const showcase = engine
  .map()
  .start()
  .flow(ownerFlow)                              // Episode 1 - Owner
  .flow(viewerFlow, { reset: true })            // Episode 2 - Viewer, locked out
  .end();
await showcase.run(context, mem);
```

## Verify / precondition

```sh
verify: [
Trait.url({ pathname: "/inventory.html" }),
Trait.text("h1", "Products"),
Trait.visible('[data-testid="cart"]'),
]

instruction: {
async act(page) { /* ... */ },
resolve: () => checkpoint("CheckoutForm"),
precondition: [Trait.visible("#checkout-form")],
verify: [Trait.url({ pathname: "/checkout" })],
}
```

## Demo narration

Blocks stay neutral; a flow narrates them where it uses them, with ctx stubs chained on the Block. Each flow can
narrate the same Block differently. Full page: [Demo narration](./highlights).

```ts
// .flow.ts
.method(
  SendMagicLinkBlock.stubBefore((ctx) => {
    ctx.ui.ring("email", { selector: "#email", label: "Email", detail: "Magic link." });
  }).stubAfter((ctx) => {
    ctx.ui.ring("sent", { selector: "text=Check your inbox", label: "Link sent", tag: "GATE" });
  }),
)
```

## Onboarding CLI

| Command | What you get |
|---|---|
| `npx waygraph try demo` | Temp Sauce Demo stepper + headless test |
| `npx waygraph try auto` | Temp Sauce Demo headed explore (credentials from its `*.mem-stubs.ts`) |
| `npx waygraph try auto:cli` | Same explorer, terminal menu |
| `cd examples/saucedemo && npm run auto` | In-repo headed explore |
| `npx waygraph init my-app` | Offline scaffold, built into waygraph CLI |

Full table and post-scaffold steps: [quick start - three ways in](./quickstart#paths).

## Recommendations

1. Pin a published npm version until you intentionally bump.
1. Split nav vs act from day one; migrate old `page.goto` when you touch Blocks.
1. Prefer `click` NavBlocks for in-app chrome; `url` for deep links.
1. Stealth / odd launchers via `EngineConfig.browsers`.
1. Run `waygraph check` in CI on `*.block.ts` trees.
1. Credentials in MemPage `requires` - fail in preflight.
1. Demos: nest flows with `.flow(sub, { reset: true })` - do not hand-roll cookie clears in Blocks.
1. Hand page back with `{ closeOnFinish: false }` when demos must keep the tab.
1. Popups: arm `context.once("page", …)` before the click; drive with `{ page: popup }`.
1. Extend via composition - do not invent a parallel engine.

## Useful APIs

| API | Use when |
|---|---|
| `defineNavBlock` | Navigate only (TS salt) |
| `defineEffectBlock` | Instance mutate + auto menu rows (TS salt) |
| `defineBlock` / `Block` | Act on current page (or any Block by hand) |
| `composeBlock` | Multi-step form as one named unit |
| `branch` / self-loops | Routing with `maxSteps` cap |
| `spawnTab` | Second tab, same context |
| `withVerify` / `flow.withBlockVerify` | Patch confirmation from outside |
| `.flow(sub, { reset })` | Multi-episode showcase (nest flows) |

