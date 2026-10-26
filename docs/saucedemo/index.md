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
npm install && npx playwright install chromium
npm run demo            # loginFlow then shopFlow, narrated
npm run demo:checkout   # rings, captions, slides
npm run demo:device     # phone, tablet, landscape
npm run auto            # pick each next Block yourself
npm test                # the Playwright suite, headless
```

## Layout

```
examples/saucedemo/
  config/waygraph.config.ts   base URL, the engine
  src/
    states/
      checkout.states.ts      every Checkpoint
      checkout.mem-keys.ts    Mem keys (credentials, item)
      checkout.mem-stubs.ts   default Mem values
      checkout.reads.ts       read namespaces (beta)
    blocks/saucedemo-web/     one folder per screen (its URL)
      nav-login.block.ts      Page: the login screen (/)
      methods/                fill / submit login, logout
      inventory/              the inventory Page, its methods/
      inventory-item/         item detail navigation
      cart/                   to the cart, to checkout
      checkout-step-one/      the info form's methods/
      checkout-step-two/      finish-order
    flows/                    one file per story
    stubs/                    narration several flows share
  tests/                      Playwright specs running the flows
```

Each screen folder has a `NAV.md` describing what can be reached from it, and
[`src/blocks/SITE-MAP.md`](https://github.com/deviate-dv8/waygraph/blob/main/examples/saucedemo/src/blocks/SITE-MAP.md)
lists the whole tree.

## Blocks

| Kind | Helper | In this example |
|---|---|---|
| Page | `definePageBlock` | `nav-login` (deep-links `/`, the login form's methods hang off it); `page-inventory` (arrival-only, after sign-in) |
| Nav | `defineNavClickBlock` / `defineMemNavBlock` | `nav-cart` clicks the cart icon; `nav-item-detail` opens the item named in Mem |
| Method | `defineMethodBlock` | `fill-username`, `submit-login` (branches: `LoggedIn` or back to `LoginPage`), `finish-order` |
| Effect | `defineEffectBlock` | `add-to-cart`: one auto-menu row per live "Add to cart" button |
| Read (beta) | `defineReadBlock` | `read-inventory`, `read-cart`, `read-header`: what the pages show, as JSON for `pilot read` ([Beta: Read Blocks](../reference/beta.md)) |
| API | `defineApiBlock` | `api-demo.flow.ts`: a backend check resolved into a Checkpoint like a UI step |

Blocks carry behaviour only (act, observe, resolve, verify). They have no narration of their own.

## Flows

| Flow | What it shows |
|---|---|
| `loginFlow` | Signs in; credentials come from the Mem stubs unless `--data` sets them |
| `shopFlow` | Add the selected item, check out, place the order (run after `loginFlow`) |
| `checkoutFlow` | The whole checkout with narration on every step |
| `cartBulkFlow` | Add every item, then remove them all |
| `checkoutThenBrowseAgainFlow` | Checkout, then back to the catalogue |
| `deviceShowcaseFlow` | Phone, tablet and landscape, with zoom and the todo dock |
| `viewerBlockedFlow` | `locked_out_user` is refused; needs `.flow(viewerBlockedFlow, { reset: true })` after another flow |
| `stubOnErrorFlow` | A forced failure, with `stubOnError` ringing the error banner |
| `memStubDemoFlow` | `map({ memStub: true })`: credentials are never supplied |
| `apiDemoFlow` | UI and API Blocks in one flow |

## Narration

Narration is written in the flow, chained on the Block where the flow uses it. From `checkout.flow.ts`:

```ts
.method(
  FillUsernameBlock.stubBefore((ctx) => {
    ctx.ring("username", {
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
  ctx.ring("finish", {
    selector: CheckoutOverviewSel.finishBtn,
    label: "Placing the order",
  });
}

export function orderPlacedYap(ctx: StubCtx): void {
  ctx.slides([
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
[Demo narration](../highlights.md).
