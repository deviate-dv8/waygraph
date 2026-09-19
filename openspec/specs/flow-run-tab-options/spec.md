# flow-run-tab-options Specification

## Purpose
Allows a flow to drive an already-open page and to decide whether its page survives the
run, additively - without changing any existing call's behavior. Popup capture is a
documented recipe, not an engine requirement, until a second real use case promotes it.

## Requirements

### Requirement: A run may drive an already-open page
Running a Flow or graph SHALL accept an optional `page` in a trailing options arg. When
given, the run SHALL drive that exact page instead of opening a new tab via
`context.newPage()`, and SHALL leave the number of open tabs in the context unchanged by
the run.

#### Scenario: An existing page is driven instead of a new tab opening
- **WHEN** a Flow is run as `flow.run(context, mem, { page })` where `page` is already
  open and navigated elsewhere
- **THEN** the flow SHALL act on that same `page` object and SHALL NOT create a new tab
- **THEN** after the run, `page` SHALL be pointing at wherever the flow's last Block left it

### Requirement: A run may keep its page open and hand it back
Running a Flow SHALL accept `closeOnFinish` in a trailing options arg. When given as the
literal `false`, the run SHALL leave its page open after the terminal Checkpoint and SHALL
return `{ result, page }` so the caller can keep driving that page.

#### Scenario: closeOnFinish false returns the live page
- **WHEN** a Flow is run as `flow.run(context, mem, { closeOnFinish: false })`
- **THEN** the result SHALL be `{ result, page }` where `result` is the terminal Checkpoint
  and `page` is open and usable by the caller

### Requirement: The page-aware close default preserves existing behavior
By default (no options and no borrowed page), a run SHALL close the page it opened itself,
exactly as before this change. When the caller passed their own `page`, the run SHALL NOT
close it unless `closeOnFinish` is explicitly `true`; a page the caller opened is theirs to
close.

#### Scenario: No options still closes the run's own page
- **WHEN** a Flow is run as `flow.run(context, mem)` with no options
- **THEN** the run SHALL behave identically to before, opening and then closing its own
  page, so the tab count in the context is unchanged afterward

#### Scenario: A caller-owned page survives by default
- **WHEN** a Flow is run as `flow.run(context, mem, { page })` with no `closeOnFinish`
- **THEN** the run SHALL leave `page` open after the terminal Checkpoint
- **THEN** `page.isClosed()` SHALL be `false`

#### Scenario: Explicit closeOnFinish true closes a caller-owned page
- **WHEN** a Flow is run as `flow.run(context, mem, { page, closeOnFinish: true })`
- **THEN** the run SHALL close that page after the terminal Checkpoint
- **THEN** `page.isClosed()` SHALL be `true`

### Requirement: The options surface is additive
Existing signatures SHALL continue to compile and behave identically. `runGraph`'s
positional arguments and `spawnTab(entry, page, mem)` SHALL NOT change shape; new options
SHALL arrive only as the trailing optional options object.

#### Scenario: Pre-existing calls still typecheck unchanged
- **WHEN** a Flow is run as `flow.run(context, mem)` (no options)
- **THEN** it SHALL typecheck and run unchanged, returning the plain terminal Checkpoint

### Requirement: Popup capture is documented, not engine-owned
Capturing a popup opened by a `target=_blank` click SHALL be expressible as a documented
recipe for callers (arming a context-level page event before the click), and SHALL NOT be a
promoted engine API until a second real use case requires it.

#### Scenario: A popup is captured by the caller without engine support
- **WHEN** a recipe arms a context page-event listener before a click expected to open
  exactly one `target=_blank` popup
- **THEN** the caller SHALL receive the popup's `Page` in their own handle and SHALL be able
  to close or keep it without any engine API