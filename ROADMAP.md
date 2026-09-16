# Waygraph roadmap

Not yet v1.0.0 - breaking changes between minor versions are expected and acceptable
until then. This file is the durable, git-tracked record of where the project is headed;
`openspec/changes/<name>/` holds the actual planning artifacts (proposal/spec/design/tasks)
for anything listed here as "Spec'd."

## Modules

The package is one published unit today, organized internally along these lines:

| Module | Where | What it owns |
|---|---|---|
| `waygraph-core` | `src/types.ts`, `src/mem-page.ts`, `src/trait.ts` | Checkpoint, Block, MemPage, Trait, `connect()`. Stable - untouched this whole cycle. |
| `waygraph-engine` | `src/engine.ts` | `Engine`, `defineFlow`, `runGraph`, `chainFlow`, `composeBlock`, browser launching. Currently the one module hardcoded to vanilla `@playwright/test` - see v0.6.0. |
| `waygraph-cli` | `src/cli.ts` (non-`chain --step` commands) | `list` / `nav` / `validate` / `run` / `chain`. |
| `waygraph-demo` | `src/cli.ts` (`chain --step` overlay) | The step-through browser overlay: panel, ring, cursor, `narrate()`, episode headings. Grew large enough this cycle to be its own module in practice. |
| `waygraph-auto` | `src/graph.ts`, `locate()` in `src/engine.ts`, `waygraph auto` CLI | State-machine discovery (`discoverGraph` / `toMermaid`) + page recognition (`locate`). |

Whether these become physically separate npm packages, or stay one package with clearer
internal boundaries, is an open decision - not committed to either way yet.

## Milestones

| Version | Theme | Status |
|---|---|---|
| 0.4.0 | `chainFlow`, `withSessionReset`/`withTitle`, episode-aware step overlay | Shipped |
| 0.5.0 | `NavBlock` + `ActionPage` + `waygraph check` + pluggable browser provider | **Implemented, committed locally** (current) - holding for go-ahead to publish |
| 0.6.0 | `locate()` page recognition + split `requires` | `locate()` + `waygraph auto` graph discovery **shipped** (see `waygraph-auto` module). Split `requires` still roadmap. |
| 0.7.0 | Federated pool of waygraphs | Roadmap only (autonomous-mode phase 3) |
| 0.7.2 | `precondition` + tip polish | Shipped |
| 0.7.3 | (staged on npm, never went live - E409) | Skipped - do not pin |
| 0.7.4 | `waygraph demo` + run flags; NavBlock click demo cursor | **This release** (not 1.0.0) |
| 1.0.0 | Stability declaration | Hold for Dan go-ahead once auto is used for real on consumers |

### 0.5.0 - NavBlock + ActionPage + waygraph check + pluggable browser provider

Separates "navigate to a URL" from "act on the current page" as a structural,
engine-enforced distinction - the foundation the later autonomous-mode phases need to
reason over the Block library reliably (a page can't be reliably fingerprinted by a Block
that might also be doing something else). Enforcement is soft: a passive TypeScript
`@deprecated` warning on regular Blocks' `page.goto`/`reload`/`goBack`/`goForward`
(primary), plus `waygraph check` as a whole-project sweep (secondary, for contexts with no
editor watching).

Also folded in: `EngineConfig.browsers` - "waygraph is just an opinionated Playwright," so
the engine's three hardcoded `chromium`/`firefox`/`webkit` launch sites now accept an
override, letting a consumer plug in `playwright-extra` or a stealth-patched launcher
(same `.launch()` shape, drops in unmodified). Requested alongside NavBlock in the same
go-ahead ("pia project really want this"), so built together rather than waiting for a
separate 0.6.0. Puppeteer support is explicitly out of scope - different `Page`/
`BrowserContext` shape entirely.

**Implemented and verified** (9 new tests, full suite 105/105) at
`openspec/changes/nav-block-and-check/` - see that change's `tasks.md` for the full
verification record, including a real finding: `zsign-atomic-waygraph`'s own existing nav
blocks (still plain `defineBlock`) get flagged by `check` too, since it looks for the
runtime `defineNavBlock` marker, not file-naming convention. Committed locally
(`affe227`); not yet pushed or published to npm - holding for explicit go-ahead.

### 0.6.0 - locate() + split requires (autonomous-mode phase 2)

**Shipped (graph + locate half):** `discoverGraph` / `toMermaid` / `waygraph auto`
CLI and `locate(page, library)` reverse-match NavBlocks by their own `verify`
Traits. See `src/graph.ts`, `tests/graph/`, `tests/nav/locate.spec.ts`.

**Still open:** split a MemKey's `requires` into externally-supplied
(credentials/config) vs producedBy-another-Block so a failed `preflight()` can
suggest a recovery path.

### 0.7.0 - Federated pool of waygraphs (autonomous-mode phase 3)

Multiple site-specific waygraph packages loaded together, each publishing its own Block
library, with package-scoped namespacing so `locate()`/planning can run across sites
without name collisions. Scoped to owned/cooperating sites, not arbitrary third parties -
two real risks make that scoping deliberate, not just cautious: DOM/selector rot at
community scale (no one owns a third party's markup, unlike your own product) and
ToS/access risk on platforms that restrict automation. Neither is an engine problem to
solve; both are reasons this stays scoped.

**Not yet spec'd** beyond the paragraph in `openspec/changes/nav-block-and-check/design.md`'s
Roadmap section.

### 1.0.0 - Stability declaration

No fixed feature list. Marks the point breaking changes stop being casual - not scheduled
until 0.5.0-0.7.0 have shipped and been used for real (not just spec'd).
