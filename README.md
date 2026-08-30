# Waygraph

A typed graph of reusable Blocks for driving a browser through E2E flows, in place of a
flat pile of ad hoc helper functions.

This repo is the `waygraph` npm package itself. Consumer projects proving it against real
sites/apps (saucedemo.com, zsign-app) live in the sibling `projects_waygraph/` repo, not here.

## Install

```bash
npm install waygraph @playwright/test
```

`@playwright/test` is a peer dependency, not bundled - you bring your own version (`^1.40.0`
or later) since it's also what drives the rest of your test suite. Requires Node 22+ (uses
`URL`/`URLPattern` from `@types/node` for `Trait.url`'s type checking).

## Quick start

A Block wraps one `act`/`resolve` step (add `observe`/`verify` once you need them); a `Flow`
chains several into a run:

```typescript
import { Engine, start, end, MemPage, key, checkpoint, Trait } from "waygraph";
import type { Block, Checkpoint } from "waygraph";

type Start = Checkpoint<"__start__">;
type LoggedIn = Checkpoint<"LoggedIn">;

const Username = key<string>("username");

const Login: Block<Start, LoggedIn> = {
  name: "login",
  instruction: {
    async act(page, _input, mem) {
      await page.goto("https://example.com/login");
      await page.getByLabel("Username").fill(mem.get(Username));
      await page.getByRole("button", { name: "Sign in" }).click();
    },
    resolve: () => checkpoint("LoggedIn"),
    verify: [Trait.url({ pathname: "/dashboard" })],
  },
};

const mem = new MemPage();
mem.set(Username, "alice");

const flow = new Engine().defineFlow([start, Login, end]);
const result = await flow.run(mem); // Engine launches its own browser
// result === { __state: "LoggedIn" }
```

Inside an existing `@playwright/test` file, reuse its `context` fixture instead of having the
Engine launch its own browser: `await flow.run(context, mem)`.

