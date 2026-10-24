# engine-flow-definition Specification

## Purpose
Provides one declarative way to compose a sequence of Blocks into a runnable flow, `map()`, so a flow reads as its own
shape (a chain of steps, each checked for its Block's kind) instead of hand-nested `connect()` calls.

## Requirements

### Requirement: A flow is built with `map()`, one step at a time
Defining a flow SHALL be `engine.map(settings?).start()`, then one step per Block (`.gotoPage(navOrPage)`,
`.method(methodEffectOrApi)`, `.assert(assertBlock)`, `.gotoExternal(nav)`, `.flow(subFlow)`, `.branch({...})`), then
`.end()`, which SHALL produce a runnable Flow without the caller nesting `connect()` calls. There SHALL be no other
way to build a flow (the list form `defineFlow([start, ..., end])` was removed in 0.16.0).

#### Scenario: A single-step flow is definable
- **WHEN** a flow is defined as `engine.map().start().gotoPage(NavHomeBlock).end()`
- **THEN** the result SHALL be a Flow that plays that one Block and resolves to its Checkpoint

#### Scenario: A multi-step flow composes in order
- **WHEN** a flow is defined as `map().start().gotoPage(A).method(B).assert(C).end()` where each step starts where the
  one before it lands
- **THEN** the result SHALL be a Flow that plays A, B, C in order and resolves to C's Checkpoint

#### Scenario: A step of the wrong kind is refused
- **WHEN** an assert Block is passed to `.method()` (or a Method Block to `.gotoPage()`)
- **THEN** building the flow SHALL throw a `WG_MAP_WRONG_KIND` error naming the Block

### Requirement: Flow definition is typechecked on Checkpoint adjacency
Each step SHALL only compile when the Block can start from the Checkpoint the previous step lands on, identically to
how `connect()` enforces this for two Blocks.

#### Scenario: A broken adjacency fails to compile
- **WHEN** a step's Block starts from a Checkpoint the previous step cannot land on
- **THEN** defining that flow SHALL be a compile-time type error, not a runtime failure

### Requirement: A defined flow is run against a browser context and shared memory
A Flow SHALL expose a way to run it against a given browser context and MemPage, returning
the flow's terminal Checkpoint.

#### Scenario: Running a flow returns its terminal Checkpoint
- **WHEN** a defined Flow is run against a real browser context and a MemPage
- **THEN** it SHALL return the Checkpoint the flow's last Block resolved to

### Requirement: Run accepts an optional additive options argument
`Flow.run` and `runGraph` SHALL accept a trailing, optional options argument for driving an
already-open page and/or controlling whether the run's page closes on finish. This SHALL be
additive only - every pre-existing call signature SHALL continue to compile and behave
identically with no options given. Full behavior: `flow-run-tab-options` capability.

#### Scenario: No options still behaves exactly as before
- **WHEN** a Flow is run as `flow.run(context, mem)` with no trailing options
- **THEN** it SHALL open and close its own page exactly as it did before this capability
  existed
