# The Map

## Waygraph Map

An opinionated, Next.js/Nuxt-style folder convention where a project's own directory
structure mechanically *is* its map - not a separate schema file to generate, maintain, or
let drift out of sync. Needs zero new engine code: `discoverGraph`/`loadBlockLibrary` already
recurse through any folder structure, matching only the `.block.ts` filename pattern - folder
naming and depth are already 100% cosmetic to every existing command.

```text
src/map/
  (app_base)/              # the landing/base group - purely organizational, never part of
    dashboard/              # any Checkpoint tag. One folder per Checkpoint - "Dashboard"
      _page.block.ts         # arrival hub (definePageBlock) - fixed name, every folder
      _nav.block.ts           # navigation (defineNavBlock) - fixed name, every folder
      _sel.ts                  # selectors for this Checkpoint - fixed name, every folder
      _read.block.ts            # what the page shows, as data (defineReadBlock) - every page
      _reads.ts                 # its typed namespace (reads("dashboard")<{...}>())
      _methods/                 # this Checkpoint's own action Blocks - fixed name, every
        click-widget.block.ts    # folder. Contents keep their own descriptive names -
  (external)/                     # only the folder itself is fixed.
    docs/                    # a genuinely cross-origin group, same shape - "Docs"
      _page.block.ts
      _nav.block.ts
      _sel.ts
      _read.block.ts
      _reads.ts
```

