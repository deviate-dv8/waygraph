# Sauce Demo - convention showcase

Full live consumer for [saucedemo.com](https://www.saucedemo.com). This tree is
the **reference** for waygraph consumer conventions:

- Route folders under `src/blocks/saucedemo-web/` = real Swag Labs URLs
- **Nav** / **Effect** / **Action** file kinds (helpers are TypeScript salt;
  runtime is still `Block`)
- `instanceOptions` menus for `waygraph auto` (Add/Remove + Open details)
- Detailed Kind / Helper / Route comments on every Block file
- Per-route `NAV.md` + root `src/blocks/SITE-MAP.md`

**GitHub Pages walkthrough:**
[docs/saucedemo](https://deviate-dv8.github.io/waygraph/saucedemo/)
(`docs/saucedemo/` in this repo - README, SITE-MAP, kinds, layout, auto, comments).

`waygraph try demo` copies the sibling template at `templates/quickstart`
(same Blocks) into an OS temp dir.

## Setup

From the waygraph package root (after `npm run build`):

```bash
cd examples/saucedemo
npm install
npx playwright install chromium
```

## Commands

| Want | Command |
|------|---------|
| Headless suite | `npm test` |
| Interactive explore (headed panel) | `npm run auto` |
| Interactive explore (terminal menu) | `npm run auto:cli` |
| Shop demo stepper | `npm run demo:step` |
| Shop demo autoplay | `npm run demo:autoplay` |
| **Cart bulk** demo (named flow) | `npm run demo:bulk` |
| Cart bulk stepper | `npm run demo:bulk:step` |
| **Cart bulk** chain (Block names only) | `npm run chain:bulk` |
| List flows | `npm run flows` |

**Demo vs auto vs chain for cart bulk**

| | CLI | Needs `.flow.ts`? |
|--|-----|-------------------|
| **`chain` (block names)** | `npm run chain:bulk` → `loginFlow({…}) then add-all-to-cart then remove-all-from-cart` | No — Block `.name` only |
| **`demo` (named flow)** | `npm run demo:bulk` → `cartBulkFlow` | Yes — `cart-bulk.flow.ts` |
| **`auto` (pick live)** | `npm run auto` / `auto:cli` | No — menu from graph |

Same Blocks either way. `chain` is the ad-hoc path (handout-style `"A then B then C"`).

## Layout (short)

```text
src/blocks/
  SITE-MAP.md
  saucedemo-web/                 # URL /
    NAV.md
    nav-login.block.ts
    methods/                     # submit-login, logout, …
    inventory/                   # URL /inventory.html
      nav-item-detail.block.ts   # MemNav
      methods/*.effect.block.ts  # Add / Remove
    cart/                        # URL /cart.html
    checkout-step-one/
    checkout-step-two/
```

Docs: [Sauce Demo showcase](../../docs/saucedemo/) ·
[Auto explore](../../docs/auto.html) · [Consumer layout](../../docs/consumer.html)
