# Consumer layout

Route folders mirror the app's real URLs - not a parallel invented tree.
Reference consumer: **Sauce Demo** (Swag Labs checkout) at
`examples/saucedemo` in this package (also what
`templates/quickstart` / `try demo` copy). The
[engine handout](./handout) covers the package API.
Interactive explore: [Auto explore](./auto).

## The rule

| Sauce Demo URL | Waygraph blocks |
|---|---|
| `/` (login) | `saucedemo-web/` namespace root: `NAV.md` + `nav-login.block.ts` |
| `/inventory.html` | `saucedemo-web/inventory/` - `nav-item-detail`, `add-to-cart`, … |
| `/cart.html` | `saucedemo-web/cart/` - `nav-cart`, `nav-checkout-info`, … |
| `/checkout-step-one.html` | `saucedemo-web/checkout-step-one/` - `submit-checkout-info`, … |
| Path with no page of its own | Grouping only - no `NAV.md`, no nav block |

**Test:** a folder gets `NAV.md` + a nav block if and only if
the app has a real page at that URL.
On Next.js, swap URLs for `app/…/page.tsx` paths - route groups like
`(auth)` vanish; layout chrome goes in `shared/chrome/`, not a second route tree.

## Block kinds

File suffixes are a **convention** for humans and
`waygraph check`. Helpers are TypeScript salt - runtime is always
`Block`.

| Kind | File | Helper | `page.goto`? | Lives |
|---|---|---|---|---|
| Nav | `nav-*.block.ts` | `defineNavBlock` | Yes (`url` XOR `click`) | Route folder root |
| Effect | `*.effect.block.ts` | `defineEffectBlock` | No | Route `actions/` (instance add/remove/toggle) |
| Method | `*.method.block.ts` | `defineBlock` | No | Route `actions/` |
| Chrome | `*.chrome.block.ts` | `defineBlock` | No | Route `actions/chrome/` or `shared/chrome/` |

Every route folder with nav or actions must have `NAV.md`.
Namespace the app under `saucedemo-web/` (or `<product>-web/`).
Non-app hosts (MailHog, probes) go in `<product>-external/` if you add them.

## Example layout (Sauce Demo)

```sh
src/blocks/
SITE-MAP.md
saucedemo-web/                 # Swag Labs - THIS FOLDER IS "/"
NAV.md
nav-login.block.ts           # url: /
actions/
submit-login.action.block.ts
inventory/                   # /inventory.html
NAV.md
nav-item-detail.block.ts   # click -> /inventory-item.html
nav-back-to-inventory.block.ts
actions/
add-to-cart.effect.block.ts
remove-from-cart.effect.block.ts
inventory-item/              # /inventory-item.html
NAV.md
nav-continue-shopping.block.ts
cart/                        # /cart.html
NAV.md
nav-cart.block.ts          # click: .shopping_cart_link
nav-checkout-info.block.ts
checkout-step-one/           # /checkout-step-one.html
NAV.md
actions/
submit-checkout-info.action.block.ts
checkout-step-two/           # /checkout-step-two.html
actions/
finish-order.action.block.ts
```

Block names match the live `examples/saucedemo` project; folders show
how to group them by URL. Nav uses `url` or `click` (see
`nav-cart` - header link, not a separate `goto` in actions).

## Conventions

- **Namespace root is `/`.**
Login lives at `saucedemo-web/` with `nav-login` - not
`saucedemo-web/root/` or `saucedemo-web/landing/`.
- **One nav per route.**
Header links (`nav-cart`, `nav-checkout-info`) are nav blocks on
the route that owns that URL - not a parallel `shell/nav/…` tree.
- **Actions never navigate.**
`submit-login`, `add-to-cart` (effect), and friends stay in
`actions/`; only `defineNavBlock` blocks call
`page.goto` or encoded clicks. Effect vs action is file + helper
convention only - both are Blocks.

## Same checkpoint + mem

Checkpoint is a phantom tag only - no payload. Same URL after an action ⇒ same
Checkpoint; richer mem. `act` / `observe` may
`mem.set` / `mem.update`; `resolve` is pure;
verify Traits cannot read mem. Self-loop via `branch` +
`maxSteps`; document in that route's `NAV.md` States / mem-keys.

One-liner: Waygraph maps Sauce Demo (and any app) the way URLs map in the browser - one
nav (+ actions) per page, `/` at the namespace root, mem can change without
changing the Checkpoint.

