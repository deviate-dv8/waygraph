## 1. Site map in the shared layer

- [ ] 1.1 Move the site map's tree (sites, folders, each page under its parent by address) from
      `ui/app/services/site_map.ts` to `manifest/site-map.ts`; the UI imports it from the package; tests move with it
- [ ] 1.2 `parentOf(checkpoint)` and `ancestorsOf(checkpoint)` on the tree

## 2. Layouts

- [ ] 2.1 `engine/block/kinds/layout.ts`: `defineLayout({ name, go, do, read, on? })` returning a hub: `go.<name>` Nav
      Blocks (click, verify landing on `to`), `do.<name>` Method thunks, `read` a Read Block; links typed `from: "*"`
- [ ] 2.2 A link's precondition: the current page is one the layout covers; the failure names the layout and the page
- [ ] 2.3 `manifest/layouts.ts`: `loadLayouts(projectDir)`: import each `_layout.block.ts`, read the `checkpoint:` of the
      Page and Nav Blocks under its folder (ts-morph), fill coverage (or `on`), set each link's `from`; run by `run`,
      `demo`, `test` and the sessions beside `loadReadBlocks` / `loadAccounts`
- [ ] 2.4 `to: "parent"`: one Nav per covered page with a parent, resolved from the site map, all as `go.<name>`
- [ ] 2.5 The layout's Read reads on every covered page (its `from` set from coverage)
- [ ] 2.6 `Trait` for breadcrumbs: the crumbs shown against the page's ancestors, by name or address
- [ ] 2.7 Export `defineLayout` and its types from `src/index.ts`; API snapshot
- [ ] 2.8 Tests: coverage by folder, nesting, `on`, a link from an uncovered page fails before acting, `parent` on a
      three-level tree, the breadcrumb check passing and failing (naming the missing crumb)

## 3. Access (`for`)

- [ ] 3.1 `for?: Account[]` on layout links and actions, `definePageBlock` and `defineMethodBlock`
- [ ] 3.2 `cli/flow-tests/register.ts`: one access test per account (`access › <account>`, `@access @<account>`): the
      layouts' links and actions shown match what `for` gives it; pages it can't open don't open; an account that
      can't sign in is skipped, saying why
- [ ] 3.3 `analysis/`: a flow `map({ as: X })` using a link, action, Method or page X isn't given; and a page Block in
      a layout folder whose Checkpoint can't be read statically
- [ ] 3.4 Tests: access passes; a missing link and an extra link each fail naming it; a forbidden page that opens fails;
      the check rule on a fixture

## 4. Manifest, map and Waygraph UI

- [ ] 4.1 Manifest: `layouts` (name, file, covered pages, links with destination / `parent` / selector / `for`, actions,
      Read fields); `for` on Blocks and pages
- [ ] 4.2 Map: a layout as one node with a line per destination, a mark on each covered page; link Navs not drawn page
      by page; the legend explains both
- [ ] 4.3 A layout's panel (links, actions, Read, pages, who sees each); a page's panel lists its layouts and who can
      open it
- [ ] 4.4 An account picker on the map: only what that account is given, and how much was left out
- [ ] 4.5 UI tests; look at it light and dark

## 5. Examples, docs and skills

- [ ] 5.1 saucedemo: the burger menu (all items, logout, reset app state) as `(app_base)/_layout.block.ts`, its flows
      using `Menu.go.*` / `Menu.do.*`; the quickstart synced
- [ ] 5.2 The scaffold: a root layout with its top bar, so a new project starts with the shape
- [ ] 5.3 Docs: a Layouts guide page (coverage, nesting, `on`, breadcrumbs, what belongs in a page vs a layout), `for`
      and access tests in the accounts and testing guides, the manifest reference, the deprecated page's
      `defineLayout` row
- [ ] 5.4 Convention skill and planner agent: a piece of UI on many pages is a layout; who sees it is `for`; never a
      list of pages on each Nav
- [ ] 5.5 ROADMAP; full verify (tsc, build, structure, knip, unit, Playwright, saucedemo, ui)
