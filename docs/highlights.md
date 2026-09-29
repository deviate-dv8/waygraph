# Demo narration: stubs, fixtures, captions & slides

Catch-all highlight lifecycle on every block (`stubBefore` / `stubAfter`);
unlimited demo purposes on the issue `.flow.ts`;
multi-step yap slides with Next between each one.
Shipped in `waygraph@0.11.2`.
**Purple** = authored narration; **yellow** = automation
checks (verify / unmatched fill-click) - watch the purple.

## Mental model

```sh
Every block     → stubBefore + stubAfter   (selectors + neutral labels; {} ok)
Issue .flow.ts  → highlightFixtures        (unlimited demo purposes per phase/slot)
Block or flow   → slides                   (multi-step yap, Next between each - not block lifecycle)
```

Same pattern as Mem: the block declares **slots**; the flow owns the
**story**. Shared blocks stay library-neutral. Ticket AC copy, BUG/GATE
tags, `detail` lines, and any other demo purpose live on the flow.

| Feature | Where | Role |
|---|---|---|
| **Stubs** | Every block `instruction` | `stubBefore` + `stubAfter` - named slots (selector +
neutral label). Catch-all lifecycle shape on every block (`{}` ok). |
| **Fixtures** | Issue `.flow.ts` | **Unlimited demo purposes** - AC copy, BUG/GATE tags,
`detail`, ticket sentences. Override per block / phase / slot. |
| **Captions** | Every stub slot / slide | `label` (or `caption` on slides), optional `detail`
and `tag`. Rendered as: `[TAG] primary - detail`. |
| **Slides** | Block `instruction.slides` or flow fixture `slides` | Multi-step yap sequence. Demo pauses on each slide; user clicks
**Next slide** (or auto-next) to advance. Separate from
block lifecycle - slides run after the step resolves. |

**Not** `modHighlight()` and
**not** a `modBlock*` highlight decorator.
(`modBlockVerify` is verify-only and unrelated.)

## Phases (stubs)

| Phase | When demo runs it | Block (library) | Flow fixture |
|---|---|---|---|
| `stubBefore` | Before / during `act` | Inputs / buttons the block touches | Unlimited purposes before/during interaction |
| `stubAfter` | After resolve + verify | Post-step proof points | Unlimited purposes after the step (AC / GATE / ...) |

## Block (neutral stubs)

```sh
instruction: {
async act(page, _input, mem) { /* ... */ },
resolve: () => checkpoint("LoginLinkSent"),
verify: [Trait.visible("text=Check your inbox")],

stubBefore: {
email:  { selector: "#email",              label: "Email address" },
submit: { selector: 'button[type="submit"]', label: "Send sign-in link" },
},
stubAfter: {
sent: { selector: "text=Check your inbox", label: "Magic link sent" },
},
}
```

## Captions: `label`, `detail`, `tag`

Every stub slot and every slide supports the same caption fields:

| Field | Type | Purpose |
|---|---|---|
| `label` | string (required on stubs) | Primary ring / panel text |
| `detail` | string (optional) | Second line in the panel body |
| `tag` | string (optional) | Badge prefix: `AC`, `BUG`, `GATE`, `YAP`, ... |

Rendered format: `[TAG] primary - detail` (hyphens, not em-dashes).

## Slides: multi-step yap

