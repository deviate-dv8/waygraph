# Demo narration: ctx stubs, captions & slides

Narration is written in the **flow**, as ctx stubs chained on the Blocks it uses (`stubBefore` / `stubAfter` /
`stubOnError`). Blocks stay neutral and carry no stubs, so one Block can be narrated differently by every flow.
**Purple** = authored narration; **yellow** = automation checks (verify / unmatched fill-click) - watch the purple.

## Mental model

```sh
Block           → what it does (act / resolve / verify), no narration
Flow            → the story: ctx stubs chained on each Block, in the order the flow runs them
                  (rings, todos, captions, and ctx.ui.slides for a multi-step yap)
```

| Feature | Where | Role |
|---|---|---|
| **Stubs** | Chained on a Block inside a flow | `ctx.ui.ring(...)`, `ctx.ui.todos(...)`, `ctx.ui.title(...)` before, after or on error. |
| **Captions** | Every ring / slide | `label` (or `caption` on slides), optional `detail` and `tag`. Rendered as: `[TAG] primary - detail`. |
| **Slides** | `ctx.ui.slides([...])` in a stub | Multi-step yap sequence. Demo pauses on each slide; user clicks **Next slide** (or auto-next). In `stubBefore` they play before the step runs, in `stubAfter` after it lands. |

## Phases

| Phase | When demo runs it |
|---|---|
| `stubBefore` | Before / during `act` - the inputs and buttons the step touches |
| `stubAfter` | After resolve + verify - proof points (AC / GATE / ...) |
| `stubOnError` | When the step throws - what was on screen at the failure |

A stub that throws fails its step in the demo, named (`add-item: its stubAfter stub threw: ...`), so a typo in a stub
shows up on the failure panel instead of the narration quietly missing. A stub returns nothing; it paints through `ctx`.

## Chaining stubs in a flow

Chain a ctx stub on the Block where the flow uses it. No separate fixture map:

```ts
const SubmitLogin = SubmitLoginBlock
  .stubBefore((ctx) => {
    ctx.ui.ring("username", { label: "Demo user", detail: "standard_user from Mem.", tag: "AC" });
    ctx.ui.ring("submit", { label: "Sign in", tag: "GATE" });
  })
  .stubAfter((ctx) => ctx.ui.ring("badge", { label: "Signed in", tag: "AC", duration: true }));

export const checkoutFlow = engine
  .map()
  .start()
  .gotoPage(NavLoginBlock)
  .method(SubmitLogin)
  .end();
```

A Block used twice gets one `const` and is reused. Selectors come from the Block's `*Sel`; do not invent
ones the page does not have.

## Reusable stubs

A stub is just a function of `ctx`, so share one the same way you share any function:

```ts
// src/stubs/checkout-ac.ts
import type { StubCtx } from "waygraph";

export const usernameAc = (ctx: StubCtx<any>) => ctx.ui.ring("username", { label: "AC-1: standard_user", tag: "AC" });

// src/flows/checkout.flow.ts
.method(SubmitLoginBlock.stubBefore(usernameAc))
```

Slides are a stub call like the rest:

```ts
.method(FinishOrderBlock.stubAfter((ctx) => ctx.ui.slides([
  { caption: "Checkout is a short pipeline", tag: "YAP", duration: true },
  { caption: "Completion page is the proof", selector: ".complete-header", tone: "success" },
])))
```

The older `withHighlightFixtures(flow, map)` slot map was removed in 0.16.0, and a Block's own `slides` field in 0.16.2;
chain ctx stubs on the Block as above (`waygraph upgrade --codemod flows` moves old `slides` into `ctx.ui.slides`).

## TypeScript exports

| Export | Kind | What it does |
|---|---|---|
| `resolveHighlightSlots(block, phase, opts)` | function | Resolve a Block's stubBefore / stubAfter / stubOnError slots |
| `formatHighlightCaption(h)` | function | Format `[TAG] label - detail` string |
| `hasAuthoredStubAfter(block, out)` | function | True when block has non-empty stubAfter (skips verify-trait fallback) |
| `WaygraphHighlightStub` | type | One named stub slot |
| `WaygraphSlide` | type | One yap slide for `ctx.ui.slides` (caption, detail, tag, selector) |
| `ResolvedHighlight` | type | A resolved stub slot |

## Todo dock UI (demo, 0.15.8+)

`ctx.ui.todos(id, items, { title, index, style, pos })` paints a floating
checklist during `waygraph demo` (and Pilot overlay). Smart defaults
keep long FR/AC lists from burying highlight rings:

- **Compact** - fold around the current row; hover or `+N more` expands
- **Collision flip** - dock moves L/R when a ring would overlap it
- **Behind ring** - dim + lower z-index while a ring is up

Opt out for the whole run: `waygraph demo ... --todo-full`
(or `WAYGRAPH_TODO_UI=full`). Per-block:
`ctx.ui.todoDockUi({ compact: false, collision: false, behindRing: false })`.
Full flag table: [Demo / run → Todo dock UI](./demo#todo-dock-ui).

## Caption bar (demo, 0.15.49+)

`ctx.ui.caption(text)` shows a bottom-centered narration card (white, rounded, drop
shadow) during `waygraph demo` - distinct from `ctx.ui.title()`/`ctx.ui.titlePos()`
(the top banner card). Call it from `stubBefore`/`stubAfter` like any other
open-lifecycle fixture:

```sh
instruction: {
stubBefore(ctx) {
ctx.ui.caption("Enter the first name on the order");
},
}
```

`ctx.ui.hideCaption()` (or `ctx.ui.caption("")`) fades it out. Leaving `caption`
untouched on a later phase keeps whatever the previous step set - it does not
reset between steps on its own, so clear it explicitly once it no longer
applies (see `examples/saucedemo`'s `checkout.flow.ts`, which calls
`ctx.ui.hideCaption()` on the final checkout-info field).

## Network tab (demo, 0.15.49+)

Real page traffic (`fetch`/`xhr`/navigation requests) and every `defineApiBlock`
call are always captured into a Postman-style panel - method, URL, status,
click-to-expand headers/request/response body, "Copy as cURL" - but the panel
itself is **hidden by default**. Toggle it like any other overlay fixture:

```sh
stubBefore(ctx) {
ctx.ui.showNetworkTab();
},
```

`ctx.ui.hideNetworkTab()` hides the panel again; capture keeps running in the
background either way, so nothing is lost by toggling visibility off. A block
built with `defineApiBlock` also shows a terminal icon on the stepper while it
runs, independent of whether the network tab itself is visible.

Network *mocking* (intercepting a request and serving a fabricated response,
not just observing real traffic) isn't implemented yet - see `ROADMAP.md`.

## Sauce Demo coverage

The [Sauce Demo](./saucedemo/index) shows all features in a real block/flow:

- **submit-login** - `stubBefore` (fill rings on username/password/submit)
- **add-to-cart** - `stubAfter` (cart badge ring after action)
- **finish-order** - a `stubBefore` ring on Finish and `ctx.ui.slides(...)` in its `stubAfter` (3-slide yap sequence), both in `src/stubs/finish-order.ts`
- Stubs chained in `checkoutFlow` - AC/GATE captions, tag badges, detail lines
- **login / cart blocks** - `ctx.ui.todos(...)` so the floating dock (smart UX) shows in `waygraph demo`

## Related

- [Demo / run](./demo) - `--auto-next`, `--fast`, carousel strip, [todo dock UI](./demo#todo-dock-ui)
- [Engine handout](./handout) - core API summary
- [Sauce Demo](./saucedemo/index) - live saucedemo example

