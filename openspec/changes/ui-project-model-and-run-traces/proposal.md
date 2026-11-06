## Why

Waygraph UI is moving from alpha toward stable, and two things it stands on were built for a terminal, not for a UI.

**Reading the project.** The UI runs `waygraph manifest` in a new process every 30 seconds, and each run imports every
project file. So an edit shows up late or after a manual refresh, every read costs a full import, and the manifest says
too little to link anything. A Block lists its name, route and file, but not its selectors, its `verify` checks, its
expectations' checks, its narration, or the line it's on. The UI can draw a box but can't say what the box checks or
open its source.

**Reading a run.** The run log is a flat list of events (`step:start`, `step:end`, `step:error`). It records only the
check that failed, never the ones that passed. It doesn't split a step into its phases (precondition, act, resolve,
verify, expect), and it records nothing of the browser (console, page errors, network calls) or which step caused it.
Debugging a run means re-running it with a terminal open. A run should instead be a **trace**: every step, phase and
check as a span with its timing and parent, and everything the page did attached to the span that caused it. The UI
can then show it as a timeline (Dagster's run view, Airflow's Gantt chart) and drill into any part.

## What Changes

- **Project host.** A long-lived waygraph process holds one project: it scans it once, watches its files, rescans after
  a change (in a fresh process, so a changed `_sel.ts` is seen through every Block that imports it), and pushes the new
  manifest, or the error that stopped the scan, to whoever is connected. `waygraph ui` starts one per project; the UI
  reads the project through it instead of spawning `waygraph manifest`. `waygraph manifest` stays and prints the same
  shape.
- **Manifest metadata** (manifest version 3). Each Block gains its source position (file, line, column); its checks as
  data (`verify` and `precondition` Traits: name, what each wants, selector), or `dynamic` when `verify` is a function of
  the outcome; its expectations as Expect Block names plus their Traits; and the selectors it uses (static, from the
  `*Sel` members its file references). Each flow step gains its source line in the flow file, whether it has narration
  (`stubBefore` / `stubAfter` / `stubOnError`), and its `when` / `ff` / cleanup flags. Selector objects (`*Sel`) are listed
  with each member's selector string and line.
- **BREAKING: runs are traces.** The run log (`.waygraph/runs/<runId>.jsonl`) becomes span records in OpenTelemetry's data
  model: `span:start` / `span:end` with `spanId`, `parentSpanId`, `name`, `kind` (run, flow, step, phase, check) and
  attributes named after OpenTelemetry's semantic conventions where one exists (`code.filepath`, `code.lineno`,
  `http.response.status_code`), plus `span:event` for what happens inside a span. Every Trait check is recorded, passed
  ones too, with what it wanted and what it saw. The page's console messages, page errors, failed or slow requests,
  dialogs and navigations are recorded on the step span that was open when they happened, as are screenshots
  (on failure by default; every step with `--screenshots`). `onRunEvent` is replaced by `onTrace`; the old event names
  are removed, not kept alongside.
- `waygraph trace <runId> [--otlp <file>]` prints a run's trace as a tree, or writes it as OTLP/JSON for any
  OpenTelemetry viewer (Jaeger, Grafana Tempo).
- Every reader of the old events moves to spans: `--replay` (the run's mem), the demo's after-step panel (the step's
  read), the session `subscribe` feed (`SESSION_PROTOCOL_VERSION` bumps), `WAYGRAPH_JSON`, and Waygraph UI.
- **UI: run timeline.** A run's page becomes a timeline: one row per span, nested and collapsible, bars on a shared time
  axis, coloured by status. Selecting a span opens its details on the right: checks (wanted / saw), console, network,
  screenshot, the page's read, and the Block's source position. A run in progress streams in live from the host
  (server-sent events), replacing the reload every second.
- **UI: links.** The map, flows and run pages link each Block to its checks, selectors and source position, using the
  enriched manifest.

## Capabilities

### New Capabilities
- `project-host`: the long-lived process that holds a project's scan, watches it, and serves the manifest and run traces
  to the UI.
- `manifest-metadata`: manifest version 3: source positions, checks as data, selectors, step details.
- `run-traces`: runs recorded as spans (OpenTelemetry's model), every check and the page's console, errors and requests
  attributed to the step that caused them, `onTrace`, `waygraph trace`, OTLP export.
- `ui-run-timeline`: Waygraph UI's run timeline, live updates, and links from Blocks to their checks and source.

### Modified Capabilities
<!-- No existing spec covers the run log, the manifest or Waygraph UI. -->

## Impact

- **Public API** (`src/index.ts`, API snapshot): removes `onRunEvent` and the `RunEvent` type; adds `onTrace` and the span
  record types. `docs/deprecated.md` gets the rows.
- **Engine:** `engine/run/events.ts` becomes the span recorder, `engine/run/run.ts` opens a span per phase,
  `engine/trait/verify.ts` records each check, and `engine/run/expect.ts` records each expectation. The page listeners for
  console, errors, requests and dialogs attach where the browser is launched (`engine/run/launch.ts`, the runner's
  session).
- **Runtime:** `runtime/run-log.ts` writes spans; the `--replay` reader in `runner/plan/plan.ts` reads the run span's mem.
- **Manifest:** `manifest/` gains source positions (ts-morph, already a dependency), Traits as data, the selector scan,
  and a version bump.
- **New:** the host (`waygraph host`, an internal command like `__auto-serve`) and `waygraph trace`.
- **Live sessions:** `subscribe` streams span records; the protocol version bumps.
- **Demo:** the after-step panel reads the step span's read.
- **Waygraph UI (`ui/`):** the project and player services move onto the host; new run timeline and detail panel; live
  updates over server-sent events.
- **Docs:** run log and manifest reference (rewritten), a traces guide, the UI guide, CLI, env, skills, ROADMAP,
  deprecated rows.
- **Run log size:** recording passed checks, console and requests grows a log. Logs keep their per-run file; the host can
  prune old runs (`runLog.keep` in the config, default 200).
- **Patch bump** (0.16.x), like earlier removals; old run logs stay readable as "legacy" runs in the UI's list.

## Open questions

- **Secrets in traces.** Mem values are already logged (`run:mem`), and request and console capture adds more places a
  token can appear. Proposed: keys can be marked `secret` in `keys()` and are written as `"***"`; request and response
  bodies are never recorded, only method, URL (query string included), status and timing.
- **Network scope.** Proposed: record XHR / fetch requests, plus any request that fails or returns 4xx / 5xx; skip
  successful images, fonts, stylesheets and scripts.
- **The host beyond the UI.** Proposed: only `waygraph ui` uses it at first; `pilot` / `auto` could share it later (not
  in this change).
