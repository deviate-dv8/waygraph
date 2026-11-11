## Why

A demo's network tab is a developer's list: a method, an address cut off halfway, a bare status code, in a small box in a
corner, hidden unless a stub shows it. A QA reading a demo (or its video) can't tell from it what the step did to the
backend, whether that went well, or what came back:

- **Noise first.** Every request the page makes is listed: analytics beacons, third-party scripts. On saucedemo the
  first rows are two red `401`s from an analytics service, which look like failures of the app.
- **Not tied to the step.** Requests pile up in one list across the whole demo; nothing says which step made which call.
- **Codes, not words.** `401`, `422`, `502` mean something to a developer; a QA wants "not signed in", "the form was
  rejected", "the server is down".
- **An API step shows nothing of its own.** `defineApiBlock` (a call with no page) adds a row to the same list; what it
  sent, what came back and what was checked aren't shown.

## What Changes

- **What a step did, in its own card.** After a step that called the app's backend, the step's card says so in a line
  each: what was asked, in words where it can be named (`Saved the machine`), and how it went (`201 Created`, `422 The
  form was rejected`), with how long it took. A call that failed is marked even when the step passed. Third-party
  traffic (another origin than the app's and its configured APIs) is left out, unless asked for.
- **An API step's own card.** A step with no page (`defineApiBlock`) shows the request (method, address, the body as a
  readable table), the response (its status in words, the body's fields as a table) and its checks (each pass or fail),
  where the page would be.
- **Names for calls.** `demo.network.names` in the config names an endpoint by its route (`"POST /api/machines": "Saved
  the machine"`); without a name, the method and route read as a phrase (`POST /api/machines` → `POST machines`).
- **The full list, readable.** The network panel, opened from the step's card, lists the step's calls first, each row
  in words, its detail as tables (headers, query, body), with copy-as-cURL kept for developers. `demo.network.show:
  "all"` includes third-party traffic.
- **In the run log and Waygraph UI.** Each step's calls (method, route, status, time, name) go in the run log; a run's
  step shows them in Waygraph UI, so a QA reads them after the fact too.

## Capabilities

### New Capabilities
- `qa-network-view`: what the demo, the run log and Waygraph UI say about the calls a step made (filtered to the app,
  named, in words, tied to the step), and an API step's card.

### Modified Capabilities
<!-- None: no main spec covers the demo's network tab (openspec/specs/ predates it). -->

## Impact

- **Demo:** `demo/overlay/network-capture.ts` (per step, filtered, named), `demo/overlay/inpage/network.ts` (the panel,
  rebuilt), the step's after card (`demo/stepper/panel-after.ts`, `outcome.ts`), a new API card; overlay CSS tokens and
  Storybook stories, light and dark.
- **Engine:** `defineApiBlock` records what it sent and got (already captured for the panel) as run events.
- **Config:** `demo.network` (`show`, `names`, `apis`: other origins that count as the app's).
- **Run log and UI:** a `step:call` event; Waygraph UI's run step lists its calls.
- **Docs:** the demo guide's network section, the config reference, the run log reference.
