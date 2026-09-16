# Sauce Demo example

Full live consumer for [saucedemo.com](https://www.saucedemo.com) - Effect
Add/Remove (`defineEffectBlock` / `*.effect.block.ts`), MemNav Open details,
`waygraph auto`, and Playwright flows. Helpers are TypeScript salt: runtime is
still just Blocks.

This tree is the in-package reference. `waygraph try demo` copies the sibling
template at `templates/quickstart` (same Blocks) into an OS temp dir.

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
| Interactive explore | `npm run auto` |
| Stepper (manual Next) | `npm run demo:step` |
| Stepper (Auto-advance) | `npm run demo:autoplay` |
| List flows | `npm run flows` |

Docs: [Auto explore](../../docs/auto.html) · [Demo / step](../../docs/demo.html)
