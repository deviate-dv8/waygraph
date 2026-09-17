# __PROJECT_NAME__

Offline waygraph scaffold - Nav, Page hub, Method, Effect (`instanceOptions` for
`waygraph auto`), stubs/fixtures/YAP, mem keys.

## Layout

See [STRUCTURE.md](./STRUCTURE.md). Docs:
https://deviate-dv8.github.io/waygraph/scaffold.html

## Commands

```bash
npm install
npx playwright install chromium
npm test
npm run list && npm run check && npm run graph
npm run demo                 # exampleFlow (hello + YAP)
npm run demo:shop            # Effect path (needs --data selectedItem)
npm run auto                 # headed explore - pick Add Alpha / …
npm run auto:cli
npx waygraph agent-dive --loop claude   # coding-agent defs (optional)
```

Point `package.json` `waygraph.baseUrl` at your real app when you leave the
fixture (and drop `scripts/with-fixture.mjs` wrappers). Keep route folders =
app URLs (consumer layout).
Offline fixture is HTTP `http://127.0.0.1:4177/home.html` (Flatpak-safe).
