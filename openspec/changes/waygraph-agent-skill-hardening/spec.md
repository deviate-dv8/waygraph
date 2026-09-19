# waygraph-agent-skill-hardening Specification

## Purpose
Closes the gap between the defect classes this roadmap found in real usage (compound
multi-action Methods, orphan Blocks, 40+ near-identical hand-written assertion Blocks with
inline selectors) and the tooling/instructions that generate Block code, so an agent
authoring new Blocks is structurally steered away from repeating them.

## Requirements

### Requirement: `defineAssertBlock` provides self-loop-only assertion sugar
`defineAssertBlock(options)` SHALL accept a `name`, a `checkpoint` tag, an optional
`waitForHeading` string, a `verify` array/function, and optional `stubBefore`/`stubAfter`/
`stubOnError`/`slides` narration fields (the same fields every other Block helper accepts),
and SHALL produce a `MethodBlock<Checkpoint<string>, Checkpoint<string>>` whose generated
`act()` waits for that heading when given (otherwise a no-op) and whose `resolve()` always
returns the given `checkpoint` tag - the caller SHALL NOT be required to hand-write
`act`/`resolve` for this shape, and SHALL NOT lose demo/highlight narration data when
converting an existing hand-written assertion Method to this helper.

#### Scenario: A minimal assert Block requires no act/resolve
- **WHEN** `defineAssertBlock({ name, checkpoint: "SomeScreen", verify: [...] })` is called
  with no `waitForHeading`
- **THEN** the resulting Block's `act()` SHALL be a no-op
- **THEN** running it SHALL resolve to `checkpoint("SomeScreen")`

#### Scenario: waitForHeading waits before verify runs
- **WHEN** `defineAssertBlock` is given a `waitForHeading` string
- **THEN** `act()` SHALL wait for a heading with that accessible name before returning

#### Scenario: The checkpoint tag is stated once, not duplicated
- **WHEN** two `defineAssertBlock` calls in the same file are copy/pasted and only the
  `checkpoint` field is edited
- **THEN** each SHALL self-loop to its own stated `checkpoint` with no separate `resolve`
  string to independently keep in sync

#### Scenario: Converting a hand-written assert Method keeps its narration fixtures
- **WHEN** a hand-written `defineMethodBlock` assertion carrying `stubBefore`/`stubAfter`/
  `stubOnError`/`slides` is rewritten as `defineAssertBlock` with those same fields passed
  through
- **THEN** the generated Block's `instruction` SHALL carry the same `stubBefore`/`stubAfter`/
  `stubOnError`/`slides` values, unchanged

### Requirement: `waygraph check` warns on an inline selector in a `verify` array
`waygraph check` SHALL scan each discovered Block file's own source text (the same
file-scoped technique its existing navigation-escape sweep already uses) for a
`Trait.visible`/`Trait.text`/`visible`/`textEquals` call whose first argument is a literal
string rather than an identifier or property access, and SHALL warn naming that file - as a
warning only, never a build failure or a changed exit code, matching the existing nav-escape
check's severity.

#### Scenario: An inline selector is flagged
- **WHEN** a Block file contains `Trait.visible("#some-id")` (a literal string argument)
- **THEN** `waygraph check` SHALL warn naming that file

#### Scenario: A `*Sel`-referencing call is not flagged
- **WHEN** a Block file contains `Trait.visible(SomeSel.thing)` (an identifier/property
  access, not a literal string)
- **THEN** `waygraph check` SHALL NOT warn about that call

#### Scenario: A non-selector Trait factory is not flagged
- **WHEN** a Block file contains `Trait.url({ pathname: "/inventory.html" })` (a URL pattern,
  not a DOM selector)
- **THEN** `waygraph check` SHALL NOT warn about that call

### Requirement: The agent skill states one-distinct-action-per-Block as a hard rule
`templates/agents/waygraph-author.agent.md` SHALL state, as an explicit rule (not merely
implied by example), that a Method/Effect Block SHALL do exactly one distinct action - a
Block that both fills form fields and submits, or that drives a multi-step sequence inside
one `act()`, violates this rule and SHALL be split into separate atomic Blocks.

#### Scenario: The rule is stated, not just demonstrated
- **WHEN** `waygraph-author.agent.md` is read
- **THEN** it SHALL contain an explicit rule against multi-action Blocks, with a concrete
  before/after example drawn from this repository's own `examples/saucedemo`

### Requirement: The agent skill self-gates on zero orphan Blocks before finishing
`templates/agents/waygraph-author.agent.md`'s own verification instructions SHALL require
running `waygraph check` and confirming zero orphan Blocks are reported, in addition to
typecheck/build, before the agent reports its work as done.

#### Scenario: The verification steps include the orphan gate
- **WHEN** `waygraph-author.agent.md`'s verification section is read
- **THEN** it SHALL instruct running `waygraph check .` and treating a nonzero orphan count
  as not-yet-done, not merely as an informational warning to ignore

### Requirement: The planner skill documents a blind-mode discovery workflow
`templates/agents/waygraph-planner.agent.md` SHALL document a workflow for planning Block
coverage when there is no frontend source available to read, using the already-shipped
`waygraph auto --cli --detach`/`send`/`status`/`dom`/`trace` tools to discover the
application's real structure instead.

#### Scenario: A blind-mode path exists
- **WHEN** `waygraph-planner.agent.md` is read
- **THEN** it SHALL describe how to plan Block coverage using only the `auto` session tools,
  without assuming access to the target application's own source code

### Requirement: This change does not touch any external consumer project
This capability SHALL modify only files within this package's own repository. It SHALL NOT
generate, edit, or otherwise touch Block files in any separate, external consumer project.

#### Scenario: Scope stays inside this repository
- **WHEN** this change is implemented
- **THEN** every file it modifies SHALL be under this repository's own tree (`src/`,
  `templates/`, `tests/`, `README.md`, `examples/saucedemo/docs/`)
