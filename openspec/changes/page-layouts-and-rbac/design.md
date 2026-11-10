## Context

- **A page today.** A Page Block (`definePageBlock`, `engine/block/kinds/page.ts`) is a page's hub: its `nav`, its
  `methods` (`Page.do.x`, lazy thunks so a page and its methods can import each other), its `expects`, and a `screenshot`
  option. A Read Block (`defineReadBlock`) reads one or more Checkpoints (`from`), or every page (`from: "*"`).
- **Navs.** A Nav is valid from the Checkpoints in its `from`, or from anywhere when it has none. `map()` type-checks a
  flow's steps against each Block's `from`/`to` Checkpoint types, so a flow can't skip between pages.
- **Folders.** `src/map/` mirrors the app's addresses, with route groups (`(app_base)`) and `_`-folders for parts of a
  page that aren't addresses (`_methods/`, `_expects/`). The site map (each page under the page or folder its address
  hangs from) is built in Waygraph UI (`ui/app/services/site_map.ts`) from the manifest's `pageUrls`.
- **Accounts.** `account(name, { signIn, mem, ttl })` in `src/accounts/`; flows run `map({ as })`. waygraph loads
  `src/accounts/` for runs, demos and tests (`loadAccounts`).
- **Flow tests.** `cli/flow-tests/register.ts` registers one Playwright test per exported flow, tagged with its labels.
- **Checks.** `analysis/practices-check.ts` and `analysis/check.ts` read Blocks and flows statically (ts-morph) and from
  the scan.
- **The old name.** `defineLayout` existed until 0.16.11 as a shared list of expectations; the deprecated page maps it to
  Expect Blocks.

## Goals / Non-Goals

**Goals:**
- The UI on many pages is declared once, where front-end developers would look for it: a layout file in the folder of
  the pages it wraps.
- No new Block kind and no lists of pages to keep in step: coverage comes from folders.
- Breadcrumbs covered on every page by one declaration.
- Who sees what is declared beside what it's about, and tested without writing a test.
- The map gets simpler, not busier.

**Non-Goals:**
- Layouts that change by device (a sidebar that becomes a burger menu): needs selectors per device (ROADMAP).
- Disabled-but-visible links and buttons (`disabledFor`): visible or not, for now.
- Roles as their own concept: accounts are the people; a role is the accounts that share a `for`.
- An app's own permission model (server-side checks, API 403s): the access tests check what the UI shows and opens.

## Decisions

### D1. A layout is a hub, not a Block kind
`defineLayout({ name, go, do, read, on? })` returns a hub like a Page Block's: `Layout.go.<name>` are Nav Blocks,
`Layout.do.<name>` Method Blocks (thunks, as `methods` are), `Layout.read` a Read Block. Every step is still one of the
six kinds; the manifest, run log and demo need no new step kind.
- *Alternative:* a `layout` Block kind. Rejected: it would act like a Nav sometimes and a Method other times, and every
  surface would need to learn it.

### D2. Coverage comes from the folder, read when layouts load
A layout covers the Checkpoints of the Page and Nav Blocks in its folder and below. The engine can't know a file's
folder from a value, so coverage is filled in when layouts load: `loadLayouts(projectDir)` (beside `loadReadBlocks`
and `loadAccounts`, run by `run`, `demo`, `test` and the sessions) imports each `_layout.block.ts` and reads the
`checkpoint:` of the Page and Nav Blocks under its folder from their source (ts-morph, as the manifest reads selectors),
then sets each link Nav's `from`. `on` replaces the folder's pages. The manifest's scan does the same.
- *Alternative:* list pages in the layout (`on` always). Rejected as the default: it's the list this change removes;
  kept as the override.

### D3. A layout link type-checks as "from any page"; coverage is checked when it runs
TypeScript can't see folders, so `Layout.go.x` is typed `from: "*"` (any page) and `to: <its Checkpoint>`. Its
precondition checks, before clicking, that the page the flow is on is one the layout covers, and fails naming the
layout and the page otherwise; `waygraph check` reports the same statically from the manifest. Typing it from the folder
would need generated types, a new build step for every project.

### D4. Breadcrumbs: `to: "parent"` resolved from the site map
The site map's tree (each page's parent by address) moves from the UI to `manifest/site-map.ts`, so the engine's scan and
the UI share it. A link with `to: "parent"` is resolved per page when layouts load: one Nav per covered page that has a
parent, all named `Layout.go.up` (a step names the link; the page it starts on picks which). The breadcrumb check is a
Trait built from the same tree: `Crumbs.trail(sel, { by: "name" | "url" })` reads the crumbs and compares them with the
page's ancestors.
- *Alternative:* author each breadcrumb link. Rejected: it's pia's one-off Method, multiplied.

### D5. `for` names accounts; access tests are generated per account
`for: [PlantManager]` takes `account(...)` values, so a typo is a type error and the access tests know how to sign in.
`register.ts` adds, after the flows, one test per account (`access › <account>`, tagged `@access @<account>`): sign in
as it (its `signIn`, or its kept session), visit one page each layout covers that the account can open, read the
layout's links and actions as shown (by their selectors' visibility) and compare them with what `for` gives the account;
then try each page the account can't open by its Nav and expect not to land on it.
- *Alternative:* a role type (`role("planner")`) separate from accounts. Rejected for now: no project has needed a role
  that isn't one account's; a `for` list is already the role.

### D6. The map draws layouts, and can show one account's view
The manifest gains `layouts` (name, file, covered pages, links with destination/`parent`/selector/`for`, actions, Read
fields) and `for` on Blocks and pages. Waygraph UI draws a layout as one node, with its links' lines to their
destinations, and marks each covered page with the layout's icon; edges from link Navs aren't drawn page by page. An
account picker filters pages, links and Methods by `for`.

### D7. Reusing `defineLayout`
The name matches what front-end developers know. The deprecated page's 0.16.11 row changes to say the name now means
this (and what the old use became); no codemod is needed, since nothing old compiles against the new shape.

## Risks / Trade-offs

- **Coverage from source misses a dynamic `checkpoint:`** (computed, imported indirectly) → `waygraph check` warns about
  a page Block in a layout folder whose Checkpoint it can't read; `on` is the escape.
- **Access tests depend on accounts that can sign in** → an account without a working `signIn` is skipped, saying why,
  like a flow missing data.
- **"Exactly these links" breaks on a link nobody declared** (a new menu item) → that's the point; the failure names the
  extra link, and declaring it (with or without `for`) is the fix.
- **`to: "parent"` makes several Navs share one name** → the step and run log name the link (`sidebar › up`) and the page
  it started on, so a failure is still one place.
- **One more name to learn** → mitigated by matching front-end frameworks; the convention skill says when a page's thing
  belongs in the page and when in a layout.

## Migration Plan

Additive. Projects without `_layout.block.ts` or `for` behave as today. pia (outside this repo) moves its sidebar Navs
and its breadcrumb Method into layouts as a follow-up; saucedemo's burger menu (logout, all items, reset) becomes
`(app_base)/_layout.block.ts` in this change.

## Open Questions

- Should a layout's `do` be offered to `waygraph auto` and Pilot on every covered page? (Proposed: yes; they are Methods.)
- Should the access tests also call the app's API as each account? (Proposed: no; UI only, per the non-goals.)
