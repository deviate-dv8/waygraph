# CLI reference

## CLI reference

Flags are read with Node's `parseArgs` from one table (`RUN_OPTIONS` in `src/cli/flags.ts`), which also prints the
`demo` / `run` / `browser start` help (`waygraph demo --help` prints just that command's flags; `waygraph traverse --help`,
`agent-dive --help` likewise): an unknown flag or a flag missing its value stops with the reason, naming the command,
instead of being taken as a project path.

`waygraph auto [project]` is the **interactive explore** loop: `locate()` reads where you
are, lists runnable Blocks from the graph, you pick one (headful panel or `--cli` terminal
menu), repeat. Static graph export (old JSON / Mermaid) is `waygraph graph [project]`
(`--mermaid`). Unattended JSON execution is `run` + `WAYGRAPH_JSON=1`.

**`--cli` session control:** `waygraph auto --cli` on its own is a blocking terminal loop -
fine for a person, awkward for an agent that needs to inspect state between picks or send
one command at a time without guessing a whole input sequence upfront. `waygraph browser start` runs
the same session as a background socket server instead (session identity under
`.waygraph-auto/` in the target project, mirroring `.waygraph-traverse/`'s convention);
`auto send <sessionId> "<pick>"` and `auto status <sessionId>` are non-interactive
request/response calls against it (no TTY needed), and `auto attach <sessionId>` reopens an
interactive terminal against an already-running session. `send q`/`send quit` ends the
session and cleans up its socket/metadata. `browser start` opens a real visible browser
window (`--headless` for none) while the session stays driven entirely through `send`/`status`/`attach`/`dom` - not
a new picker UI, and the existing page-embedded headful panel (bare `waygraph auto`, no
`--cli`) is untouched either way.

**Session history:** `auto trace <sessionId>` returns a Checkpoint/Block-level record of
what the session actually did - Block name, Checkpoint before/after, and (when the Block
authors them) its resolved `stubBefore`/`stubAfter`/`stubOnError` demo-narration fixtures
(the same highlight/todo/device data `waygraph demo`'s own lifecycle logging computes via
`runStubPhase`, reused here since it's pure data with no browser side effects). Deliberately
not a raw action recorder - no clicks/fills, only the same Block-level resolution the rest of
the engine already reasons about, capped at the last 500 steps.

**Reading the live page:** `auto dom <sessionId>` gives an agent driving a session read-only
visibility into the actual page, without reading the target project's frontend source.
Default `--mode aria` returns Playwright's AI-oriented accessibility snapshot
(`ariaSnapshotJSON({ mode: "ai" })`) - small and usually enough to find "the Username
textbox" or "the Login button." `--mode full` returns a bounded raw DOM subtree
(tag/attributes/text/children - useful when you need actual CSS classes or data-attributes
`aria` can't see), hard-capped on depth/node count/text length and marked `truncated: true`
whenever a cap is hit, since this is read by an LLM, not a human. `--selector <sel>` scopes
either mode to one element's subtree instead of the whole page - a modifier on the mode, not
a third mode.

**Agent bootstrap:** `waygraph pilot start` starts a background session and reads back the
whole project graph in one call, so an agent can begin planning a multi-step request
immediately - see "Waygraph Pilot" above for the full picture.

**Cold start (zero Blocks):** `auto click/type/goto <sessionId>` act on the live page even
when no Block covers that action yet, and `auto reload <sessionId>` picks up a Block just
written to disk without restarting the session - see "Blind Pilot" above.

**`waygraph test [...args]`** is a thin wrapper around the project's own `@playwright/test`
suite - it forwards to the local `node_modules/.bin/playwright` (falling back to
`npx playwright` if the project hasn't installed it locally yet), so `waygraph test` behaves
exactly like `playwright test`, and anything after it (`--grep`, a spec path, `--headed`, …)
passes straight through. `waygraph test ui` (or `waygraph test --ui`) launches Playwright's
interactive UI Mode the same way. Scaffolded projects (`waygraph init`) wire this up as
`npm test` / `npm run test:ui`, and ship `trace: "retain-on-failure"` plus
the `html` reporter in `playwright.config.ts`, so a failing `waygraph test` already has a
trace waiting - `waygraph test report` opens the HTML report, and
`waygraph test show-trace <trace.zip>` opens one trace directly (both forward to Playwright's
own `show-report`/`show-trace`, which live outside `playwright test`, so they're handled
before the `test` forward rather than passed through it).

**`waygraph test --flows`** runs every flow the project exports as a Playwright test, with no spec to write: in
parallel (`--workers N`), with `--retries N`, video and traces as configured, the HTML report, and
`--reporter=json` for a results file; `-g <text>` picks flows by file or export name. Each flow runs at its
`map({ viewport })`, with its mem stubs filling its `requires`. Flows marked `map({ exclusive: true })` run one at a
time, after all the others (they change data the rest read, or need the app to themselves). A flow is skipped, with
the reason, when it needs a key nothing supplies, or when it starts on a page it doesn't open (an episode that runs
after another flow: its first step doesn't navigate by URL, sign an account in or call an API). A flow meant to fail
(`expectedFailure`) passes when it fails.

Flows are files (0.10.5+):

| Want | Command |
|------|---------|
| List flows | `waygraph list` -> `src/flows/shop.flow.ts  shopFlow` |
| Run by file | `waygraph run src/flows/shop.flow.ts --data '{...}'` |
| Same via `auto` | `waygraph auto src/flows/shop.flow.ts --data '{...}'` |
| Run by export | `waygraph run --blocks shopFlow` |
| Manual watch | `waygraph demo src/flows/shop.flow.ts` |
| Auto-advance | `waygraph demo --blocks shopFlow --auto-next` (nav auto-hides strip) |
| Fast / full strip | `waygraph demo ... --fast` (shorter gates; keeps cursor) · `--full` (classic chips; default = carousel) |
| Todo dock UX | `waygraph demo ... --todo-smart` (default) · `--todo-full` (no compact/collision/behind) |
| QA watch + record | `waygraph demo --blocks shopFlow --auto-play-video` |
| Ad-hoc Blocks | `waygraph run --blocks "login then nav-cart" --data '{...}'` |
| A flow's input | `waygraph run addItemFlow --input '{...}'` · `--input @cases.json` (an array plays the flow once per item) |
| Rerun with a run's data | `waygraph run signupFlow --replay <runId>` (the mem that run was seeded with, from its run log) |
| Headed execute | `waygraph run --blocks shopFlow --non-headless --video` |
| Explore | `waygraph auto` / `waygraph auto --cli` |
| Browser command reference | `waygraph browser` |
| List live browser sessions | `waygraph browser sessions [--json]` |
| Open a new persistent browser | `waygraph browser start` (headful, about:blank by default) |
| Stop a browser session | `waygraph browser stop <sessionId>` / `stop --all` |
| Pilot bootstrap (browser + graph + snapshot) | `waygraph pilot start` |
| Attach to existing session (graph only) | `waygraph pilot attach <sessionId>` |
| Path-find | `waygraph auto --blocks LoginPage OrderComplete` |
| Start a background session | `waygraph browser start [--headless] [--goto <url>]` -> `{sessionId, socketPath, headless}` |
| Drive a detached session (no TTY) | `waygraph browser send <sessionId> "<pick>"` -> JSON state (`<pick>` is a menu index or a Block name) |
| Paint highlight rings (shorthand) | `waygraph browser highlight <sessionId> "#x\|Label\|tone; .y\|Label2"` |
| Paint highlight rings (full JSON) | `waygraph browser highlight <sessionId> '{"rings":[{"selector":"#x","label":"X"}]}'` |
| Read a detached session's state | `waygraph browser status <sessionId>` (no side effects) |
| Reattach a terminal to a detached session | `waygraph browser attach <sessionId>` |
| Read the live page (aria, small/default) | `waygraph auto dom <sessionId>` |
| Read the live page (raw DOM, bounded) | `waygraph auto dom <sessionId> --mode full` |
| Scope either to one element | `waygraph auto dom <sessionId> --selector ".inventory_list"` |
| Read the session's Checkpoint/Block history | `waygraph auto trace <sessionId>` |
| Read real console/network errors + coverage-gap warnings | `waygraph auto console <sessionId>` |
| What the page shows, as JSON from its Read Blocks | `waygraph auto read <sessionId> [path] [--where field=value] [--rows 20:40]` |
| Watch a session live: every step, read and snapshot as JSON lines | `waygraph auto watch <sessionId>` |
| Protocol version and where a session is | `waygraph auto hello <sessionId>` |
| Read localStorage/sessionStorage + service workers | `waygraph auto storage <sessionId>` |
| Whole-project nav-escape + inline-selector + orphan sweep | `waygraph check [project]` |
| `tsc --noEmit` + bad-practice warnings | `waygraph typecheck [project]` (`--no-practices` to skip scan) |
| Waygraph Map enforcement (verbatim url-vs-folder, exits 1 on a violation) | `waygraph map [project]` |
| Graph crawl | `waygraph traverse [project] --parallel N --min-edge-coverage 80%` |
| Coding-agent defs | `waygraph agent-dive --loop claude` |
| Print packaged skills | `waygraph --skill` / `--skill-pilot` / `--skill-pilot-blind` / `--skill-convention` |
| One-shot temp-dir demo | `waygraph try demo` / `waygraph try auto` / `waygraph try auto:cli` |
| Run the project's `@playwright/test` suite | `waygraph test` |
| Same suite, Playwright's interactive UI Mode | `waygraph test ui` (or `--ui`) |
| Open the last HTML report | `waygraph test report` |
| Open one trace in the trace viewer | `waygraph test show-trace <trace.zip>` |

`--blocks` / positional accepts a Flow export, a `.flow.ts` path, or `"a then b"`.
`auto <file.flow.ts>` **runs** that flow (same as `run`); bare `auto` still explores.
`--auto-next` = panel Auto-advance. `--auto-play-video` is **demo only**.

### Todo dock UI (demo, 0.15.8+)

Long FR/AC checklists used to bury highlight rings. **Smart defaults are on:**

| Behavior | Default | Opt out |
|----------|---------|---------|
| Compact fold (~5 rows around current; hover expands; `+N more`) | on | `ctx.ui.todoDockUi({ compact: false })` / `--todo-full` / `WAYGRAPH_TODO_UI=full` |
| Collision flip (dock L/R when a ring overlaps) | on | `ctx.ui.todoDockUi({ collision: false })` / `WAYGRAPH_TODO_COLLISION=0` |
| Behind ring (dim + lower z-index while a ring is up) | on | `ctx.ui.todoDockUi({ behindRing: false })` / `WAYGRAPH_TODO_BEHIND=0` |

Per-knob env also: `WAYGRAPH_TODO_COMPACT`, `WAYGRAPH_TODO_CAP` (default 5),
`WAYGRAPH_TODO_EXPAND_CAP` (default 14). Author API: `ctx.ui.todoDockUi({ ... })`.
`browser highlight` (same as `auto`/`pilot highlight` - identical command, see "auto vs
browser vs pilot" above) accepts the same knobs as `todoUi` on the JSON body.

Run `waygraph --help` (or any subcommand with no args) for the full flag reference kept
in `src/cli/usage.ts`'s `usage()` - that's the source of truth for flags, this table is the
scannable summary.

## Example

A navigation Block and a method Block (only `act` + `resolve`, no branching), each confirmed with `verify`
after the fact rather than asserting mid-`observe`, built into a flow and run against a
real page:

```typescript
import { Engine, MemPage, key, checkpoint, defineNavBlock, defineMethodBlock } from "waygraph";
import type { Checkpoint } from "waygraph";

const FormLoaded = checkpoint("FormLoaded");
type FormLoaded = typeof FormLoaded;
const Submitted = checkpoint("Submitted");
type Submitted = typeof Submitted;

const EmailKey = key<string>("form.email");
const PasswordKey = key<string>("form.password");

const GotoForm = defineNavBlock({
  name: "goto-form",
  checkpoint: FormLoaded,
  url: "https://example.com/login",
});

const FillAndSubmit = defineMethodBlock({
  name: "fill-and-submit",
  from: FormLoaded,
  to: Submitted,
  requires: [EmailKey, PasswordKey],
  instruction: {
    async act(page, _input, mem) {
      await page.getByPlaceholder("Email").fill(mem.get(EmailKey));
      await page.getByPlaceholder("Password").fill(mem.get(PasswordKey));
      await page.getByRole("button", { name: "Submit" }).click();
    },
    verify: [
      {
        name: "submitted-heading-shown",
        check: async (page) => {
          await page.getByRole("heading", { name: "Submitted" }).waitFor();
          return true;
        },
      },
    ],
  },
});

const mem = new MemPage();
mem.set(EmailKey, "alice@test.com");
mem.set(PasswordKey, "hunter2");

const flow = new Engine().map().start().gotoPage(GotoForm).method(FillAndSubmit).end();
const result = await flow.run(mem);
// result === { __state: "Submitted" }
```

## Recipes

### Detect / drive the surviving tab after a run

The default run closes the page it opened, and a page you hand in via `options.page`
survives. For a flow that must BE the surviving tab after it returns (an interactive
demo, a hand-back to a caller), ask for the page back explicitly:

```typescript
const { result, page } = await registerFlow.run(context, mem, { closeOnFinish: false });
// `result.__state` reached the terminal Checkpoint; `page` is still open where the
// flow left it - the caller keeps driving it, and closes it whenever IT is done.
```

### Capture a popup (`target=_blank` click)

Frameworks and email UIs routinely rewrite links to `target="_blank"`, so a click that
"should navigate" actually opens a second, engine-invisible tab. Until a second real use
case promotes this to an engine API, capture it in userland with a context-level page
event armed before the click that is expected to open exactly one popup:

```typescript
let popup: Page | undefined;
context.once("page", (p) => { popup = p; });
await linkHandle.click();          // the block that causes the popup (e.g. the
                                    // MailHog email's real verify link)
if (popup) {
  await popup.waitForLoadState();  // fully loaded before calling into the engine
  await verifyLinkFlow.run(context, mem, { page: popup, closeOnFinish: false });
  // popup is now the caller's page - close it when done, or leave it as the
  // surviving tab of a demo.
}
```

`context.once` (not `.on`) guarantees a second stray popup won't re-fire the handler and
clobber your handle; if a page truly can open more than one popup, this recipe needs to
collect them instead. The popup is a normal Playwright `Page` from the same context, so
anything `Flow.run(context, mem, { page })` can drive is available to keep driving here,
and `closeOnFinish: false` hands it back into your ownership instead of the run closing
it out from under you.
