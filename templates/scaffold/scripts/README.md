# `scripts/`

**Not part of the waygraph API** - this is scaffold-fixture plumbing only, so `npm test`/`npm
run demo`/etc. work out of the box with no real app, no network, nothing to sign in to. A real
project pointed at its own app (see the note at the bottom) doesn't need this folder at all.

Both files are plain TypeScript, run directly via `tsx` (already a devDependency here, and the
same loader every `.block.ts`/`.flow.ts` in this project already runs through - not a second,
different toolchain) - `tsc --noEmit` / `waygraph typecheck` cover them like any other `.ts`
file in the project.

- **`fixture-server.ts`** - a tiny static HTTP server for the offline `.html` fixture pages
  under `src/map/` (`127.0.0.1:4177` by default; override with `WAYGRAPH_FIXTURE_PORT`/
  `WAYGRAPH_FIXTURE_HOST`). This is what makes `npm test` pass with no network and no real app
  running.
- **`with-fixture.ts`** - starts `fixture-server.ts`, runs whatever command you give it
  (`waygraph auto`, `waygraph demo --blocks ...`), then tears the server down once that command
  exits. Every `npm run demo*`/`auto*`/`run*` script in `package.json` goes through this wrapper
  - don't run `waygraph demo`/`auto` directly against this scaffold's own fixture pages without
  it, or there will be nothing listening on `127.0.0.1:4177` yet.

**Pointing this scaffold at a real app instead of the offline fixtures:** change
`_nav.block.ts`'s `url`/`homeOrigin` to the real one, set a real `baseUrl` (`waygraph.config.ts`
or a `.env` - see the main README's "Project config" section), and drop both files in this
folder plus the `with-fixture.ts` wrapping in `package.json`'s scripts - none of it is needed
once a real app is answering requests.
