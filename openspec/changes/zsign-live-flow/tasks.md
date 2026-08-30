## 1. Workspace scaffolding

- [ ] 1.1 Create `project/zsign/` with `src/`, `tests/`; write `package.json` (name `zsign-e2e`, private, depends on `@waygraph/core` as a workspace dependency and `@playwright/test`); verify `npm install` from the workspace root resolves `@waygraph/core` via workspace symlink (no `file:`/version pin needed)
- [ ] 1.2 Add `tsconfig.json` (extends the same strictness as `@waygraph/core`'s) and `playwright.config.ts` pointing `testDir` at `tests/`; verify `npm run typecheck -w zsign-e2e` runs cleanly on an empty `src/`

## 2. Blocks against the live stack

- [ ] 2.1 Implement `RegisterBlock` (`In: Start`, `Out: Registered`): `act` POSTs to `http://localhost:3001/api/v1/auth/register` with a generated unique email/password/name, writing the credentials to `MemPage`; verify a real request against the running API succeeds (201/200) in isolation
- [ ] 2.2 Implement `VerifyEmailBlock` (`In: Registered`, `Out: EmailVerified`): `act` polls `http://localhost:3080/mailhog/api/v2/search?kind=to&query=<email>` (bounded attempts, short delay between), extracts the token from the matched message's body, then POSTs to `http://localhost:3001/api/v1/auth/verify-email`; verify in isolation that it finds the real email sent by task 2.1's registration and verification succeeds
- [ ] 2.3 Implement `LoginBlock` (`In: EmailVerified`, `Out: LoggedIn`): `act` navigates to `http://localhost:3000/login`, fills email/password from `MemPage`, clicks Sign In; `observe` waits for the URL to reach `/dashboard`; `resolve` returns the fixed `LoggedIn` tag; verify in isolation (with a pre-verified account) that it reaches the dashboard

## 3. Wire the flow and prove it end to end

- [ ] 3.1 Compose `connect(RegisterBlock, connect(VerifyEmailBlock, LoginBlock))` and run it via `runGraph(..., terminals: new Set(["LoggedIn"]), ...)` in a real Playwright test; verify one full run against the live stack passes, returning `{ __state: "LoggedIn" }`
- [ ] 3.2 Verify the run used a uniquely-generated email (rerun the test back to back and confirm no duplicate-account conflict) and triggered no shared-state reset (no Redis flush, no other account touched)
- [ ] 3.3 `npx tsc --noEmit` (whole `project/zsign/` tree) and the task-3.1 test both green in the same session, run last, as the final verification
