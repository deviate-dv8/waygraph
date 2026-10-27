> **Status (2026-10-26): reads are in as a beta** (`waygraph/beta`), in the shape agreed after this was written. Reads
> are a **Read Block** in its own file (`*.read.block.ts`), shaped like a Method:
> `defineReadBlock({ name, description, from, requires, instruction: { read: (ctx) => Ns({ ... }) } })`, not a `read:`
> field on `definePageBlock`. Readers come from `ctx` (`ctx.text`, `ctx.page.list(rowSel, (row) => ...)`, `ctx.table`), not
> a `Read` import. `read` runs after `verify`, never as a flow step. Done: namespaces, Read Blocks, `ReadPage`,
> `readCheckpoint`, the session `read` op, `read` / `missing` in snapshots. Not yet: `Trait.read`, the manifest,
> run log and demo panel, and `keys()` for Mem. Where this file says otherwise, the status wins.

## Context

Page Blocks (`engine/block/kinds/page.ts`) register Methods but say nothing about what a page shows. Live sessions
(`live/auto-session/`) detect the current Checkpoint with `detectHere` and expose `dom` (aria or full DOM) as the only
way to look. Mem keys (`engine/mem/mem.ts`) are `MemKey<T>` objects keyed by identity, built one `const` at a time with
`key<T>(name)` or `keyGroup<T>(name)`. The manifest (`manifest/manifest.ts`) lists Blocks and Flows; codemods `flows` and
`checkpoints` already rewrite projects on the AST with ts-morph.

## Goals / Non-Goals

**Goals:**
- One declaration per namespace for Mem keys and for reads; no name written twice.
- A page's read is a typed, layered object an agent gets as JSON, without a second call after acting.
- Reads usable in code (`PageBlock.read`, `Trait.read`) with types inferred from the namespace.

**Non-Goals:**
- Waiting reads (polling until a value appears). A read is point-in-time; verify Traits already wait.
- Reads on Nav, Method, Effect or API Blocks. A read describes a page, and the page Block for a Checkpoint owns it.
- Writing reads into Mem automatically. A Block that needs a value copies it (`mem.set(K, r.get(Post.slug))`).
- Changing `MemPage` itself or the identity-keyed store.

## Decisions

**1. `keys("ns")<T>()`, a Proxy with a per-namespace cache.** The curried form lets `T` be given explicitly while the
namespace string is inferred. The Proxy creates `MemKey<T[p]>("ns.p")` on first `get` and caches it, so identity holds
across files. `then`, `toJSON`, symbols and `constructor` return `undefined` (await, JSON.stringify and inspection must
not mint keys). Rejected: `keys("ns", { url: t<string>() })` with a runtime field list - it repeats each field once more
and needs a `t` helper; the field list is only needed by the manifest, which reads it from the type instead.

**2. Reads are a parallel namespace, `reads("ns")<T>()`, callable to build a spec.** `ReadKey<T>` is its own class, not a
`MemKey`, so a read value can never be passed where Mem expects a key. Making the namespace callable (`Post({...})`, a
Proxy over a function with an `apply` trap) instead of a `.from()` method keeps every property name free for fields.
Spec type: `ReadSpec<T> = { [K in keyof T]?: Reader<T[K]> | (T[K] extends object ? ReadSpec<T[K]> : never) }`, where
arrays of objects are read with `Read.list`.

**3. Readers are small objects, not bare selectors.** `Reader<T> = { kind, run(scope, mem): Promise<T | null> }`; `scope`
is the page or (inside `Read.list`) the row Locator. `null` means missing. One form per field keeps the "one way" rule;
the cost is `Read.text(".a")` instead of `".a"` inside lists. `Read.number` takes the first match of
`/-?\d[\d,]*(\.\d+)?/` and drops commas: it targets display text like "$1,299.00" and "41 likes", not locale parsing; a
page that needs more uses a function field.

