## Status (read this first, always)

**State: implemented and verified.** Phase 2 of the "Agent-authoring tooling and Waygraph
Copilot" roadmap in `ROADMAP.md`, building on the shipped Phase 1
(`waygraph-auto-cli-session-control`). All four milestones done; 173/174 relevant tests pass
(1 pre-existing, unrelated timing flake, confirmed passing in isolation); real end-to-end
runs against live saucedemo.com confirmed by hand and by the extended
`tests/cli/auto-session.spec.ts`. Not yet archived to `openspec/changes/archive/`.

- [x] Milestone 1 (M1) - DOM snapshot core in `AutoSession`
- [x] Milestone 2 (M2) - `dom` op on the session protocol
- [x] Milestone 3 (M3) - `auto dom` CLI sub-verb
- [x] Milestone 4 (M4) - Proof

---

## M1. DOM snapshot core in `AutoSession`

- [x] M1.1 `AutoSession.inspectDom(opts: InspectDomOptions)` in `src/auto-session.ts` -
      dispatches to aria/full, scoped to `selector` when given. Read-only: uses the
      already-live `this.page`, no `mem`/checkpoint mutation.
- [x] M1.2 Aria path: `page.ariaSnapshotJSON({ mode: "ai", depth })` (whole page) or
      `page.locator(selector).first().ariaSnapshotJSON(...)` (selector-scoped) - thin
      wrapper, no re-implementation of Playwright's own truncation.
- [x] M1.3 Full path: a self-contained `walkFullDom(root, caps)` function passed directly to
      `Locator.evaluate` (tag, attributes, text, children), enforcing caps inside the walk
      itself (depth default 12 caller-overridable, max 800 nodes, max 300 chars text per
      node) and returning `truncated: true`/`false`. Real bug caught before typecheck: the
      whole-page case can't be a second `page.evaluate` callback referencing `walkFullDom` by
      closure - `evaluate` only ships the one passed function's own source. Fixed by routing
      the whole-page case through `page.locator("html")` so both cases share the one
      self-contained walker instead of two near-duplicate callbacks (this is also why
      proposal.md's "container" was corrected to "`--selector` modifies either mode" earlier
      - same reuse principle applies at the code level).
- [x] M1.4 A selector matching nothing (either fidelity) rejects clearly instead of
      returning an empty/misleading snapshot (`locator.count() === 0` check before dispatch).

## M2. `dom` op on the session protocol

- [x] M2.1 New request/response shape in `src/auto-session-ipc.ts`: `{op:"dom", mode?,
      selector?, depth?}` -> `{ok:true, snapshot: DomSnapshot}` | `{ok:false, error}`, handled
      through the same per-session request queue `status`/`send` already use. `requestSession`
      given two overloads (status/send vs dom) so callers get a correctly narrowed response
      type instead of a loose union.
- [x] M2.2 No change to `status`/`send`'s own handling - `dom` added as a third `else if`
      branch, existing branches untouched. Verified via `tsc --noEmit`.

## M3. `auto dom` CLI sub-verb

- [x] M3.1 `waygraph auto dom <sessionId> [--mode aria|full] [--selector <sel>] [--depth N]`
      in `src/cli.ts`, added as a fourth sub-verb alongside `send|status|attach` (before the
      normal project-directory resolution). `--selector` is an optional modifier on either
      mode, not a third mode value.
- [x] M3.2 An unrecognized `--mode` value, a non-positive-integer `--depth`, or an unknown
      flag each error with a clear message rather than guessing.
- [x] M3.3 `usage()` updated.

## M4. Proof

- [x] M4.1 `npm run typecheck` clean (only the pre-existing, unrelated `tests/unit/*` vitest
      errors remain).
- [x] M4.2 Extended `tests/cli/auto-session.spec.ts` (real live saucedemo.com, not a
      synthetic fixture) with `dom` assertions inline in the existing sequence: default
      `aria` mode returns a non-empty snapshot mentioning Username/Password/Login;
      `--selector "#login-button"` returns a strictly smaller snapshot than the unscoped
      page; an unmatched selector errors cleanly (`no element matches selector`); `--mode
      full` on the login page returns `{tag:"html", ...}` with `truncated:false`; `--mode
      full` on the real inventory page (post-login, much larger DOM) hits the caps and
      reports `truncated:true`. Also verified by hand first (detach, `auto dom` in aria/full/
      selector modes, unmatched selector, truncation on inventory) before writing the
      automated version - same discipline as Phase 1. All 3 tests in the file still pass.
- [x] M4.3 Full suite still green: 173/174 across the same 8 directories Phase 1 verified
      (`tests/flow-run/engine-config.spec.ts`'s `slowMo` timing test failed once under
      parallel worker contention, passed clean in isolation immediately after - this is the
      pre-existing, previously-documented timing flake this repo's own history already
      references repeatedly, not a regression from this change, which touches none of
      `engine.ts`/browser launching).
- [x] M4.4 `README.md` "CLI reference" table + new explanatory paragraph, and `docs/auto.html`
      (new "Reading the live page" section) updated with `auto dom` and its two modes plus
      the `--selector` modifier.

## Follow-up (explicitly NOT in this change - do not pull forward without a new proposal)

- [ ] Phase 3: simultaneous `--cli` + headful, structured trace emission reusing this `dom`
      op - separate change proposal.
- [ ] Exposing `full` mode's node-count/text-length caps as CLI flags, if a real case needs
      it (see design.md Risks) - not scoped into this change.