Slides are a demo-only narration sequence. They run after a block resolves
(not part of the block's pass/fail lifecycle). Each slide pauses and waits for
**Next slide** (or auto-next / auto-advance checkbox). An optional
`selector` shows a ring while that slide is up.

```sh
// On a block:
instruction: {
stubBefore: { finish: { selector: "#finish", label: "Finish" } },
stubAfter:  { thanks: { selector: ".complete-header", label: "Order confirmed" } },
slides: [
{
caption: "Checkout is a short pipeline",
detail:  "Cart -> info -> overview -> done.",
tag:     "YAP",
},
{
caption:  "Finish submits the overview",
detail:   "This click is the only mutating step.",
tag:      "YAP",
selector: "#finish",
},
{
caption:  "Completion banner is the proof",
detail:   "The thank-you header is the durable signal.",
tag:      "YAP",
selector: ".complete-header",
},
],
}
```

Flow fixtures can override `slides` for a specific block
(fixture wins over block): set `slides: [...]` on the block's fixture entry.
Leave it unset to use the block's own slides.

## Flow `.flow.ts` - fixtures + slides

```sh
import { withHighlightFixtures, withTitle } from "waygraph";

export const checkoutFlow = withHighlightFixtures(
withTitle(engine.defineFlow([start, ...chain, end]), "Owner: Full Checkout"),
{
"submit-login": {
stubBefore: {
username: { label: "Demo user",  detail: "standard_user from Mem.", tag: "AC" },
password: { label: "Password",   detail: "Filled from Mem credentials." },
submit:   { label: "Sign in",    tag: "GATE" },
},
},
"add-to-cart": {
stubAfter: {
badge: { label: "Cart now has the item", detail: "Badge updates after add.", tag: "AC" },
},
},
"finish-order": {
stubAfter: {
thanks: { label: "Order placed", detail: "Completion header is the proof.", tag: "GATE" },
},
// slides: [...] here would override the block's own slides
},
},
);
```

Fixtures merge onto stub slots (label / detail / tag; selector optional -
inherited from the block stub). Do not invent selectors the block never declared.

## Reusable fixtures (HighlightFixtureMap)

A `HighlightFixtureMap` is a plain object - define it once, reuse
across multiple flows or export from a shared file:

```sh
// src/fixtures/checkout-ac-fixtures.ts
import type { HighlightFixtureMap } from "waygraph";

export const checkoutAcFixtures: HighlightFixtureMap = {
"submit-login": {
stubBefore: {
username: { label: "AC-1: standard_user", tag: "AC" },
},
},
};

// src/flows/checkout.flow.ts
import { checkoutAcFixtures } from "../fixtures/checkout-ac-fixtures.js";
export const checkoutFlow = withHighlightFixtures(baseFlow, checkoutAcFixtures);
```

## TypeScript exports (waygraph@0.11.2)

| Export | Kind | What it does |
|---|---|---|
| `withHighlightFixtures(flow, map)` | function | Attach a `HighlightFixtureMap` to a Flow |
| `resolveHighlightSlots(block, phase, opts)` | function | Resolve stubBefore / stubAfter slots with fixture merge |
| `resolveSlides(block, opts)` | function | Resolve slides (fixture wins over block) |
| `formatHighlightCaption(h)` | function | Format `[TAG] label - detail` string |
| `hasAuthoredStubAfter(block, out, fixtures)` | function | True when block has non-empty stubAfter (skips verify-trait fallback) |
| `WaygraphHighlightStub` | type | One named stub slot |
| `WaygraphHighlightFixture` | type | Flow fixture patch for a slot |
| `WaygraphSlide` | type | One yap slide (caption, detail, tag, selector) |
| `HighlightFixtureMap` | type | Per-block fixture map for `withHighlightFixtures` |
| `ResolvedHighlight` | type | Resolved stub after merge |

## Replaces (shim until 0.12)

| Old | New |
|---|---|
| `instruction.highlights` | `stubAfter` |
| Fill ring `"writing"` / `"from mem: ..."` | `stubBefore` |
| Verify-trait fallback `visible(#...)` | `stubAfter` with human labels |

Shim: empty `stubAfter` + legacy `highlights`
automatically shimmed to ephemeral `stubAfter` keys `"0"`, `"1"`, ...

## Todo dock UI (demo, 0.15.8+)

`ctx.todos(...)` / `ctx.todoDock(...)` paint a floating
checklist during `waygraph demo` (and Pilot overlay). Smart defaults
keep long FR/AC lists from burying highlight rings:

- **Compact** - fold around the current row; hover or `+N more` expands
- **Collision flip** - dock moves L/R when a ring would overlap it
- **Behind ring** - dim + lower z-index while a ring is up

Opt out for the whole run: `waygraph demo ... --todo-full`
(or `WAYGRAPH_TODO_UI=full`). Per-block:
`ctx.todoDockFull()` / `ctx.todoDockUi({ compact: false, ... })`.
Full flag table: [Demo / run → Todo dock UI](./demo#todo-dock-ui).

## Sauce Demo coverage

The [Sauce Demo](./saucedemo/index) shows all features in a real block/flow:

- **submit-login** - `stubBefore` (fill rings on username/password/submit)
- **add-to-cart** - `stubAfter` (cart badge ring after action)
- **finish-order** - `stubBefore` + `stubAfter` + `slides` (3-slide yap sequence)
- Flow fixtures on `checkoutFlow` - AC/GATE captions, tag badges, detail lines
- **login / cart blocks** - `ctx.todos(...)` so the floating dock (smart UX) shows in `waygraph demo`

## Related

- [Demo / run](./demo) - `--auto-next`, `--fast`, carousel strip, [todo dock UI](./demo#todo-dock-ui)
- [Engine handout](./handout) - core API summary
- [Sauce Demo](./saucedemo/index) - live saucedemo example

