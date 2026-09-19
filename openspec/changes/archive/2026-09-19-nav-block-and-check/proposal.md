## Why

Dan's direction for waygraph is autonomous mode: eventually, an agent should be able to
look at whatever page it's actually on, recognize where it is against a known Block
library, pick the Block/Flow that accomplishes a goal, and recover gracefully when a
required mem key is missing (e.g. re-run login) instead of a fixed hand-written chain
being the only way to drive a site. The concrete example discussed: log into a
Facebook-shaped app, check feeds, log out, log back in, edit profile - and if the browser
ends up somewhere unplanned (a human navigated it, or the app redirected to an error
page), the agent should figure out where it landed and what to do next, rather than
assuming its last known state is still true.

That "recognize where I am" step needs a live page to be checked against every known
Block's `verify` Traits - a reverse lookup instead of today's forward confirmation. It
only works if a Block's identity is unambiguous: a Block that both navigates AND performs
a business action can't be fingerprinted reliably, because the same Block being "true" for
verify purposes says nothing about whether the page just changed underneath it.

`projects_waygraph/zsign-atomic-waygraph` already discovered this independently, the hard
way: it hand-splits every route into `nav.*.block.ts` (navigates) vs `*.action.block.ts` /
`*.chrome.block.ts` (never navigates), documented in `docs/CONVENTION.md`, with a
hand-maintained route registry (`src/nav_zsign/routes.ts`, `edges.ts`) and a throwaway
script (`scripts/print-nav.mjs`) that regex-scans each Block's own file for `page.goto(`
to report its navigation footprint. None of this is enforced by waygraph itself - a
NavBlock today is built with the exact same `defineBlock()` as any other Block, so nothing
stops an author (human or an autonomous agent generating Blocks itself) from quietly
mixing navigation into a business-action Block, or vice versa.

This change promotes that convention into the engine: a real `NavBlock` type that
structurally cannot do anything but navigate. Enforcement stays soft by design - Dan: "we
don't explicitly block the users to follow our conventions" - so the primary signal is a
passive TypeScript warning any author (human or an autonomous agent generating Block code)
sees the instant they type `page.goto(...)` in a plain Block, with a `waygraph check`
command as the complementary whole-project sweep for contexts with no editor watching
(CI, an agent auditing many files at once). It's the first of a longer roadmap (see
design.md for phases 2 and 3 - page recognition and a federated pool of site-specific
waygraph packages) but is scoped on its own: useful today even before any of the later
phases exist, since it also gives the existing hand-rolled `print-nav.mjs`-style tooling a
real primitive to build on instead of regex-scanning Block source from outside the engine.

## What Changes

- New `defineNavBlock({ name, url, ... })` factory and `NavBlock<Out>` type in
  `src/engine.ts`. `url` accepts a plain string or `(mem: MemPage) => string` (parameterized
  routes, e.g. `/dashboard/requests/:id`, are a real, already-demonstrated need in
  `zsign-atomic-waygraph`'s own route registry). The generated `act()` is always exactly
  `page.goto(url)` (resolved from mem when `url` is a function) - authors never write
  `act()` for a NavBlock themselves.
- `NavBlock extends Block`, so it drops into `defineFlow([...])`, `connect()`,
  `composeBlock()` exactly like any other Block - no special-casing needed anywhere that
  only expects a `Block`, matching how `ComposedBlock` already works.
- **Primary enforcement**: a new `ActionPage` type - the same `Page` a regular Block's
  `act()` already receives, but with `goto`/`reload`/`goBack`/`goForward` re-declared under
  a `@deprecated` JSDoc tag pointing at `defineNavBlock`. All four methods remain fully
  present and callable - nothing breaks, nothing is blocked, `tsc --noEmit` still passes on
  every existing Block including the ones that call `page.goto` today. An editor shows the
  call struck through with a hover warning the moment it's typed. No custom tooling (no
  ESLint rule, no language service plugin) - a type declaration alone does this.
- **Secondary enforcement**: `waygraph check <project>` CLI command - walks every
  `*.block.ts` file, and for any Block not built via `defineNavBlock`, scans that file's
  own source for `page.goto(`, `page.reload(`, or `page.goBack(`; prints a warning naming
  the file when found. Warning only, never a build failure, never changes exit code -
  covers the case an editor can't (CI, generated code, an autonomous agent writing Block
  files without a language server attached).
- Fully additive: no existing exported API's behavior changes. `list`/`nav`/`validate`/
  `run`/`chain` are untouched; `check` is a new, separately-invoked command; `ActionPage`
  is structurally identical to `Page` for every method that isn't navigation, so existing
  call sites (`page.locator(...)`, `.click()`, `.fill()`, etc.) are unaffected.

## Capabilities

### New Capabilities
- `nav-block-and-check`: a distinct, engine-recognized NavBlock kind whose only possible
  action is navigation, a passive TypeScript warning when navigation escapes it, and a CLI
  command that sweeps a whole project for the same thing.

## Impact

- `src/engine.ts` (new, additive) - `defineNavBlock`, `NavBlock` type/marker, `ActionPage`
  type, regular `defineBlock`'s `act()` typed against `ActionPage` instead of raw `Page`.
- `src/index.ts` (tiny) - export `defineNavBlock`, `NavBlock`, `ActionPage`.
- `src/cli.ts` (new command) - `check`, reusing the existing `walkDir`/Block-discovery
  pattern `findBlock`/`list` already use.
- `tests/` - new spec covering `defineNavBlock`'s generated `act()` (both static and
  mem-function `url`) and `check`'s warning output (flags a mixed Block, stays silent on a
  NavBlock and on a clean action Block). The `@deprecated` tag itself isn't something
  `tsc --noEmit` can assert on (deprecation is not a type error) - verified instead by
  confirming it's present in the built `.d.ts` output, plus a manual editor check as part
  of review (see design.md Risks).
- No change required to `zsign-all`, `zsign-atomic-waygraph`, or `saucedemo` - opt-in.
  Porting `zsign-atomic-waygraph`'s existing `nav.*.block.ts` files to `defineNavBlock` is
  a natural follow-up, not part of this change.
