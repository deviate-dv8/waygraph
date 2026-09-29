# Demo / run (less is more)

Three primary verbs: `auto`, `demo`, `run`.
Flows live as `*.flow.ts` files - list them, then run by
**file path** or **export name**.

## Flows are files

Each Flow is a TypeScript module under `src/flows/` (or anywhere
ending in `.flow.ts`). `waygraph list` prints the map:

```sh
npx waygraph list
# src/flows/shop.flow.ts  shopFlow
# src/flows/login.flow.ts  loginFlow
# …
```

| Want | Command |
|---|---|
| Run by file path | `npx waygraph run src/flows/shop.flow.ts` |
| Same via `auto` | `npx waygraph auto src/flows/shop.flow.ts` |
| Same via flag | `npx waygraph run --blocks src/flows/shop.flow.ts` |
| Run by export name | `npx waygraph run --blocks shopFlow` |
| Watch that file | `npx waygraph demo src/flows/shop.flow.ts` |
| Chain two flows | `npx waygraph run --blocks "loginFlow then shopFlow" --data '{…}'` |

File path → export: `shop.flow.ts` resolves to `shopFlow`
(or the sole `*Flow` export in that file). Needs mem?
Pass `--data '{"saucedemo.credentials":{…}}'`.

## Pick the command

| Want | Command |
|---|---|
| Watch a flow (manual Next) | `npx waygraph demo src/flows/shop.flow.ts` |
| Auto-advance steps | `npx waygraph demo --blocks shopFlow --auto-next` |
| Unattended + recorded (headless) | `npx waygraph demo --blocks shopFlow --auto-play-video` |
| Same, but watch it live too | `npx waygraph demo --blocks shopFlow --auto-play-video-head` |
| Ad-hoc Blocks + mem seed | `npx waygraph run --blocks "loginFlow then add-all-to-cart" --data '{…}'` |
| Headed execute + video | `npx waygraph run src/flows/shop.flow.ts --non-headless --video` |
| Explore (CLI first) | `npx waygraph auto --cli --data '{…}'` |
| Onboarding (temp dir) | `npx waygraph try demo` / `try auto` |

Prefer `--blocks` or a `.flow.ts` path. Compat:
`chain` -> `run --blocks`;
`--autoplay` -> `--auto-next`.

## Flags

| Flag | Where | What it does |
|---|---|---|
| `--blocks` | demo / run / auto | Flow export, `.flow.ts` path, or `"a then b"` spec.
On `auto` only: `--blocks From To` = Checkpoint path-find. |
| `--data '{…}'` | demo / run / auto | Mem seed JSON (keyed by MemKey name, e.g. `saucedemo.credentials`). |
| `--auto-next` | demo | Step overlay Auto-advance starts ON (alias `--autoplay`).
Auto-hides the stepper on NavBlocks (compact `N / M` pill). |
| `--fast` | demo only | Faster cursor/type dwells and shorter auto-next gates. |
| `--full` | demo only | Classic wrap-all block chips. Default is a horizontal **carousel**. |
| `--todo-smart` | demo only | Compact floating checklist + collision flip + behind-ring
(default for `waygraph demo`). See
[Todo dock UI](#todo-dock-ui). |
| `--todo-full` | demo only | Opt out of smart dock UX (full list, no compact/collision/behind).
Alias `--no-todo-smart`. Env: `WAYGRAPH_TODO_UI=full`. |
| `--todo-left` / `--todo-right` | demo only | Pin the floating todo dock to that side (default remembers last side). |
| `--auto-play-video` | demo only | `--auto-next` + `--video` (+ step) - unattended and
recorded, so **headless by default** (no live window needed). |
| `--auto-play-video-head` | demo only | Same as `--auto-play-video`, but keeps the browser visible (implies `--non-headless`). |
| `--non-headless` | run | Show the browser. |
| `--video [dir]` | run / demo | Playwright `recordVideo` (.webm). |
| `--step` / `--no-step` | demo / run | Overlay on/off. `demo` defaults step ON. |

## Todo dock UI (demo, 0.15.8+)

When a block calls `ctx.todos(...)` / `ctx.todoDock(...)`,
`waygraph demo` renders a **floating checklist** outside
the step panel (survives Hide / mini). Long FR/AC lists used to bury highlight
rings - **smart defaults are on** in demo:

| Behavior | Default | Opt out |
|---|---|---|
| Compact fold (~5 rows around current; hover expands; `+N more`) | on | `--todo-full` / `WAYGRAPH_TODO_UI=full` / `ctx.todoDockFull()` |
| Collision flip (dock L/R when a ring overlaps) | on | `ctx.todoDockUi({ collision: false })` / `WAYGRAPH_TODO_COLLISION=0` |
| Behind ring (dim + lower z-index while a ring is up) | on | `ctx.todoDockUi({ behindRing: false })` / `WAYGRAPH_TODO_BEHIND=0` |

Try it on Sauce Demo login / cart flows (they already seed todos):

```sh
npx waygraph demo examples/saucedemo/src/flows/login.flow.ts --auto-next
npx waygraph demo examples/saucedemo/src/flows/login.flow.ts --todo-full
```

Author API and Pilot parity:
[Demo narration → Todo dock UI](./highlights#todo-dock-ui).

```sh
# See file → export
npx waygraph list

# Run / watch by file
npx waygraph run src/flows/shop.flow.ts --data '{"saucedemo.credentials":{…}}'
npx waygraph demo src/flows/cart-bulk.flow.ts --auto-next --fast
npx waygraph demo src/flows/shop.flow.ts --full
npx waygraph demo src/flows/login.flow.ts --todo-smart   # default; compact dock

# Or by export name
npx waygraph demo --blocks shopFlow
npx waygraph run --blocks "loginFlow then add-all-to-cart" --data '{…}'
```

## Explore next

Interactive picker (same menus in CLI and GUI):
[Auto explore](./auto).
Demo ring captions / AC copy on flows:
[Demo narration](./highlights)
(`stubBefore` / `stubAfter` + `.flow.ts` fixtures).
Floating checklist UX:
[Todo dock UI](#todo-dock-ui).

