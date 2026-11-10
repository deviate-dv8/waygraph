## 1. Span recorder (engine)

- [ ] 1.1 `engine/run/trace.ts`: span records (`span:start` / `span:event` / `span:end`), OpenTelemetry-format ids,
      `inRun` opening the run span, `span(kind, name, attributes, fn)` scoped by `AsyncLocalStorage`, innermost-open-span
      tracking per run, `onTrace(listener)`; closes spans in `finally`
- [ ] 1.2 `engine/run/run.ts`: a `step` span per Block (fast-forward steps nest) and a `phase` span for precondition,
      act, resolve, verify, expect, read; step attributes: Block name, kind, `code.filepath` / `code.lineno`, from / to
- [ ] 1.3 `engine/trait/verify.ts` and `engine/run/expect.ts`: a `check` span per Trait and read check: name, wants, last
      saw, tries, selector / `at`, status; expectations in parallel each get their own span
- [ ] 1.4 Flow spans from the runner's plan (one per flow in a chain); the run span carries the seeded mem (`run:mem`
      today) as a span event per segment
- [ ] 1.5 Unit tests: tree shape for a plain step, a fast-forward step, a branch, a failed verify, a failed expectation,
      a skipped `when` step; two runs at once don't mix; a throw closes every open span

## 2. Browser activity

- [ ] 2.1 Page / context listeners (console warning+error, pageerror, dialog, main-frame navigation, requestfinished,
      requestfailed) installed where pages are created (runner session, `Engine.run`); attached to the innermost open span
- [ ] 2.2 Request filter (XHR / fetch, or failed / ≥ 400) and timing; never read bodies
- [ ] 2.3 Screenshots as span events: on a failed step always; every step with `--screenshots` (new run / demo / test
      flag, `WAYGRAPH_SCREENSHOTS`)
- [ ] 2.4 Tests on a fixture page: a console error during act lands on that step's act phase; a failing fetch is
      recorded with status; no body in the log

## 3. Secrets

- [ ] 3.1 `Secret<T>` in `keys()` and `secretKeys` in the config; the recorder masks these keys' values in mem, reads and
      `saw`
- [ ] 3.2 `--replay` names the masked keys it can't restore
- [ ] 3.3 Tests: a secret key never appears in the run log file

## 4. Run log and readers move to spans

- [ ] 4.1 `runtime/run-log.ts` writes span records through a buffered stream per run (flush every 100 ms and at end);
      `runLog.keep` prunes old runs (default 200)
- [ ] 4.2 `--replay` (`runner/plan/plan.ts`) reads the run span's mem events
- [ ] 4.3 Demo after-step panel (`demo/stepper/last-read.ts`) reads the step's `read` phase
- [ ] 4.4 Session `subscribe` feed streams span records; bump `SESSION_PROTOCOL_VERSION`; `pilot watch` prints them
- [ ] 4.5 `WAYGRAPH_JSON` report built from spans (same report shape)
- [ ] 4.6 Remove `onRunEvent`, `RunEvent` and the old events; API snapshot; `scripts/gen-deprecated.mjs` rows mapping each
      old event to its span; docs drift test rejects `onRunEvent`
- [ ] 4.7 `waygraph trace <runId>` (tree) and `--otlp <file>` (OTLP/JSON); test the OTLP output against the OTLP JSON
      schema's required fields

## 5. Manifest version 3

- [ ] 5.1 Source positions for Blocks, Read Blocks, flows and each flow step's chain call (ts-morph) (done: Blocks,
      Read Blocks, flows as `source`; left: each step's chain call)
- [ ] 5.2 Checks as data: verify / precondition Traits, `"dynamic"` for function verify; expectations as Expect Block
      names plus Traits and read checks, per outcome (done: `checks.precondition` / `checks.verify`; left: expectations
      as data)
- [x] 5.3 Selector objects from `*_sel.ts` (members, strings or `"function"`, lines) and each Block's referenced members
- [ ] 5.4 Flow steps: narration flags, `when` / `ff` / `finally` / `expect: false`
- [ ] 5.5 `version: 3`; version 2 fields unchanged; tests on `examples/saucedemo` and the scaffold

## 6. Project host

- [ ] 6.1 `waygraph host <project>` (internal): stdio newline-JSON with request ids: `hello` (versions), `manifest`, `runs`,
      `trace`, `subscribe`; exits when stdin closes
- [ ] 6.2 Watch `src/`, `config/`, the config file and `package.json` (recursive `fs.watch`), debounce 300 ms, rescan in a
      child with a 60 s timeout, keep the last good manifest on failure and report the error with its file
- [ ] 6.3 Watch the run log folder; stream new span records per run and `runs` updates; summarize legacy run files with
      today's fold
- [ ] 6.4 Tests: an edit to `_sel.ts` appears in the next manifest; a syntax error keeps the last manifest and reports
      the file; a run started separately streams in; the host exits with its parent

## 7. Waygraph UI

- [ ] 7.1 `waygraph ui` starts the host and passes its pipe to the UI server; `ProjectService` and the runs list read
      through it; remove the `waygraph manifest` spawn and the per-request log parsing
- [ ] 7.2 `/events` server-sent events endpoint fanning out the host's updates; pages patch their props instead of
      reloading every second; the map and flows update on edits
- [ ] 7.3 Run page timeline: rows by span depth, collapsible, rough.js bars on a shared time axis, status colours; open
      on the failure; live while running
- [ ] 7.4 Detail panel: step (Block, source, from / to), check (wanted / saw / tries / selector), events (console, errors,
      requests, navigations, dialogs, screenshots), read
- [ ] 7.5 Block details on the map and flows: checks, expectations, selectors, `file:line`, editor link (`ui.editor`)
      (done on the map's page panel and the Blocks page, with the Block's code; left: flows, editor link)
- [ ] 7.6 Legacy runs listed and opened on the old step list
- [ ] 7.7 Look at it light and dark; the UI's own tests; the `waygraph ui` spec extended to a live run

## 8. Docs and release

- [ ] 8.1 Docs: run log and manifest reference rewritten (span records, attributes, version 3), a Traces guide
      (reading a trace, `waygraph trace`, exporting to Jaeger / Tempo), the UI guide (timeline, live, editor links), CLI
      (`trace`, `--screenshots`), config (`secretKeys`, `runLog.keep`, `ui.editor`), env, pilot (protocol version)
- [ ] 8.2 Skills and agent templates: read a run's trace instead of the old events; scaffold untouched unless a file
      uses `onRunEvent`
- [ ] 8.3 ROADMAP; patch bump; full verify (tsc, build, structure, knip, unit, Playwright, storybook, saucedemo, ui)
