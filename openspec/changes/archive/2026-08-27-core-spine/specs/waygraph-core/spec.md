## Purpose

Defines the minimum typed graph engine needed to drive a browser through a single,
non-branching, single-tab flow, so that a broken step fails exactly where it broke instead
of surfacing as an unrelated failure somewhere downstream.

## ADDED Requirements

### Requirement: Checkpoint identity is its tag alone
A Checkpoint SHALL be identified solely by its string tag. Two Checkpoint values carrying
the same tag SHALL be treated as the same state by every part of the system, and a
Checkpoint SHALL carry no data beyond that tag.

#### Scenario: Two Checkpoints with the same tag are interchangeable
- **WHEN** two different Blocks each produce a Checkpoint with the tag `"Authed"`
- **THEN** a Block requiring input tag `"Authed"` SHALL accept output from either of them

### Requirement: Block composition is typechecked on tag equality
Composing two Blocks into one SHALL only be possible when the first Block's output tag is
identical to the second Block's input tag. Composing Blocks whose tags do not match SHALL
fail to compile.

#### Scenario: Matching tags compose
- **WHEN** Block A produces output tag `"LoggedOut"` and Block B accepts input tag `"LoggedOut"`
- **THEN** composing A and B SHALL produce a single Block whose input is A's input and whose
  output is B's output

#### Scenario: Mismatched tags do not compose
- **WHEN** Block A produces output tag `"LoggedOut"` and Block C accepts input tag `"Authed"`
- **THEN** composing A and C SHALL be a compile-time type error, not a runtime failure

### Requirement: resolve produces the output Checkpoint from evidence alone
A Block's `resolve` step SHALL determine the output Checkpoint using only the evidence
passed to it. It SHALL have no access to the live browser page or to shared memory, so its
output SHALL be reproducible from the same evidence alone.

#### Scenario: resolve output depends only on its input evidence
- **WHEN** `resolve` is called twice with the same evidence value
- **THEN** it SHALL produce the same output Checkpoint both times

### Requirement: observe is optional; a Block still resolves without it
A Block MAY omit its evidence-gathering step. When omitted, the Block's `resolve` step
SHALL still run and SHALL still produce a valid output Checkpoint.

#### Scenario: A Block with no evidence-gathering step still completes
- **WHEN** a Block declares no evidence-gathering step
- **THEN** running that Block SHALL still produce an output Checkpoint without error

### Requirement: Shared memory reads are typed and fail loudly when unset
Shared memory SHALL associate each typed key with at most one value at a time, and reading
a key SHALL return a value of that key's declared type. Reading a key that has never been
written SHALL raise an error identifying that key, rather than returning an empty or
placeholder value.

#### Scenario: Reading a value after writing it returns that value
- **WHEN** a value is written to a memory key and then read back using the same key
- **THEN** the read SHALL return the exact value that was written

#### Scenario: Reading an unset key fails loudly
- **WHEN** a memory key is read before any value has been written to it
- **THEN** the system SHALL raise an error naming that key, rather than returning an empty
  or undefined value

### Requirement: The engine owns the browser tab's lifecycle
Running a graph SHALL create a browser tab before the first Block runs and SHALL close that
tab once a Checkpoint registered as terminal for that graph is reached. No individual Block
SHALL be responsible for creating or closing the tab.

#### Scenario: The tab opens before the first Block acts
- **WHEN** a graph run begins
- **THEN** a browser tab SHALL exist before the first Block's browser-driving step runs

#### Scenario: The tab closes once a terminal Checkpoint is reached
- **WHEN** a Block produces a Checkpoint registered as terminal for the running graph
- **THEN** the engine SHALL close the browser tab and SHALL stop running further Blocks

### Requirement: The terminal Checkpoint is the graph's result
Running a graph to completion SHALL return the terminal Checkpoint that ended the run,
rather than discarding it, so that which terminal tag was reached is observable by the
caller.

#### Scenario: The caller receives the terminal Checkpoint
- **WHEN** a graph run reaches a Checkpoint registered as terminal
- **THEN** the value returned to the caller SHALL be that terminal Checkpoint
