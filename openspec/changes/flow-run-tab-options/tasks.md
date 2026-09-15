## 1. Additive options arg on `runGraph` + `Flow.run`

- [x] 1.1 `runGraph` accepts trailing `options?: RunGraphOptions` with `page` (drive this
      page instead of `context.newPage()`) and `closeOnFinish` (default `true`)
      - `src/engine.ts` (WIP diff confirms; verified by typecheck + test 1.3)
- [x] 1.2 `Flow.run` gains two overloads: `run(context, mem, options?: RunGraphOptions)` and
      `run(context, mem, options: RunGraphOptions & { closeOnFinish: false })` returning
      `{ result, page }`; `run(mem, config?)` (no-context, own browser) unchanged
      - `src/engine.ts` (WIP diff confirms)
- [x] 1.3 Default behavior unchanged: no options still opens its own page and closes it
      - proven by `tests/flow-run-options.spec.ts` test 3 ("no options still closes its own page")
- [x] 1.4 Export `RunGraphOptions` from the package barrel
      - `src/index.ts` (WIP diff confirms)

## 2. Proof

- [x] 2.1 `npm run typecheck` green (`tsc --noEmit`)
- [x] 2.2 `tests/flow-run-options.spec.ts` covers: (a) drives the given page, no new tab
      + `isClosed()===false`, (b) `closeOnFinish: false` leaves page open + returns
      `{ result, page }`, (c) `{ page, closeOnFinish: true }` closes caller-owned page
      (`isClosed()===true`), (d) no-options path unchanged
- [x] 2.3 `npm run test` (playwright suite) green including the new spec
      - full suite 91/91 (1 pre-existing timing flake reconfirmed passing standalone,
        unrelated to this change); slot-6 review re-ran flow-run-options after gap (c)

## 3. Docs

- [x] 3.1 README: "Capture a popup" recipe (docs-only, pattern-first like action-block /
      defineBeat) - `context.once('page', handler)` armed before the `target=_blank` click,
      captured `Page` stored in a caller-owned handle; no engine API added
      - README.md "Capture a popup (`target=_blank` click)" section
- [x] 3.2 README: mention `options.page` / `options.closeOnFinish` on `Flow.run` where the
      run examples sit, so the additive surface is discoverable
      - README.md, both in the main run-options explanation and the Recipes section

## 4. Follow-up (not in this change)

- [ ] 4.1 Decide popup-capture promotion to engine API only if a second real use case needs
      it (slot-6 condition)