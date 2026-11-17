# Working on waygraph

waygraph is an opinionated Playwright, testing first: Blocks move between Checkpoints, `map()` chains Blocks into a
Flow, and the engine plays it (`waygraph run`, or `waygraph demo` with the overlay around each step). Every change is
held to `docs/doctrine.md`: does it make flows read more like the scenario, and Blocks more reusable?

## Read first

- `src/ARCHITECTURE.md`: where the code starts, one line per folder, the layers, where new code goes.
- `docs/guides/` for how each feature works (one topic per page), `docs/reference/` for every command and setting; `docs/env.md` for every `WAYGRAPH_*` variable; `docs/deprecated.md` for what 0.16.0
  removed and what replaces it.
- `studio/` is Waygraph Studio (`waygraph studio`), an AdonisJS app over a project's manifest and run logs: `studio/AGENTS.md`. It has
  its own package.json and checks (knip and check:structure skip it); `npm run build` builds it into `dist/studio`, which
  ships, and its runtime packages are waygraph's dependencies. Install it once per checkout: `npm ci --prefix studio`.

## Development cycle: a feature, start to finish

Add the feature where the folder it belongs to already is, and touch only the files its row names (`src/ARCHITECTURE.md`,
"Where to put new code" and "What a feature touches"). A feature request is never a reason to move files, rename things or
reshape a layer: if the code you need isn't where the table says, say so before moving it. Never mix a move with an edit.

1. **Place it.** Find the row for what you add (a Block kind, a flow setting, a CLI command, an error, a `WAYGRAPH_*`
   variable, a Studio page). It lists the files; add to them, in the style around them. Read `docs/doctrine.md`'s question:
   does it make flows read more like the scenario, and Blocks more reusable?
2. **Build it** with the types doing the work (no `any`, no `x!` in `src/engine/`), one way to write it, no alias beside an old
   form (breaking is fine until 1.0.0; a removed form gets a row in `docs/deprecated.md`'s source and a codemod when one is
   cheap).
3. **Expose it.** A runtime export goes in `src/index.ts` and the snapshot, regenerated on purpose:
   `node --import tsx/esm -e 'import * as a from "./src/index.ts"; import {writeFileSync} from "node:fs"; writeFileSync("tests/unit/api-surface.snapshot.json", JSON.stringify(Object.keys(a).sort(), null, 2)+"\n")'`.
   Something a viewer needs goes in the manifest (`src/manifest/manifest.ts`) and `studio/app/types/project.ts`; something
   that happened goes in the run log (`src/engine/run/events.ts`).
4. **Test it** where its row says: a unit test in `tests/unit/` (node:test) for pure logic, a spec in `tests/<area>/` for
   anything that runs a flow or opens a page. A new Block kind, flow setting or run event gets a spec that shows the order
   it runs in. Studio changes get `node ace test` and a look in light and dark.
5. **Document it, in the same change** (never "later"):
   - the guide that teaches it (`docs/guides/<topic>.md`: one topic per page) and the reference that lists it
     (`docs/reference/`: cli, config, map, run-log, pilot; `docs/env.md` is generated from `src/engine/env.ts`);
   - a new page is added to the sidebar in `docs/.vitepress/config.mts`; generated pages come from `npm run docs:api`
     (API, deprecated, env), never by hand;
   - the agent skills in `templates/skills/` (`waygraph-convention.skill.md` for how to write it, the pilot skills for
     live sessions) and the scaffold/quickstart: `examples/saucedemo` is the showcase, `npm run sync:quickstart` copies it
     to `templates/quickstart`, and `templates/scaffold` stays pure waygraph;
   - `ROADMAP.md`: move it out of Next, or say what's left;
   - Studio's guide (`docs/guides/studio.md`) and screenshots (`npm run docs:studio-shots`) when Studio changed.
6. **Update the example project, `examples/saucedemo/`.** It is the reference for how a project is written with waygraph, so
   every feature a user can write or run shows up in it, once, the best-practice way, in the folder the convention says
   (`src/map/(main)/(app_base|api|given)/…` for Blocks, `src/flows/<area>/` for flows, `src/accounts/`, `src/states/`,
   `config/waygraph.config.ts`). A changed or removed form is changed in saucedemo too: nothing in it uses a
   deprecated form, a stale state or a Block no flow uses (`waygraph check` and `waygraph map` are clean there). Then:
   `npm run sync:quickstart` (its copy in `templates/quickstart`), the walkthrough `docs/saucedemo/index.md` (its layout and
   flows), the graph snapshot (`WAYGRAPH_UPDATE_SNAPSHOT=1`), and a real run of the flow that shows the feature.
7. **Verify** (the commands below), then commit locally. A feature is one commit (a version bump its own, patch only).
   The docs site deploys itself from `main` (`.github/workflows/pages.yml` runs when `docs/**` changes), so a docs
   change is live once it is pushed: check it first with `npm run docs:build` (a broken link or a bad page fails it).
8. **Leave nothing running:** no browser, server or Studio (`pgrep -af "chrome-headless|__auto-serve|waygraph studio"`
   empty), and browsers only ever run as `env -u WAYLAND_DISPLAY xvfb-run -a …` (the Playwright config does it for the suite).

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
- Commit locally; never push or publish unless asked. Versions are patch bumps. A release is `npm run release` (once the
  version's commits are pushed): it publishes to npm, tags the commit `vX.Y.Z` and creates its GitHub Release.
- Never leave a browser, server or detached session running (`pgrep -af __auto-serve` should be empty).
- The CLI loads no `@playwright/test` before a project's config: `src/cli/cli.ts` imports each command when it runs,
  and engine code doesn't import Playwright values it can test by name. Otherwise a project with its own install
  (`waygraph try demo`) fails with "Requiring @playwright/test second time".
- Module state another copy of waygraph must see (the Locator patch's theaters, mem stubs) lives on `globalThis` under a
  `Symbol.for("waygraph.…")` key: src and dist, or two installs, can load in one process.

## Verify

```bash
npm run examples:link   # once per checkout: examples/*/node_modules/waygraph -> this repo (CI does the same)
npm ci --prefix studio      # once per checkout: the build builds Waygraph Studio
npm run studio              # this checkout's Waygraph Studio on examples/saucedemo (npm run studio:dev: the UI's hot-reload server)
npx tsc --noEmit && npm run build && npm run check:structure && npm run knip && npm run test:unit
npx playwright test --grep-invert non-headless   # runs on a hidden xvfb display by itself (the config re-runs it there); WAYGRAPH_HEADED=0 unless you set it
npm run test:offscreen   # the whole suite with WAYGRAPH_HEADED=1: headed tests included, still on the hidden display
npm run storybook:build   # overlay changes: also look at the piece in `npm run storybook`, light and dark
npm run docs:studio-shots     # Waygraph Studio changes: the UI guide's screenshots, from examples/saucedemo
(cd examples/saucedemo && WAYGRAPH_HEADED=0 node ../../bin/waygraph test)
(cd studio && npm run typecheck && npm run lint && node ace test)   # UI changes; studio/AGENTS.md
```
