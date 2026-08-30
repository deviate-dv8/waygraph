## MODIFIED Requirements

### Requirement: The engine owns the browser tab's lifecycle
Running a graph SHALL create a browser tab before the first Block runs and SHALL close that
tab once a Checkpoint with no further routing is reached, following any routing between
Blocks in between. No individual Block SHALL be responsible for creating or closing the
tab. A caller MAY register a set of expected terminal tags; if it does, the engine SHALL
validate the reached Checkpoint against that set before treating the run as complete. If no
such set is registered, the engine SHALL treat the first Checkpoint with no further routing
as terminal without validation.

#### Scenario: The tab opens before the first Block acts
- **WHEN** a graph run begins
- **THEN** a browser tab SHALL exist before the first Block's browser-driving step runs

#### Scenario: The tab closes once a terminal Checkpoint is reached
- **WHEN** a Block produces a Checkpoint registered as terminal for the running graph
- **THEN** the engine SHALL close the browser tab and SHALL stop running further Blocks

#### Scenario: The tab closes when no terminal set was registered
- **WHEN** a graph is run without registering an expected set of terminal tags
- **THEN** the engine SHALL close the browser tab once a Checkpoint with no further routing
  is reached, without raising a "not a registered terminal" error

#### Scenario: The tab stays open across routed Blocks
- **WHEN** a Block's resolved tag routes to another Block
- **THEN** the same browser tab SHALL be used for that next Block, not a new one
