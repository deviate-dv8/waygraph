# waygraph-auto-cli-session-control Specification

## Purpose
Lets a non-interactive caller (an agent, a script) drive a `waygraph auto --cli` explore
session step by step over a request/response protocol, instead of blind-piping a whole
pre-guessed sequence of answers into one blocking `readline` loop, so it can inspect state
between picks and recover from an unexpected prompt instead of failing blind.

## Requirements

### Requirement: `--detach` starts a session as a background process and returns immediately
`waygraph auto --cli --detach` SHALL start the same explore session `runAutoExplore` already
runs in the foreground (graph/library build, mem seeding, browser/context/page launch) as a
detached background process, SHALL NOT block the invoking process waiting for any pick, and
SHALL print the new session's identity (at minimum a session id and a socket path) as JSON to
stdout before exiting.

#### Scenario: Detaching returns before any pick is made
- **WHEN** `waygraph auto --cli --detach` is invoked against a project
- **THEN** the invoking process SHALL print a JSON object containing a session id and exit
  with status 0 without waiting for a menu pick

#### Scenario: The detached process keeps the browser session alive
- **WHEN** a session has been started with `--detach`
- **THEN** its browser context and page SHALL remain open and usable by later `send`/`status`
  calls after the invoking CLI process that started it has already exited

### Requirement: `send` advances a session by exactly one pick and returns JSON state
`waygraph auto send <sessionId> "<pick>"` SHALL accept a pick value using the identical
parsing rules the existing interactive `cliPick` already applies (a menu index or `q`/`quit`),
SHALL NOT require a TTY, SHALL run at most one Block per invocation, and SHALL print the
resulting state (current Checkpoint, the next available menu, and the last-run note) as a
single JSON object to stdout rather than free-text console lines.

#### Scenario: A valid pick runs exactly one Block
- **WHEN** `send` is called with a pick number that is in range for the session's current menu
- **THEN** exactly one Block SHALL run against the session's live page and `mem`
- **THEN** the printed JSON SHALL reflect the Checkpoint and menu that result from that run

#### Scenario: An invalid pick is rejected without advancing the session
- **WHEN** `send` is called with a pick that is out of range, non-numeric, or not `q`/`quit`
- **THEN** no Block SHALL run and the session's state SHALL be unchanged
- **THEN** the response SHALL indicate the error rather than silently reinterpreting the input

#### Scenario: Sending quit ends the session
- **WHEN** `send` is called with `q` or `quit`
- **THEN** the session SHALL follow the same quit path the interactive loop's `q` already
  takes (closing its browser context), and its socket and metadata SHALL be removed afterward

### Requirement: `status` reads session state without side effects
`waygraph auto status <sessionId>` SHALL return the same state shape `send` returns, and
SHALL NOT run a Block, mutate `mem`, or navigate the page.

#### Scenario: Repeated status calls are idempotent
- **WHEN** `status` is called twice in a row with no intervening `send`
- **THEN** both calls SHALL return identical state

### Requirement: `attach` reopens the interactive loop against a running session
`waygraph auto attach <sessionId>` SHALL present the same menu rendering and input parsing
the foreground `--cli` loop already uses, driving the session purely through the same
`status`/`send` operations available to any other caller - it SHALL NOT require the detached
session to expose any behavior beyond what `send`/`status` already provide.

#### Scenario: Attaching, picking, and detaching again leaves the session running
- **WHEN** an operator attaches to a running session, makes one pick, and then disconnects
  (without sending `q`)
- **THEN** the session SHALL remain running and reachable by a later `send`/`status`/`attach`

### Requirement: Foreground `--cli` behavior is unchanged
`waygraph auto --cli` invoked without `--detach` SHALL behave identically to its current
behavior - the same prompts, the same blocking interactive loop, no session id or socket
created.

#### Scenario: Existing non-detached usage is unaffected
- **WHEN** `waygraph auto --cli` is invoked without `--detach`, as in any existing script or
  doc example
- **THEN** it SHALL run exactly as before this capability existed

### Requirement: Headful mode is unaffected
This capability SHALL apply only to the `--cli` picker. `waygraph auto` invoked without
`--cli` (the headful browser-panel picker) SHALL NOT change behavior in any way.

#### Scenario: Headful auto is untouched
- **WHEN** `waygraph auto` is invoked without `--cli`
- **THEN** it SHALL behave exactly as it did before this capability existed, with no session
  id, socket, or new commands involved

### Requirement: Session identity is scoped and cleaned up on quit
A detached session's on-disk identity (metadata and socket) SHALL live under a per-project
`.waygraph-auto/` directory, and SHALL be removed when the session ends via the `q`/`quit`
operation, so a session that has quit SHALL NOT be mistaken for one still running.

#### Scenario: A quit session's identity is gone
- **WHEN** a session has been sent `q`/`quit` and has finished shutting down
- **THEN** its metadata file and socket SHALL no longer exist under `.waygraph-auto/`

#### Scenario: A stale or unreachable session is reported, not hung
- **WHEN** `send`, `status`, or `attach` is called with a session id whose socket is missing
  or unreachable (e.g. the process crashed without cleaning up)
- **THEN** the caller SHALL receive a clear error within a bounded time, rather than hanging
  indefinitely
