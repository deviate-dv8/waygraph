# waygraph-pilot Specification

## Purpose
Bootstraps an agent's access to a real, persistent, driveable Playwright session in one call
- the session itself (via the existing `auto --cli --detach` mechanism) plus the whole
project's Block graph (via the existing `waygraph graph` mechanism) - so an agent can plan
and execute a multi-step, natural-language goal by driving the session itself through the
already-existing `auto send/status/dom/trace` surface. Does not itself resolve a
plain-language ask to a Block, narrate anything, or act on anything - that reasoning belongs
to whatever agent holds the session.

## Requirements

### Requirement: `pilotStart` combines a real session and the whole project graph in one call
Given an `AutoSessionInit`, `pilotStart` SHALL start a detached session using the same
mechanism `auto --cli --detach` uses, and SHALL read back the whole project's Block graph
using the same mechanism `waygraph graph` uses, returning both plus the session's identity
and its starting snapshot in a single result.

#### Scenario: The returned graph is the whole project, not just what's reachable now
- **WHEN** `pilotStart` is called against a project whose current position only reaches a
  small subset of its Checkpoints
- **THEN** the returned `graph` SHALL include every Checkpoint and edge in the project, not
  only the ones reachable from the session's starting position

#### Scenario: The returned session is real and already running
- **WHEN** `pilotStart` returns
- **THEN** its `sessionId` SHALL identify a real, already-listening detached session, such
  that `auto status <sessionId>` (or the equivalent `requestSession` call) against it
  succeeds immediately without the caller starting anything further

### Requirement: `pilotStart` does not resolve, narrate, or act on anything itself
`pilotStart` SHALL NOT score a plain-language ask against the graph, SHALL NOT render any
highlight/overlay, and SHALL NOT run (`applyPick`) any Block on the caller's behalf. Planning
which Block(s) to run, and actually running them via `auto send <sessionId> "<pick>"`, SHALL
remain entirely the responsibility of whatever agent is driving the session.

#### Scenario: The session's state is unchanged immediately after `pilotStart` returns
- **WHEN** `pilotStart` returns
- **THEN** the session's Checkpoint SHALL be exactly its natural starting position (e.g. the
  result of Phase 1's own `detectHere`) - no Block SHALL have been run as a side effect of
  bootstrapping

### Requirement: Driving the session afterward uses only pre-existing session-control commands
An agent holding a `pilotStart` result SHALL be able to drive the session to completion of a
multi-step goal using only `auto send/status/dom/trace <sessionId>` - commands that already
existed before this capability did. This capability SHALL NOT introduce any new
session-control primitive (e.g. a raw click/type/goto command, or a path-finding command
scoped to a running session) to make this possible.

#### Scenario: A real multi-step goal is reachable using only pre-existing commands
- **WHEN** an agent is given a multi-step natural-language goal (e.g. "log in and buy an
  item") against a `pilotStart` session
- **THEN** the agent SHALL be able to reach the goal's terminal Checkpoint using only
  repeated `auto send <sessionId> "<pick>"` calls, each chosen by reading the previous
  `status`/`send` response - proven end to end against real saucedemo.com before this
  capability's own code was written

### Requirement: The rejected one-ask-to-one-edge architecture is not reintroduced
A prior implementation of this capability (`resolveAsk`/`pilotNarrate`/`pilotAct`, a
deterministic text-similarity resolver mapping one plain-language ask to one graph edge,
narrating or running just that edge) was built, proven, demoed, and explicitly rejected as
not satisfying a real multi-step request. This capability SHALL NOT reintroduce that
architecture, or any other internal resolver that picks a single Block on the caller's
behalf, without a new, separate proposal explicitly re-opening that decision.

#### Scenario: No exported function scores a plain-language ask against the graph
- **WHEN** this capability's public surface (`src/pilot.ts`'s exports) is inspected
- **THEN** it SHALL contain no function that takes a free-text ask and returns a single
  resolved Block/edge

### Requirement: Proof is scoped to an in-repo example, not a real external consumer app
This capability's own proof SHALL demonstrate `pilotStart` returning a real session and the
real whole-project graph, and that session remaining alive and driveable afterward, end to
end, against an in-repo example - not a real external consumer application. This SHALL be
stated explicitly wherever this capability's status is reported, distinct from
`ROADMAP.md`'s original `1.0.0` criterion ("demoable on one real consumer"), which this
capability alone does not satisfy.

#### Scenario: Status reporting does not conflate in-repo proof with the 1.0.0 criterion
- **WHEN** this capability is reported as implemented and proven
- **THEN** the report SHALL state plainly that proof is in-repo only, and that the original
  `1.0.0` "real consumer" criterion remains a separate, later, unmet step

### Requirement: A multi-step route runs in one call, verifying real progress at every step
An agent SHALL be able to run a whole multi-step route to a target Checkpoint in one call
against an already-running session, without hand-picking each step's index separately. Each
step SHALL be verified to have actually reached the specific Checkpoint its own graph edge
promised - not merely that it ran without throwing - before the route is reported successful.

#### Scenario: A route with no setup-step requirement runs correctly in one call
- **WHEN** a target Checkpoint is reachable via one or more Blocks whose real DOM
  preconditions are already met at the session's current position
- **THEN** the whole route SHALL run in one call, and the resulting snapshot's Checkpoint
  SHALL equal the target

#### Scenario: A step that runs without error but lands elsewhere fails loud, not falsely
- **WHEN** a step in the computed route runs to completion without throwing, but its own
  `resolve()` legitimately lands on a Checkpoint other than the one that step's specific edge
  promised (e.g. a login submission staying on the login page after bad auth)
- **THEN** the whole route SHALL be reported as failed, naming the step and where it actually
  landed - not reported as successful because no exception occurred

#### Scenario: A route crossing an edge whose real precondition isn't met fails loud, not hangs
- **WHEN** the computed route includes a step whose real DOM precondition isn't met at the
  point it's attempted (a known, stated limitation of routing purely from the static graph -
  see design.md)
- **THEN** the route SHALL fail within a bounded time with a clear error naming the failed
  step, and the session SHALL remain alive and usable afterward - not hang indefinitely or
  corrupt the session's state
