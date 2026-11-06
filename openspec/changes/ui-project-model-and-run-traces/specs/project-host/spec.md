## ADDED Requirements

### Requirement: One long-lived process holds a project
waygraph SHALL provide an internal command, `waygraph host <project>`, that scans the project once and keeps its manifest
in memory. It SHALL answer requests over its standard input and output as newline-delimited JSON: `manifest` (the current
manifest, or the error that stopped the last scan with the last good manifest), `runs` (summaries of the run log),
`trace <runId>` (one run's span records), and `subscribe` (a stream of updates until the client closes it). It SHALL exit
when its input closes, so the process that started it can't leave it behind.

#### Scenario: The manifest is read once, not per request
- **WHEN** a client asks for `manifest` twice with no file changed in between
- **THEN** the project SHALL be scanned once, and both replies SHALL carry the same manifest

#### Scenario: The host stops with its client
- **WHEN** the process that started `waygraph host` exits
- **THEN** the host SHALL exit too

### Requirement: The host rescans when the project changes
The host SHALL watch the project's `src/`, `config/` and the files a scan reads (the waygraph config, `package.json`).
After a change, waiting until no change has arrived for 300 ms, it SHALL rescan in a new process, so that a module
imported by a Block (a `_sel.ts`, a `_states.ts`) is read fresh as well. A successful rescan SHALL replace the manifest and
notify subscribers. A failed rescan SHALL keep the last good manifest, notify subscribers with the error and the file it
names, and SHALL NOT stop the host.

#### Scenario: A changed selector file is seen through the Blocks that import it
- **WHEN** a project's `_sel.ts` changes a selector that a Method's `verify` uses, and no Block file changes
- **THEN** the next manifest SHALL show the new selector on that Method

#### Scenario: A broken file doesn't take the map away
- **WHEN** a Block file is saved with a syntax error
- **THEN** subscribers SHALL get the error naming the file, and `manifest` SHALL still return the last good manifest

### Requirement: The host streams runs as they're written
For `subscribe`, the host SHALL watch the run log folder and send each new span record of every run as it is written,
tagged with its run id, plus a `runs` update when a run starts or ends. A record SHALL arrive within 500 ms of being
written.

#### Scenario: A run started from a terminal shows up live
- **WHEN** a UI is subscribed and `waygraph run loginFlow` is started from a terminal in the same project
- **THEN** the UI SHALL receive the run's `span:start` records while it plays

### Requirement: Waygraph UI reads the project through the host
`waygraph ui` SHALL start a host for the project and the UI SHALL read the manifest, runs and traces through it. The UI
SHALL NOT spawn `waygraph manifest` or re-read the run log folder per request.

#### Scenario: An edit appears without a refresh
- **WHEN** the UI's map is open and a Block's description is edited and saved
- **THEN** the map SHALL show the new description without the user reloading the page
