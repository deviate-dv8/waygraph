## Context

- `demo/overlay/network-capture.ts` listens to the page's `request` / `requestfinished` events (fetch, XHR, document),
  keeps the last 30 entries on the Playwright page (`__wgNetworkHistory`) and paints them into the in-page panel
  (`inpage/network.ts`); `defineApiBlock` records its own call into the same list (`setApiCallRecorder`). Bodies up to
  200 KB are captured for the detail view, with copy-as-cURL.
- The panel is hidden unless a stub calls `ctx.ui.showNetworkTab()`, lists everything (every origin) in one rolling list,
  and isn't tied to steps.
- The demo's step panel and outcome card (`demo/stepper/`) already show, after each step, what it expected and what the
  page now shows: the natural place for "what it called".

## Goals / Non-Goals

**Goals:** a QA reads, at each step, what it asked the backend and whether that went well, in words; noise is left out
by default; an API step reads as clearly as a UI step; the same is in the run log and Waygraph Studio.

**Non-Goals:** mocking responses (ROADMAP: network tab mocking); a full developer inspector (the panel keeps cURL and the
raw detail, but isn't DevTools); WebSockets and server-sent events.

## Decisions

### D1. Calls belong to the step that made them
Capture marks each request with the step running when it was sent (the run's current step), so the after card lists
the step's own calls. Requests still in flight when the step ends finish into it.

### D2. The app's calls, by origin
A call is the app's when its origin is the base URL's, or one listed in `demo.network.apis`; the rest is hidden unless
`demo.network.show: "all"`. Documents (page loads) are shown only when they fail (a navigation is already the step).

### D3. Status in words
A fixed table maps codes to short words (200 OK, 201 Created, 204 Done, 301/302 Moved, 400 Bad request, 401 Not signed
in, 403 Not allowed, 404 Not found, 409 Conflict, 422 Rejected, 429 Too many requests, 500 Server error, 502/503/504
Server unavailable); others read by class (2xx OK, 4xx Request refused, 5xx Server error).

### D4. Names from the config, else a phrase from the route
`demo.network.names` maps `"METHOD /route/:param"` to a name; matching ignores the query and treats ids (numbers,
UUIDs) as params. Without one, the line reads `METHOD` and the route's last segments that aren't ids.

### D5. An API step's card replaces the page view's panel for that step
A step that is an API Block (no page) shows its card in the middle of the stage: request, response, checks. Bodies show
as field tables (nested objects folded, arrays as counts with the first items); raw JSON is a click away.

### D6. The run log gets `step:call`
`{ step, method, url, route, status, ms, name, failed }`, no bodies (they can hold secrets); the demo keeps bodies in
memory only, as today.

## Risks / Trade-offs

- **Hiding a call that mattered** (a backend on another origin not listed) → the card says how many calls were left out,
  and `demo.network.show: "all"` / `apis` bring them in.
- **Bodies with secrets on screen** (tokens, passwords) → fields named like secrets (`password`, `token`, `secret`,
  `authorization`) show masked; headers stay in the developer detail only.
- **Busy pages** (dozens of calls a step) → the card lists the first five and a count; the panel has them all.

### D7. A failed call never fails its step
What passes or fails a step stays what it is today: its verify and its expectations. A failed call is marked, never a
failure of its own, and there is no option to make it one: a project's results don't change when it upgrades, and a
call that matters is checked like anything else (an API Block's checks, a step's `expect`).

### D8. The same with one page and with panes
Everything here works the same in a flow on one page and in a flow with panes (each pane's calls with its steps, in
its own card), in run, demo, video, the run log and the UI: nothing in the docs is "not available with panes".
