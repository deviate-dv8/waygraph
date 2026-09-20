# waygraph-blind-pilot Specification

## Purpose
Gives an agent driving a detached `AutoSession` two primitives it does not otherwise have:
acting on a live page before any Block covers that action (`click`/`type`/`goto`), and
picking up a Block newly written to disk mid-session (`reload`) - so it can build a project's
Block library incrementally, starting from zero, instead of only ever driving an
already-complete one. Does not generate Block file content, resolve a plain-language ask, or
decide when to ask the human a clarifying question - all of that remains the driving agent's
own responsibility.

## Requirements

### Requirement: Raw interaction primitives work on a session with zero or partial Blocks
A running session SHALL support `click`, `type`, and `goto` operations against its own live
page, regardless of whether any Block currently covers the resulting action. Each SHALL
re-run the session's existing Checkpoint-detection logic afterward and return a fresh
snapshot, the same way running a Block via `send` already does.

#### Scenario: Clicking an element on a page with zero Blocks succeeds and returns a snapshot
- **WHEN** `click` is sent to a session whose project has no `.block.ts` files at all
- **THEN** the click SHALL be performed against the session's real live page, and the
  response SHALL include a snapshot (with `here: null`, since no Block exists yet to
  recognize the resulting page)

#### Scenario: A raw action on a page a newly-written NavBlock now recognizes updates `here`
- **WHEN** `goto`/`click`/`type` lands the page somewhere a Block written earlier in the same
  session (and already picked up via `reload`) can now recognize
- **THEN** the returned snapshot's `here` SHALL reflect that Checkpoint, using the same
  detection logic `send`/`status` already use - no separate detection path

#### Scenario: A raw action naming a selector that matches nothing fails loud, not silently
- **WHEN** `click`/`type` is sent with a selector that matches no element on the live page
- **THEN** the response SHALL report failure naming the selector, not silently succeed or
  hang

### Requirement: Live library reload picks up newly-written Blocks without restarting the session
A running session SHALL support a `reload` operation that re-discovers the project's Block
library and graph from disk (the same discovery `AutoSession.start()` itself performs) and
replaces the session's in-memory library/graph, while leaving the session's live page,
browser context, mem, and current Checkpoint (`here`) untouched.

#### Scenario: A Block written to disk after the session started becomes pickable after reload
- **WHEN** a new `.block.ts` file is added to the project directory after a session has
  already started, and `reload` is then sent to that session
- **THEN** a subsequent `status`/`send` against that session SHALL be able to see and run
  that Block, without the session's browser having restarted or its `here`/mem having reset

#### Scenario: Reload does not disturb the session's existing state
- **WHEN** `reload` is sent to a session that already has navigation/mem state (e.g. mid-way
  through a login flow)
- **THEN** the session's live page URL, mem contents, and current Checkpoint SHALL be
  unchanged immediately after `reload` returns

### Requirement: This capability generates no Block file content
Nothing in this capability SHALL produce `.block.ts`, `*Sel`, or mem-key file text on the
caller's behalf. Authoring a Block from what was observed via the raw primitives above SHALL
remain entirely the responsibility of whichever agent is driving the session - matching
`waygraph-pilot`'s own established precedent of leaving all reasoning to the external agent
rather than building an internal decision-maker.

#### Scenario: No exported function returns Block source text
- **WHEN** this capability's public surface (`AutoSession`'s new methods, the new IPC ops,
  the new CLI sub-verbs) is inspected
- **THEN** none of it SHALL take an observed action/pattern and return `.block.ts` source
  text or write such a file itself

### Requirement: Proof is scoped to an in-repo synthetic fixture, not a real external site
This capability's own proof SHALL demonstrate, end to end: a session started against a
project with zero Blocks, cold exploration via `dom`/`click`/`type`/`goto`, a real Block
hand-authored to disk (by the test, standing in for the driving agent), that Block becoming
driveable via `reload` followed by `send`, and the session's browser never having restarted
across the whole sequence - against an in-repo synthetic fixture, not a real external
consumer application, matching `waygraph-pilot`'s and Phase 4/5's own established precedent
for the identical tension.

#### Scenario: Status reporting does not conflate in-repo proof with a real-consumer claim
- **WHEN** this capability is reported as implemented and proven
- **THEN** the report SHALL state plainly that proof is in-repo only, and that Waygraph Map,
  Waygraph Router, and any real external-site proof remain separate, later, unscoped work
