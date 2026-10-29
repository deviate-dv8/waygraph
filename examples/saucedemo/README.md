# Sauce Demo

A complete waygraph project against [saucedemo.com](https://www.saucedemo.com), in the freeform layout
(`src/blocks/saucedemo-web/<page>/`): accounts, Read Blocks, per-row Effects, fast-forward steps, an API Block, demo
narration. `waygraph try demo` plays a copy of it (`templates/quickstart`, synced with `npm run sync:quickstart`).

```bash
# from the waygraph root, after npm install && npm run build
cd examples/saucedemo && npm install && npx playwright install chromium
npm test              # the suite, against the live site
npm run demo          # sign in, then shop
npm run auto          # pick Blocks by hand
```

`package.json` has a script per demo. Walkthrough: https://deviate-dv8.github.io/waygraph/saucedemo/
