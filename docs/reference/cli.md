# CLI

`waygraph <command> [project]`: the project defaults to the current folder. `waygraph <command> --help` prints that
command's flags, from the same table the CLI parses, so an unknown flag stops with the reason.

## Play flows

| Want | Command |
|---|---|
| list flows (file → export) | `waygraph list` |
| run a flow | `waygraph run checkoutFlow` · `waygraph run src/flows/checkout.flow.ts` |
| run two in a row | `waygraph run "loginFlow then shopFlow"` |
| run Blocks by name | `waygraph run "loginFlow then nav-cart"` |
| watch it step by step | `waygraph demo checkoutFlow` ([flags](../guides/demo#flags)) |
| show the browser, record it | `waygraph run checkoutFlow --non-headless --video` |
| every `.branch()` path | `waygraph run checkoutFlow --all-branches` |
| a JSON report | `WAYGRAPH_JSON=1 waygraph run checkoutFlow` |

| Data flag | Does |
|---|---|
| `--data '{"saucedemo.credentials":{…}}'` | seeds mem by key name |
| `--input '{…}'` · `--input @cases.json` | the flow's input; an array plays it once per item |
| `--replay <runId>` | the mem a past run was seeded with |
| `--mem-stub` | fill missing keys from mem stubs, opted in or not |
| `--env <mode>` · `--config <name>` | which `.env` / config file ([Config](./config)) |

## Test

| Want | Command |
|---|---|
| every flow as a test | `waygraph test --flows [-g text] [--workers N] [--retries N]` |
| the project's specs | `waygraph test [...playwright args]` |
| Playwright's UI mode | `waygraph test ui` |
| the HTML report · a trace | `waygraph test report` · `waygraph test show-trace <trace.zip>` |
| crawl every edge | `waygraph traverse --parallel N --min-edge-coverage 80%` |

More: [Testing](../guides/testing).

## Explore and drive

| Want | Command |
|---|---|
| pick Blocks by hand | `waygraph auto` (browser panel) · `waygraph auto --cli` (terminal) |
| find a route and play it | `waygraph auto --blocks LoginPage OrderComplete` |
| start a session for an agent | `waygraph pilot start` · `waygraph browser start [--headless] [--goto <url>]` |
| list · stop sessions | `waygraph browser sessions [--json]` · `waygraph browser stop <id>` / `--all` |
| the menu · run one pick | `waygraph pilot status <id>` · `waygraph pilot send <id> "<index or Block name>"` |
| go to a Checkpoint | `waygraph pilot reach <id> <Checkpoint>` |
| what the page shows | `waygraph pilot read <id> [path] [--where field=value] [--rows 20:40]` |
| the DOM | `waygraph pilot dom <id> [--mode full] [--selector s] [--depth n]` |
| history · errors · storage | `waygraph pilot trace <id>` · `console <id>` · `storage <id>` |
| stream it live | `waygraph pilot watch <id>` |
| re-detect where it is | `waygraph pilot resync <id>` |
| paint rings | `waygraph pilot highlight <id> "#x\|Label\|tone; .y\|Label2"` (or JSON) |
| act with no Block | `waygraph auto click <id> <sel>` · `type <id> <sel> <text>` · `goto <id> <url>` |
| load new Block files | `waygraph auto reload <id>` |
| reattach a terminal | `waygraph browser attach <id>` |

`auto`, `browser` and `pilot` reach the same session by the same id. More: [Agents](../guides/agents),
[Pilot](./pilot).

## Inspect the project

| Want | Command |
|---|---|
| lint Blocks | `waygraph check` (warnings only) |
| `tsc --noEmit`, then the lint | `waygraph typecheck [--no-practices]` |
| folders match URLs | `waygraph map` (exits 1 on a mismatch) |
| pack a map group | `waygraph map pack <group> [--out dir] [--name pkg] [--version x.y.z]` |
| the graph | `waygraph graph [--mermaid]` |
| everything as JSON | `waygraph manifest [--out file]` ([Run log and manifest](./run-log)) |

## Set up and update

| Want | Command |
|---|---|
| a new project | `waygraph init my-app` |
| try Sauce Demo in a temp folder | `waygraph try demo` · `try auto` · `try auto:cli` |
| update scaffold files | `waygraph upgrade [paths] [--apply] [--overwrite] [--diff]` |
| refresh agent skills | `waygraph upgrade --skills` |
| rewrite removed code | `waygraph upgrade --codemod keys` (also `flows`, `checkpoints`) |
| fetch browser extensions | `waygraph extensions install [--update]` |
| coding-agent files | `waygraph agent-dive --loop claude` (also `opencode`, `cursor`, `vscode`) |
| print a skill | `waygraph --skill` · `--skill-pilot` · `--skill-pilot-blind` · `--skill-convention` |

`waygraph --help` prints every flag.

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
