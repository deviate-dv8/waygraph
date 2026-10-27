# Pilot

## Waygraph Pilot

Bootstraps a real, persistent, inspectable browser session for an **agent** to discover and
drive toward a natural-language goal it plans itself - not a tool that resolves one ask to one
Block internally. A real request is a multi-step task ("log in and buy the backpack for me",
"make a signature draft request") that needs an agent reasoning over a sequence of Blocks, not
a single best-matching edge. Comparable in shape to a browser-use-style agent, but the action
space is constrained to this project's own pre-verified Blocks (each with a real resolve/verify
already checked) instead of freeform DOM/pixel guessing - narrower, but far more accurate and
deterministic.

### auto vs browser vs pilot

| Layer | Command | What it is |
|-------|---------|------------|
| **auto** | `waygraph auto` | Interactive explore (picker / `--cli` menu). **Not** a persistent agent browser. |
| **browser** | `waygraph browser start` | New persistent Playwright session — **headful by default**, **about:blank by default**. |
| **pilot** | `waygraph pilot start` | Bootstrap only: `browser start` + whole-project `graph` + starting `snapshot` in one JSON payload. Does not plan or act. |

Session control (`send`, `status`, `highlight`, `dom`, …) works on **`auto`**, **`browser`**, and
**`pilot`** — same socket, same session id. Prefer the `browser`/`pilot` prefix when driving a
detached session; `auto` is the interactive picker.

**Session lifecycle is explicit** — list what's live before opening another:

```bash
waygraph browser                         # show browser subcommands
waygraph browser sessions [--json]       # list live sessions; --json for agents
waygraph browser start                   # always opens a new session
waygraph browser stop <sessionId>        # shut one down
waygraph browser stop --all              # shut every session for this project
waygraph browser attach <sessionId>        # terminal picker on an existing session
waygraph pilot attach <sessionId>          # graph + snapshot, no new browser
```

```bash
waygraph pilot start
# {"sessionId":"bb65d74c","socketPath":"...","headless":false,"graph":{...},"snapshot":{...}}
```

`pilot start` is one round trip for agents that need the whole graph immediately. For browser-only
work (no graph payload), use `browser start` (`--headless` for no window, `--goto <url>` to open somewhere other than
about:blank).

From a live session, drive one pick at a time:

```bash
waygraph browser status <sessionId>              # read the current menu (no side effects)
waygraph browser send <sessionId> "<pick>"       # run one pick, get the resulting menu back
waygraph browser dom <sessionId>                 # inspect the live DOM/ARIA tree
waygraph browser trace <sessionId>               # read the Checkpoint/Block history so far
waygraph browser reach <sessionId> <Checkpoint>  # run a whole multi-step route in one call
waygraph browser resync <sessionId>              # force here to re-detect from the real page
```

(`auto …` and `pilot …` accept the same subcommands with the same `<sessionId>`.)

Worked example (run for real against `examples/saucedemo`, no new execution code involved): an
agent gets a plain request - "log me in and buy the backpack" - reads the graph and the starting
`status`, reasons out login -> add-to-cart -> cart -> checkout info -> submit -> finish as the
route to `OrderComplete`, then drives it by repeatedly reading each `status`/`send` response and
picking the next index itself. The browser stays open the whole time; the user can watch it, or
check the final tab afterward.