**4. Reads are keyed by Checkpoint.** `definePageBlock` registers `checkpoint -> [{ block, spec }]` in a module registry
(`engine/read/registry.ts`). Duplicate keys for one Checkpoint throw `WG_READ_DUPLICATE` at definition. This makes the
read of "where I am" independent of which Block got there: `pilot read` uses `detectHere`'s Checkpoint, `send` uses the
Checkpoint the step resolved to, and `Trait.read` uses the Checkpoint its Block resolved to. Rejected: binding readers
to the key itself (one selector per key) - the same field sits in different markup on different pages (a feed card's
title vs a post's heading).

**5. `Trait.read` gets the Checkpoint from the verify runner.** `Trait.check(page, mem)` gains an optional third
argument `ctx: { checkpoint: string }`; the verify runner (`engine/trait/trait.ts`'s runner, called from `run.ts`) passes
the resolved Checkpoint. Existing Traits ignore it. `Trait.read` builds the ReadPage for that Checkpoint and checks
one key; `WG_READ_UNBOUND` when no registered spec reads the key there.

**6. `ReadPage` mirrors `MemPage`.** `get` throws `WG_READ_MISSING` (new code in `engine/errors.ts` with where / means /
fix), `has`, `missing: string[]`, `toJSON()` nests by key path and fills missing paths with `null` so the shape is stable
for an agent. Readers run in parallel per page (`Promise.all`); `Read.list` uses `locator.all()` then runs the row spec
per row.

**7. Sessions.** `AutoSession.read(path?)` builds the ReadPage for `this.here`. `SessionSnapshot` gains
`read: Record<string, unknown>` and `missing: string[]`, filled after each `send` / `reach`; reads are skipped (empty)
when no spec exists for the Checkpoint, so sessions on projects without reads cost nothing extra. `read` joins the
session ops in `cli/commands/session-ops.ts` and the IPC request types; the pilot overlay shows a short "read" activity
line like `dom` does.

**8. Manifest field types from the checker.** The manifest scan finds `keys("ns")<T>()` and `reads("ns")<T>()` calls with
ts-morph and prints each property of `T` with `type.getText()` (aliases resolved, `import("...")` prefixes stripped).
Page Block entries list the paths of their read specs (from the registry at load time, which the manifest already uses
for Blocks).

**9. The `keys` codemod.** On the AST: collect `key` / `keyGroup` variable declarations per file, group by namespace
(text before the last dot; undotted -> the file's map group or file stem), emit one `export const <Pascal(ns)> =
keys("ns")<{ ... }>()` with each field's type from the old type argument, then rewrite references project-wide with the
language service (`findReferences`): `X.key` and bare `X` both become `Ns.field`, and `mem.set(X(v))` /
`mem.setAll([X(v), ...])` become `mem.set(Ns.field, v)` (`setAll` entries become `[Ns.field, v]` pairs). A namespace
already exported under the PascalCase name gets a `Keys` suffix. It runs inside `waygraph upgrade --codemod keys` and is
idempotent.

## Risks / Trade-offs

- [Proxy keys are invisible to `Object.keys` and editor "find all references" on a field name] -> the manifest lists
  them, the type gives autocomplete, and go-to-definition lands on the type's property.
- [A typo'd property on a namespace typed loosely (`keys("x")<any>()`) mints a new key silently] -> the any ratchet
  forbids `any` in projects' templates; docs show only concrete types.
- [Merging reads by Checkpoint across page Blocks means a read depends on which Blocks are loaded] -> live sessions load
  the whole library; `Trait.read` in a flow fails loud with `WG_READ_UNBOUND`, naming the Checkpoint, if the page Block
  is not loaded.
- [Reads after every `send` add page work] -> only when the Checkpoint has a spec; reads do not wait; a slow page
  is bounded by Playwright's action timeouts per locator call.
- [~300 files mention `key` / `keyGroup`] -> most are tests, docs and templates in this repo; the codemod does the code,
  the docs drift test catches the prose.

## Migration Plan

1. Land `keys()` alongside `key` / `keyGroup` internally, run the codemod over the repo (tests, examples, templates),
   then remove `key` / `keyGroup` in the same release.
2. Projects run `waygraph upgrade --codemod keys`; `waygraph upgrade` (no codemod) points one out when it finds
   `key<` / `keyGroup<`.
3. Reads are additive; no migration.

## Open Questions

- None blocking. A later change may let a Method declare `reads: [Post.slug]` to copy read values into Mem, if flows
  need it often.
