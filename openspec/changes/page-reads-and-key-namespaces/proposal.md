## Why

An agent driving a waygraph session can act on a page (its Methods) but cannot ask what the page shows. Today it calls
`dom` and digs through an accessibility tree, which costs tokens and breaks when markup moves - even though the Block's
author already wrote the selectors. Page Blocks need the other half of a page object: **reads**, a typed object of what
the page shows, returned as plain JSON.

Designing reads exposed the same cost in Mem keys. Each key is its own `const` with its name written twice and its
namespace retyped on every line (`RequestUrl = key<string>("hoppscotch.requestUrl")`, 13 times over in one scaffold
file), and there are two ways to write one (`key` and `keyGroup`, with `LoginCreds.key` vs `LoginCreds({...})`).
Reads built that way would be just as tedious. Both get one declaration per namespace instead.

## What Changes

- **BREAKING** `key<T>(name)` and `keyGroup<T>(name)` are removed. One form replaces them:
  `export const Hopp = keys("hoppscotch")<{ requestUrl: string; expectedStatus: number }>()`. Property names become key
  names (`Hopp.requestUrl` is a `MemKey<string>` named `"hoppscotch.requestUrl"`), created on first use and the same
  object every time after. `mem.get` / `mem.set` / `requires` / `registerMemStub` take these keys unchanged.
- `waygraph upgrade --codemod keys` converts a project: it groups each file's `key` / `keyGroup` consts by namespace
  into one `keys(...)` declaration and rewrites every use (`LoginCreds.key` and `LoginCreds` -> `Saucedemo.credentials`;
  `mem.set(LoginCreds({...}))` -> `mem.set(Saucedemo.credentials, {...})`).
- New `reads("post")<T>()`: a read namespace, same shape as `keys`. Calling it builds a read spec checked against `T`:
  `Post({ title: Read.text(sel), comments: Read.list(rowSel, { author: Read.text(".a") }) })`. Nested objects are the
  layers of the result.
- `definePageBlock({ read: Post({...}) })` (or an array of specs). Read helpers: `Read.text`, `Read.texts`,
  `Read.number`, `Read.attr`, `Read.value`, `Read.visible`, `Read.count`, `Read.list`, or any `(page, mem) => value`.
- `await PageBlock.read(page, mem?)` returns a `ReadPage`: `get(key)` (typed; throws `WG_READ_MISSING` naming the key when
  the page did not show it, like Mem's `WG_MEM_READ_BEFORE_SET`), `has(key)`, `missing`, `toJSON()` (the layered object).
- Reads belong to a Checkpoint: every page Block for the Checkpoint a session is at contributes its read spec.
- Sessions: `waygraph auto|browser|pilot read <sessionId> [path]` returns `{ page, checkpoint, read, missing, methods }`.
  The JSON reply to `send` and `reach` carries the same `read` and `missing` for the page the step landed on.
- `Trait.read(key, predicate)` in any verify list: checks a read of the Checkpoint the Block resolved to.
- The manifest lists every key and read namespace with field types (`"post.likes": "number"`, read from the source's
  types), and each page Block's read paths.
- `docs/deprecated.md` gains `key` / `keyGroup` rows; the reference, scaffold, quickstart, skills, ROADMAP and vault
  describe keys and reads.

## Capabilities

### New Capabilities
- `mem-key-namespaces`: one `keys(namespace)<T>()` declaration for Mem keys, the removal of `key` / `keyGroup`, and the
  `keys` codemod.
- `page-reads`: read namespaces, read specs on page Blocks, `ReadPage`, the `Read` helpers, session `read` and the read in
  `send` / `reach` replies, `Trait.read`, and reads in the manifest.

### Modified Capabilities
<!-- waygraph-core's "Shared memory reads are typed and fail loudly when unset" still holds as written. -->

## Impact

- Public API (`src/index.ts`, `tests/unit/api-surface.snapshot.json`): removes `key`, `keyGroup`; adds `keys`, `reads`,
  `Read`, `ReadKey`, `ReadPage`, `Trait.read`.
- Engine: `engine/mem/` (keys), new `engine/read/` (namespace, helpers, ReadPage, Checkpoint registry), `engine/trait/`
  (`Trait.read`; the verify runner hands Traits the resolved Checkpoint), `engine/block/kinds/page.ts` (`read`).
- Live: `live/auto-session/` (`read` op, snapshot gains `read` / `missing`), `cli/commands/session-ops.ts` (`read` op).
- Manifest: key and read namespaces with field types via the TypeScript checker (ts-morph, already a dependency).
- Codemod `keys` in `cli/commands/` next to `flows` and `checkpoints`.
- Every project and template using `key` / `keyGroup` (about 300 files mention them, mostly tests and docs). Key names
  stay the same for dotted names, so `--data` JSON and `*.mem-stubs.ts` keep working; undotted names gain a namespace
  and the codemod prints each rename.
- Ships as a patch bump (0.16.2), like 0.16.0's removals.
