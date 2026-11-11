## ADDED Requirements

### Requirement: A run's page is a timeline
A run's page in Waygraph Studio SHALL show its trace as a timeline: one row per span, indented by depth, steps expanded and
phases and checks collapsed by default, each row a bar on a time axis shared by the whole run and coloured by status
(passed, failed, skipped, running). A failed span and its ancestors SHALL be expanded when the page opens.

#### Scenario: A failed check is visible on opening
- **WHEN** a run failed in step 6's verify
- **THEN** the run page SHALL open with step 6, its verify phase and the failed check expanded, and the check selected

### Requirement: Selecting a span shows its details
Selecting a span SHALL open its details in the right-hand panel: for a step, the Block (name, kind, description, source
position) and where it went (from, to); for a check, what it wanted and saw, its tries, and its selector or element; and
for any span, its events (console, page errors, requests, navigations, dialogs, screenshots) in time order, and the page's
read when the span has one.

#### Scenario: Requests made by a step
- **WHEN** the user selects a step whose act made two fetch requests
- **THEN** the panel SHALL list both with method, URL, status and duration

### Requirement: Runs update live
While a run is being written, the UI SHALL add its spans as they arrive from the host, through server-sent events, without
reloading the page. The runs list SHALL show a new run when it starts, wherever it was started from. The UI SHALL NOT poll
by reloading the page every second.

#### Scenario: Watching a run started in a terminal
- **WHEN** the runs list is open and a run is started from a terminal
- **THEN** the run SHALL appear in the list as running, and its page SHALL fill in step by step

### Requirement: Blocks link to their checks and source
On the map, a flow and a run, a Block SHALL show its checks (verify and precondition Traits, its expectations) and its
selectors from the manifest, and its source position as `file:line`, copyable, with a link that opens it in the editor
when the config names one (`ui.editor: "vscode" | "cursor" | "idea"`).

#### Scenario: From a failed check to the code
- **WHEN** the user selects a failed check in a run
- **THEN** the panel SHALL show the Block's `file:line`, and with `ui.editor: "vscode"` a link that opens that line in VS Code

### Requirement: Old run logs still list
Runs recorded before traces SHALL still appear in the runs list, marked as recorded without a trace, and open on the old
step list.

#### Scenario: A legacy run
- **WHEN** the run log folder holds a run written by 0.16.15
- **THEN** it SHALL be listed and openable, with its steps and its failure as before
