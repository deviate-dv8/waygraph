## Purpose

Lets a Block's output route to different next Blocks depending on which tag was actually
reached, including routing back to itself, bounded by a safety cap so a routing bug can't
hang a run forever.

## ADDED Requirements

### Requirement: branch() routes are exhaustive over the Block's output tags
Attaching routes to a Block SHALL require a route for every possible tag of that Block's
output, and SHALL fail to compile if any tag is missing a route.

#### Scenario: A missing route fails to compile
- **WHEN** routes are attached to a Block whose output can be one of several tags, and one
  of those tags has no route
- **THEN** attaching the routes SHALL be a compile-time type error

### Requirement: The engine follows routing to completion
Running a graph SHALL, after a Block resolves, follow that Block's routing (if any) to the
next Block and continue running, stopping only once a Block with no further routing is
reached.

#### Scenario: A run follows a route to a different Block
- **WHEN** a Block's resolved tag has a route to a different Block
- **THEN** the engine SHALL run that next Block afterward, in the same run

#### Scenario: A route may point back to the routing Block itself
- **WHEN** a Block's resolved tag routes back to that same Block
- **THEN** the engine SHALL run that Block again, using its own resolved Checkpoint as the
  next input

### Requirement: A run is bounded and fails loud if the bound is exceeded
Running a graph SHALL stop with a named error once a configured maximum number of steps is
exceeded, rather than running indefinitely.

#### Scenario: An unintended infinite loop is caught
- **WHEN** a graph's routing never reaches a Block with no further routing, within the
  configured step limit
- **THEN** the run SHALL fail with an error naming the step limit, rather than hanging
