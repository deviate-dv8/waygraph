## ADDED Requirements

### Requirement: A layout covers the pages under its folder
A `_layout.block.ts` in a `src/map/` folder SHALL export one layout (`defineLayout({ name, ... })`). The layout SHALL
cover every page (Checkpoint) whose Page Block or Nav lives in that folder or a folder under it. A page under several
layouts SHALL be covered by each, outermost first. A layout MAY name its pages with `on: [Checkpoint, ...]` instead; then
its folder SHALL NOT add any.

#### Scenario: Pages under the folder are covered
- **WHEN** `src/map/(app_base)/platform/_layout.block.ts` defines `Sidebar`, and the Equipment Registry page lives in
  `src/map/(app_base)/platform/plant/equipment/`
- **THEN** the Equipment Registry page SHALL be covered by `Sidebar`, and the login page in
  `src/map/(app_base)/auth/login/` SHALL NOT be

#### Scenario: Nested layouts stack
- **WHEN** `platform/_layout.block.ts` defines `Sidebar` and `platform/plant/_layout.block.ts` defines `PlantTabs`
- **THEN** a page in `platform/plant/lines/` SHALL be covered by `Sidebar` and then `PlantTabs`

#### Scenario: An app whose layout doesn't follow its addresses
- **WHEN** a layout sets `on: [Dashboard, Reports]`
- **THEN** it SHALL cover exactly those two pages, wherever its file is

### Requirement: A layout's links are Navs valid on every page it covers
A layout's `go` SHALL map each link name to `{ to, click, for? }`. `Layout.go.<name>` SHALL be a Nav Block that clicks
`click` and lands on `to`, valid from every page the layout covers and from no other. A flow SHALL use it like any Nav
(`gotoPage(Sidebar.go.equipment)`).

#### Scenario: A sidebar link from any covered page
- **WHEN** a flow is on the Production Plan page (covered by `Sidebar`) and steps `gotoPage(Sidebar.go.equipment)`
- **THEN** the step SHALL click the link's selector and verify it landed on the Equipment Registry page

#### Scenario: A link from a page the layout doesn't cover
- **WHEN** a flow on the login page (not covered) steps `gotoPage(Sidebar.go.equipment)`
- **THEN** the flow SHALL fail to type-check or, built dynamically, fail before acting, saying the sidebar isn't on the
  login page

### Requirement: A layout's actions and what it shows
A layout's `do` SHALL map names to Method Blocks valid on every page it covers (`Layout.do.<name>`). A layout's `read`
SHALL be a Read Block for every page it covers, and its keys SHALL be read after every step that lands on one.

#### Scenario: Sign out from the user menu on any page
- **WHEN** `TopBar.do.signOut` is a Method and a flow on any covered page steps `.method(TopBar.do.signOut)`
- **THEN** the step SHALL run, and its route SHALL start on the page the flow is on

#### Scenario: What the sidebar shows is read on every covered page
- **WHEN** `Sidebar.read` reads `sidebar.links` and a step lands on a covered page
- **THEN** that step's read SHALL include `sidebar.links`, and `SidebarShows.links.is([...])` SHALL work as a check there

### Requirement: Breadcrumbs follow the site map
A layout link MAY set `to: "parent"`: it SHALL lead to the covered page's parent in the site map (the nearest page above
it by address), so one declaration covers every page under the layout. A layout's Read MAY expose its trail; waygraph
SHALL offer a check (`Trait.breadcrumbs(sel)`) that the trail's links lead to the page's ancestors in the site map, in
order, by their addresses.

#### Scenario: Up one level from any page
- **WHEN** `Crumbs.go.up` has `to: "parent"` and a flow on `/platform/plant/equipment/new` steps `gotoPage(Crumbs.go.up)`
- **THEN** the step SHALL land on the page at `/platform/plant/equipment`

#### Scenario: The trail matches the map
- **WHEN** a flow lands on `/platform/plant/equipment/new` and its breadcrumbs link to `/platform`, `/platform/plant`
  (when that's a page) and `/platform/plant/equipment`
- **THEN** the breadcrumb check SHALL pass; a trail without `/platform/plant/equipment` SHALL fail it, saying that
  crumb is missing

### Requirement: Layouts in the manifest, the map and Waygraph Studio
The manifest SHALL list each layout: its name, file, the pages it covers, its links (name, destination or `parent`,
selector, `for`), actions and Read fields. The map SHALL draw a layout as one node with one line per link destination
and mark each page it covers, instead of a line from every covered page. Waygraph Studio SHALL show a layout's links,
actions, Read and pages when it is clicked, and a page's panel SHALL list the layouts covering it.

#### Scenario: Ten links on thirty pages
- **WHEN** a sidebar with ten links covers thirty pages
- **THEN** the map SHALL show one sidebar node with ten lines, not three hundred, and each of the thirty pages SHALL
  carry the sidebar's mark
