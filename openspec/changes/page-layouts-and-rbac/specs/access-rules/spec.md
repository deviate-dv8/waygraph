## ADDED Requirements

### Requirement: `for` says who is given a link, an action or a page
A layout link, a layout action, a Page Block and a Method Block SHALL accept `for: [Account, ...]`, naming the project's
accounts (`account(...)`). Without `for`, every account SHALL be given it. A page's `for` SHALL mean the accounts that
can open it; a link's or an action's, the accounts that see it.

#### Scenario: A link only some roles see
- **WHEN** `Sidebar.go.equipment` has `for: [PlantManager, PlanningOfficer]`
- **THEN** the manifest SHALL list those two accounts for that link, and Leadership SHALL NOT be given it

### Requirement: Access tests come from `for`
`waygraph test --flows` SHALL add, for each account that `for` anywhere names (and for each account, when the project
has any `for`), an access test that signs in as the account and:
- on a page each layout covers that the account can open, checks the layout shows exactly the links and actions given to
  the account: none missing, none extra;
- for each page the account can't open, checks that opening it doesn't land on it.

These tests SHALL be tagged `@access` (and with the account's name), so `--grep @access` or a label runs them alone.

#### Scenario: A missing link fails, naming it
- **WHEN** PlantManager is given `Sidebar.go.equipment` but the sidebar it sees has no equipment link
- **THEN** the access test for PlantManager SHALL fail, saying the sidebar is missing `equipment` for PlantManager

#### Scenario: An extra link fails, naming it
- **WHEN** Leadership isn't given `Sidebar.go.equipment` but its sidebar shows it
- **THEN** the access test for Leadership SHALL fail, saying the sidebar shows `equipment`, which Leadership isn't given

#### Scenario: A page it can't open
- **WHEN** a Page Block has `for: [Leadership]` and the access test runs as PlantManager
- **THEN** opening that page as PlantManager SHALL NOT land on it, or the test fails saying PlantManager opened a page
  only Leadership is given

### Requirement: `waygraph check` catches a flow using what its account isn't given
`waygraph check` SHALL report each flow `map({ as: X })` with a step that uses a layout link or action, a Method, or a
page whose `for` doesn't include X, naming the flow, the step and the account.

#### Scenario: A flow as the wrong role
- **WHEN** `engine.map({ as: Leadership }).gotoPage(Sidebar.go.equipment)` and the link is for PlantManager only
- **THEN** `waygraph check` SHALL warn: the flow uses `sidebar → equipment`, which Leadership isn't given

### Requirement: One account's view in Waygraph Studio
Waygraph Studio's map SHALL let a person pick an account and then show only what that account is given: the pages it can
open, the layout links and the Methods it sees. A page's panel SHALL say which accounts can open it.

#### Scenario: Leadership's map
- **WHEN** a person picks Leadership on the map
- **THEN** the map SHALL leave out the pages, links and Methods Leadership isn't given, and say how many it left out
