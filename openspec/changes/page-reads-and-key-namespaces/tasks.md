## 1. Key namespaces

- [ ] 1.1 Add `keys(namespace)<T>()` to `engine/mem/mem.ts`: Proxy with a per-namespace cache, `then` / `toJSON` /
      `constructor` / symbols return `undefined`; export from `src/index.ts`
- [ ] 1.2 Unit tests: name is `ns.prop`, same object on every read, works with `mem.set/get/has/update`, `requires`,
      `registerMemStub`, `--data` by name; `tsc` rejects a wrongly typed `mem.set` (type test)
- [ ] 1.3 Codemod `keys` (`cli/commands/codemod-keys.ts`): group declarations by namespace, emit one `keys(...)` per
      namespace, rewrite references (`X.key`, `X`, `mem.set(X(v))`, `setAll` pairs), undotted names to the file's map
      group or stem with a printed rename, `Keys` suffix on a name clash, idempotent; wire into `waygraph upgrade
      --codemod keys`, and make plain `waygraph upgrade` point out `key<` / `keyGroup<`
- [ ] 1.4 Codemod tests on fixtures (keyGroup pair uses, setAll, undotted names, a clash, a second run changes nothing)
- [ ] 1.5 Run the codemod over this repo: `src/` internals, `tests/`, `examples/`, `templates/scaffold`,
      `templates/quickstart`; full suite green
- [ ] 1.6 Remove `key` / `keyGroup` from `engine/mem/mem.ts` and `src/index.ts`; update the API surface snapshot; add
      rows to `scripts/gen-deprecated.mjs` and the docs drift test

## 2. Reads in the engine

- [ ] 2.1 `engine/read/read-key.ts`: `ReadKey<T>`, `reads(namespace)<T>()` (callable Proxy, same cache rules), the
      `ReadSpec<T>` type
- [ ] 2.2 `engine/read/readers.ts`: `Read.text`, `texts`, `number`, `attr`, `value`, `visible`, `count`, `list`, and
      function fields; no waiting; `null` for missing
- [ ] 2.3 `engine/read/read-page.ts`: `ReadPage` (`get` / `has` / `missing` / `toJSON`), `WG_READ_MISSING`,
      `WG_READ_DUPLICATE`, `WG_READ_UNBOUND` in `engine/errors.ts` with where / means / fix
- [ ] 2.4 `engine/read/registry.ts`: Checkpoint -> specs; `readCheckpoint(page, mem, checkpoint, path?)`
- [ ] 2.5 `definePageBlock({ read })`: register under its Checkpoint, `PageBlock.read(page, mem?)`
- [ ] 2.6 `Trait.read(key, predicate)`; the verify runner passes `{ checkpoint }` as Trait's third argument
- [ ] 2.7 Unit and Playwright tests on a fixture page: each helper, lists, nested specs, missing fields, duplicate keys,
      `Trait.read` pass / fail / unbound, a partial namespace on two pages of one Checkpoint
- [ ] 2.8 `check:structure`: `engine/read/` in the engine layer; any-debt stays at or below today's count

## 3. Sessions and the manifest

- [ ] 3.1 `AutoSession.read(path?)`; `SessionSnapshot` gains `read` and `missing`, filled after `send` / `reach`
- [ ] 3.2 `read` session op in `cli/commands/session-ops.ts` and the IPC request types; usage and `--help` text; pilot
      activity line
- [ ] 3.3 Session spec tests: `pilot read`, `read <path>`, no Checkpoint detected, `send` reply carries the changed read
- [ ] 3.4 Manifest: key and read namespaces with field types via ts-morph; page Blocks list read paths; manifest test

## 4. Examples and templates

- [ ] 4.1 Saucedemo example: `reads` for inventory (items, cart count), cart (lines, total) and checkout complete; a
      Method verify using `Trait.read`; its tests pass
- [ ] 4.2 Scaffold and quickstart: one page with a `read`, shown in their docs; `waygraph init` project passes tsc,
      check, test and demo

## 5. Docs

- [ ] 5.1 `docs/reference/`: keys (replacing key / keyGroup), reads (`reads`, `Read`, `ReadPage`, `Trait.read`), the
      `read` session op in `pilot.md` / `cli.md`; regenerate with `npm run docs:api`
- [ ] 5.2 `docs/deprecated.md` (generated) rows for `key` / `keyGroup`; README, `docs/*.md` mentions
- [ ] 5.3 `templates/skills/`: agents read pages with `pilot read` before reaching for `dom`; keys and reads in the
      convention skill
- [ ] 5.4 ROADMAP entry; `obsidian/` vault notes on keys and reads; `src/ARCHITECTURE.md` adds `engine/read/`

## 6. Release

- [ ] 6.1 Full verify (tsc, build, check:structure, knip, unit, Playwright suite, saucedemo tests, a demo); no sessions left
- [ ] 6.2 Patch bump to 0.16.2; commit locally (push and publish only when asked)
