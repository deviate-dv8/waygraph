# Sauce Demo example

[`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo) is a complete waygraph
project against the public [saucedemo.com](https://www.saucedemo.com) store: sign in, browse, cart, checkout. It is
the project the package's own tests run against, so everything on this page works on the current release.

## Run it

```sh
npx waygraph@latest try demo   # temp copy: the stepper, narrated
npx waygraph@latest try auto   # temp copy: explore Block by Block
```

Or from a checkout of the repo:

```sh
cd examples/saucedemo
npm install && npx waygraph install
npm run demo            # loginFlow then shopFlow, narrated
npm run demo:checkout   # rings, captions, slides
npm run demo:device     # phone, tablet, landscape
npm run auto            # pick each next Block yourself
npm test                # the Playwright suite, headless
```

## Layout

One folder per screen, named for its URL (`waygraph map` checks they match), and in each a page object:

```
examples/saucedemo/
  config/waygraph.config.ts          base URL, the engine
  src/
    map/(shop)/
      _page.block.ts                 the login page (/): its read and its Methods (fill, submit)
      _sel.ts                        its selectors
      _methods/                      one file per Method: fill-username, fill-password, submit
      inventory.html/                the catalogue: _page.block.ts, _sel.ts, _items.ts, _methods/ (add, remove, all, open detail)
      inventory-item.html/           one product: back to products
      cart.html/                     the cart: continue shopping
      checkout-step-one.html/        the info form: fill first name, last name, postal code, submit
      checkout-step-two.html/        the summary: finish the order
      checkout-complete.html/        the confirmation: back home
      menu/                          the burger menu, a shell over every page after sign-in (all items, log out)
    states/checkout.mem-keys.ts      Mem keys (credentials, the selected item), with their stubs
    accounts/accounts.ts             the standard and problem shoppers
    flows/                           one file per story, each with a title, a description and labels
    stubs/                           narration several flows share
  tests/                             Playwright specs running the flows
```

`waygraph graph` prints what can be reached from each screen; `waygraph types` writes the page names
(`src/waygraph-pages.d.ts`) that `to` and `covers` complete from.

## Blocks

| Kind | In this example |
|---|---|
| Page (`definePageBlock`) | one per screen: its `url` (or the `click` that opens it, or the Methods that lead to it), its `verify`, what it shows (`read`) and what you can do there (`do`) |
| Method (`self.method` in `_methods/`) | `fill-username`; `submit-login` (two outcomes: `InventoryPage`, or the login page again with the error banner); `add-to-cart` (one auto-menu row per live Add button, through `instanceOptions`); `open-detail`; `finish-order` |
| Shell (`covers`) | `menu`: the burger menu over every page after sign-in, with its two links |
| Check (`Page.check`) | `Inventory.check("the item in the cart", ({ items }, mem) => ...)` in a Method's `verify` and in a flow's `expect` |
| API (`defineApiBlock`) | `api-demo.flow.ts` (a backend check resolved into a Checkpoint) and `hybrid-seeding.flow.ts` (seed, then verify, around the UI steps) |

A page is its own Checkpoint (`checkpoint: "InventoryPage"`), so there are no Nav Blocks and no states file. Blocks carry
behaviour only; narration is written in the flow, where it is used.

## Flows

| Flow | What it shows |
|---|---|
| `loginFlow` | Signs in; credentials come from the Mem stubs unless `--data` sets them |
| `shopFlow` | Add the selected item, check out, place the order (run after `loginFlow`) |
| `checkoutFlow` | The whole checkout with narration on every step |
| `cartBulkFlow` | Add every item, then remove them all |
| `checkoutThenBrowseAgainFlow` | Checkout, then back to the catalogue |
| `allFeaturesShowcaseFlow` | Every feature in one demo: phone, tablet and landscape, zoom, the todo dock, then split view |
| `viewerBlockedFlow` | `locked_out_user` is refused; needs `.flow(viewerBlockedFlow, { reset: true })` after another flow |
| `stubOnErrorFlow` | A forced failure, with `stubOnError` ringing the error banner |
| `memStubDemoFlow` | `map({ memStub: true })`: credentials are never supplied |
| `apiDemoFlow` | UI and API Blocks in one flow |
| `hybridSeedingFlow` | An API step seeds a note, the shopper adds an item in the browser, an API step checks: each call shows its request and response in the demo |

## Narration

Narration is written in the flow, chained on the Block where the flow uses it. From `checkout.flow.ts`:

```ts
.method(
  FillUsernameBlock.stubBefore((ctx) => {
    ctx.ui.ring("username", {
      selector: LoginSel.username,
      label: "Demo user",
      tag: "AC",
      focus: true,
    });
  }),
)
.method(
  FinishOrderBlock.stubBefore(placingOrder).stubAfter(orderPlacedYap),
)
```

`placingOrder` and `orderPlacedYap` live in `src/stubs/finish-order.ts`, so the three checkout flows share them:

```ts
export function placingOrder(ctx: StubCtx): void {
  ctx.ui.ring("finish", {
    selector: CheckoutOverviewSel.finishBtn,
    label: "Placing the order",
  });
}

export function orderPlacedYap(ctx: StubCtx): void {
  ctx.ui.slides([
    { caption: "Checkout is a short pipeline", tag: "YAP", duration: true },
    {
      caption: "Completion page is the durable proof",
      tone: "success",
      selector: CheckoutOverviewSel.completeHeader,
    },
  ]);
}
```

The full stub API (rings, todos, title, caption, device, zoom, network tab, slides) is on
[Demo narration](../guides/demo.md).
