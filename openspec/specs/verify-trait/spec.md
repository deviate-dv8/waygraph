# verify-trait Specification

## Purpose
Gives a Block a way to confirm the expected page state was actually reached after its
Checkpoint was decided, without that confirmation being able to influence the decision -
closing the gap that previously pushed assertions into the evidence-gathering step.

## Requirements

### Requirement: A Trait is a named, independently-reportable check
A Trait SHALL carry a name and a check that inspects the page and/or shared memory and
resolves to whether the check passed, so a failure can be reported by that specific name
rather than as an anonymous assertion failure.

#### Scenario: A failing check is reported by its own name
- **WHEN** a Trait's check resolves to false during a run
- **THEN** the run SHALL fail with an error that includes that Trait's name

### Requirement: verify runs after resolve, never before
A Block's verify Traits SHALL run only after that Block's Checkpoint has already been
decided by resolve, and SHALL have no way to change which Checkpoint was decided.

#### Scenario: verify cannot redirect the flow
- **WHEN** a Block declares verify Traits alongside a Block that also has resolve
- **THEN** the Checkpoint the flow proceeds with SHALL be exactly what resolve returned,
  regardless of what verify's Traits report

### Requirement: A Block with no verify Traits behaves exactly as before
A Block MAY omit verify entirely. Omitting it SHALL NOT change any other behavior of that
Block.

#### Scenario: A Block without verify still resolves normally
- **WHEN** a Block declares no verify Traits
- **THEN** running that Block SHALL proceed to its next step exactly as it would have
  before verify existed
