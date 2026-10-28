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
  ctx.ui.ring("cart", { selector: CartSel.count, label: "AC · item in cart" });
  ctx.ui.todos("cart", ["Add an item", "Check the cart"], { index: 1 });
});
```

`stubBefore` plays before the step runs, `stubAfter` after it lands, `stubOnError` when it fails. A stub can ring
elements, set the title and caption, show todos, switch to a phone-sized device, zoom, and open the network tab.
A stub is always that chained function; a stub that throws fails its step, with the Block's name, instead of the
narration quietly going missing. Every `ctx` method is in `src/engine/stub/stub.ts`.

## Pace

A fast-forward unit narrates the steps inside it at once: their stubs' todos, title and caption are painted when it
plays (no rings).

Each step has a pace: `blitz` (no theater), `fast`, `normal`, `slow`, or a number. It comes from the step's
`{ pace }`, else the flow's `map({ demoPace })`, else the config's `demo.pace`. `--fast` only speeds up steps nobody
gave a pace.

The same overlay serves [[Live Sessions]] (auto and pilot paint the same rings). It survives navigation the same way
everywhere: after any page load - a link, a redirect, a reload - each surface repaints itself (rings, todos, device),
once the redirects settle (`src/demo/overlay/reattach.ts`).

**Don't hand-write UI.** Everything the demo shows comes from `ctx.ui` in a flow's stubs. A project that builds its own
banner or caption in the page, or restyles waygraph's overlay (`#wg-*`, `window.__wg*`), changes the page it is testing
and breaks when the overlay changes. `waygraph check` warns on it (`hand-written UI`).

**The look.** The overlay looks like macOS: frosted panels the page shows through, the system font, blue for what the
flow narrates, gray for what Playwright does on its own, real icons. It follows the computer's light or dark setting;
a project can pin one (`demo: { appearance: "dark" }`). Every piece can be seen on its own, in both, with
`npm run storybook` in the waygraph repo.

**One layout.** Everything the demo draws sits in one layer over the page. What follows the page - the ring, its
caption, the cursor - is drawn where the target is. Everything else has a fixed place: the title top-left (or centre,
or right), todo checklists down the sides, the device chip top-right, and at the bottom centre, stacked top to bottom,
what is being typed, the narration caption and the step panel; the network tab bottom-left, zoom bottom-right. Pieces
that share a place stack instead of overlapping, and nothing spills off the screen.

