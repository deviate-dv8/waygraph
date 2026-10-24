# Working on waygraph

waygraph is an opinionated Playwright: Blocks move between Checkpoints, `map()` chains Blocks into a Flow, and the
engine plays it (`waygraph run`, or `waygraph demo` with the overlay around each step).

## Read first

- `src/ARCHITECTURE.md`: where the code starts, one line per folder, the layers, where new code goes.
- `obsidian/Start Here.md`: the same, high level, with pictures.
- `docs/reference/` for behaviour (one topic per page); `docs/env.md` for every `WAYGRAPH_*` variable; `docs/deprecated.md` for what 0.16.0
  removed and what replaces it.

## Rules the tooling enforces (`npm run check:structure`)

Layers; no re-exports outside `src/index.ts`; no HTML strings into the page (`__wgEl` / `__wgSet` / `__wgSvg`);
`WAYGRAPH_*` only through `src/engine/env.ts`; no `.catch(() => {})` (`ignorePageGone` / `ignoreTimeout`); `any` only
shrinks (`scripts/any-debt.json`); files under 500 lines (a ratchet for the few above); no import cycles. `npm run knip` finds unused code.

## Rules by convention

- One way to write each thing: no aliases, no deprecated forms kept alongside new ones.
- A change updates every docs surface with it: `docs/reference/`, `docs/*.md`, the scaffold and quickstart
  templates, `templates/skills/`, `ROADMAP.md`, the generated pages (`npm run docs:api`), and `obsidian/`.
- Commit locally; never push or publish unless asked. Versions are patch bumps.
- Never leave a browser, server or detached session running (`pgrep -af __auto-serve` should be empty).

## Verify

```bash
npm run examples:link   # once per checkout: examples/*/node_modules/waygraph -> this repo (CI does the same)
npx tsc --noEmit && npm run build && npm run check:structure && npm run knip && npm run test:unit
WAYGRAPH_HEADED=0 npx playwright test --grep-invert non-headless
(cd examples/saucedemo && WAYGRAPH_HEADED=0 node ../../bin/waygraph test)
```
