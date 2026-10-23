---
tags:
  - waygraph
  - concept
aliases:
  - Demo
  - Overlay
  - Narration
---

# The demo UI

What `waygraph demo` paints on the real page, around each step. Three parts:

| Part | What it is | Code |
|---|---|---|
| **Stepper** | the panel before each step (what's next, its mem, Next), the result after it, Retry/Stop on failure, the Next gate and auto-advance, the pace | `src/demo/stepper/` (start at `stepper.ts`) |
| **Overlay** | what's drawn on the page: rings around elements, the moving cursor, the title banner, the caption bar, todo docks, the device frame, the network tab | `src/demo/overlay/` |
| **Narration** | what a step *says*: its ctx stubs | `src/demo/narration/` |

## Narration is written as stubs

```ts
AddItemBlock.stubAfter((ctx) => {
  ctx.ring("cart", { selector: CartSel.count, label: "AC · item in cart" });
  ctx.todos("cart", ["Add an item", "Check the cart"], { index: 1 });
});
```

`stubBefore` plays before the step runs, `stubAfter` after it lands, `stubOnError` when it fails. A stub can ring
elements, set the title and caption, show todos, switch to a phone-sized device, zoom, and open the network tab.

## Pace

Each step has a pace: `blitz` (no theater), `fast`, `normal`, `slow`, or a number. It comes from the step's
`{ pace }`, else the flow's `map({ demoPace })`, else the config's `demo.pace`. `--fast` only speeds up steps nobody
gave a pace.

The same overlay serves [[Live Sessions]] (auto and pilot paint the same rings). It survives navigation the same way
everywhere: after any page load - a link, a redirect, a reload - each surface repaints itself (rings, todos, device),
once the redirects settle (`src/demo/overlay/reattach.ts`).
