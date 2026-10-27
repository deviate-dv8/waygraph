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
- **`Trait`** - a named, independently-reportable check (`{ name, wants?, check(page, mem) }`).
  Built-in factories: `Trait.url`, `Trait.text`, `Trait.contains`, `Trait.matches`, `Trait.value`, `Trait.attribute`,
  `Trait.absent`, `Trait.visible`, `Trait.disabled`, `Trait.enabled`, and the frame variants. `text`, `contains` and
  `value` take the expected value or a function of mem (`Trait.text("#code", (mem) => mem.get(Machine.code))`).
  `check` returns `true` / `false`, or `{ ok, saw }` to say what the page showed.
  Verify retries a check that doesn't pass until it does or its `timeoutMs` (default 5 s) runs out, so a page still
  settling doesn't fail it. A failure is a `TraitFailure` that reads as one sentence - `trait "text-equals(.toast,
  "Saved")" failed after "save-machine": wanted "Saved" in .toast; saw "Draft" (on /machines "Equipment Registry")` -
  and the run's `step:error` event carries the same as data (`check: { trait, block, wants, saw, url, heading }`).
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
from the `src/flows/<page>/<outcome>.flow.ts` path, its `steps` in run order and its settings), every Checkpoint, and
(manifest version 2+) every [Read Block](./beta.md): the Checkpoints it reads and the shape of its fields
(`"catalog.items": [{ "name": "string", "price": "number" }]`), so a viewer knows what each node can show before it runs.
`buildManifest(projectDir)` returns the same object in code. It is read at runtime from the Blocks themselves, the same
scan `graph`, `check`, `map`, `auto`, `traverse` and the runner use, and is what Waygraph UI and map packages read.
Blocks from installed [map packages](./map.md#map-packages) are included, with the package name as their `map`.

## Run events and the run log

Every run emits events: `run:start`, then `step:start` / `step:end` (Block, its kind - `nav`, `page`, `method`, `effect`, `assert`, `api` or `block`, as in the manifest - from/to Checkpoint, duration) or `step:error`
for each Block, `step:read` between a step's verify and its end when [Read Blocks](./beta.md) cover the page it landed
on (what the page showed, after it settled), `run:artifact` for a saved video, and `run:end` (ok, result or error). Each
run has its own id even when several run at once in one process (parallel traverse workers each are one run). Subscribe in code with
`onRunEvent((event) => …)`. The CLI (`run`, `demo`, `test`) also writes them to `.waygraph/runs/<runId>.jsonl` in the
project, and prints `waygraph: run log <file>` on stdout when a run ends (not in JSON mode, whose stdout is the report): the run history Waygraph UI shows, and where a script
reads a run's result (a failed check's `wanted` / `saw` is on its `step:error`) in any mode, the demo included. `runLog: false` in the config turns it off, `runLog: "<folder>"` moves it.
The unattended JSON report (`run` + `WAYGRAPH_JSON=1`) carries the same `runId`, and a failure screenshot is recorded as
a `run:artifact`.
