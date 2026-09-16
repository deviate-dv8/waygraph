# saucedemo waygraph conventions

Atomic Blocks - one nav / effect / action per real URL or on-page mutation so
`waygraph auto` can discover a real state graph (not a fat multi-page Block).

**TypeScript salt only.** `defineNavBlock`, `defineEffectBlock`, and plain
`defineBlock` are helpers that force a useful shape. At runtime everything is
still a `Block` - there is no separate Effect or Nav engine.

**Multi-route consumers:** folder layout must mirror Next.js `app/` page routes -
see package docs `docs/consumer.html` (no invented `root/`, `landing/`, or
`shell/nav/*` families; `/` lives at the namespace root).

## Block kinds (file convention)

| Kind | File | Helper | `page.goto`? |
|------|------|--------|--------------|
| Nav | `nav-*.block.ts` | `defineNavBlock` / `defineMemNavBlock` | Yes (`url` XOR `click`) |
| Effect | `*.effect.block.ts` | `defineEffectBlock` | No - mutates a live instance (add/remove/toggle) via mem + `instanceOptions` |
| Action | `*.method.block.ts` | `defineBlock` | No - forms, submit, logout, etc. |

Only an explicit `page.goto()` (or NavBlock `click`) counts as navigation - an
action/effect that fills a form or clicks a button stays non-nav even when the
app changes URL as a side effect of `#continue`.

## Layout

```text
src/blocks/
  SITE-MAP.md
  saucedemo-web/                 # THIS FOLDER IS URL "/"
    NAV.md
    nav-login.block.ts
    actions/
      submit-login.method.block.ts
      submit-login-for-flow.ts
      submit-logout.method.block.ts
    inventory/                   # /inventory.html
      NAV.md
      nav-item-detail.block.ts
      actions/
        inventory-items.ts
        add-to-cart.effect.block.ts
        remove-from-cart.effect.block.ts
    inventory-item/              # /inventory-item.html
      NAV.md
      nav-continue-shopping.block.ts
      nav-back-to-products.block.ts
      nav-back-to-inventory.block.ts
    cart/                        # /cart.html
      NAV.md
      nav-cart.block.ts
      nav-checkout-info.block.ts
    checkout-step-one/           # /checkout-step-one.html
      NAV.md
      actions/
        submit-checkout-info.method.block.ts
    checkout-step-two/           # /checkout-step-two.html
      NAV.md
      actions/
        finish-order.method.block.ts
src/states/
src/flows/
```

`waygraph check` should report zero warnings - every navigation goes through
a `defineNavBlock`, nothing else calls `page.goto`.

`waygraph auto` should discover Checkpoints as nodes and these Blocks as
edges (including cycles via logout / continue-shopping / back-to-products).

## Friendly demo run (DX)

Prefer flags (or npm scripts) over a pile of `WAYGRAPH_*` env vars:

```bash
npm run demo                 # waygraph demo shopFlow  (STEP+headed; BASE_URL from package.json / playwright)
npm run demo:autoplay        # --autoplay --title "Shop demo"
waygraph demo shopFlow --base-url https://www.saucedemo.com --title "Shop"
waygraph chain "loginFlow" --step --no-autoplay
```

Flags beat env: `--step` / `--no-step`, `--autoplay` / `--no-autoplay`,
`--base-url <url>`, `--title <text>`. Default BASE_URL resolution order for
`demo`: `--base-url` > `WAYGRAPH_BASE_URL` > `package.json` `waygraph.baseUrl`
> `playwright.config` `baseURL`.
