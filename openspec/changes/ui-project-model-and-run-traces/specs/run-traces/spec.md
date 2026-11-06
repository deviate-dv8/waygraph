## ADDED Requirements

### Requirement: A run is a tree of spans
Every run SHALL be recorded as spans following OpenTelemetry's span model: each span has a `traceId` (the run), a
`spanId`, a `parentSpanId` (absent on the run span), a `name`, a `kind`, a start and end time, a status (`ok`, `error`,
`skipped`) and attributes. The kinds SHALL be: `run`; `flow` (each flow in a chain); `step` (each Block played; a
fast-forward step contains its inner steps); `phase` (each of a step's `precondition`, `act`, `resolve`, `verify`,
`expect`, `read`); and `check` (each Trait or read check). The run log SHALL write `span:start` when a span opens and
`span:end` when it closes, so a reader can follow a run live, and `span:event` for something that happened inside a span.

#### Scenario: A step's phases are its children
- **WHEN** a Method step runs with a precondition, an act, a two-Trait verify and one expectation
- **THEN** its step span SHALL have `phase` children for precondition, act, resolve, verify and expect, in that order; the
  verify phase SHALL have two `check` children and the expect phase one

#### Scenario: The trace can be followed while the run plays
- **WHEN** a run is on its third step
- **THEN** the run log SHALL already hold `span:start` for the run, its flow and its first three steps, and `span:end` for
  the first two

### Requirement: Every check is recorded, passed ones too
Each `check` span SHALL carry the Trait's name, what it wanted, what it saw last, its selector or the element it named
(`at`), how many times it was tried, and its status. A check that passed SHALL be recorded the same way as one that failed.

#### Scenario: A passing check shows what it saw
- **WHEN** `Trait.text(".title", "Products")` passes on the second try
- **THEN** its check span SHALL have status `ok`, `wants: "Products"`, `saw: "Products"` and `tries: 2`

### Requirement: What the page does is attached to the step that caused it
While a run plays, the run log SHALL record as `span:event`s on the innermost open span: console messages of level
warning and error (with the source location the browser reports), uncaught page errors, dialogs, top-frame navigations,
and requests that are XHR or fetch, or that failed or returned 4xx / 5xx. Each request SHALL record method, URL, status
and duration, never its body. Screenshots SHALL be recorded as events with their file path: on a failed step always, and
on every step with `--screenshots`.

#### Scenario: A console error belongs to the step that triggered it
- **WHEN** clicking the submit button in step 4 makes the page log `console.error("Invalid token")`
- **THEN** that console event SHALL be on step 4's `act` phase, not on the run

#### Scenario: Request bodies are never recorded
- **WHEN** a step's act posts a login form
- **THEN** the request event SHALL record `POST`, the URL, the status and the duration, and no body

### Requirement: Spans link to the source
A step span SHALL carry the Block's name, kind and source position as `code.filepath` and `code.lineno`, and the flow
step's own source position. A check span SHALL carry the Trait's name and the Block whose verify or expectation it is.

#### Scenario: A failed check leads to its definition
- **WHEN** a check in `submit-login`'s verify fails
- **THEN** its step span SHALL carry the file and line where `SubmitLoginBlock` is defined

### Requirement: Secrets are not written
A Mem key declared secret (`keys("auth")<{ password: Secret<string> }>()`, or listed in the config's `secretKeys`) SHALL be
written as `"***"` wherever its value would appear in a trace (the run's mem, a read, a check's `saw`).

#### Scenario: A password stays out of the log
- **WHEN** a flow is seeded with a secret key `auth.password`
- **THEN** the run span's mem SHALL show `auth.password: "***"`

### Requirement: One API for traces
The package SHALL export `onTrace(listener)`, called with each span record in this process, returning the unsubscribe
function. `onRunEvent` and the `run:*` / `step:*` events SHALL be removed. `--replay <runId>` SHALL seed mem from the run's
recorded mem. The live session's `subscribe` feed SHALL stream span records, and `SESSION_PROTOCOL_VERSION` SHALL increase.

#### Scenario: Replay reads the trace
- **WHEN** `waygraph run loginFlow --replay <runId>` names a run recorded as a trace
- **THEN** mem SHALL be seeded with the values that run was seeded with (secret keys excepted, which must be supplied again)

### Requirement: Traces can be read and exported
`waygraph trace <runId>` SHALL print the run as an indented tree with status and duration per span. With `--otlp <file>`
it SHALL write the trace as OTLP/JSON (`resourceSpans`) that an OpenTelemetry viewer can import.

#### Scenario: Export to an OpenTelemetry viewer
- **WHEN** `waygraph trace <runId> --otlp trace.json` runs
- **THEN** `trace.json` SHALL be valid OTLP/JSON with one span per recorded span and the same parent links
