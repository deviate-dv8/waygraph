# Working on Waygraph UI

A read-only AdonisJS 7 + Inertia + Vue app over one waygraph project (`WAYGRAPH_PROJECT`). Skills for the stack are in
`.claude/skills/` (adonisjs, nuxt-ui, vue-*, vite, vitest).

## Where things are

- `app/services/project_service.ts`: everything the app knows about the project: its manifest (via the project's own
  `waygraph manifest`) and its run logs (`.waygraph/runs/*.jsonl`). It only reads.
- `app/controllers/`: one per page (map, flows, runs); `start/routes.ts`.
- `app/types/project.ts`: the shapes shared with the pages. `type` aliases with JSON values only (Inertia props must be
  JSON), imported as `#types/project` on both sides.
- `inertia/pages/`: map, flows, runs, setup (no project set). `inertia/layouts/workspace.vue`: the canvas with its
  floating islands.
- `inertia/components/graph/`: Vue Flow nodes and edges. `inertia/components/sketch/sketch_box.vue` and
  `inertia/lib/sketch.ts`: the hand-drawn shapes.

## Rules

- The look is hand-drawn on paper: shapes are rough.js (`SketchBox`, `sketchPath`), the canvas font is Kalam
  (`font-hand`), panels are `.island`s. Colours are the variables in `inertia/css/app.css` (`--ink`, `--paper`,
  `--pass`, ...), set for light and dark; the accent is `sketch-*`. rough.js can't take CSS variables, so a shape is
  drawn in marker colours and coloured with `style`.
- Icons are Lucide through Nuxt UI (`i-lucide-*`), bundled at build time.
- Commit locally; never push unless asked.

## Verify

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Look at what you changed in `npm run dev`, light and dark, and stop the server afterwards.
