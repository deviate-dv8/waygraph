# waygraph-copilot Specification

## Purpose
Resolves a plain-language ask to a real, reachable Checkpoint using each Block's existing
`description`, then either narrates it (highlights the real control on a real live page) or
acts on it (runs the real Block) - built entirely on `AutoSession`'s existing, already-proven
Playwright session, not a new execution architecture.

## Requirements

### Requirement: The resolver scores an ask against reachable edges' descriptions only
Given a free-text ask and a live session's current snapshot, the resolver SHALL consider
only edges reachable from the session's current position (`currentSnapshot()`'s own
sections/edges), scoring each by similarity between the ask and that edge's `description`.
It SHALL NOT consider edges that are not currently reachable, and SHALL NOT require any
Block to supply data beyond what `description` already requires today.

#### Scenario: An ask matching one reachable edge's description resolves to it
- **WHEN** an ask closely matches exactly one currently-reachable edge's `description`
- **THEN** the resolver SHALL return that edge as the top match

#### Scenario: A well-matching but unreachable edge is never returned
- **WHEN** an edge elsewhere in the graph would match the ask well but is not reachable from
  the session's current position
- **THEN** the resolver SHALL NOT return it

#### Scenario: No confident match is reported as such, not guessed
- **WHEN** no reachable edge's `description` is a reasonable match for the ask
- **THEN** the resolver SHALL report no confident match rather than returning the
  best-of-a-bad-set edge as if it were reliable

### Requirement: Narrate mode highlights the real control without running the Block
Given a resolved edge, narrate mode SHALL render that Block's own highlight/ring overlay
(reusing its `stubBefore` data and the same rendering primitives `waygraph demo` already
uses) against the session's real, live page, and SHALL NOT call `applyPick` or otherwise run
the Block.

#### Scenario: Narrate mode changes nothing about the page's state
- **WHEN** narrate mode runs for a resolved edge
- **THEN** the real target element SHALL be visibly highlighted, and the session's current
  Checkpoint SHALL be unchanged afterward

### Requirement: Agentic mode runs the real Block via the session's existing execution path
Given a resolved edge, agentic mode SHALL run it by calling the session's own existing
`applyPick(String(edge.index))` - the same execution path Phase 1 already proved end to end
- not a separate or reimplemented execution mechanism.

#### Scenario: Agentic mode's outcome matches a manual pick of the same edge
- **WHEN** agentic mode resolves and runs an ask that maps to edge N
- **THEN** the resulting Checkpoint/trace SHALL be identical to manually picking edge N via
  the same session's existing `applyPick`

### Requirement: Every Block kind runs through its own real code, including bespoke Traits
Because this capability runs entirely inside the same Playwright session Phase 1-5 already
use (not a separate, untrusted-browser context), a Block's `verify`/`act` SHALL execute
exactly as authored - a bespoke `{ name, check(page, mem) {...} }` Trait works identically to
a built-in-factory one, with no `recognizable`-style subset restriction.

#### Scenario: A Block using a bespoke Trait works the same as one using only built-in factories
- **WHEN** a resolved edge's Block verify uses a hand-written mem-aware Trait
- **THEN** both narrate and agentic mode SHALL work for it exactly as they do for a Block
  using only `Trait.url`/`Trait.text`/`Trait.visible`/etc.

### Requirement: Proof is scoped to an in-repo example, not a real external consumer app
This capability's own proof SHALL demonstrate one real plain-language ask resolving to a
real narrated highlight and a real agentic run, end to end, against an in-repo example - not
a real external consumer application. This SHALL be stated explicitly wherever this
capability's status is reported, distinct from `ROADMAP.md`'s original `1.0.0` criterion
("demoable on one real consumer"), which this capability alone does not satisfy.

#### Scenario: Status reporting does not conflate in-repo proof with the 1.0.0 criterion
- **WHEN** this capability is reported as implemented and proven
- **THEN** the report SHALL state plainly that proof is in-repo only, and that the original
  `1.0.0` "real consumer" criterion remains a separate, later, unmet step
