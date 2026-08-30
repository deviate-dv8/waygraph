## Purpose

Provides a declarative way to compose a sequence of Blocks into a runnable flow, so a flow
reads as its own shape (a bookended list of steps) instead of hand-nested `connect()` calls.

## ADDED Requirements

### Requirement: A flow is defined as a bookended list of Blocks
Defining a flow SHALL accept a list whose first and last elements are the reserved `start`
and `end` markers, with one or more Blocks between them, and SHALL produce a runnable Flow
without requiring the caller to nest `connect()` calls themselves.

#### Scenario: A single-Block flow is definable
- **WHEN** a flow is defined as `[start, block, end]`
- **THEN** the result SHALL be a Flow whose input matches `block`'s input and whose output
  matches `block`'s output

#### Scenario: A multi-Block flow composes in order
- **WHEN** a flow is defined as `[start, blockA, blockB, blockC, end]` where each Block's
  output tag matches the next Block's input tag
- **THEN** the result SHALL be a Flow whose input matches `blockA`'s input and whose output
  matches `blockC`'s output

### Requirement: Flow definition is typechecked on tag adjacency
Defining a flow SHALL only compile when every adjacent pair of Blocks in the list has a
matching output/input tag, identically to how `connect()` already enforces this for two
Blocks.

#### Scenario: A broken adjacency fails to compile
- **WHEN** a flow is defined with two adjacent Blocks whose tags do not match
- **THEN** defining that flow SHALL be a compile-time type error, not a runtime failure

### Requirement: A defined flow is run against a browser context and shared memory
A Flow SHALL expose a way to run it against a given browser context and MemPage, returning
the flow's terminal Checkpoint.

#### Scenario: Running a flow returns its terminal Checkpoint
- **WHEN** a defined Flow is run against a real browser context and a MemPage
- **THEN** it SHALL return the Checkpoint the flow's last Block resolved to
