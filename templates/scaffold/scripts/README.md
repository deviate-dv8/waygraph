# `scripts/`

- `fixture-server.mjs` - serves the offline `.html` fixture pages under `src/map/` on
  `127.0.0.1:4177` (override with `WAYGRAPH_FIXTURE_PORT`/`WAYGRAPH_FIXTURE_HOST`). This is
  what makes `npm test` pass with no network and no real app running.
- `with-fixture.mjs` - starts `fixture-server.mjs`, runs whatever command you give it
  (`waygraph auto`, `waygraph demo --blocks ...`), then tears the server down when that command
  exits. Every `npm run demo*`/`auto*` script in `package.json` goes through this wrapper -
  don't run `waygraph demo`/`auto` directly against this scaffold's own fixture pages without it.

Pointing this scaffold at a real app instead of the offline fixtures: change `_nav.block.ts`'s
`url`/`homeOrigin` to the real one and drop `with-fixture.mjs` from the scripts that no longer
need it.
