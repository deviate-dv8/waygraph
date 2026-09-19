## Context

Discussed live with Dan this session, working from a concrete example: an autonomous
waygraph agent driving a Facebook-shaped app - log in, check feeds, log out, log back in,
edit profile - that can also cope with the browser landing somewhere unplanned (a human
navigated it, or the app redirected to an error page) by recognizing where it actually is
and recovering, rather than assuming its last known state still holds.

Independently, `projects_waygraph/zsign-atomic-waygraph` already arrived at the same split
by hand: `docs/CONVENTION.md` defines `nav.*.block.ts` (navigates) vs `*.action.block.ts` /
`*.chrome.block.ts` (never navigates) purely by file-naming discipline, backed by a
hand-maintained route registry (`src/nav_zsign/routes.ts`, `edges.ts`) and a throwaway
script (`scripts/print-nav.mjs`) that regex-scans each Block's own file for `page.goto(`.
None of it is enforced - `NavWebLoginBlock` is built with the same `defineBlock()` as any
action Block. This change is that convention, promoted into the engine.

## Roadmap (why this slice, not the whole vision)

Three phases were discussed; only phase 1 is scoped and specced here.

1. **This change** - `NavBlock`, an `ActionPage` deprecation warning, and `waygraph check`.
   Structural nav/action separation, enforced softly (a warning, never a block) rather than
   merely documented.
2. **Not in this change** - a `locate(page, library)` function that reverse-matches a live
   page against every known Block's `verify` Traits to answer "where am I", plus splitting
   a MemKey's `requires` into externally-supplied (credentials, config - no Block will ever
   produce these) vs producedBy-another-Block (a document id from a list page, a token from
   a redirect - genuinely recoverable by finding and running the right Block first). A
   failed preflight today just throws naming the missing key; phase 2 would let it suggest
   a recovery path instead.
3. **Not in this change** - a federated "pool of waygraphs": multiple site-specific
   waygraph packages loaded together, each publishing its own Block library, with
   package-scoped namespacing so `locate()`/planning can run across sites without name
   collisions (two packages can both have a Block named `login`). Scoped, when it happens,
   to owned/cooperating sites - not arbitrary third parties. Two real risks were flagged
   and accepted as out of scope for engine design: DOM/selector rot at community scale (no
   one owns a third party's markup, unlike your own product), and ToS/access risk on
   platforms that restrict automation. Neither is an engine problem to solve; both are
   reasons to scope "pool" to cooperating sites first.

Phase 1 stands on its own - it's useful today (a real, enforced nav/action boundary; a real
primitive to replace `print-nav.mjs`'s regex-from-outside approach) even if phases 2 and 3
never get built.

## Goals / Non-Goals

**Goals:**
- A Block that can only navigate, structurally - not by convention, not by a self-reported
  flag an author could get wrong silently.
- A way to catch the common case of navigation escaping into a business-action Block,
  without breaking any existing project that currently mixes the two, and without ever
  requiring anyone to remember to run a command - the signal should be passive and
  immediate (an editor warning while typing), with the CLI sweep as backup for contexts
  with no editor.
- Lay a primitive phase 2's `locate()` can eventually use: a NavBlock's `verify` Traits
  become a reliable "this Block, and only this Block, claims to be responsible for landing
  here" signal once one Block can't secretly also be doing something else.

**Non-Goals (this change):**
- `locate()` / page recognition (phase 2).
- Splitting `requires` into externally-supplied vs producedBy-another-Block (phase 2).
- Any cross-package pool/federation/namespacing (phase 3).
- Retrofitting `zsign-atomic-waygraph`'s existing `nav.*.block.ts` files to
  `defineNavBlock` - real, valuable follow-up, but a separate change once this one lands
  and is proven.
- AST-based / import-graph-aware detection in `check` - the known blind spot (navigation
  hidden behind a shared helper import) is accepted for this first cut; see Risks.

## Decisions

**`url` accepts `(mem) => string` from day one, not just a plain string.**
Considered shipping string-only first and adding the function form later if needed. Reversed
because the need is not hypothetical: `zsign-atomic-waygraph`'s own route registry already
has `"web.requests.detail": { path: "/dashboard/requests/:id", nav: "nav-web-request-detail" }`
- a parameterized route it currently has no way to express as a pure NavBlock without a
free-form `act()`. Shipping string-only now would force every parameterized route to stay
a regular Block (defeating the purpose) until a follow-up change added the function form -
better to get the shape right once. This was an open question raised with Dan and not yet
answered when this proposal was written; flagged here as the assumption made, reviewable
before implementation starts.

**`NavBlock extends Block`, not a parallel type.**
Same reasoning `ComposedBlock` already established for `composeBlock`: it must drop into
`defineFlow([...])`, `connect()`, `composeBlock()` untouched, with zero special-casing
anywhere that already accepts a `Block`. A parallel, structurally different type would
require touching every one of those call sites; extending `Block` costs nothing there.

**The primary signal is a TypeScript `@deprecated` warning, not a CLI command.**
Dan's own framing: "we don't explicitly block the users to follow our conventions... we
should have a warning in TypeScript on this." A CLI command only fires if someone
remembers to run it - useless against an author (human or an autonomous agent) who never
does. Re-declaring `goto`/`reload`/`goBack`/`goForward` under `@deprecated` on the `page`
type regular Blocks receive gets the warning for free, in every TypeScript-aware editor,
at the exact moment the mistake is made, with no new tooling: not an ESLint rule, not a
language-service plugin, just a type declaration. It costs nothing at build time either -
deprecation is not a type error, so `tsc --noEmit` and every existing Block (including
ones that already call `page.goto`) keep passing/running exactly as before. Rejected:
narrowing regular Blocks' `page` type by simply omitting `goto` etc. (an `Omit<Page, ...>`
with no deprecation) - that would be a hard type error on any existing call, which
directly contradicts "don't block users" and would break the frozen `zsign-all` reference
Blocks Dan has said never to edit.

