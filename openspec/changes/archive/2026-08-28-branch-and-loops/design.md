## Context

See proposal.md. `connect()`, `defineFlow`, `verify`, `MemPage` are unchanged - this adds a
`next` field to `Block` and turns `runGraph`'s single pass into a bounded loop that follows it.

## Goals / Non-Goals

**Goals:** `branch()` only attaches routing to a Block - it never touches that Block's
`act`/`observe`/`resolve`/`verify`, so everything already proven about those phases still
holds for a routed Block. A Block with no routing behaves exactly as it does today (single
pass, no loop overhead, no behavior change).

**Non-Goals:** `defineFlow` gaining branching support - it stays the simple, linear,
no-routing ergonomic layer; `branch()` is used directly with `runGraph` for now.

## Decisions

**`next` lives on `Block`, not as a separate routing table the engine consults
externally.** Considered: a `Map<Block, Routes>` held by the engine. Rejected - a Block
already carries everything else about itself (`name`, `instruction`); routing is a property
of that Block's next step, the same way `verify` is a property of that Block's confirmation
step. Keeping it on the Block means `branch()`'s result is still just a `Block` - nothing
else in the system needs to know routing is a distinct concept.

**`branch()`'s return type is `Block<In, any>`, not a precisely-typed union.** A route can
lead anywhere, including back to the routing Block itself - the set of Checkpoints
reachable after arbitrarily many hops isn't a fixed type TypeScript can represent without
deep recursive-type machinery. This is why `runGraph`'s explicit `terminals` parameter
exists: what the type system can't pin down statically, the caller states explicitly and
the engine validates at runtime.

**`maxSteps` defaults to 5000, not unlimited or a required parameter.** A default means
nobody has to think about it until a routing bug actually produces a runaway loop, at which
point the error names the limit rather than the process hanging.

## Risks / Trade-offs

- [`branch()`'s output typing is weaker than `connect()`'s] → Accepted and named directly
  above, not hidden - `terminals` is the runtime backstop for what types can't express here.
- [A routing bug could still spin through many real browser actions before hitting
  `maxSteps`] → `maxSteps` bounds *iterations*, not wall-clock time; a future change could
  add a time-based bound too, not needed until it's an actual problem.
