# saucedemo waygraph conventions

Atomic nav/action blocks, same split `zsign-atomic-waygraph` uses - one nav
(or action) per real URL / `page.tsx`-equivalent endpoint so `waygraph auto`
can discover a real state graph (not a fat multi-page Block).

**Multi-route consumers:** folder layout must mirror Next.js `app/` page routes —
see `.sm/seats/_shared/WAYGRAPH-CONSUMER-CONVENTION.md` and
`../zsign-atomic-waygraph/docs/CONVENTION.md` (no invented `root/`, `landing/`, or
`shell/nav/*` families; `/` lives at the namespace root).

## Block kinds

| Kind | File | `page.goto`? |
|------|------|--------------|
| Nav | `nav-*.block.ts` at `src/blocks/` root, built with `defineNavBlock` | Yes (`url` XOR `click`) |
| Action | `*.action.block.ts` in `src/blocks/actions/` | No |

Only an explicit `page.goto()` (or NavBlock `click`) counts as navigation - an
action that fills a form and continues stays an action even when the app
changes URL as a side effect of `#continue`.

## Layout

```text
src/blocks/
  nav-login.block.ts
  nav-cart.block.ts
  nav-checkout-info.block.ts
  nav-item-detail.block.ts
  nav-back-to-inventory.block.ts
  nav-continue-shopping.block.ts
  nav-back-to-products.block.ts
  actions/
    submit-login.action.block.ts
    add-to-cart.effect.block.ts
    submit-checkout-info.action.block.ts
    finish-order.action.block.ts
    submit-logout.action.block.ts
src/states/
src/flows/
```

`waygraph check .` should report zero warnings - every navigation goes through
a `defineNavBlock`, nothing else calls `page.goto`.

`waygraph auto .` should discover Checkpoints as nodes and these Blocks as
edges (including cycles via logout / continue-shopping / back-to-products).

## Friendly demo run (DX)

Prefer flags (or npm scripts) over a pile of `WAYGRAPH_*` env vars:

```bash
npm run demo                 # waygraph demo shopFlow .  (STEP+headed; BASE_URL from package.json / playwright)
npm run demo:autoplay        # --autoplay --title "Shop demo"
waygraph demo shopFlow . --base-url https://www.saucedemo.com --title "Shop"
waygraph chain "loginFlow" . --step --no-autoplay
```

Flags beat env: `--step` / `--no-step`, `--autoplay` / `--no-autoplay`,
`--base-url <url>`, `--title <text>`. Default BASE_URL resolution order for
`demo`: `--base-url` > `WAYGRAPH_BASE_URL` > `package.json` `waygraph.baseUrl`
> `playwright.config` `baseURL`.
