# Developing waygraph

## Developing this package

```bash
git clone git@github.com:deviate-dv8/waygraph.git
cd waygraph
npm install
npm run build && npm run examples:link   # the specs scan examples/; this links the build in as their `waygraph`
npm run typecheck   # waygraph typecheck . (tsc --noEmit + practice warnings)
npm run test        # node --test tests/unit + playwright test
npm run test:ui     # playwright test --ui
npm run build       # tsc -p tsconfig.build.json, emits dist/
```

### Blind-agent overlay gate (anti-blank)

Every live modal (`#wg-panel`, `#wg-banner`, `#wg-auto-panel`, `#wg-todo-dock`) stamps
`data-wg-ui` / `data-wg-modal` / `data-wg-ready="1"`. Do **not** claim the stepper works
unless one of these passes:

```bash
# Playwright helper (exported from waygraph)
import { assertWgOverlayReady } from "waygraph";
await assertWgOverlayReady(page); // throws on blank / opacity-0 / missing stamp

# Live demo prove (exit 0 = painted, exit 2 = blank)
WAYGRAPH_PROVE_EXIT=1 WAYGRAPH_PROVE_SHOT=/tmp/wg.png \
  waygraph demo --blocks loginFlow --data '...'
# stderr: WAYGRAPH_PROVE {"ok":true,"beacons":[...],"readyAttr":"1"}
```

Tests: `tests/cli/overlay-beacon.spec.ts`. Helpers: `src/demo/overlay/beacon.ts`. Rules for
touching the stepper/overlay chrome itself: `src/CLI-STOMP-GUARD.md`.

## Layout

```
package.json              the "waygraph" npm package itself
src/                      layers and import rules: src/ARCHITECTURE.md
  engine/                 the engine - start at engine.ts: checkpoint/, block/ (+ kinds/), flow/ (map()), run/ (runGraph), mem/, trait/
  runner/                 `waygraph run/demo` - start at runner.ts: plan/ -> session -> play-steps.ts with a mode (modes/: run, demo, report, branches)
  demo/                   stepper/ (the UI around each demo step), overlay/ (rings, banner, todos, device; ui/ = shadow root + CSS), narration/
  live/                   live browser sessions: auto, pilot, traverse
  manifest/               the one project scanner + `waygraph manifest` + map packages
  analysis/               graph, map check, practices check, validate / check, coverage gap
  runtime/                config, env, browser launch, extensions, webServer, video dir, playwright config, run log
  cli/                    cli.ts (the dispatcher) + commands/ (one file per subcommand)
  index.ts                public API
examples/saucedemo/         live Sauce Demo (Page + methods/ + Sel)
templates/quickstart/       try demo / init template (mirrors sauce)
templates/scaffold/         offline waygraph init scaffold template
templates/agents/           waygraph agent-dive coding-agent definitions
docs/                       GitHub Pages static HTML + docs/proposals/ RFCs
openspec/                   spec-driven planning: specs/ (current), changes/ (in-flight),
                            changes/archive/ (shipped)
tests/                      runtime unit + integration tests (@playwright/test)
tsconfig.json                base config
tsconfig.build.json          emits to dist/
```

In-package Sauce Demo: [`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo). Other consumer
experiments may still live in a sibling workspace folder and depend on this package via
`"waygraph": "file:../waygraph"` during local dev (see that
project's own `.npmrc` - `install-links=true` is required there, or npm will symlink
instead of copy and pull this package's own `node_modules` in through the symlink, causing
a duplicate-Playwright-installation error).
