# Core concepts

## Core concepts

- **Checkpoints** - a state identified by its tag, declared once as a value and a type:
  `export const Home = checkpoint("Home"); export type Home = typeof Home;`. Blocks take the values
  (`checkpoint: Home`, `from: Home, to: ItemInCart`), so each Block carries its route at runtime.
- **`MemPage`** / **`MemKey<T>`** - typed shared memory across a run, keyed by object
  identity (`key<T>("debug-name")`), not by name string.
- **`Block<In, Out>`** - one step: `act(page, input, mem)` does the work,
  `resolve()` decides the resulting Checkpoint (never touches the page or mem),
  `verify` (optional) confirms the page actually matches what `resolve()` claimed.
- **`Trait`** - a named, independently-reportable check (`{ name, check(page, mem) }`).
  Built-in factories: `Trait.url` / `Trait.text` / `Trait.visible` (also importable as
  free functions `urlMatches` / `textEquals` / `visible`).
- **`Flow`** - several Blocks chained with `engine.map().start().gotoPage(...).method(...).end()`,
  run with `flow.run(mem)` (Engine launches its own browser) or `flow.run(context, mem)`
  (reuse an existing `@playwright/test` `context` fixture).

## Checkpoints as values

Each Checkpoint is declared once, in `src/states/`, as a value with a type of the same name:

```typescript
import { checkpoint } from "waygraph";

export const Home = checkpoint("Home");
export type Home = typeof Home;
export const CartEmpty = checkpoint("CartEmpty");
export type CartEmpty = typeof CartEmpty;
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
export const CanAddItem = [Home, CartEmpty] as const;      // several states a Block can run from
export type CanAddItem = (typeof CanAddItem)[number];
```

Blocks name them as values, never as tag strings or `<In, Out>` type arguments; the types are inferred:

| Helper | Says |
|---|---|
| `defineNavBlock` / `defineNavClickBlock` / `definePageBlock` | `checkpoint: Home` (and optionally `from: [SignedIn, …]`) |
| `defineAssertBlock` | `checkpoint: ItemInCart` |
| `defineMethodBlock` / `defineEffectBlock` | `from: CanAddItem, to: ItemInCart` - leave `from` out for "from anywhere"; `resolve` is implied when `to` is one Checkpoint, and needed when it is a list |

Because the route is recorded on the Block, `waygraph graph`, `auto`, `traverse` and the manifest read it at runtime
instead of parsing source text. The older forms (`checkpoint: "Home"`, `defineMethodBlock<Home, ItemInCart>`) were
removed in 0.16.0; `waygraph upgrade --codemod checkpoints` rewrites a project's states and Block files (on the
TypeScript AST, so formatting and comments don't trip it).

## The manifest

`waygraph manifest [project] [--out <file>]` prints everything the project defines as JSON: every Block (`kind`,
`description`, route `from` -> `to`, `requires`, `file`, and its `map` group under `src/map/`), every Flow (its `useCase`
from the `src/flows/<page>/<outcome>.flow.ts` path, its `steps` in run order and its settings) and every Checkpoint.
`buildManifest(projectDir)` returns the same object in code. It is read at runtime from the Blocks themselves, the same
scan `graph`, `check`, `map`, `auto`, `traverse` and the runner use, and is what Waygraph UI and map packages read.
Blocks from installed [map packages](./map.md#map-packages) are included, with the package name as their `map`.

## Run events and the run log

Every run emits events: `run:start`, then `step:start` / `step:end` (Block, from/to Checkpoint, duration) or `step:error`
for each Block, `run:artifact` for a saved video, and `run:end` (ok, result or error). Subscribe in code with
`onRunEvent((event) => …)`. The CLI (`run`, `demo`, `test`) also writes them to `.waygraph/runs/<runId>.jsonl` in the
project: the run history Waygraph UI shows. `runLog: false` in the config turns it off, `runLog: "<folder>"` moves it.
The unattended JSON report (`run` + `WAYGRAPH_JSON=1`) carries the same `runId`, and a failure screenshot is recorded as
a `run:artifact`.
