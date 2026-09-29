# SITE-MAP - Sauce Demo blocks

Namespace `saucedemo-web/` is URL `/` for [saucedemo.com](https://www.saucedemo.com).
Route folders mirror real Swag Labs paths (consumer convention).

```text
src/blocks/
  SITE-MAP.md
  saucedemo-web/                      # URL /
    NAV.md
    nav-login.block.ts                # Nav  defineNavBlock url:/
    actions/
      submit-login.action.block.ts    # Action defineBlock
      submit-login-for-flow.ts        # helper (not a discoverable *.block.ts alone)
      submit-logout.action.block.ts   # Action
    inventory/                        # URL /inventory.html
      NAV.md
      nav-item-detail.block.ts        # Nav  defineMemNavBlock (instance row)
      actions/
        inventory-items.ts            # DOM helpers for Effects (not a Block)
        add-to-cart.effect.block.ts   # Effect defineEffectBlock
        remove-from-cart.effect.block.ts
    inventory-item/                   # URL /inventory-item.html
      NAV.md
      nav-continue-shopping.block.ts
      nav-back-to-products.block.ts
      nav-back-to-inventory.block.ts
    cart/                             # URL /cart.html
      NAV.md
      nav-cart.block.ts               # Nav click header cart
      nav-checkout-info.block.ts
    checkout-step-one/                # URL /checkout-step-one.html
      NAV.md
      actions/
        submit-checkout-info.action.block.ts
    checkout-step-two/                # URL /checkout-step-two.html
      NAV.md
      actions/
        finish-order.action.block.ts
```

Checkpoints and mem keys live under `src/states/`. Flows under `src/flows/`
compose Blocks into episodes for `waygraph demo` / Playwright.
