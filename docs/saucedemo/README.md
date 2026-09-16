# Sauce Demo - convention showcase

Live consumer against [saucedemo.com](https://www.saucedemo.com). This tree is the
**reference** for waygraph consumer conventions: route folders = real URLs,
Page / Method / Effect / MemNav, TypeScript salt helpers, and `waygraph auto`.

| | |
|--|--|
| **Runnable package** | [`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo) (also `templates/quickstart` for `waygraph try`) |
| **Pages walkthrough** | [index.html](./index.html) (this folder on GitHub Pages) |
| **Engine API** | [../handout.html](../handout.html) |
| **Layout contract** | [../consumer.html](../consumer.html) |

## One rule

**Everything is a `Block` at runtime.** Helpers are TypeScript salt - they force a
useful authoring shape. The engine does not have a separate Effect or Nav runtime.

## Run locally

```bash
# From a waygraph checkout after npm run build:
cd examples/saucedemo
npm install && npx playwright install chromium

npm run auto:cli      # terminal menu - start here (same menus as headed)
npm run auto          # headed panel
npm run demo          # stepper, manual Next
npm run demo:auto-next
npm test              # headless Playwright suite
```

Or one-shot without a permanent folder:

```bash
npx waygraph@latest try auto   # then: cd <temp> && npm run auto:cli
npx waygraph@latest try demo   # stepper + test
```

## Pages in this folder

| Page | What it covers |
|------|----------------|
| [index.html](./index.html) | Overview + why Sauce Demo |
| [kinds.html](./kinds.html) | Block kinds (salt) |
| [layout.html](./layout.html) | Route folders = URLs |
| [auto.html](./auto.html) | `auto` / `auto:cli` menus |
| [SITE-MAP.md](./SITE-MAP.md) | Block tree map |
