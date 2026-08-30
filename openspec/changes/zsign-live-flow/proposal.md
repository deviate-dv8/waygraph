## Why

`@waygraph/core` has only ever run against a toy `data:` URL form. Proving it against a
real, running application - zsign-app/zsign-api's actual register -> verify -> login flow -
is the real test of whether the engine's abstractions (Checkpoint, connect, runGraph) hold
up outside a controlled fixture.

## What Changes

- New `project/zsign/` workspace member (not under `packages/` - project-specific, not a
  reusable library piece). Depends on `@waygraph/core` as a workspace dependency.
- Three Blocks against the live dev stack (verified running: app `:3000`, api `:3001` via
  cors-relay, Mailhog at `:3080/mailhog`): `RegisterBlock` (API call), `VerifyEmailBlock`
  (polls Mailhog, extracts the token, verifies via API), `LoginBlock` (real UI interaction,
  `observe` waits for the dashboard URL).
- Happy path only - no wrong-password/locked-account branches, since `branch()` doesn't
  exist in `@waygraph/core` yet. Terminal Checkpoint is a single `LoggedIn` tag.
- Does not touch `zsign-app` or `zsign-api` repos - only makes the same kind of HTTP/browser
  calls against the already-running stack that the existing `zsign-app/main/e2e` suite does.
  No Redis flush, no shared-state mutation beyond a uniquely-generated test user per run.

## Capabilities

### New Capabilities
- `zsign-live-flow`: a runnable Waygraph flow proving register -> verify-email -> login
  against the real, running zsign-app/zsign-api dev stack.

### Modified Capabilities
(none)

## Impact

- New workspace member `project/zsign/`, added to root `package.json` workspaces glob
  (already done: `["packages/*", "project/*"]`).
- Reads/writes to the shared dev Postgres via the running API (a uniquely-generated test
  user, same isolation convention `zsign-app/main/e2e/helpers.ts` already uses) and to the
  shared Mailhog inbox (read-only search, scoped to the generated email).
- No changes to `@waygraph/core` itself in this change.
