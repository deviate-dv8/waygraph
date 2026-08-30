## Context

New package, no existing code to interoperate with. See proposal.md - Why for the
motivation (replacing zsign-app's ad hoc E2E helpers). This design covers only the spine:
`Checkpoint`, `MemPage`, `Instruction`/`Block`, `connect()`, and `runGraph()`. Branching,
assertions, background overlay handling, loop safety, and second-tab support are separate
future changes that build on this one - see proposal.md - What Changes for that sequence.

## Goals / Non-Goals

**Goals:**
- A Block's output type is the only thing the next Block can rely on - no untyped data
  threaded through hand-rolled helper functions.
- `resolve` is structurally incapable of touching the browser or shared memory, so it is
  unit-testable in isolation and cannot become a second place classification logic hides.
- The engine, not any individual Block, owns opening and closing the browser tab.

**Non-Goals:**
- Branching (`Out` as a union of Checkpoints) - this change only supports a single output
  tag per Block. `connect()` requires an exact tag match, not a union member match.
- Any loop-safety mechanism - not needed until branching makes self-loops possible.
- Assertions beyond what `resolve` needs to classify - no `verify`, no Trait primitive yet.
- Anything to do with a second tab, overlays, or popups.

## Decisions

**`Checkpoint<Tag>` is a phantom type with zero data fields, not a data-carrying state
object.** Considered: letting Checkpoint carry a data payload (e.g.
`{ __state: "Authed", orgId: string }`). Rejected because it gives control-flow matching
(`connect()`) and data-threading (shared memory) two different homes for the same concern,
which is exactly the ambiguity that made the old helper functions hard to reason about. One
rule instead of two: Checkpoints are markers, `MemPage` is data, always.

**`Instruction` splits browser-driving (`act`) from evidence-gathering (`observe`) from
classification (`resolve`), and `resolve` receives no `page` or `mem` parameter at all.**
Considered: one function that both acts and decides the output Checkpoint. Rejected because
a function that both commands the browser and perceives its own effect on that browser
conflates two different jobs, and because `resolve`'s output needs to be reproducible from
its input alone to be trustworthy and unit-testable. The purity is enforced by what is
simply absent from `resolve`'s parameter list - not a lint rule, a lint rule can be
bypassed, a missing parameter cannot.

**`MemPage` keys are class instances (`MemKey<T>`), and the store is keyed by object
identity, not by a string name.** Considered: a plain string-keyed object or `Map<string,
unknown>`. Rejected because two unrelated modules can accidentally choose the same string
key name; identity-based keys make that impossible regardless of what debug name two keys
happen to share, and the phantom `T` on `MemKey<T>` gives `get`/`set` real inferred types
instead of `any`.

**Reading an unset `MemPage` key throws immediately, naming the key, instead of returning
`undefined`.** Considered: returning `undefined` and letting the caller handle it, matching
plain `Map` semantics. Rejected because a silently-undefined value threaded further into a
Block's logic turns into a confusing failure far from its actual cause; throwing at the
exact read site keeps the failure attributable to the Block that misused it.

**`runGraph()` creates the page and closes it in a `finally`, and returns the terminal
Checkpoint as its result rather than `void`.** Considered: a fixed, single `"__end__"` tag
with the run returning nothing. Rejected because collapsing every terminal outcome to one
flat tag throws away exactly the information a caller needs (which terminal state was
actually reached), forcing a separate side-channel to recover it. Returning the terminal
Checkpoint directly needs no additional mechanism.

## Risks / Trade-offs

- [No branching support yet] → Acceptable for this change: a real flow with multiple
  outcomes (e.g. login succeeding vs. failing) cannot yet be expressed. This is intentional
  scope-narrowing, not an oversight; the next change adds `branch()` for exactly this.
- [No loop-safety cap] → Acceptable because nothing in this change can express a cycle:
  `connect()` requires exact tag equality between two fixed Blocks, so there is no
  mechanism yet for a Block to route back to itself.
- [Single package, not yet integrated into zsign-app/main/e2e] → Intentional: proving the
  engine against a real flow happens before wiring it into the actual CI-running suite, so
  a design mistake here never risks the suite developers currently depend on.

## Open Questions

(none - the scope above is deliberately narrow enough that nothing here should need to
change once branching, traits, guardrails, and spawnTab land in later changes)
