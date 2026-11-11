## ADDED Requirements

### Requirement: A page is one object
`definePage` SHALL accept `checkpoint`, `read`, `expects` and `do`. `read` SHALL be called after a step lands on the page and its
result recorded with the step; field types SHALL be inferred from it. `expects` and `do` SHALL be functions of the page, called
after it exists, so entries need no per-entry laziness. A field of `read` SHALL be usable as a Trait (`.is`, `.passes`).

#### Scenario: A modal is a field
- **WHEN** a page's `read` returns `modalOpen` and its `expects` has `modalShown: page.read.modalOpen.is(true)`
- **THEN** `.method(Open, { expect: [Page.expects.modalShown] })` SHALL pass once the modal shows (retried like `verify`) and TypeScript SHALL reject a field that isn't returned

### Requirement: The address comes from the folder; params are typed
A page's address SHALL come from its place under `src/map/` (`[id]` for a path param). `Page.go(params)` SHALL navigate to it;
`params` and `query` SHALL be typed. A query SHALL be state of the page (a read field, set by `setQuery`), not a Checkpoint;
arrival SHALL verify the path and any query given.

#### Scenario: A tab in the URL
- **WHEN** `RequestDetail.go({ id: 5, tab: "history" })` plays
- **THEN** it SHALL open `/requests/5?tab=history` and verify the page's `tab` reads `history`

### Requirement: Interrupts
A layout SHALL accept `interrupts: { name: { when, do } }`. When `when` shows on a covered page during a step, `do` SHALL run
and the step SHALL retry; each firing SHALL be recorded in the run log and shown in a demo.

#### Scenario: A cookie banner
- **WHEN** a banner appears between steps and blocks a click
- **THEN** the interrupt SHALL dismiss it, the click SHALL retry, and the run log SHALL record "cookieBanner fired"

### Requirement: A Method has no `instruction` wrapper
`defineMethod` SHALL take `act`, `verify`, `precondition` and an optional `lands` directly. Migration from every removed form SHALL be by a
codemod; one way to write each thing remains.
