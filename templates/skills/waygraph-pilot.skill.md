---
name: waygraph-pilot
description: Drive an existing waygraph Block graph as a real agent - use when a task needs to operate a web app that already has waygraph Blocks written for it (login, checkout, matching, chat, admin flows, etc.), not when writing new Blocks from scratch. Includes how to paint demo-parity fixture highlights in Pilot via `auto highlight` (pilot:watch / --non-headless).
---

Waygraph Pilot is not a planner you call and get an answer from - `pilot start` only
bootstraps a session and hands you the whole project's Block graph as context. **You** are
the reasoning agent. Every multi-step decision (which Block to run next, when a route needs
`reach` vs `send`, when to fall back to raw primitives) is yours to make, turn by turn, by
reading each `auto status`/`auto send` response.

## auto vs browser vs pilot (do not conflate them)

| Layer | Command | What it is |
|-------|---------|------------|
| **auto** | `waygraph auto` | Interactive explore (picker / `--cli` menu). **Not** a persistent agent browser. |
| **browser** | `waygraph browser start` | New persistent Playwright session — **headful by default**, **about:blank by default**. `waygraph browser` prints subcommands; `browser sessions` lists live ones. |
| **pilot** | `waygraph pilot start` | Bootstrap only: `browser start` + whole-project `graph` + starting `snapshot` in one JSON payload. Does not plan or act. |

Session control (`send`, `status`, `highlight`, `dom`, …) works on **`auto`**, **`browser`**, and **`pilot`** — same socket, same session id:

```
waygraph browser send <sessionId> "<pick>"     # same as auto send / pilot send
```

**Session lifecycle — list first, then attach or start:**

```
waygraph browser sessions [project]          # what's live right now
waygraph browser attach <sessionId>          # terminal picker on an existing session
waygraph browser stop <sessionId|--all>      # shut one down when done
waygraph pilot attach <sessionId>          # graph + snapshot for an existing session
```

`browser start` / `pilot start` always open a **new** session. Check `browser sessions` before starting another.

## Starting a session

```
waygraph pilot start [flags]              # {sessionId, socketPath, headless, graph, snapshot}
waygraph browser start [flags]            # {sessionId, socketPath, headless, inject} - no graph
```

