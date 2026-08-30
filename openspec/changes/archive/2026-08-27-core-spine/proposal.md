## Why

zsign-app's Playwright E2E suite (60+ spec files) has degraded into a flat pile of
`*ViaAPI` helper functions and copy-pasted selectors with no typed relationship between
steps, producing both false reds (a rename breaks specs nobody remembers to update) and
false greens (route-mock registration order silently determines which mock wins). Waygraph
replaces that with a typed graph of reusable Blocks: a broken selector fails at the Block
that owns it, not two specs later, and a Block's output type is the only contract the next
Block can rely on. This change lands the smallest possible runnable slice of that engine -
everything else (branching, assertions, background guardrails, a second tab) is deliberately
deferred to later changes so each piece can be reviewed and tested on its own.

## What Changes

- New `Checkpoint<Tag>` type - a phantom string tag with zero embedded data, used as the
  only contract between Blocks.
- New `MemKey<T>` / `MemPage` - a typed, identity-keyed shared-memory store for data that
  flows between Blocks (as opposed to control flow, which Checkpoints carry).
- New `Instruction` shape - `act` (drives the browser), `observe` (optional, gathers
  evidence), `resolve` (mandatory, pure - no `page` or `mem` in scope, classifies evidence
  into an output `Checkpoint`).
- New `Block` and `connect()` - linear composition of two Blocks into one, typechecked so
  the connection only compiles when the first Block's output tag matches the second's input.
- New `runGraph()` engine - creates the browser tab before the first Block runs and closes
  it once a registered terminal Checkpoint is reached; returns that terminal Checkpoint as
  the graph's result instead of discarding it.
- Explicitly out of scope for this change (tracked as follow-up changes): `branch()` for
  Blocks whose output is a union of Checkpoints, the `maxSteps` loop-safety cap, the `Trait`
  primitive (`verify` + continuous invariants), Interstitials/Watchers (background overlay
  handling), and `spawnTab` (second-tab support). Each depends on this spine existing first.

## Capabilities

### New Capabilities
- `waygraph-core`: the typed Checkpoint/Block/Instruction model, `connect()` composition,
  typed `MemPage`, and the `runGraph()` engine for a single, non-branching, single-tab flow.

### Modified Capabilities
(none - this is a new package, nothing existing to modify)

## Impact

- New standalone package at `/home/dan/Desktop/Work/zsign/waygraph/` (not yet wired into
  `zsign-app/main/e2e` - integration happens after the incremental feature set is complete
  and proven against a real flow).
- Dependencies: `@playwright/test` (peer), TypeScript. No other runtime dependencies.
- No impact on any existing zsign-app/zsign-api code in this change.
