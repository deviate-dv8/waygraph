## Context
- `defineApiBlock` calls `options.call({ request, mem })` with `page.request` and keeps the result in mem for `resolve`.
- Playwright: `request.newContext({ baseURL, extraHTTPHeaders, storageState })` makes an isolated `APIRequestContext`;
  `page.request` shares the page's cookies.

## Decisions
### D1. A client is a value with a lazily made context
`client(...)` records options only; the run makes its `APIRequestContext` on first use and disposes it with the flow
(like panes). `as: Account` uses the account's kept session's cookies as `storageState`; a token account's headers.
### D2. A burst and `alongside` are step options, not new Block kinds
They wrap the step the way `settle` and `ff` do: `times` runs the API Block's `act` n times with `Promise.all`;
`alongside` runs the other Blocks' calls with the step's own action, started after the step's precondition.
### D3. Results are recorded as `step:call` events (the network change's event) with `burst`/`client`
So the demo's card and Studio read them without new plumbing; no bodies by default in the log (secrets).
### D4. Failure
A call's status never fails the step. A call that *throws* (network error, timeout) is recorded as `failed` with its
error; it fails the step only if it's the step's own call (`times` / `alongside` calls report, never fail).
### D5. Parity
`via` accepts a pane; a burst or alongside works in any pane; nothing differs with one page.

## Risks
- Races are non-deterministic: the step records what happened; the docs say to expect a property ("exactly one 200"),
  not an order.
