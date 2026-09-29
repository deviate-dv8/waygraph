# Auto explore

Interactive graph walker: locate the live Checkpoint, list runnable Blocks,
pick one, repeat. Prefer `auto --cli` first - the headed panel shows
the same menu rows.

**Everything is a Block.**
Page hubs + Methods / Effects hang off the graph. CLI and GUI share
`buildExploreMenu` (same sections and labels).

## Commands (0.10+)

| Want | Command |
|---|---|
| Run a `.flow.ts` file (same as `run`) | `npx waygraph auto src/flows/shop.flow.ts --data '{...}'` |
| Terminal menu (start here) | `npx waygraph auto --cli --data '{...}'` |
| Headed browser panel | `npx waygraph auto --data '{...}'` |
| Graph path-find From -> To, then run | `npx waygraph auto --blocks LoginPage OrderComplete` |
| One-shot Sauce Demo headed panel | `npx waygraph try auto` |
| One-shot Sauce Demo CLI (temp dir) | `npx waygraph try auto:cli` |
| In-repo Sauce Demo | [see clone steps](./quickstart#saucedemo), then `npm run auto` |

`--data` seeds MemKeys (same JSON shape as demo/run). Alias env:
`WAYGRAPH_AUTO_MEM`. Project path optional (defaults to cwd).
Pass a `.flow.ts` path to **run** that flow (not explore).
On Sauce Demo LoginPage you should see `submit-login` (needs
`waygraph@0.10.6+` for headed `try auto` / file-path
`auto`).

## What you see (CLI and GUI)

1. **You are here:** Checkpoint from Nav/Page verify Traits.
1. Sections: **Methods from …** / **Also on this page**
(per-item Add/Remove + **Add all** / **Remove all**) /
**Navigate** / **Go back**.
1. CLI: type a number or `q`. GUI: click a row (hover rings the target).
1. After each pick: `running [N] …` then a refreshed menu.

## Sauce Demo CLI walk

Login is three atomic Blocks, not one - `fill-username` and
`fill-password` self-loop on `LoginPage`,
`submit-login` owns the actual transition. Menu order may vary; pick by
the label shown.

```sh
cd examples/saucedemo
npm install
npx playwright install chromium
npm run auto:cli
# [2] fill-username
# [1] fill-password
# [3] submit-login
# [7] Add all to cart
# [8] Remove all from cart
# q

# Scripted prove (same path):
npm run prove:auto-cli
```

## `--cli` session control (detach / send / status / attach)

Bare `auto --cli` blocks in a terminal `readline` loop - fine
for a person, awkward for an agent that needs to inspect state between picks or send
one command without guessing a whole input sequence upfront. `--detach`
runs the same session as a background socket server instead.

| Want | Command |
|---|---|
| Start a detached session | `npx waygraph auto --cli --detach` -> `{"sessionId":"...","socketPath":"..."}` |
| Send one pick, get JSON state back (no TTY) | `npx waygraph auto send <sessionId> "3"` |
| Read state without side effects | `npx waygraph auto status <sessionId>` |
| Reopen an interactive terminal on it | `npx waygraph auto attach <sessionId>` |
| End the session | `npx waygraph auto send <sessionId> q` |

Session identity lives under `.waygraph-auto/` in the target project
(metadata + socket), mirroring `.waygraph-traverse/`'s convention - removed
automatically when the session quits. Session control only applies to `--cli`;
the headed panel is unaffected. See
`openspec/changes/waygraph-auto-cli-session-control/spec.md` in the package repo.

## Reading the live page (`auto dom`)

An agent driving a session can read the actual page - not just the menu - without
touching the target project's frontend source.

| Want | Command |
|---|---|
| Small, structured, AI-oriented snapshot (default) | `npx waygraph auto dom <sessionId>` |
| Raw DOM subtree (tags/attributes/text), bounded | `npx waygraph auto dom <sessionId> --mode full` |
| Scope either mode to one element | `npx waygraph auto dom <sessionId> --selector ".inventory_list"` |
| Limit snapshot depth | `npx waygraph auto dom <sessionId> --depth 4` |

Default mode is `aria` - Playwright's `ariaSnapshotJSON({ mode: "ai" })`,
small and usually enough to find an interactive element by role/name. `full`
is a hand-written bounded DOM walk for when you need something aria can't see (actual
CSS classes, data-attributes) - hard-capped on depth/node count/text length and marked
`truncated: true` whenever a cap is hit, since this is read by an LLM, not a
human. `--selector` is a modifier on either mode, not a third mode. See
`openspec/changes/waygraph-auto-dom-inspect/spec.md` in the package repo.

## Visible browser + session history (`--non-headless`, `auto trace`)

| Want | Command |
|---|---|
| Detached session with a real visible browser | `npx waygraph auto --cli --detach --non-headless` |
| Read the session's Checkpoint/Block history | `npx waygraph auto trace <sessionId>` |

`--non-headless` is the same flag `run`/`demo`
already use for "show the browser" - reused here rather than a new flag name. The
session stays driven entirely through `send`/`status`/
`attach`/`dom` either way; this is not a new picker UI, and the
existing page-embedded headful panel (bare `waygraph auto`, no
`--cli`) is unaffected regardless of this flag.

`auto trace` returns a Checkpoint/Block-level record of what the session
actually did - Block name, Checkpoint before/after, and (when the Block authors them)
its resolved `stubBefore`/`stubAfter`/`stubOnError`
demo-narration fixtures, the same highlight/todo/device data
`waygraph demo`'s own lifecycle logging already computes via
`runStubPhase`. Deliberately not a raw action recorder - no clicks or
fills, only the same Block-level resolution the rest of the engine already reasons
about, capped at the last 500 steps. See
`openspec/changes/waygraph-auto-headful-trace/spec.md` in the package repo.

## Related primary verbs

| Verb | Job |
|---|---|
| `demo --blocks …` | Watch with step overlay (`--auto-next`, `--auto-play-video`) |
| `run --blocks …` | Execute (`--non-headless`, `--video`) |
| `auto` | Explore / path-find (`--cli`, `--blocks From To`) |

Details: [Demo / run](./demo). Compat aliases:
`chain` -> `run --blocks`; `--autoplay` -> `--auto-next`.

