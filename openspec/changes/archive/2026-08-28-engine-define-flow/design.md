## Context

See proposal.md for why - the saucedemo proof-of-concept exposed both gaps by actually
being used. `connect()`, `runGraph()`, `Checkpoint`, `MemPage` are unchanged; this adds a
layer on top and one new phase, nothing underneath moves.

## Goals / Non-Goals

**Goals:** `defineFlow([start, ...blocks, end])` reuses `connect()` internally (zero new
chaining logic to trust); `verify` reuses the exact "no page/mem in scope unless explicitly
listed" discipline `resolve` already established.

**Non-Goals:** Branching-aware `verify` (a per-tag map of Traits) - `Out` is always a single
tag until `branch()` exists, so a flat `Trait[]` is both correct and simpler for now; this
is additive later (`Trait[] | { [tag]: Trait[] }`), not something to build early for a case
that can't happen yet.

## Decisions

**`defineFlow` is typed via explicit overloads (arities 1-6), not a recursive variadic-tuple
type.** Considered: a single fully-generic recursive conditional type walking the tuple.
Rejected for now - it's achievable but harder to verify quickly and more prone to subtle
edge cases (distributivity, unhelpful error messages on mismatch) than reusing `connect<A,B,C>`'s
already-proven two-argument shape six times over. Each overload is trivial to eyeball-verify
correct; a `@ts-expect-error` fixture proves a broken chain still fails to compile. Six
real Blocks between `start`/`end` covers any realistic flow; longer chains can nest
`defineFlow` results or signal the flow should be split.

**`start`/`end` are real exported sentinel values (`Symbol`), not string conventions.**
Considered: keeping `"__start__"` as a bare string literal callers write by hand. Rejected -
the whole point raised was that `start`/`end` should be usable, importable values, not a
string a caller has to remember to type correctly.

**`runGraph`'s `terminals` becomes optional rather than adding a second function.**
Considered: a separate `runFlow` function used only by `Flow.run()`. Rejected - the only
difference is whether the reached Checkpoint gets validated against an expected set, which
is naturally "does this collection have anything in it," not a reason to duplicate the
tab-lifecycle logic a second time.

**`Trait.check` returns `boolean`, not `void`/throwing.** Considered: matching `resolve`'s
throw-based error style. Rejected - a boolean return lets the engine attach the failing
Trait's own `name` to the error message at a single point, rather than every Trait author
needing to throw a correctly-worded error themselves.

## Risks / Trade-offs

- [Six-arity cap on `defineFlow`] → Named directly in the Decisions above; not a silent
  limitation.
- [Optional `terminals` slightly widens `runGraph`'s contract] → Backward compatible -
  every existing caller already passes a `Set`, so nothing about current behavior changes.
