## Why

Playwright's API testing (`APIRequestContext`) is what waygraph's API Block already runs on, but only as one call in a
flow's order: one request, then the next step. Two things teams need don't fit:

- **Races.** "While the browser submits the form, fire twenty requests at the same endpoint" or "the admin approves in the
  UI while the planner's API call cancels": a race condition needs calls that run *at the same time as* a browser step,
  or as a burst, and a verdict on what the app did with them. Today that is hand-written `Promise.all` in a Method, with
  no result in the run log, the demo or Studio.
- **Who calls.** An API call is made as nobody in particular (`page.request`, the browser's session). A race often needs
  a second person's call (the planner's token, an API user), with its own base URL and headers, not the browser's cookies.

Hoppscotch (an `(external)` Map) is a different use: a person-facing REST client page. This is about calls made *by the
test*, beside the browser.

## What Changes

- **API clients are values**, like accounts and panes: `const Api = client("api", { baseUrl, as: Planner, headers })`
  (its own `APIRequestContext`: base URL, headers, and the account's session or token), or `client(..., { via: Pane })`
  to call with a pane's cookies. An API Block takes `via: Api` (or a pane); without it, as today.
- **A burst.** `.method(CancelBlock, { times: 20 })` plays an API Block twenty times at once and lands when all are done.
- **Alongside.** `.method(SubmitForm, { alongside: [Cancel, Cancel] })` runs API Blocks at the same moment as a browser
  step (started together, optionally `after: 50` ms), and the step lands when the browser step and every call are done.
  Calls are `expect`ed like any step: what the app did with them (how many 200s and 409s, what the page shows) is the
  scenario's expectation.
- **Results as data.** Every call's result (status, body, time, which of the burst) is recorded with the step in the run
  log; `Key.is` and Expect Blocks read them (`Api.results`: statuses, bodies); the demo shows them on the step's card
  and Studio on the run's step. Never fails a step by itself.
- **Same with panes and one page.** A burst or alongside works in a flow on one page and with panes; `via` takes a pane.

## Capabilities

### New Capabilities
- `api-requests`: API clients as values, bursts (`times`), `alongside`, results as data, in the demo, run log and Studio.

### Modified Capabilities
<!-- none -->

## Impact

- **Engine:** `engine/block/kinds/api.ts` (`via`, results), a `client()` value (`engine/flow/client.ts`), step options
  `times` / `alongside` in `map-steps.ts`, API calls recorded with their step.
- **Network view:** the `qa-network-and-api-view` change shows each call (and each burst call) on the step's card; this
  change gives it the calls. Apply after it, or together.
- **Docs:** an API requests guide page (clients, bursts, alongside, a race recipe), the blocks guide's API section.
