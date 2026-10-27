# Block helpers

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
| `defineApiBlock` | Backend/API check via `page.request`, not a page action | `methods/*.api.block.ts` |

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
hand-written `act`/`resolve` to accidentally make do two things. Narration (rings, todos,
`ctx.ui.slides`) is chained where a flow uses it, as on every other Block. `requires` (declare it whenever a mem-aware Trait reads a mem key the caller
must supply externally - see the mail example below) lets preflight catch a missing input
before the flow ever runs, the same as every other Block helper:

```typescript
export const AssertInventoryHeaderBlock = defineAssertBlock({
  name: "assert-inventory-header",
  checkpoint: LoggedIn,
  waitForHeading: "Products",
  verify: [Trait.visible(InventorySel.list)],
});
```

`waygraph check` warns when a `verify` array inlines a literal selector string
(`Trait.visible("#some-id")`) instead of referencing a `*Sel` object - the exact pattern
`defineAssertBlock` exists to make easy to avoid.

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

export const AssertItemAddedBlock = defineAssertBlock({
  name: "assert-item-added",
  checkpoint: ItemInCart,
  verify: [removeButtonVisibleForSelectedItem, Trait.text(CartCountSel, "1")],
});

// wired right after the action it checks:
engine.map().start().gotoPage(NavHomeBlock).method(AddItemBlock).assert(AssertItemAddedBlock).method(ClearCartBlock).end()
```

Live reference: `templates/scaffold/src/map/(app_base)/home/_methods/assert-item-added.method.block.ts`,
wired into `shop.flow.ts`.

**An assert Block also names a feature *state*, not just a result or static content.** A
submit button greyed out until required fields are filled, a "Save" button re-enabling
after a successful edit, a field-level validation error appearing under one specific input
- these are conditions the UI is *in*, worth a nameable Checkpoint of their own the same way
`AssertItemAddedBlock` names "did add-item work." `Trait.disabled` / `Trait.enabled` cover a disabled control; for any
other state condition (a class, an `aria-disabled` attribute - whatever the app actually uses), write a custom Trait
against the real DOM condition, returning `{ ok, saw }` so a failure says what it found, the same pattern as
`removeButtonVisibleForSelectedItem` above:

```typescript
const submitGatedUntilFieldsComplete: Trait = {
  name: "submit-gated-until-fields-complete",
  async check(page) {
    return page.locator(CheckoutSel.submitButton).isDisabled();
  },
};

export const AssertSubmitGatedBlock = defineAssertBlock({
  name: "assert-submit-gated",
  checkpoint: CheckoutInfoPage,
  verify: [submitGatedUntilFieldsComplete],
});

// wired right after the fields that gate it, before the ones that clear the gate:
engine.map().start().gotoPage(NavCheckoutInfoBlock).assert(AssertSubmitGatedBlock).method(FillFirstNameBlock) /* … */
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
  checkpoint: LoggedIn,
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

**`defineApiBlock` - a backend check inside the same Flow.** Not a page action: `act`
makes a real HTTP request through Playwright's own `page.request` (an `APIRequestContext`
sharing the browser context's cookies/origin, so an already-logged-in session carries
over automatically). Lets one Flow narrate a UI step and a backend check as the same
state machine, checked by the same `verify`/Trait system every other Block uses:

```typescript
import { defineApiBlock } from "waygraph";
import { LoggedIn, OrderConfirmed, OrderFailed } from "../states/app.js";

export const CheckOrderCreatedBlock = defineApiBlock({
  name: "check-order-created",
  from: LoggedIn,
  to: [OrderConfirmed, OrderFailed],
  call: ({ request }) => request.get("/api/orders/latest"),
  method: "GET", // cosmetic only - shown in the demo overlay's network tab, not read back from the response
  resolve: (r) => (r.ok ? OrderConfirmed : OrderFailed),
  verify: [Trait.disabled],
});
```

`resolve` receives `{ status, ok, body }` (`body` is the parsed JSON, or raw text when it
doesn't parse as JSON); leave it out when `to` is one Checkpoint. Put it in a flow with `map().method(CheckOrderCreatedBlock)`. Every call - real page traffic too - feeds the same demo-overlay
network tab (hidden by default, `ctx.ui.showNetworkTab()`/`hideNetworkTab()` to toggle); see
[Demo narration → Network tab](../highlights.md#network-tab-demo-0-15-49).

Live reference: `examples/saucedemo/src/flows/api-demo.flow.ts` (a login chained into a
health-check API call against a public test API, since saucedemo.com has no real backend).
