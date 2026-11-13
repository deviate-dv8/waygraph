# Sauce Demo

A complete waygraph project against [saucedemo.com](https://www.saucedemo.com), the way
waygraph recommends: one page object per screen (`src/map/(shop)/<url>/`, with its read, its Methods and its selectors),
a shell for the menu, accounts, per-row Methods, API Blocks, flows with a title and labels, demo narration. `waygraph try demo` plays a copy of it (`templates/quickstart`, synced with `npm run sync:quickstart`).

```bash
# from the waygraph root, after npm install && npm run build
cd examples/saucedemo && npm install && npx waygraph install
npm test              # the suite, against the live site
npm run demo          # sign in, then shop
npm run auto          # pick Blocks by hand
```

`package.json` has a script per demo. Walkthrough: https://deviate-dv8.github.io/waygraph/saucedemo/
