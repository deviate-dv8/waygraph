## Context

`@waygraph/core` (from the `core-spine` change) exists but has only run against a `data:`
URL fixture. See proposal.md for why proving it against zsign-app/zsign-api matters now.
The dev stack is already running and was verified directly, not assumed: app `:3000`
(`/login` -> 200), api `:3001` (`/api/v1/auth/login` -> real 401 on bad creds), Mailhog at
`:3080/mailhog` (bare `:8025` 404s - it's path-prefixed).

## Goals / Non-Goals

**Goals:**
- One real, passing run of register -> verify-email -> login against the live stack.
- Zero changes to the `zsign-app`/`zsign-api` repos or their shared state beyond what an
  ordinary E2E client already does against them today.

**Non-Goals:**
- Branching (wrong password, locked account, etc.) - `@waygraph/core` has no `branch()` yet.
- Any assertion beyond reaching the dashboard - no `Trait`/`verify` primitive exists yet.
- Publishing or reusing this as a library - it is a one-off proof, kept out of `packages/`.

## Decisions

**Lives at `project/zsign/`, not `packages/zsign-e2e/`.** Considered: a `packages/`
member, consistent with `@waygraph/core`. Rejected per explicit direction - `packages/` is
for generic, potentially reusable pieces of Waygraph itself; this is inherently tied to one
specific application and shouldn't read as part of the library's public surface.

**Mailhog polling is a plain retry loop inside `VerifyEmailBlock`'s `act`, not a graph-level
self-loop.** Considered: modeling "keep checking until the email arrives" as a Block
routing back to itself via `branch()`. Rejected because `branch()` doesn't exist in this
version of `@waygraph/core` - and doesn't need to: the retry is bounded, internal to one
Block, and identical in shape to what `zsign-app/main/e2e/helpers.ts`'s `verifyEmail`
already does today (poll with a max attempt count, no external state needed).

**Test data isolation follows the existing suite's convention, not a new one.** A
generated-per-run email (timestamp + random suffix) is what `zsign-app/main/e2e/helpers.ts`
already uses for exactly this reason (no collisions between runs or with other agents using
the same shared dev database). Reusing it rather than inventing a different isolation
scheme keeps this flow's footprint on shared state identical to what the existing suite's
footprint already is.

## Risks / Trade-offs

- [Live-service flakiness - Mailhog delivery latency, dev stack under load from other
  agents] → Mitigated the same way the existing suite mitigates it: a bounded poll with
  retries, not a single blind check.
- [Shared dev database receives one more test account per run] → Acceptable and consistent
  with how the existing `zsign-app/main/e2e` suite already behaves against this same stack;
  no cleanup step exists in that suite either.
- [No branching support means only the happy path is provable right now] → Intentional
  scope-narrowing, matching `@waygraph/core`'s actual current capability, not a shortcut
  taken to make this change easier.