**`auto reach <sessionId> <Checkpoint>`** runs a whole route in one call instead of one
`send` per step - real, reported pain for any non-trivial task on a rich graph ("the entire
prompts of the day" for one manual walkthrough). It path-finds via the same BFS
`auto --blocks <From> <To>` already uses, then runs each step directly against the session's own live
page/mem, verifying every step actually lands where its own graph edge promised (not just that
it ran without throwing - a Block can legitimately resolve elsewhere, e.g. a login submission
staying put after bad auth). **Real, stated limitation, not silently papered over:** for a
target only reachable by crossing a wildcard (`from: "*"`) edge whose real DOM precondition
depends on same-Checkpoint setup (e.g. filling form fields before a submit), neither `reach`
nor the already-shipped `auto --blocks` can safely route there automatically - both fail loud
within a bounded time (a real Playwright click/wait timeout) rather than silently guessing
wrong or hanging. Full design history - three rejected approaches, a real correctness bug this
change's own tests caught, and this limitation confirmed by direct reproduction - is in
`openspec/changes/waygraph-pilot/tasks.md`'s own M5 section.

**`auto resync <sessionId>`** - `here` is only ever updated by an action the session itself
ran (`send`/`reach` set it from a Block's own resolved Checkpoint; the raw `click`/`type`/
`goto` primitives null it because *they* just changed the page). Anything that changes the
page *outside* the session - a human clicking around in a visible `--non-headless` session
someone is co-driving, for instance - leaves `here` silently stale, since `send`/`reach` only
ever re-detect when the position is already unknown, never to double-check a known one.
`resync` forces that re-detection unconditionally, right now, against whatever the real page
actually shows. Doesn't crash or corrupt anything if you never need it - it's a real, found
gap (confirmed by reading the exact code path, `src/live/auto-session/`'s `currentMenu()`), fixed
outright rather than left as a caveat.

**Coverage gaps `waygraph check`/`graph` can't see, because there's no Block to scan yet.**
Static tools only find gaps in Blocks that already exist - a real link or button on the live
page with *no Block written for it at all* has nothing in source to catch it. Every live
`auto`/`browser`/`pilot` session watches the real page instead and warns (once per element,
via `console.warn`) on a same-origin `<a href>` no `defineNavBlock` covers, or a visible
`button`/`[role=button]`/submit input no Method/NavClick Block selector matches:

```text
[waygraph] unmapped nav link on this page: /settings - no NavBlock covers this URL; add defineNavBlock
[waygraph] unmapped button on this page: #save-draft - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock
```

Read them back with `auto console <sessionId>` - the same channel real console/network errors
already come through, not a separate command (`src/coverage-gap.ts`, wired into every session
in `src/live/auto-session/`).

**On-page indicator.** A headful (`--non-headless`) session looks like an ordinary browser
tab otherwise - no sign anything is driving it, which matters once a human might be watching
or co-driving the same visible session. Every session injects a small badge (bottom-right
corner: `Waygraph Pilot - session <id> - <Checkpoint>`) that click-expands into a panel
listing the current live menu's real edges (block name, kind, target Checkpoint,
description) - the same data `auto status` returns, rendered in the page itself. The overlay
shell is installed via `context.addInitScript`, so it **persists on `about:blank`** and
survives `goto` navigations (browser start defaults to blank; pilot navigates when a base URL
exists). Headful sessions paint the badge immediately on start — no need to call `status`
first. Bottom-left activity toasts label raw primitives as **`Running (no Block): …`**
(click/type/goto/upload outside the Block library); Block runs stay **`Running (Block): …`**.
Both refresh automatically after every `send`/`reach`/`reload`/`resync`/raw action.
It lives in `src/demo/overlay/` (`pilot-shell.ts`, `pilot-fixtures.ts`) next to the demo overlay and paints rings
through the same `inpage/core.ts` primitive; the session menu panel is `src/live/pilot/panel.ts`.

**Pilot itself does no planning, resolving, narrating, or acting** - `pilotStart`'s only job is
starting the session and handing back its graph in one round trip; see `src/live/pilot/pilot.ts`. An
earlier shape (`pilot ask "<text>"`, a deterministic ask-to-one-edge text matcher) was built,
shipped, and then explicitly rejected as not matching this goal - preserved for reference at git
tag `waygraph-pilot-v1-logs-prettified`, not on any active branch.

**Honest scope, not silently redefined:** this capability's own proof runs against an in-repo
example (`examples/saucedemo`), not a real external consumer application - it demonstrates the
mechanism works, not the "demoable on one real consumer" bar `ROADMAP.md` sets for `1.0.0`,
which remains separate, later, unmet work. Live reference: `tests/pilot/pilot.spec.ts` (the
library function) and `tests/cli/pilot.spec.ts` (the real CLI), both proven against live
saucedemo.com.

## The session protocol (for clients such as Waygraph UI)

A live session (`browser start`, `pilot start`) is a process listening on a Unix socket. Requests and replies are
newline-delimited JSON; the types are exported: `SessionRequest`, `SessionResponse`, `SessionStreamMessage`,
`SESSION_OPS` (every op, once) and `SESSION_PROTOCOL_VERSION` (bumped when a shape changes; a new op or optional field
does not bump it).

| Op | Answers |
|---|---|
| `hello` | `{ protocol, waygraph, sessionId, here }`. Cheap, never waits behind a running step |
| `status`, `send`, `reach`, `resync`, raw actions | the snapshot: `here`, the menu, and `read` / `missing` where Read Blocks cover the page |
| `read`, `dom`, `trace`, `console`, `storage` | what the page / session shows, without changing anything |
| `subscribe` | keeps the socket open: one line per run event (`step:start`, `step:read`, `step:end`, ...) and one `{ type: "snapshot" }` after each change |

In code: `requestSession(projectDir, sessionId, { op: "status" })` for one request, and
`subscribeSession(projectDir, sessionId, (message) => ...)` for the feed (returns `close()`). From a terminal:
`waygraph pilot hello <id>` and `waygraph pilot watch <id>` (the feed, until Ctrl-C).

Requests run one at a time per session (a second waits for the first), except `hello` and `subscribe`.

## Blind Pilot (cold start, zero Blocks)

Waygraph Pilot above assumes a Block library already exists. Blind Pilot is the opposite
case: a session on a site nobody has described to this package yet. `AutoSession`/`browser start` already tolerate a project directory with **zero** `.block.ts` files (no crash,
`here` just stays `null`), so an agent can open a real session and start exploring cold with
no new code at all - `auto dom <sessionId>` already gives real DOM/ARIA visibility
independent of any Block library.

What's actually new here is two primitives an agent needs to go from "exploring" to "building
a Block library incrementally":

```bash
waygraph auto click <sessionId> "<selector>"          # act before any Block covers this
waygraph auto type <sessionId> "<selector>" "<text>"  # same, for a real input
waygraph auto goto <sessionId> "<url>"                # navigate the real live page
waygraph auto reload <sessionId>                      # pick up a Block just written to disk,
                                                       # without restarting the session
```

`click`/`type`/`goto` each re-detect the session's Checkpoint afterward (the same detection
`send`/`status` already use) and return a fresh snapshot - a selector matching nothing is a
reported failure naming it, not a silent no-op. `reload` re-discovers the project's Block
library/graph from disk in place, leaving the live page, mem, and current Checkpoint
untouched - so a Block an agent just wrote to disk becomes immediately runnable via the
session's existing `send`, without relaunching the browser.

