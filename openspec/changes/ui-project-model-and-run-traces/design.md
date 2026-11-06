## Context

- **Reading the project.** Waygraph UI (`ui/`, an AdonisJS app started by `waygraph ui`) reads a project through
  `ProjectService`. That service runs the project's own `waygraph manifest` as a child process and caches the result for
  30 s. It reads runs by parsing `.waygraph/runs/*.jsonl` on every request, and while a flow plays it reloads the whole
  page every second.
- **Scanning.** `manifest/scan.ts` imports each project file with `importFresh`, which cache-busts only the file it
  imports. A long-running process that re-imports an edited Block therefore still holds the old version of the
  `_sel.ts` or `_states.ts` that Block imports.
- **Run events.** `engine/run/events.ts` emits flat run events through `onRunEvent`. They are scoped per async chain by
  `AsyncLocalStorage` and have a step counter and a stack of open steps (fast-forward steps nest).
- **Readers of those events:** the run log (`runtime/run-log.ts`), `--replay` (`runner/plan/plan.ts`, reading
  `run:mem`), the demo's after-step panel (`demo/stepper/last-read.ts`, reading `step:read`), the live session feed
  (`live/auto-session/feed.ts`) and Waygraph UI.
- **Checks.** They run in `engine/trait/verify.ts`, retrying every 200 ms up to 5 s. Expectations run in
  `engine/run/expect.ts`, in parallel, on a read-only page. Only a failure leaves a record (`step:error.check`).
- **Browser activity.** Nothing records the page's console, errors or network during a run. Live sessions have their own
  console buffer (`live/auto-session/console.ts`).

## Goals / Non-Goals

**Goals:**
- One process per project holds its scan; the UI sees edits within a second or two, without a refresh.
- The manifest is enough to link any Block to its checks, selectors and source line.
- A run is a trace: every step, phase and check, with timings, the browser's activity on the step that caused it, and
  links to the source.
- A standard data model (OpenTelemetry spans), so traces can also go to existing tools.
- One way to write each thing: spans replace run events everywhere; `onRunEvent` goes.

**Non-Goals:**
- Sending traces to a collector while running (OTLP over HTTP or gRPC). Export is from a finished run, to a file.
- Using the OpenTelemetry SDK at runtime. We write its data model ourselves, with no SDK dependency.
- Live sessions (`pilot`, `auto`) sharing the host. They keep their own process; they gain spans through the shared
  recorder, but not the host.
- Request and response bodies, and full-page network HAR. Use Playwright's trace (`trace.zip`, already a run artifact) for
  that.
- Editing the project from the UI.

## Decisions

### D1. The host is a waygraph child process, not code inside the UI's server
The UI server is AdonisJS. Scanning a project means importing its TypeScript through waygraph's loader (`tsx`) and the
project's own install, and a process that has loaded one Playwright can't load a second (the "Requiring @playwright/test
second time" rule). So `waygraph ui` starts `waygraph host <project>` (internal, like `__auto-serve`) and hands its stdio
pipe to the UI server. The protocol is newline-delimited JSON with request ids, like the session protocol.
- *Alternative:* a socket per host, as sessions use. Rejected for now: one client (the UI) and stdio make the host's
  lifetime follow the UI's for free.

### D2. Rescan in a fresh process
On a change (debounced 300 ms), the host forks a short-lived scanner (`waygraph manifest --json-stream`, or the same code
in a child) and swaps in its result. A fresh process sees every changed module, and a crash or hang (a Block with a
top-level `await` that never resolves) can't take the host down; the scanner times out at 60 s.
- *Alternative:* cache-bust every project file's URL on each change. Rejected: memory grows with every rescan (Node
  never unloads ES modules), and third-party modules that hold global state (`Symbol.for("waygraph.…")` registries)
  would be loaded twice.

### D3. The manifest reads positions and selectors statically, and checks at runtime
Positions come from the TypeScript AST (ts-morph, already used for read types): the call expression that defines the
export, and each chain call in a flow file. Selectors also come from the AST: object literals exported from `_sel.ts`
files, and member accesses (`LoginSel.x`) inside a Block's definition. Checks come from the imported Block: Traits are
objects with `name`, `wants` and `selector`. `verify` as a function stays opaque (`"dynamic"`); calling it with a made-up
outcome isn't safe.

### D4. Spans follow OpenTelemetry's model, written as start / end records
OpenTelemetry's data model gives the standard shape: trace, span, parent, kind, status, attributes, events. Its JSON
encoding (OTLP) is what other tools import. But an OTLP span is written once, when it ends, and the UI must show a run
while it plays. So the run log holds three record types:

