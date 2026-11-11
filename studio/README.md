# Waygraph Studio

A read-only view of a waygraph project, drawn by hand on paper:

- **Map**: every page (Checkpoint) as a box, every move between pages as an arrow labelled with the Blocks that make it.
  Click a page for its ways in, what you can do there, what's expected there, where it leads and what its Read Block shows.
- **Flows**: every flow as a pipeline of steps, each with its expectations, and its recent runs.
- **Runs**: every run from the project's `.waygraph/runs/` logs; a run's steps coloured by result, with what the flow
  expects after each, the failed one open with what its check wanted and saw.
- **Play**: a flow's **Run** (headless) or **Demo** (a browser with the step panel), optionally verify only (no
  expectations); a run's **Play again** with the mem it was seeded with. The run's page follows it step by step;
  **Stop** ends it and the browser it opened. One play at a time.

It never changes the project's files: it reads `waygraph manifest` (through the project's own install, so the versions
match) and the run logs, and plays flows with the project's own `waygraph run` / `waygraph demo`.

## Run it

Users run it with `waygraph studio` (the package ships it built, in `dist/studio`): see the docs' Waygraph Studio guide.

To work on it: Node 24 or newer. From the repo root, once: `npm run examples:link` (the saucedemo example uses this
checkout's waygraph). Then in `ui/`:

```bash
npm install
cp .env.example .env        # WAYGRAPH_PROJECT_DIR: ../examples/saucedemo, or any waygraph project's folder
node ace generate:key
npm run dev                 # http://localhost:9294
```

`npm run build` at the repo root builds it into `dist/studio` (`scripts/build-waygraph-studio.mjs`); `waygraph studio` starts that
build on the project it finds. Its runtime packages are waygraph's own dependencies: a package the built server imports
goes in both package.json files.

## Stack

AdonisJS 7 with Inertia and Vue, Nuxt UI 4 (Tailwind 4), Vue Flow for the canvases, rough.js for the hand-drawn shapes.