**`check` is a warning, never a build failure - and it's secondary, not primary.**
Kept for what an editor can't do: sweep an entire project in one shot (CI, a one-off audit)
and catch an autonomous agent's generated Block file before anyone ever opens it in an
editor. Existing `zsign-all` reference Blocks deliberately mix nav+action (Dan: never edit
those) - a hard failure would make `check` unusable on the one codebase it would find the
most real examples in. Non-blocking also means it's safe to run against every existing
consumer today with zero risk of breaking CI that doesn't call it.

**Detection is text-scoped to the Block's own file, not a transitive import graph.**
Matches the already-proven `print-nav.mjs` technique (regex over one file's source) rather
than inventing an AST/import-following analysis for the first cut. Real blind spot (a
shared helper hides the `page.goto`) accepted below rather than solved - solving it well
needs real examples of the failure mode first, same "recipe before promotion" principle
already used elsewhere in this codebase (see `flow-run-tab-options`'s popup-capture
decision).

## Risks / Trade-offs

- [`@deprecated` only surfaces in a TypeScript-aware editor/language server - a plain
  `tsc` CLI build emits no diagnostic for it, and an author working in a non-TS-aware
  editor, or an autonomous agent writing files without any language server attached, sees
  nothing at all] -> Accepted; this is exactly the gap `waygraph check` covers, which is
  why it stays in this change as a secondary mechanism rather than being dropped once the
  deprecation warning exists.
- [Text-scan detection misses navigation hidden behind a shared helper import] -> Accepted
  for this cut; documented as a known limitation in the spec, not silently glossed over.
  Revisit only if this blind spot causes a real missed case in practice - don't build
  import-graph analysis speculatively.
- [A NavBlock's mem-dependent `url` function could itself throw, or read a key that isn't
  set] -> Same failure mode as any other Block reading `mem.get()` on an unset key today
  (fails loudly, per `waygraph-core`'s existing "reading an unset key fails loudly"
  requirement) - no new behavior needed, just inherited.
- [`check` warnings could be noisy on a codebase that never adopts the nav/action split
  (e.g. `zsign-all`'s frozen reference Blocks)] -> Intentional and accepted: it's an
  opt-in, separately-invoked command precisely so a project that hasn't adopted the
  convention isn't forced to see (or fix) anything until it chooses to run `check`.
- [Scope creep toward phases 2/3 mid-implementation] -> Mitigated by this design doc
  explicitly listing them as Non-Goals; a future change proposal covers each when it's
  actually being built.