**Not just a naming preference - a forced convention.** Folder nesting under `map/(group)/`
must **verbatim-match** the real site's own URL path segments, `(group)` parens excluded
(purely organizational, same as a Next.js route group): `/app/chats` lives at
`map/(app_base)/app/chats/`, never `map/(auth)/chats/` for a fabricated grouping that was
never a real `/auth/*` URL. `waygraph map [project]` (see [CLI reference](./cli.md#cli-reference))
enforces this mechanically and exits 1 on a mismatch - don't rely on review alone. Same Block
helpers as today's freeform "manual mode" (`definePageBlock`/`defineNavBlock`/
`defineMethodBlock`/etc.) either way - Map only changes *where files live and what they're
named*, never what kind of Block authors them or how they execute. A project adopts it
incrementally, folder by folder. Build flows with [`map()`](./engine.md#map-a-kind-checked-no-teleporting-flow-builder) -
it can't silently accept a Block that didn't come from a real factory.

**Leading underscore = this Checkpoint's own fixed machinery, never a route segment.**
`_nav.block.ts`/`_page.block.ts`/`_sel.ts`/`_methods/` (same private-folder idea as Next.js's
own `_folder` convention) mark "this belongs to the endpoint whose folder it's directly in,"
so a bare (non-underscore, non-`(group)`) folder name always means a real child
Checkpoint/URL segment - `_methods/` can never be mistaken for a sibling endpoint folder the
way a bare `methods/` structurally could be, since only ONE of those two readings is
mechanically distinguishable at a glance. `waygraph map`'s own folder-vs-URL comparison
excludes underscore segments the same way it excludes `(group)` ones - `_methods/foo.block.ts`
compares against the URL as if `_methods/` weren't there at all. Individual files inside
`_methods/` keep their own descriptive names (`join-pool.method.block.ts`, not
`_join-pool...`) - they're hand-authored per-project content, not fixed convention names; the
`_methods/` folder boundary alone already marks the whole subtree as non-route.

**"waypack" - loading another project's Blocks needs no separate manifest either.** A second
project depending on a Map-convention project as a plain `file:` dependency (the same
mechanism `examples/saucedemo`'s own `"waygraph": "file:../.."` already uses) is immediately
understandable: `waygraph graph node_modules/<loaded-package>` correctly discovers its full
Checkpoint/edge structure, with nothing generated or maintained separately. Proven end to end
in `examples/routed-demo-consumer/` against `examples/routed-demo/`.

**A real bug this proof surfaced, fixed, not left as a caveat:** a *live* background session
against a package loaded through a consumer project's own deeply nested `node_modules/<pkg>`
path used to fail with `listen EINVAL` - the session's Unix socket lived under the project
directory, and that absolute path could exceed the OS's AF_UNIX limit (~108 bytes on Linux).
Fixed: session sockets now live in a short, fixed location (`os.tmpdir()/waygraph-auto/`),
independent of how deeply the project itself is nested - confirmed against the exact
previously-failing path (a background session, `auto reach`, and quit all working normally).
Session metadata (`.waygraph-auto/<id>.json`, discoverable per-project) is unaffected - only
the socket moved.

Full design history (why "Router" isn't a separate thing to build, two prior wrong readings
of this before landing here, and everything above stated as requirements) in
`openspec/changes/waygraph-map/`.

## Map packages

A group under `src/map/` that owns its Checkpoints and keys is a map you can publish: `_states.ts` and `_keys.ts` live in
the group's folder (not in `src/states/`), and its files import only `waygraph`, Playwright, `node:` modules and each
other. `waygraph check` warns on any import that leaves the group.

```text
src/map/(external)/hoppscotch/
  _states.ts          HoppscotchRest, HoppscotchSettings
  _keys.ts            hoppscotch.requestUrl, hoppscotch.expectedStatus, ...
  _nav.block.ts  _page.block.ts  _sel.ts  _methods/  settings/
```

```bash
waygraph map pack hoppscotch [project] [--out <dir>] [--name <package>] [--version <x.y.z>]
# -> .waygraph/packages/hoppscotch: compiled .js + .d.ts, index re-exporting every module, package.json,
#    and waygraph.map.json (its Blocks with routes, its Checkpoints)
cd .waygraph/packages/hoppscotch && npm publish
```

The pack uses the project's own `tsconfig.json` and TypeScript and refuses a group that imports outside itself. In
another project, `npm i waygraph-map-hoppscotch` is all it takes: the scanner finds every dependency with a
`waygraph.map.json`, so its Blocks appear in `graph`, `auto`, `manifest` and `waygraph run <block>`, and flows import
them like any module:

```typescript
import { NavHoppscotchRestBlock, SetUrlBlock, SendRequestBlock, AssertStatusBlock } from "waygraph-map-hoppscotch";
```

The scaffold's `(external)/hoppscotch` and `(external)/mailpit` are written this way.

## Migrating from freeform ("router") to Waygraph Map

"Router" isn't a separate mode to turn off - it's this project's own name for today's
freeform, folder-organized style (`src/blocks/<slug>/`, any nesting, any file names).
Migrating means moving those files under `src/map/(group)/<page-slug>/` with verbatim
URL-matching names, nothing more - no engine change, no new Block helpers, no flag to flip.
Do it incrementally: the two styles coexist in the same project (and even the same Flow) with
no special-casing, since `discoverGraph`/`loadBlockLibrary` only ever match the `.block.ts`
filename pattern, never folder depth or naming.

1. **List every real URL your NavBlocks/PageBlocks already navigate to.** For each one with a
   static string `url`, note its real path. For each one that's `click`-based (no `url` field
   at all) or a dynamic `(mem) => string` function, note that too - neither is statically
   checkable by `waygraph map`, so they can go wherever makes sense; only a literal string
   `url` is verified.
2. **Pick your group(s).** `(app_base)/` for the landing/base app (organizational only, never
   part of a Checkpoint tag); `(external)/` for genuinely cross-origin Blocks (mail tools,
   third-party embeds) - verify with the real URL, not the folder's own current name, since a
   folder can already be mis-grouped (a real bug this session found: a project's own
   `(external)/docs/` was actually same-origin the whole time).
3. **Create `src/map/(group)/<verbatim-url-segments>/` per Checkpoint**, `git mv` each
   Block/Sel file in, and rename the fixed ones: `nav.block.ts` -> `_nav.block.ts`,
   `page.block.ts` -> `_page.block.ts`, your selector file -> `_sel.ts` (drops its slug - now a
   fully fixed name), `methods/` -> `_methods/` (contents keep their own names unchanged).
   **Two Checkpoints sharing one real URL** (a DOM-state distinction, not a URL one - e.g. a
   "joined" vs "not joined" variant of the same page) can't both use the bare fixed names in
   one folder; give each pair a slug prefix instead (`app-home._nav.block.ts` /
   `in-pool._nav.block.ts`, or similar) rather than nesting either under its own subfolder
   (that would add a folder segment the real URL doesn't have, and fail step 5).
4. **A dynamic per-instance URL** (a real chat/order/ticket id, not a fixed route) - if it's
   currently a plain string constant, wrap it as `url: () => thatConstant` instead. A bare
   string is always treated as a real, checkable static route; a function is correctly treated
   as dynamic/non-canonical and skipped, matching how you'd actually navigate a real instance of
   it in practice anyway.
5. **Fix every import** the moves break (states/mem-key paths change depth; sibling
   nav/page/methods imports need their new `_`-prefixed names) - let the compiler do this for
   you: `tsc --noEmit` if the project has one, otherwise `waygraph check [project]` and
   `waygraph graph [project]` (both do real dynamic imports of every Block file and report
   import failures by name) are just as effective a proof.
6. **Run `waygraph map [project]`.** Exit 0 / "0 violations" is the actual finish line - not a
   subjective review. A remaining violation names the exact file, its real folder path, and the
   real URL it doesn't match; fix the folder, not the check.
7. **Diff `waygraph graph`'s node/edge/skipped/orphan counts against before the move.** A pure
   migration changes zero Block behavior - if a count changed, something broke in transit
   (a bad import silently dropped a Block from discovery is the usual cause), not something to
   wave off as "close enough."

Once the folder structure is settled, build Flows over these Blocks with
[`map()`](./engine.md#map-a-kind-checked-no-teleporting-flow-builder) - it can't silently accept a Block that isn't
really a Nav/Page/Assert/Method from this package's own factories.
