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
waygraph pilot start                      # bootstraps: {sessionId, socketPath, headless, graph, snapshot}
waygraph browser start [--inject path] [--goto <url>] [--cli]  # new browser session; --cli opens terminal picker
waygraph pilot start [--cli]              # --cli opens terminal picker after bootstrap JSON
waygraph auto status <sessionId>          # re-read the live menu, no side effects
waygraph auto send <sessionId> "<pick>"   # run exactly one Block (by menu index or name)
waygraph auto reach <sessionId> <Checkpoint>  # path-find + run a whole route in one call
waygraph auto highlight <sessionId> '<json>'  # paint rings/todos on the live page (agent fixtures)
```

`graph` in `pilot start`'s response is the **whole project's** Block/Checkpoint graph, not
just what's reachable from here - use it to plan several steps ahead before you start
sending picks.

## Bad practices (`waygraph check` / `waygraph typecheck`)

Run `waygraph typecheck .` (or `npm run typecheck`) — runs `tsc --noEmit` then bad-practice warnings.
`waygraph check` includes the same practice scan plus nav/orphan/selector hygiene.
Use `--no-practices` on either command to skip the practice scan.

Patterns warned (does not fail `check`; fails `typecheck` only when `tsc` fails):

- **`Checkpoint<string>` in Block generics** — e.g. `defineMethodBlock<Checkpoint<string>, …>` instead of a project Checkpoint type from `src/states/`.
- **`defineAssertBlock({…})` without an explicit type arg** — use `defineAssertBlock<YourCheckpoint>({…})` so `defineFlow` typing stays honest.
- **Multiple `.fill()` in one Method** — split into one Block per input (fill-username, fill-password, …).
- **`.fill()` + `.click()` in one Method** — split fill and submit into separate Blocks.

Opt out per file: `// waygraph-ignore-practices` or `// waygraph-ignore: multi-input, combined-action`.

Fix these before adding more Blocks; wildcard Checkpoints hide real graph edges from the type checker.

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
| `waygraph demo` | Engine, automatically | Block `stubBefore` / `stubAfter` / `withHighlightFixtures` run each step |
| Pilot / `auto --detach` | **You (the agent)** | `waygraph auto highlight <sessionId> '<json>'` before (or between) sends |

Block-authored `stubBefore` / `withHighlightFixtures` still exist on Blocks in Pilot —
they show up in `auto trace` as metadata — but they do **not** auto-draw. You re-express
the same intent with `auto highlight` (copy selectors/labels from the Block stubs or from
`auto dom`). Paint, then `auto send` the real Block. Clear when done.

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
- `todoUi`: `{ compact?, cap?, expandCap?, collision?, behindRing? }` — same dock UX as demo (defaults smart-on; see README "Todo dock UI")
- `zoom` / `zoomSelector` / `zoomOut` - scroll + zoom badge (not CSS page scale)
- `device`: `mobile` | `tablet` | `desktop` (Playwright viewport)
- `holdMs`: ms to keep fixtures; `0` = until the next highlight / clear (default 30000)
- `clear`: true drops rings/todos/focus/zoom badge

- `tone`: all demo tones - `planned` | `auto` | `info` | `warning` | `danger` | `success` | `orange` (aliases like `error`/`blue`/`green` work too)
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
control (a human click) might have interfered, re-supply mem explicitly before the next
step rather than trusting stale state.

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
  interactable the instant their trigger is clicked - a real, reproducible flake, not
  paranoia. A short `page.waitForTimeout(300-400)` between opening a popover and acting
  inside it is a real, load-bearing fix seen live more than once, not defensive padding.
- **Orphan Blocks** (not wired into any `.flow.ts`) are still fully visible and runnable in
  the live Pilot menu - orphan status only blocks `auto --blocks <From> <To>` pathfinding,
  never `auto`'s own interactive menu.
- A hard `page.goto()` straight to an SPA route can render a stale/incomplete view compared
  to reaching the same page via a real in-app click-nav - if `auto dom` output looks wrong
  right after a raw `goto`, try reaching the page through its real click-based NavBlock
  instead before assuming the DOM read is broken.