**Status:** `Checkpoint`, `MemPage`, `Instruction`/`Block` (`act`/`observe`/`resolve`/`verify`),
`connect()`, `Trait`, `Engine.defineFlow([start, ...blocks, end])`, and `branch()`/self-loops
with a `maxSteps` safety cap. A Block's output type is the only contract the next Block can
rely on, `resolve` is structurally incapable of touching the browser or shared memory,
`verify` runs only after `resolve` has already decided (confirms or fails loud, never
redirects), `branch()` attaches routing to a Block - including back to itself - without ever
touching that Block's own phases, a Block's `requires: MemKey[]` gets checked by
`preflight()` (built into `runGraph`) before a tab even opens - a missing credential fails
in milliseconds, not after several real browser actions already ran - and `new Engine({ headless, browserName, slowMo })` configures a browser the Engine
launches and owns itself: `flow.run(mem)` (no context) uses it, and `flow.run(mem, {
...overrides })` overrides it per call - so one module-level `Flow`, imported by many
specs, doesn't force every caller into the same settings. `flow.run(context, mem)` still
works exactly as before and ignores all of this, since that context is already launched.
`withVerify(block, verify)` decorates any existing Block with different confirmation - same
`act`/`resolve`, same routing - without that Block needing to have been authored as a
parameterized factory (`withVerify(LoginBlock, [])` is the "I only care that I navigated
this far, no DOM check" case). Built-in Trait factories are reachable two ways - as free
functions (`urlMatches`, `textEquals`, `visible`) or, for autocomplete discoverability,
off `Trait.` itself (`Trait.url`, `Trait.text`, `Trait.visible` - the exact same functions,
just findable by typing `Trait.` without needing to already know their names). `Trait.url`
takes a structured `URLPatternInit` (`{ pathname, hostname, search, hash, ... }`, the same
shape the standard `URLPattern` Web API takes), not a hand-written regex - whichever
components you leave out default to "match anything," so `Trait.url({ pathname:
"/inventory.html" })` already ignores whatever query params a hybrid SPA tacks on, with no
separate flag needed for that. Once Blocks are composed into a `Flow`, `flow.withBlockVerify`/
`flow.modBlockVerify` patch one Block's verify from outside - a spec that only imports the
finished flow, addressed by the Block reference (preferred), its name, or its numeric
position in the flow - without editing the flow's own file.

Deliberately **not yet implemented** (tracked on the project board):
- Interstitials/Watchers - background overlay handling (cookie banners, popups).
- `spawnTab` - a second browser tab.
- A patchable way to compose several Blocks into one named unit with per-step verify
  addressable from outside (`connect()`-composed chains don't get `withVerify`/`modVerify`
  attached the way `defineBlock()`/`branch()`/`Flow` outputs do) - useful for a multi-step
  form (e.g. a government form with several stepper pages) that's naturally "one feature" but
  still wants each step's own confirmation independently overridable.

## Example

Two Tier-0 Blocks (only `act` + `resolve`, no branching), each confirmed with `verify`
after the fact rather than asserting mid-`observe`, defined as a flow and run against a
real page:

```typescript
import { Engine, start, end, MemPage, key, checkpoint } from "waygraph";
import type { Block, Checkpoint } from "waygraph";

type Start = Checkpoint<"__start__">;
type FormLoaded = Checkpoint<"FormLoaded">;
type Submitted = Checkpoint<"Submitted">;

const EmailKey = key<string>("form.email");
const PasswordKey = key<string>("form.password");

const GotoForm: Block<Start, FormLoaded> = {
  name: "goto-form",
  instruction: {
    async act(page) {
      await page.goto("https://example.com/login");
    },
    resolve: () => checkpoint("FormLoaded"),
  },
};

const FillAndSubmit: Block<FormLoaded, Submitted> = {
  name: "fill-and-submit",
  instruction: {
    async act(page, _input, mem) {
      await page.getByPlaceholder("Email").fill(mem.get(EmailKey));
      await page.getByPlaceholder("Password").fill(mem.get(PasswordKey));
      await page.getByRole("button", { name: "Submit" }).click();
    },
    resolve: () => checkpoint("Submitted"),
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
};

const mem = new MemPage();
mem.set(EmailKey, "alice@test.com");
mem.set(PasswordKey, "hunter2");

const engine = new Engine();
const flow = engine.defineFlow([start, GotoForm, FillAndSubmit, end]);
const result = await flow.run(context, mem);
// result === { __state: "Submitted" }
```

See `tests/define-flow.spec.ts` here, and `saucedemo/tests/checkout-flow.spec.ts` in
`projects_waygraph/` (a real 4-Block flow against the live saucedemo.com), for this running
for real. The lower-level `connect()`/`runGraph()` still exist and are what `defineFlow`
builds on - reach for them directly only if you need a shape `defineFlow`'s array can't
express yet.

## Developing this package

```bash
git clone git@github.com:deviate-dv8/waygraph.git
cd waygraph
npm install
npm run typecheck   # tsc --noEmit
npm run test        # playwright test
npm run build       # tsc -p tsconfig.build.json, emits dist/
```

## Layout

```
package.json              the "waygraph" npm package itself
src/
  types.ts                 Checkpoint, Instruction, Block, connect()
  mem-page.ts               MemKey, key(), MemPage
  trait.ts                   Trait (type + discoverable Trait.url/.text/.visible), runVerify()
  engine.ts                   runGraph(), Engine, start, end, Flow (+ withBlockVerify/modBlockVerify)
  index.ts                     public barrel
typecheck/                 compile-time-only fixtures (assignability, @ts-expect-error cases)
tests/                      runtime unit + integration tests (@playwright/test)
tsconfig.json                base config - typecheck script includes src/ + typecheck/ + tests/
tsconfig.build.json          extends base, src/ only, emits to dist/
```

Consumer projects (saucedemo.com proof, zsign-app integration) live in the sibling
`projects_waygraph/` repo, depending on this package via `"waygraph": "file:../../waygraph"`
during local dev (see its own `.npmrc` - `install-links=true` is required there, or npm will
symlink instead of copy and pull this package's own `node_modules` in through the symlink,
causing a duplicate-Playwright-installation error).
