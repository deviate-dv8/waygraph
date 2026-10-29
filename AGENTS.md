# Working on waygraph

waygraph is an opinionated Playwright: Blocks move between Checkpoints, `map()` chains Blocks into a Flow, and the
engine plays it (`waygraph run`, or `waygraph demo` with the overlay around each step).

## Read first

- `src/ARCHITECTURE.md`: where the code starts, one line per folder, the layers, where new code goes.
- `docs/guides/` for how each feature works (one topic per page), `docs/reference/` for every command and setting; `docs/env.md` for every `WAYGRAPH_*` variable; `docs/deprecated.md` for what 0.16.0
  removed and what replaces it.

## Rules the tooling enforces (`npm run check:structure`)

Layers; no re-exports outside `src/index.ts`; no HTML strings into the page (`__wgEl` / `__wgSet` / `__wgSvg`);
`WAYGRAPH_*` only through `src/engine/env.ts`; overlay colours are tokens (`src/demo/overlay/ui/css/theme.css`), icons
are `__wgIcon`, never glyphs; no `.catch(() => {})` (`ignorePageGone` / `ignoreTimeout`); no `any`, and no
`x!` in `src/engine/`; files under 500 lines; no import cycles. `npm run knip` finds unused code.

## Rules by convention

- One way to write each thing: no aliases, no deprecated forms kept alongside new ones.
- A change updates the docs with it: the site (`docs/`: guides, reference, and the generated pages via
  `npm run docs:api`), the agent skills (`templates/skills/`), and `ROADMAP.md` (what's next). Templates and examples
  are code, not docs: their READMEs only link to the site.
- Commit locally; never push or publish unless asked. Versions are patch bumps.
- Never leave a browser, server or detached session running (`pgrep -af __auto-serve` should be empty).
- The CLI loads no `@playwright/test` before a project's config: `src/cli/cli.ts` imports each command when it runs,
  and engine code doesn't import Playwright values it can test by name. Otherwise a project with its own install
  (`waygraph try demo`) fails with "Requiring @playwright/test second time".
- Module state another copy of waygraph must see (the Locator patch's theaters, mem stubs) lives on `globalThis` under a
  `Symbol.for("waygraph.…")` key: src and dist, or two installs, can load in one process.

## Verify

```bash
npm run examples:link   # once per checkout: examples/*/node_modules/waygraph -> this repo (CI does the same)
npx tsc --noEmit && npm run build && npm run check:structure && npm run knip && npm run test:unit
WAYGRAPH_HEADED=0 npx playwright test --grep-invert non-headless
npm run storybook:build   # overlay changes: also look at the piece in `npm run storybook`, light and dark
(cd examples/saucedemo && WAYGRAPH_HEADED=0 node ../../bin/waygraph test)
```