```jsonl
{"type":"span:start","traceId":"…","spanId":"…","parentSpanId":"…","name":"submit-login","kind":"step","at":1730879000123,"attributes":{"waygraph.block":"submit-login","waygraph.block.kind":"method","code.filepath":"src/map/login/_methods/submit-login.method.block.ts","code.lineno":12}}
{"type":"span:event","spanId":"…","at":1730879000301,"name":"console","attributes":{"level":"error","text":"Invalid token","url":"https://…/app.js","line":88}}
{"type":"span:end","spanId":"…","at":1730879000412,"status":"ok","attributes":{"waygraph.checkpoint.to":"LoggedIn"}}
```

`waygraph trace --otlp` folds these into OTLP/JSON. Attribute names use OpenTelemetry's semantic conventions where one
exists (`code.filepath`, `code.lineno`, `http.request.method`, `url.full`, `http.response.status_code`,
`exception.message`) and `waygraph.*` otherwise. Ids follow OpenTelemetry's format: 16-byte hex trace id, 8-byte hex span
id (`crypto.randomBytes`). The run id stays the file name and becomes the run span's `waygraph.run.id`.
- *Alternative:* keep the flat events and add ids to them. Rejected: two shapes for one thing, and readers would still
  rebuild the tree themselves.

### D5. The recorder replaces the event emitter, with the same scoping
`engine/run/events.ts` becomes `engine/run/trace.ts`: `inRun` opens the run span, and `span(kind, name, attributes, fn)`
opens a child of the current span (an `AsyncLocalStorage` holding the open span). That keeps the current per-chain
isolation, so parallel workers and nested flows don't mix. `run.ts` wraps each phase; `verify.ts` and `expect.ts` wrap each
check (expectations run in parallel, so each check gets its own span under the expect phase). A span closes in a
`finally`, so a throw never leaves one open.

### D6. Browser activity is attached by time, to the innermost open span
Listeners on the page and context (`console`, `pageerror`, `dialog`, `framenavigated` (main frame), `requestfinished`,
`requestfailed`) are installed once per page, where the runner and `Engine.run` create it. Playwright calls a listener
outside our async chain, so the span is found by "innermost span open on this run right now", which the recorder tracks
per run. Requests: XHR and fetch always, and any resource type when it fails or returns ≥ 400. Duration comes from
`request.timing()`. Bodies are never read.

### D7. Secrets
`keys()` gains `Secret<T>`, a type marker read at runtime through a `secret` set on the namespace, and the config gains
`secretKeys: string[]` for keys from packages. The recorder masks those keys' values wherever mem values are written:
the run's mem, reads, and a check's `saw` when the Trait's expected value came from that key. Replay can't restore a
masked value; it says which keys to supply.

### D8. The UI gets live data through server-sent events
The UI server keeps one subscription to the host and fans updates out over an `EventSource` endpoint
(`/events?run=<id>`). Pages patch their props locally (Inertia's `router.replace` with `preserveState`) instead of
reloading. The timeline is its own component: Vue for rows and the panel, an SVG time axis with rough.js bars, keeping
the hand-drawn look. No chart library: rows and bars are simple, and drill-down needs custom interaction.

### D9. Old run logs
Files whose first record is `run:start` are legacy. The host summarizes them with today's fold, so they list and open on
the old step list. They are never converted.

## Risks / Trade-offs

- **Bigger run logs** (every check, console, requests) → requests are filtered (D6), checks record only their last `saw`,
  and old runs are pruned past `runLog.keep` (default 200 runs).
- **Recording costs time** → listeners only append to the file. `appendFileSync` on every record would block, so writes
  are batched: a buffered stream per run, flushed every 100 ms and at the end.
- **A breaking API for `onRunEvent` users** → it's rarely used outside waygraph; a row in `docs/deprecated.md` maps each
  old event to its span.
- **Static selector detection misses indirection** (`const s = LoginSel; s.username`) → the manifest says the list is
  what the source references directly; it's a guide, not a guarantee.
- **The host and the UI drift apart** → both come from the same package (`dist/ui` ships in waygraph), and the host
  reports its version in its first message.

## Migration Plan

1. Add the recorder and spans next to the old events, with both written in one run, and compare them on the test suite.
2. Move every reader (run log, replay, demo panel, session feed, `WAYGRAPH_JSON`, the UI) to spans.
3. Remove `onRunEvent` and the old events; add deprecated rows; bump `SESSION_PROTOCOL_VERSION`.
4. Ship the host and the UI on top of it, then the manifest's version 3.
Rollback: until step 3 ships, the old events still work; each step is its own commit.

## Open Questions

- Should the host also serve `waygraph pilot` / `auto`, so the UI can show live sessions? (Proposed: later.)
- Is `ui.editor` worth a config key, or should the UI always show `file:line` to copy? (Proposed: the key, since it's
  one line.)
