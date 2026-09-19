# waygraph-copilot Specification

## Purpose
Compiles a project's Block graph into a client-safe manifest and ports enough of
`locate()`/`findBlockPath` to run inside a real end user's own browser tab (no Playwright,
no filesystem) so a plain-language ask can be resolved to a real Checkpoint and narrated -
highlighted on the user's real page - without executing arbitrary Block code client-side.
Agentic execution (actually performing the action for the user) is explicitly out of scope
for this capability; see design.md's Non-Goals.

## Requirements

### Requirement: The compiled manifest is plain JSON, never executable code
The manifest a project compiles for client-side use SHALL be plain, JSON-serializable data -
no function bodies, no `eval`-able strings - so it can be shipped to and loaded in an
untrusted end-user browser context without granting it the ability to run arbitrary code
sourced from the compiling project.

#### Scenario: The manifest survives a JSON round-trip unchanged
- **WHEN** a compiled manifest is serialized with `JSON.stringify` and parsed back with
  `JSON.parse`
- **THEN** the result SHALL be deep-equal to the original manifest, with no data loss

### Requirement: A Block's `verify`/`resolve` is captured as data only when built from the built-in Trait factories
The manifest compiler SHALL capture a data-only representation of a Block's `resolve`
Checkpoint and `verify` Traits only when every Trait involved was constructed via one of the
built-in factories (`Trait.url`, `Trait.text`, `Trait.visible`, `Trait.frameVisible`,
`Trait.frameText`, `Trait.frameContains`) - each of which is reconstructable from its own
plain construction arguments (a selector string, a `URLPatternInit`, an expected string).
Any other shape (a bespoke `{ name, check(page, mem) {...} }` Trait, or a `verify` that is a
function of the resolved Checkpoint) SHALL cause that Block to be recorded in the manifest
with `recognizable: false`, never partially captured or silently guessed.

#### Scenario: A Block using only built-in Trait factories is fully recognizable
- **WHEN** a Block's `verify` array contains only `Trait.url`/`Trait.text`/`Trait.visible`/
  `Trait.frameVisible`/`Trait.frameText`/`Trait.frameContains` calls
- **THEN** the manifest SHALL record `recognizable: true` for that Block, with enough data to
  reconstruct each check without needing that Block's own source file at check time

#### Scenario: A Block using a bespoke Trait is marked unrecognizable, not silently dropped
- **WHEN** a Block's `verify` array contains a hand-written `{ name, check(page, mem) {...} }`
  Trait (e.g. a mem-aware existence check)
- **THEN** the manifest SHALL still list that Block (name, description, edges) but SHALL mark
  it `recognizable: false`, and client-side `locate()`/`findBlockPath` SHALL exclude it from
  any path that requires confirming arrival there

### Requirement: Client-side `locate()` runs without Playwright, Node, or filesystem access
The client-side port of `locate()` SHALL determine which Checkpoint the current real page
matches using only the compiled manifest and native browser APIs (`document.querySelector`,
`URLPattern` or equivalent, `getBoundingClientRect`, etc.) - no import of `@playwright/test`,
no `node:fs`/`node:path`, no dynamic `import()` of a `.block.ts` file.

#### Scenario: Client-side locate matches the same Checkpoint the server-side one would
- **WHEN** a real page matches a `recognizable: true` Block's reconstructed check
- **THEN** the client-side `locate()` SHALL report that Block's Checkpoint, the same result
  `engine.ts`'s own `locate()` would report given the same page and the original Block

### Requirement: A plain-language ask resolves to a Checkpoint via each Block's required `description`
Given a free-text ask, the resolver SHALL match it against the `description` field of every
edge reachable from the current Checkpoint (per the manifest) and return the best-matching
target Checkpoint (and the Block/edge that reaches it) - using only data every Block already
must supply today (`description` is a required field on the relevant `defineBlock`-family
options), not a new field authors must add.

#### Scenario: An ask matching one Block's description resolves to its edge
- **WHEN** an ask closely matches exactly one reachable edge's `description`
- **THEN** the resolver SHALL return that edge (and its target Checkpoint) as the top match

#### Scenario: No confident match is a real "I don't know", not a wrong guess
- **WHEN** no reachable edge's `description` is a reasonable match for the ask
- **THEN** the resolver SHALL report no confident match rather than returning the
  best-of-a-bad-set edge as if it were reliable

### Requirement: Narrate mode highlights the real control without acting on the user's behalf
Once an edge is resolved, narrate mode SHALL render the same kind of ring/highlight overlay
`waygraph demo` already renders (reusing that Block's own `stubBefore`/`WaygraphHighlight`
data, computed via the same pure, page-independent `runStubPhase` logic already used
server-side) against the user's real, live page - and SHALL NOT click, fill, or navigate
anything itself. Narrate mode is the default and only delivery mode this capability ships;
agentic execution is a distinct, unimplemented capability (see design.md).

#### Scenario: Narrate mode points at the real element, takes no action
- **WHEN** narrate mode runs for a resolved edge whose Block has `stubBefore`/highlight data
- **THEN** the real target element SHALL be visibly highlighted on the user's real page, and
  no click/fill/navigation SHALL occur as a result

### Requirement: Proof is scoped to an in-repo example, not a real external consumer app
This capability's own proof SHALL demonstrate one real plain-language ask resolving to a
real highlighted control, end to end, against an in-repo example (`examples/saucedemo` or
`templates/scaffold`) - not a real external consumer application. This SHALL be stated
explicitly wherever this capability's status is reported, distinct from `ROADMAP.md`'s
original `1.0.0` criterion ("demoable on one real consumer"), which this capability alone
does not satisfy.

#### Scenario: Status reporting does not conflate in-repo proof with the 1.0.0 criterion
- **WHEN** this capability is reported as implemented and proven
- **THEN** the report SHALL state plainly that proof is in-repo only, and that the original
  `1.0.0` "real consumer" criterion remains a separate, later, unmet step
