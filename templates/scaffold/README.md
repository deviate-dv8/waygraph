# __PROJECT_NAME__

Offline waygraph scaffold (`data:` URL - no network for `npm test`).

## Layout

See [STRUCTURE.md](./STRUCTURE.md). Package docs:
https://deviate-dv8.github.io/waygraph/scaffold.html

## Commands

```bash
npm install
npx playwright install chromium
npm test
npm run list
npm run check
npm run demo          # headed step (manual Next)
npm run demo:auto-next
npm run auto
npm run auto:cli
```

Point `package.json` `waygraph.baseUrl` at your real app when you leave the
`data:` demo. Keep route folders = app URLs (consumer layout).