| Flag | Does |
|------|------|
| `--headless` / `--non-headless` | no window / a visible one (`browser start` is visible by default) |
| `--goto <url>` | open this first (default: the project's base URL for `pilot`, `about:blank` for `browser`) |
| `--base-url <url>` | where relative URLs go (default: the config's `baseUrl` / `.env`) |
| `--data '{...}'` | the session's mem, by key name: **whose** credentials and which rows it uses (see Mem) |
| `--inject <path>` | also load another project's Blocks |
| `--cli` | open the terminal picker after the bootstrap JSON |

A start URL that can't be opened (server down, DNS) fails the start with the reason; it never starts a blank session
silently. An unknown flag is an error, not a project path. A session that dies at start leaves its reason in
`<project>/.waygraph-auto/<sessionId>.log`.

`graph` in `pilot start`'s reply is the **whole project's** Block/Checkpoint graph, not just what's reachable from
here - plan several steps ahead from it before you start sending picks.

## Mem: whose data the session uses (read this before you sign in)

A Block's `requires` (credentials, the row to act on) come from mem, and a session fills mem **once, when it starts**:

1. a key given in `pilot start --data '{"<namespace>.<field>": ...}'` (or `WAYGRAPH_DATA` in the shell), else
2. that key's **mem stub** (`registerMemStub` in a `*.mem-stubs.ts`): the project's default user, a fake email.

So a session started without `--data` signs in as **the mem stub's user**, whoever that is. Every reply's
`snapshot.mem` says where each key's value came from, never the value itself:

```json
"mem": { "acme.credentials": "stub", "acme.selectedItem": "step" }
```

| Source | Means |
|--------|-------|
| `data` | given with `--data` when the session started |
| `stub` | the project's mem stub - **not** necessarily the user the task is about |
| `step` | set by `--data` on a `send` / `reach` |

To act as someone else mid-session, give the keys with the step:

```
waygraph pilot send <id> fill-username --data '{"acme.credentials":{"username":"kat","password":"..."}}'
waygraph pilot reach <id> Dashboard --data '{"acme.credentials":{"username":"ops-admin","password":"..."}}'
```

The keys stay set for the steps after it. A name no Block requires is refused before anything runs, and the error
lists the keys there are - that's how to find a key's exact name. Before any step that signs in or acts on a person's
data, check `mem`: a `stub` there means you are about to act as the stub's user. Key names are `<namespace>.<field>`
from the project's `keys("<namespace>")<{ ... }>()` declarations (`grep -rn 'keys("' src`).

## Reading a reply

Every `status` / `send` / `reach` reply is `{ "ok": true, "snapshot": { ... } }` or `{ "ok": false, "error": "..." }`
(and the CLI exits 1). The snapshot:

| Field | Is |
|-------|----|
| `here` | the Checkpoint the session is on; `null` until something located it (then `status` or `resync`) |
| `sections[].edges[]` | the menu: `index` (1-based, what you pick), `block`, `kind` (`nav` / `action`), `to` (where it lands), `label` (one row of a per-row Block: "Add Sauce Labs Backpack"), `description` |
| `done` | nothing runnable from here |
| `lastRunNote` | `"<block> -> <Checkpoint>"`, or `"<block> failed"` |
| `read` / `missing` / `readNotes` | what the page shows, from its Read Blocks (lists cut to 20 rows; `pilot read <id> <path>` gets them all) |
| `mem` | where each mem value came from (above) |

Picking: `send <id> 3` (the index), `send <id> submit-login` (the Block's name - an ambiguous name is refused, not
guessed), `send <id> q` (ends the session). One Block may run 45 s; a `send` waits 15 s for its reply (`--timeout <ms>`
for a slow one), a `reach` 90 s.

## Other ops

```
waygraph auto status <id>                   # the menu, no side effects
waygraph auto send <id> "<pick>"            # run exactly one Block
waygraph auto reach <id> <Checkpoint>       # path-find + run a whole route in one call
waygraph pilot read <id> [path] [--where field=value] [--rows 20:40]
waygraph auto dom <id> [--mode aria|full] [--selector s] [--depth n]
waygraph auto trace <id>                    # the Blocks this session ran, where each landed
waygraph auto console <id>                  # console / network errors, unmapped links and buttons
waygraph auto storage <id>                  # localStorage, sessionStorage, service workers
waygraph auto watch <id>                    # every step, read and snapshot as JSON lines (Ctrl-C ends)
waygraph auto hello <id>                    # protocol version, waygraph version, where it is
waygraph auto resync <id>                   # re-detect `here` from the real page
waygraph auto highlight <id> '<json>'       # paint rings / todos (below)
```

`reach` path-finds over the graph and checks each step lands where its edge says. It plays a per-row step (add *this*
item) with the row mem already names (`--data`, an earlier pick, a mem stub); when mem names none it stops and says so
- pick the row with `send <index>`, then `reach` again. A route through a Nav that's open from anywhere, whose page
needs setup first (fields filled before a submit), can't be found safely: `reach` fails within its timeout instead of
guessing - drive those steps with `send`.

When you're done: `waygraph browser stop <id>` (or `--all`). Never leave a session running.

## Before you add Blocks: `waygraph check`

`npx waygraph check .` (warnings only) and `npx waygraph typecheck .` (`tsc --noEmit`, then the same warnings) read
the Block files' syntax trees and flag:

| Warning | Means |
|---------|-------|
| `multi-input` | a Method with two `.fill()`s - one input per Block |
| `combined-action` | `.fill()` and `.click()` in one Method - fill and submit are two Blocks |
| `empty-verify` | a transition (or an Assert Block) with no checks |
| `overcomplex-selector` | `:has-text(/regex/)`, `:text-matches(...)` or XPath where a plain selector would do |
| `inline-selector-should-use-sel-file` | a selector written in the Block while its folder has a `_sel.ts` / `*.sel.ts` |
| `hand-written-ui` | DOM built or the overlay restyled from a Block / flow / stub - use `ctx.ui` |

plus navigation outside Nav Blocks, orphans, and pages no Read Block reads. Opt out per file only on purpose:
`// waygraph-ignore: <kind>, <kind>` (or `// waygraph-ignore-practices`). The rules behind them: `--skill-convention`.

## Coverage gaps on the live page (`auto console`)

After `auto status` / `auto send`, read `waygraph auto console <sessionId>` — the session warns once per page load about:

- **Unmapped hrefs** — same-origin `<a href>` paths with no `defineNavBlock` URL.
- **Unmapped buttons** — visible `button` / `[role=button]` / submit inputs with no Method or NavClick selector in the Block library.

Example warnings:

```
[waygraph] unmapped nav link on this page: /settings - no NavBlock covers this URL; add defineNavBlock
[waygraph] unmapped button on this page: #save-draft - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock
```

When you see these, author the missing Block — do not keep clicking raw primitives.

## Session reachability (multi-pane / wrong cwd)

Session ids are registered globally under `/tmp/waygraph-auto/` as well as `<project>/.waygraph-auto/`. If `auto status` says unreachable:

1. Run `waygraph pilot sessions` from the project that started the browser — reuse the id, do not spawn again.
2. Or `waygraph pilot attach <sessionId>` for graph + snapshot without a new browser.
3. Stale metadata (crashed pid) is pruned automatically — start fresh only when the pid is actually gone.

## Highlight fixtures (Pilot supports them — use `auto highlight`)

**Yes, Pilot paints rings/todos/zoom/device on the live page.** That is what
`waygraph auto highlight` is for. It works on headful `pilot start --non-headless`
(consumer `pilot:watch`) and on headless sessions alike. Same fixture surface as
`waygraph demo` (rings, todos, focus veil, zoom badge, device viewport) — proven in
`tests/cli/auto-session.spec.ts` ("auto highlight: paints agent fixture rings…").

**Do not claim Pilot "doesn't support fixture highlights."** That is wrong. The only
thing that differs from demo is *who* triggers the paint:

| Mode | Who paints | How |
|------|------------|-----|
| `waygraph demo` | Engine, automatically | ctx stubs chained in the flow run each step |
| Pilot / `browser start` session | **You (the agent)** | `waygraph auto highlight <sessionId> '<json>'` before (or between) sends |

The ctx stubs a flow chains onto Blocks show up in Pilot's `auto trace` as metadata, but they do **not**
auto-draw. You re-express the same intent with `auto highlight` (copy selectors/labels from the flow's stubs or
from `auto dom`). Paint, then `auto send` the real Block. Clear when done.

```
# Headful watch session (rings visible to a human audience):
waygraph pilot start --non-headless
# → note sessionId from the bootstrap JSON

waygraph auto highlight <sessionId> '{"rings":[{"selector":"#user-name","label":"Username","tone":"planned","focus":true},{"selector":"#password","label":"Password","tone":"info","detail":"secret"}],"todos":["Fill username","Fill password","Submit"],"todoIndex":0,"zoom":1.5,"holdMs":0}'
waygraph auto send <sessionId> fill-username
waygraph auto highlight <sessionId> '{"rings":[{"selector":"#password","label":"Password","tone":"planned","focus":true}],"todoIndex":1,"holdMs":0}'
waygraph auto send <sessionId> fill-password
waygraph auto highlight <sessionId> '{"clear":true}'
```

More shapes:

```
waygraph auto highlight <sessionId> '{"device":"mobile","rings":[{"selector":".inventory_item:last-child","label":"Last item","zoom":1.6,"focus":true}],"holdMs":30000}'
waygraph auto highlight <sessionId> '{"clear":true}'
```

Supported fields (demo parity):
- `rings[]`: `selector`, `label`, `detail`, `tag`, `tone`, `size`, `weight`, `color`, `zoom`, `zoomOut`, `focus`
- `todos` / `todoIndex` / `todoTitle` / `todoPos` (`right` default | `left`)
- `todoUi`: `{ compact?, cap?, expandCap?, collision?, behindRing? }` — same dock UX as demo (defaults smart-on; see the Demo guide, "The checklist")
- `zoom` / `zoomSelector` / `zoomOut` - scroll + zoom badge (not CSS page scale)
- `device`: `mobile` | `tablet` | `desktop` (Playwright viewport)
- `holdMs`: ms to keep fixtures; `0` = until the next highlight / clear (default 30000)
- `clear`: true drops rings/todos/focus/zoom badge

- `tone`: `planned` | `auto` | `info` | `warning` | `danger` | `success` | `orange` - exactly these; another spelling (`error`, `green`) is refused, naming them
- Bottom-left toast shows `Highlighting: …` (same strip as `Running (no Block): …` for raw ops)
- Missing selectors are listed in the JSON response (`missing`) - not a hard failure
- Does not replace `auto send` - paint, then run the real Block

## Rule 1: run real Blocks, not raw primitives

Default action is always `auto send`/`auto reach` (a real Block). `auto dom/click/type/
goto/press/upload` are for genuine gaps only - a page no Block covers yet. Before reaching
for a raw primitive, check `auto status`'s own menu: if a Block already does this, use it.
A raw click finishes the moment's task but leaves nothing typed, reusable, or re-runnable -
the entire reason this package exists. If a needed action truly has no Block, write one
properly (mirroring a sibling Block's shape) and `auto reload` it in rather than raw-clicking
past the gap.

To know what the page shows, read the `read` field every `status`/`send`/`reach` reply
carries (or `pilot read <id> [path]` for one part, uncut; `--where field=value` / `--rows 20:40` narrow a list): it comes from the project's Read
Blocks (`*.read.block.ts`) as typed JSON. Reach for `auto dom` only when `read` is empty
(no Read Block covers the page) or misses what you need - and then consider writing the Read
Block. `pilot watch <id>` streams every step, read and snapshot as JSON lines if you need to
follow changes you did not cause (another user, a server push).

The one legitimate exception: `auto dom` to resolve a real ambiguity the menu's own labels
can't (e.g. two products tied at the same displayed price) - and say so explicitly when you
do it.

## Rule 2: `resync` fixes a stale position, but has its own real limit

`auto resync <sessionId>` forces `here` to be re-detected from the live page right now -
use it whenever something outside this session might have changed the page (a human
co-driving a visible `--non-headless` session is the real, common case). But `resync` can
only ever be as good as the project's own Block coverage: if two Checkpoints share a route
and nothing in their `verify` arrays tells them apart, `resync` will confidently report the
wrong one. This is a coverage gap in the project's Blocks, not a `resync` bug - if you hit
one, fix the ambiguity (add a second, concrete `Trait.visible` condition that's only true in
one of the two states — e.g. the same route with different visible buttons that distinguish
pool membership vs home).

## Rule 3: mem is intent, Checkpoint is reality - never blur them

Checkpoint is *designed* to be DOM-derivable (that's what `resync` does) - when in doubt,
trust the DOM for "where am I." Mem is different: it holds the agent's own intent or
expectation (which row to act on next, what value a later assertion should find) - it must
never be inferred from the DOM, because doing so breaks assertion Blocks' entire ability to
catch a real app bug (mem states what's expected, DOM states what's real, `verify` compares
them - if mem always mirrored the DOM, a genuine bug would just silently agree with itself).
A Block with an `instanceOptions` re-asserts its own mem input fresh every time it's picked
from a live menu; a Block without one has no such protection - if something outside your
control (a human click) might have interfered, re-supply mem explicitly with `--data` on the
next `send` rather than trusting stale state, and check the reply's `mem` says `step`.

## Rule 4: a transition Block needs its OWN `verify`

A real bug this exact lesson comes from: a login Block's `act()` (click submit) succeeded
instantly, but the real backend call failed a moment later (401, unverified email) - well
after `resolve()` had already optimistically claimed "AppHome." The destination
Checkpoint's own PageBlock `verify` never ran, because a Block's `verify` is its own, never
inherited from another Block that merely resolves to the same tag. Without an explicit
`verify: [Trait.visible(...)]` on the transition Block itself, a real failure silently
self-reports success instead of failing loud. Any Block whose `act()` can plausibly fail
server-side after a client-side click needs its own verify - don't assume the destination
Checkpoint's PageBlock covers it.

## Rule 5: `defineAssertBlock` for "already there, assert a fact" checks

The majority shape of real QA/verification: you're already logged in, already at some
Checkpoint, and need to assert something is true. `defineAssertBlock({ name, checkpoint,
verify })` is sugar for exactly this - no hand-written act/resolve. For a check whose target
varies per run (assert a specific matched user's name is present, not a fixed string), hand-
write a `Trait` object directly instead of the `Trait.visible`/`text` factories - `Trait`'s
own shape is `{ name, check(page, mem) }`, so a plain object literal gets real mem access a
factory-built Trait can't. Gate it with `requires: [SomeKey]` so it's correctly hidden from
the live menu until that mem is actually populated, rather than appearing early and failing
confusingly.

## Known real environment gotchas

- **`auto reload`** picks up an edited/new consumer Block file mid-session, no restart
  needed. It does NOT help if the waygraph *package's own source* changed (a detached
  session process never re-imports its own already-loaded dependencies) - that needs a
  full session restart. It also doesn't help for a non-`.block.ts` file (a `.sel.ts`, a
  shared selector/type file) that some *other* already-loaded Block file imported earlier
  in the session's life - ESM caches that import too, and only the top-level `.block.ts`
  file gets cache-busted on reload. When in doubt after editing a shared file, restart.
- **HeadlessUI-style popovers** (or similar open/close transitions) sometimes aren't
  interactable the instant their trigger is clicked. Don't add a `page.waitForTimeout(...)`:
  give the Block that opens it a `verify: [Trait.visible(PopoverSel.panel)]` (retried until the
  panel is there), or the flow step `{ settle: true }` (waits until the page stops changing).
- **Orphan Blocks** (not wired into any `.flow.ts`) are still fully visible and runnable in
  the live Pilot menu - orphan status only blocks `auto --blocks <From> <To>` pathfinding,
  never `auto`'s own interactive menu.
- A hard `page.goto()` straight to an SPA route can render a stale/incomplete view compared
  to reaching the same page via a real in-app click-nav - if `auto dom` output looks wrong
  right after a raw `goto`, try reaching the page through its real click-based NavBlock
  instead before assuming the DOM read is broken.

## Troubleshooting

| You see | It means / do |
|---------|---------------|
| `Unknown option '--x'` | the op doesn't take that flag (`send` takes `--timeout` and `--data`; `reach` takes `--data`) |
| `"x" is not a valid pick` | not in this page's menu - read `status`; maybe `here` is wrong (`resync`) or you need a Nav first |
| `no such session "id"` | wrong project directory, or it ended - `waygraph pilot sessions` from the project that started it |
| `session ... exited before it was ready` | read `<project>/.waygraph-auto/<id>.log` |
| `--data names x, which no Block requires` | a typo in the key name; the error lists the real ones |
| `needs a specific live option chosen` | a per-row step in `reach` with no row in mem: `send` the row's index, or `--data` its key |
| `mem` says `stub` for credentials | you're signed in as the mem stub's user, not the one you meant: `--data` on the next sign-in step |
| `here` is `null` | nothing located the page yet: `status`, or `send` a Nav from the "Start here" section |
| a step "landed on X, not Y" | the app went somewhere else (a failed login stays on the login page): read `read` / `console` |
