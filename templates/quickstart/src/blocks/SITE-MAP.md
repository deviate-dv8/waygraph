# SITE-MAP - Sauce Demo blocks

Namespace `saucedemo-web/` is URL `/` for [saucedemo.com](https://www.saucedemo.com).
Route folders mirror real Swag Labs paths (consumer convention).

```text
src/blocks/
  SITE-MAP.md
  saucedemo-web/                      # URL /
    NAV.md
    nav-login.block.ts                # Page  definePageBlock url:/
    ff-owner-auth.block.ts            # FFCompose (nav-login + fill-username + fill-password + submit-login)
    methods/
      fill-username.method.block.ts   # Method defineMethodBlock (self-loop on LoginPage)
      fill-password.method.block.ts   # Method defineMethodBlock (self-loop on LoginPage)
      submit-login.method.block.ts    # Method defineMethodBlock (click only; branches)
      submit-login-for-flow.ts        # helper (not a discoverable *.block.ts alone)
      submit-logout.method.block.ts   # Method defineMethodBlock
      login.sel.ts                    # LoginSel (not a Block)
    inventory/                        # URL /inventory.html
      inventory.page.block.ts       # Page definePageBlock
      NAV.md
      nav-item-detail.block.ts        # Nav  defineMemNavBlock (instance row)
      methods/
        inventory-items.ts            # DOM helpers for Effects (not a Block)
        add-to-cart.effect.block.ts   # Effect defineEffectBlock
        add-all-to-cart.method.block.ts
        remove-all-from-cart.method.block.ts
        remove-from-cart.effect.block.ts
    inventory-item/                   # URL /inventory-item.html
      NAV.md
      item-detail.sel.ts              # ItemDetailSel (not a Block)
      nav-continue-shopping.block.ts
      nav-back-to-products.block.ts
      nav-back-to-inventory.block.ts
    cart/                             # URL /cart.html
      NAV.md
      cart.sel.ts                     # CartSel (not a Block)
      nav-cart.block.ts               # Nav click header cart
      nav-checkout-info.block.ts
    checkout-step-one/                # URL /checkout-step-one.html
      NAV.md
      methods/
        checkout-info.sel.ts               # CheckoutInfoSel (not a Block)
        fill-first-name.method.block.ts    # Method defineMethodBlock (self-loop on CheckoutInfoPage)
        fill-last-name.method.block.ts     # Method defineMethodBlock (self-loop on CheckoutInfoPage)
        fill-postal-code.method.block.ts   # Method defineMethodBlock (self-loop on CheckoutInfoPage)
        submit-checkout-info.method.block.ts  # Method defineMethodBlock (click only)
    checkout-step-two/                # URL /checkout-step-two.html
      NAV.md
      methods/
        checkout-overview.sel.ts      # CheckoutOverviewSel (not a Block)
        finish-order.method.block.ts
```

Checkpoints and mem keys live under `src/states/`. Flows under `src/flows/`
compose Blocks into episodes for `waygraph demo` / Playwright.
