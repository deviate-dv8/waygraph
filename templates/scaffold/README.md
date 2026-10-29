# __PROJECT_NAME__

A waygraph project: one folder per page under `src/map/` (its folders mirror your app's URLs), one Block per action,
one flow per use case in `src/flows/`. It runs offline: the demo pages open from `file://`.

```bash
npm install
npx playwright install chromium
npm test              # every test
npm run demo          # watch a flow, step by step
npm run auto          # pick Blocks by hand
npm run check         # lint Blocks and folders
```

Where each file goes, and pointing it at your real app: https://deviate-dv8.github.io/waygraph/guides/project
