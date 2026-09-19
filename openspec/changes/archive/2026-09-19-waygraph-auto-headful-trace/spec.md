# waygraph-auto-headful-trace Specification

## Purpose
Lets a `waygraph-auto` session run with a real visible browser while remaining fully
agent-drivable through the existing session protocol, and lets an agent (or a human watching)
retrieve a structured, Checkpoint/Block-level record of what the session actually did -
without recording raw browser actions, so a later authoring step can turn the record into
real Blocks by convention rather than by replaying a click-for-click transcript.

## Requirements

### Requirement: A detached session can launch with a visible browser
`waygraph auto --cli --detach --non-headless` SHALL launch the session with `headless: false`
instead of the default `headless: true`, reusing the existing `--non-headless` flag semantics
`run`/`demo` already establish for "show the browser." The session SHALL remain fully
drivable through `send`/`status`/`attach`/`dom` exactly as when headless.

#### Scenario: --non-headless reaches the real browser launch
- **WHEN** a session is detached with `--non-headless`
- **THEN** the browser it launches SHALL be non-headless
- **THEN** every existing session op (`send`, `status`, `attach`, `dom`) SHALL work against it
  identically to a headless session

#### Scenario: Default detach behavior is unchanged
- **WHEN** a session is detached without `--non-headless`
- **THEN** it SHALL launch headless, exactly as before this change

### Requirement: This is additive to the session RPC surface, not a new picker
This capability SHALL NOT introduce a new picker UI and SHALL NOT change the existing
page-embedded headful panel (`headfulPick`, used by bare `waygraph auto` without `--cli`) in
any way. A visible-browser session from this change is driven only through the same
`send`/`status`/`attach`/`dom` ops Phases 1-2 already specify.

#### Scenario: The existing headful panel is untouched
- **WHEN** `waygraph auto` is invoked without `--cli` (the pre-existing page-embedded panel)
- **THEN** it SHALL behave exactly as it did before this change

### Requirement: A session accumulates a structured, Checkpoint/Block-level trace
Every `applyPick` call that attempts to run a Block SHALL append one trace step to the
session's history, recording at minimum: the Block's name, the Checkpoint before the attempt,
the Checkpoint after (when it succeeded) or the failure message (when it did not), and a
timestamp. When the Block authors `stubBefore`/`stubAfter`/`stubOnError`, the step SHALL also
carry that phase's resolved demo-narration fixtures (highlights/todos/device state, via the
same `runStubPhase` mechanism `waygraph demo`'s own lifecycle logging already uses) - omitted
when the Block has none, or the resolved result carries no content. The trace SHALL NOT
record raw browser actions (clicks, fills, navigations) - only the Block-level sequence and
its own authored narration metadata, matching the resolution the rest of this engine already
reasons about.

#### Scenario: A successful pick appends a trace step
- **WHEN** `send` runs a Block that resolves successfully
- **THEN** the trace SHALL gain one new step naming that Block, its before/after Checkpoints,
  and a timestamp

#### Scenario: A step with authored stub fixtures carries them
- **WHEN** `send` runs a Block that authors `stubBefore` and/or `stubAfter` with actual
  content (highlights, todos, or device state)
- **THEN** the trace step SHALL include that resolved fixture data

#### Scenario: A step with no authored stubs carries none
- **WHEN** `send` runs a Block that authors no `stubBefore`/`stubAfter`/`stubOnError`
- **THEN** the trace step SHALL NOT include empty stub-fixture fields

#### Scenario: A failed pick still appends a trace step
- **WHEN** `send` runs a Block that throws
- **THEN** the trace SHALL gain one new step naming that Block, the Checkpoint before the
  attempt, and the failure message - not silently omitted

#### Scenario: An invalid or quit pick does not append a Block-run trace step
- **WHEN** `send` is called with an out-of-range pick, or with `q`/`quit`
- **THEN** the trace SHALL NOT gain a step, since no Block was attempted

### Requirement: The trace is retrievable through the session protocol
`waygraph auto trace <sessionId>` SHALL return the session's full accumulated trace as JSON,
in the order the steps occurred. Retrieving the trace SHALL NOT run a Block, mutate `mem`, or
navigate the page - the same read-only guarantee `status` and `dom` already give.

#### Scenario: Trace reflects the real order of a real run
- **WHEN** a session runs several Blocks in sequence and `trace` is then requested
- **THEN** the returned steps SHALL appear in the same order those Blocks actually ran

### Requirement: Consuming the trace to author Blocks is out of scope
This capability SHALL only capture and expose the trace. It SHALL NOT generate, suggest, or
write any Block file from a trace - that is separate, later work.

#### Scenario: No Block files are produced by this capability
- **WHEN** a trace is retrieved via `auto trace`
- **THEN** no file under the target project's `src/blocks/` (or equivalent) SHALL be created
  or modified as a side effect of that retrieval
