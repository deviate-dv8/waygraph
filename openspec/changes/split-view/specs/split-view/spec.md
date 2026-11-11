## ADDED Requirements

### Requirement: A flow declares its panes
`map({ panes })` SHALL declare a flow's panes by name. Each pane SHALL have its own browser context unless it names
another pane with `with`, in which case it SHALL be another page in that pane's context. A pane MAY say who it is (`as:
Account`) and which device it plays on (`device`). A flow without `panes` SHALL play as today, in one page.

#### Scenario: Two people, two contexts
- **WHEN** a flow declares `panes: { planner: { as: Planner }, admin: { as: Admin } }`
- **THEN** each pane SHALL be signed in as its account, and neither SHALL see the other's cookies or storage

#### Scenario: One person, two pages
- **WHEN** a flow declares `panes: { app: { as: Planner }, mail: { with: "app" } }`
- **THEN** the mail pane SHALL be a second page in the app pane's context

### Requirement: Steps act in the pane the flow names
`.in(pane)` SHALL make the steps after it act in that pane, until the next `.in()`; the first steps act in the first
pane declared. Each pane SHALL keep its own current page: TypeScript SHALL check a step against the page its pane is
on, not the page another pane is on. A Block SHALL NOT need to change to be used in a pane.

#### Scenario: Back to a pane where it left off
- **WHEN** a flow steps in `planner` to `RequestSent`, then in `admin` through two pages, then `.in("planner")`
- **THEN** the next step SHALL be checked against `RequestSent`, and SHALL act on the planner's page

### Requirement: Panes share the flow's mem; each pane's person comes back with it
Panes SHALL share one mem. Switching to a pane whose account sets data (`account({ mem })`) SHALL set that data again,
so a step in a pane reads its own person's data.

#### Scenario: What one side makes, the other reads
- **WHEN** a step in `planner` sets `Keys.request` and a later step in `admin` requires it
- **THEN** the admin's step SHALL get the planner's value

### Requirement: Playing a split flow
`waygraph run` and `waygraph test` SHALL play every pane with no stage (headless unless asked). `waygraph demo` and a
`--video` run SHALL show the panes on a stage: side by side, each labelled with its name, its account and its device,
the acting pane marked, the demo's overlay in each pane, recorded as one video. `--split windows` SHALL instead place
each pane in a real window, side by side. A failure SHALL name the pane it happened in.

#### Scenario: One video of two people
- **WHEN** `waygraph run approvalFlow --video` plays a flow with two panes
- **THEN** it SHALL save one video showing both panes side by side, whichever is acting

#### Scenario: A failure names its pane
- **WHEN** a step in `admin` fails its verify
- **THEN** the error SHALL say the step, the pane (`admin`, as Admin) and the page it was on

### Requirement: The run log and Waygraph UI show panes
Each step in the run log SHALL record its pane; the manifest SHALL list a flow's panes. Waygraph UI SHALL show a split
flow and its runs as lanes, one per pane, steps in order across them.

#### Scenario: Lanes on a run
- **WHEN** a run of a two-pane flow is opened in Waygraph UI
- **THEN** its steps SHALL show in two lanes, named for the panes, in the order they played
