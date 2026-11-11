## Why

Waygraph models a page well: a Page Block is its page object (`nav`, `do`, `expects`, `read`), and the six Block kinds
cover forms, tables, dialogs, toasts and wizards as Methods and Read fields. What it has no place for is the UI that
lives on **many** pages: a sidebar, a top bar, breadcrumbs, a user menu, a tab strip between sibling pages, a cookie
banner. Those end up as one of three workarounds, all seen in real projects:

- **Skipped.** pia opens every page by its address (`defineNavBlock({ url })`), so its sidebar is never clicked in a
  test: a broken sidebar link passes every flow.
- **One-offs.** pia's breadcrumb is a single Method on one page (`leave-by-breadcrumb`); the breadcrumbs on the other
  pages aren't covered at all.
- **Repeated.** A Nav that clicks a sidebar link has to say every page it's valid from (`from: [...]`); ten links on
  thirty pages is ten copies of the same thirty-page list, and the map draws a line from every page to every
  destination.

Who sees what (RBAC) has no place either. pia has four roles whose sidebars and buttons differ, and nothing says which
role should see which link, so nothing checks it; roles exist only as Checkpoints (`SignedInAsPlantManager`).

Front-end frameworks solved the first half long ago: a `layout` file in a route folder wraps every page under that
folder, and nested layouts stack (Next.js `layout.tsx`, Nuxt layouts, SvelteKit `+layout`). Waygraph's `src/map/`
already mirrors the app's addresses the same way, route groups and all (`(app_base)`). A layout fits it without a new
concept a front-end developer has to learn.

## What Changes

- **Layouts.** `defineLayout` in a `_layout.block.ts` covers every page in its `src/map/` folder and the folders under
  it; nested layouts stack (the page gets each one on its path). A layout is a hub like a Page Block, not a new Block
  kind: its `go` (links: Navs valid on every page it covers), `do` (actions: Methods), `read` (what it shows) and its own
  `_sel.ts`. A flow writes `gotoPage(Sidebar.go.equipment)` like any Nav. An `on` override lists the pages for an app
  whose layout doesn't follow its addresses.
- **Breadcrumbs from the tree.** A layout link can lead to the page's parent in the site map (`to: "parent"`), so one
  declaration covers every page under it; its Read can be checked against the page's place in the map (the trail shown
  matches the folders above it).
- **Who sees what: `for`.** Layout links and actions, Page Blocks (who can open the page) and Methods (who has the
  button) take `for: [Account, ...]`, naming the project's accounts (`account(...)`); without it, everyone. From those:
  - `waygraph test --flows` adds an access test per account: every layout it sees shows exactly that account's links
    and actions, and a page it can't open doesn't open.
  - `waygraph check` reports a flow `as: X` that uses a link, action or page X isn't given.
- **Manifest, map and Waygraph Studio.** The manifest lists layouts (folder, covered pages, members, `for`) and each Block's
  and page's `for`. The map draws a layout as one node with a line per destination and marks the pages it covers,
  instead of a line from every page; a page's panel lists its layouts and who can open it; the map can show one
  account's view.
- **BREAKING (name only):** `defineLayout` was removed in 0.16.11 with another meaning (a shared list of expectations;
  an Expect Block replaced it). The name comes back for this; its row on the deprecated page says so.

## Capabilities

### New Capabilities
- `page-layouts`: layouts by folder (`_layout.block.ts`, nesting, the `on` override), their members (`go`, `do`, `read`,
  `_sel.ts`), parent links and the breadcrumb check, and how the manifest, map and Waygraph Studio show them.
- `access-rules`: `for` on layout links and actions, Page Blocks and Methods; the access tests `waygraph test --flows`
  generates per account; the `waygraph check` rule for a flow using what its account isn't given.

### Modified Capabilities
<!-- None: no main spec covers Page Blocks or accounts yet (openspec/specs/ predates them). -->

## Impact

- **Engine:** `engine/block/kinds/layout.ts` (new, beside `page.ts`), `for` on Page and Method Blocks, a parent-link
  resolver that needs the site map's tree (built from Checkpoints' addresses, today in `studio/app/services/site_map.ts`;
  moves to `manifest/` so the engine-side scan and the UI share it).
- **Scan and manifest:** `_layout.block.ts` discovery and coverage by folder; manifest fields for layouts and `for`.
- **Tests:** `cli/flow-tests/register.ts` registers the per-account access tests; `analysis/` gains the access rule.
- **UI:** map rendering of layouts, a layout's panel, the page panel's layouts and access, an account picker.
- **Docs and skills:** a Layouts guide page, the Blocks and Accounts guides, the convention skill (a piece of UI on many
  pages is a layout; who sees it is `for`), the planner agent, the deprecated page row.
- **Examples:** saucedemo's burger menu becomes a layout; pia (outside this repo) is the real case: its sidebar,
  breadcrumbs and four roles.
- **Related:** layouts that change by device (a sidebar that becomes a burger menu on a phone) need the ROADMAP's
  selectors-per-device item; not part of this change.
