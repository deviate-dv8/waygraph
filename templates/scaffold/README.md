# __PROJECT_NAME__

A waygraph project on the **Waygraph Map** layout: `src/map/` folders mirror your app's URLs.
Runs fully offline - the demo pages open directly via `file://`, no server or network needed.

## Run it

```bash
npm install
npx playwright install chromium
npm test              # run the tests
npm run test:ui       # same, in Playwright's interactive UI
npm run demo          # watch a flow with the step overlay
npm run auto          # explore the app by picking Blocks
```

More: `npm run check` (lint your Blocks), `npm run graph` (see the whole graph),
`npx waygraph test report` (open the last report + traces).

## Where things live

See [STRUCTURE.md](./STRUCTURE.md). Short version: one folder per page under `src/map/`,
one Block per action, flows in `src/flows/`.

## Point it at your real app

Change each `_nav.block.ts`'s `url` from the local `file://` path to a real one, and set a real
`baseUrl` if your Nav Blocks use relative paths (`config/waygraph.config.ts`, a `.env`, or
`package.json`'s `"waygraph"` field - see the main docs' "Project config" section). That file also
holds the test settings (`testDir`, `webServer`, `playwright: { workers, timeout, ... }`), so the
project needs no `playwright.config.ts`. Keep each
`src/map/` folder matching the URL it represents (`waygraph map` enforces this).

Docs: https://deviate-dv8.github.io/waygraph/
