# Sauce Demo - convention showcase

Full live consumer for [saucedemo.com](https://www.saucedemo.com). This tree is
the **reference** for waygraph consumer conventions:

- Route folders under `src/blocks/saucedemo-web/` = real Swag Labs URLs
- **Nav** / **Effect** / **Action** file kinds (helpers are TypeScript salt;
  runtime is still `Block`)
- `instanceOptions` menus for `waygraph auto` (Add/Remove + Open details)
- Per-route `NAV.md` + root `src/blocks/SITE-MAP.md`
- Inline `{ ff: true }` fast-forward, no `.ffStart()/.ffEnd()` bracket - see
  `checkoutFlow` (`src/flows/checkout.flow.ts`)
- `defineApiBlock` - a real backend/HTTP check as one step in the same Flow as
  a UI step, with its own live network-activity panel during a demo - see
  `apiDemoFlow` (`src/flows/api-demo.flow.ts`)
- `ctx.caption()` (bottom subtitle-bar) + `ctx.titlePos()` (banner
  left/center/right) - also on `checkoutFlow`

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
| Graph crawl (Phase B-E) | `npm run traverse` |
| Parallel crawl + leases | `npm run traverse:parallel` |
| Coverage JSON + min gate (10%) | `npm run traverse:coverage` |
| Shop demo (login, then shop) | `npm run demo` |
| Shop demo autoplay | `npm run demo:auto-next` |
| **Device showcase** (mobile/tablet + portrait/landscape; narration in `src/stubs/device-showcase.ts`) | `npm run demo:device` |
| Device showcase + `.webm` | `npm run demo:video` |
| **Cart bulk** demo (add-all → remove-all) | `npm run demo:bulk` |
| **Owner checkout** (inline `{ ff: true }`, `ctx.caption()`, banner position) | `npm run demo:checkout` |
| **FE + BE in one Flow** (`defineApiBlock`, live network panel) | `npm run demo:api` |
| Record (headless `.webm`) | `npm run record` |
| List flows | `npm run flows` |

Credentials and the selected item come from `registerMemStub` in `src/states/checkout.mem-stubs.ts` (`memStub: true` on the
flows), so no command needs `--data`. Settings, the base URL and the shared `engine` are in `config/waygraph.config.ts`.
Narration is chained on Blocks in the flows (`src/flows/`) or shared from `src/stubs/`; the Block files carry none.

**Demo vs auto vs run for cart bulk**

| | CLI | Needs `.flow.ts`? |
|--|-----|-------------------|
| **`run --blocks`** | `waygraph run --blocks "loginFlow then add-all-to-cart"` | No |
| **`demo --blocks`** | `npm run demo:bulk` — named flow | Optional (`cartBulkFlow`) |
| **`auto`** | `npm run auto` / `auto:cli` | No — live menu |
| **`traverse`** | `npm run traverse` | No — graph crawl + `.waygraph-traverse/coverage.json` |
| **`auto --blocks From To`** | path-find on graph | No — checkpoints only |

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
