# saucedemo waygraph conventions

**How this maps to the app:** navigate to the site -> you land on a `Page` Block
(the screen hub) -> every Method/Effect/Nav that screen can do hangs off that
Page. Each Block does exactly **one** distinct action - never two or more
bundled together. Filling a form field and submitting it are two different
actions, so they are two different Blocks, even on the same screen:
`fill-username` / `fill-password` (self-loop Methods, no checkpoint change) and
`submit-login` (the real transition) are three real Blocks, not one Method
that "inputs username and password and logs in at the same time." The same
split applies to `fill-first-name` / `fill-last-name` / `fill-postal-code` /
`submit-checkout-info` on the shipping form.

This is what makes `waygraph auto`/`traverse` see a clean, honest graph of the
app: every real user-visible action is its own edge, and no Block silently
"teleports" the user past several actions at once. It is also why a
`page.goto()` (or NavBlock `click`) never appears anywhere except inside a
`defineNavBlock`/`defineNavClickBlock` - see `waygraph check` below.

**TypeScript salt only.** Helpers force a useful shape. At runtime everything is
still a `Block` - there is no separate Page / Effect / Nav engine.

**Multi-route consumers:** folder layout must mirror Next.js `app/` page routes -
see package docs `docs/consumer.html` (no invented `root/`, `landing/`, or
`shell/nav/*` families; `/` lives at the namespace root).

## Block kinds (file convention)

| Kind | File | Helper | `page.goto`? |
|------|------|--------|--------------|
| Page | `*.page.block.ts` | `definePageBlock` | Optional deep-link; usually arrival-only hub |
| Nav | `nav-*.block.ts` | `defineNavBlock` / `defineMemNavBlock` | Yes (`url` XOR `click`) |
| Effect | `*.effect.block.ts` in `methods/` | `defineEffectBlock` | No - mutates a live instance via mem + `instanceOptions` |
| Method | `*.method.block.ts` in `methods/` | `defineMethodBlock` | No - forms, submit, logout, predefined queues |

Only an explicit `page.goto()` (or NavBlock `click`) counts as navigation - a
method/effect that fills a form or clicks a button stays non-nav even when the
app changes URL as a side effect of `#continue`.

**Selectors:** put DOM strings in `*Sel` next to the page (static + `(id) => …`).
Mem keys store values, not selectors.

## Layout

```text
src/blocks/
  SITE-MAP.md
  saucedemo-web/                 # THIS FOLDER IS URL "/"
    NAV.md
    nav-login.block.ts             # Page hub
    ff-owner-auth.block.ts         # FFCompose wrapping the 4 Blocks below
    methods/
      fill-username.method.block.ts   # self-loop, fills only
      fill-password.method.block.ts   # self-loop, fills only
      submit-login.method.block.ts    # click only, branches
      submit-login-for-flow.ts
      submit-logout.method.block.ts
    inventory/                   # /inventory.html
      NAV.md
      inventory.page.block.ts     # Page hub + methods registry
      nav-item-detail.block.ts
      methods/
        inventory-items.ts       # InventorySel + collectors
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
      methods/
        fill-first-name.method.block.ts    # self-loop, fills only
        fill-last-name.method.block.ts     # self-loop, fills only
        fill-postal-code.method.block.ts   # self-loop, fills only
        submit-checkout-info.method.block.ts  # click only
    checkout-step-two/           # /checkout-step-two.html
      NAV.md
      methods/
        finish-order.method.block.ts
src/states/
src/flows/
```

`waygraph check` should report zero warnings - every navigation goes through
a `defineNavBlock` / Page deep-link, nothing else calls `page.goto`.

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
