# Working on Waygraph UI

The waygraph repo's `ui/`: an AdonisJS 7 + Inertia + Vue app over one waygraph project (`WAYGRAPH_PROJECT_DIR`). Skills
for the stack are in `.claude/skills/` (adonisjs, nuxt-ui, vue-*, vite, vitest; local, not committed).

## Where things are

- `app/services/project_service.ts`: everything the app knows about the project: its manifest (via the project's own
  `waygraph manifest`) and its run logs (`.waygraph/runs/*.jsonl`). It only reads.
- `app/services/player_service.ts`: plays a flow with the project's own `waygraph run` / `demo`, one at a time, in its
  own process group (Stop kills the browser too; `providers/player_provider.ts` stops it on shutdown). The run is found
  by its log's name (the moment it started). Every page gets it as the shared `play` prop (`inertia/lib/play.ts`) and
  reloads each second while it plays.
- `app/services/playwright_ui_service.ts`: Playwright's UI mode over the project's flows (`waygraph test --flows
  --ui-port=0`), shown in a frame on the Playwright page, over every flow or one (`-g`, from a flow's page); in its own process
  group, stopped on shutdown too.
- `app/controllers/`: one per page (map, flows, runs, playwright, settings) and plays (start, stop); `start/routes.ts`.
  A new route needs `node ace codegen` (the typed route names).
- `inertia/lib/settings.ts`: the Settings page's values, kept in the browser (`useStorage`); plays read them.
- `app/types/project.ts`: the shapes shared with the pages. `type` aliases with JSON values only (Inertia props must be
  JSON), imported as `#types/project` on both sides.
- `inertia/pages/`: map, flows, runs, playwright, settings, setup (no project set). `inertia/layouts/workspace.vue`: the canvas with its
  floating islands.
- `app/services/site_map.ts`: the site map, worked out on the server and passed to the map page: sites, a folder for
  each path segment no page has (`/platform`, `/platform/plant`), each page under the page, folder or site its address
  hangs from. `inertia/lib/project_graph.ts`: the moves between pages (`mapEdges`) and a page's panel (`pageSummary`);
  `inertia/lib/layout.ts` lays the tree out.
- `inertia/components/graph/`: Vue Flow nodes and edges. `inertia/components/sketch/sketch_box.vue` and
  `inertia/lib/sketch.ts`: the hand-drawn shapes.

## How it ships

`waygraph ui` starts the build in `dist/ui` (made by `npm run build` at the repo root, via
`scripts/build-waygraph-ui.mjs`) with the project it found in `WAYGRAPH_PROJECT_DIR`. The built server's packages are
waygraph's own dependencies, so a package the server imports at runtime goes in the root package.json too (same
version), and in the root knip.json's `ignoreDependencies` (waygraph's own code never imports it); browser-side packages are bundled and stay in this one. `bin/server.ts` stops on SIGINT and SIGTERM: Ctrl-C
must also stop a flow it's playing.

## Rules

- The look is hand-drawn on paper: shapes are rough.js (`SketchBox`, `sketchPath`), the canvas font is Kalam
  (`font-hand`), panels are `.island`s. Colours are the variables in `inertia/css/app.css` (`--ink`, `--paper`,
  `--pass`, ...), set for light and dark; the accent is `sketch-*`. rough.js can't take CSS variables, so a shape is
  drawn in marker colours and coloured with `style`.
- Icons are Lucide through Nuxt UI (`i-lucide-*`), bundled at build time.
- The repo's rules for commits and processes apply (`../AGENTS.md`): commit locally, never push unless asked, leave no
  server or browser running.

## Verify

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Look at what you changed in `npm run dev`, light and dark, and stop the server afterwards (`node ace serve` ignores
SIGTERM: check `pgrep -af "ace serve"` is empty). Playing a flow from the UI must leave no browser behind.

Open questions and what's next: `BACKLOG.md`.