**This package writes no Block content.** The driving agent recognizes a pattern ("this is a
login form") and writes the `.block.ts`/`*Sel`/mem-keys files itself, using the conventions
documented above - the same way it would write any other source file. Worked example (proven
end to end in `tests/cli/auto-session-blind-pilot.spec.ts` against an in-repo synthetic
fixture, `tests/fixtures/blind-pilot-site/`): start a session with zero Blocks, explore via
`dom`/`click`/`goto`, write one real `defineNavBlock` to disk, `reload`, then `send` it -
reaching the real Checkpoint it declares, proving it's genuinely driveable, not just visible.

**Two real gotchas found while proving this, worth knowing before debugging a silent
failure:** a `.block.ts` file that throws on import (e.g. a malformed Trait call) vanishes
from the graph with no error printed anywhere - `discoverGraph`'s per-file import errors are
mostly swallowed silently, so "reload did nothing" can mean a real mistake in the file just
written, not a package bug. And a Block not wired into any `.flow.ts` (`waygraph graph`'s own
"orphan" warning) is still fully visible and runnable in a live session's menu - orphan status
only affects `auto --blocks <From> <To>` path-finding, not `auto`'s own menu.

**Honest scope:** Blind Pilot does not currently author into the Waygraph Map convention
below by default - it still writes plain files wherever it's pointed. Proof stays against an
in-repo synthetic fixture, not a real external site.
