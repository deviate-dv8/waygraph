# Getting started

## Install

```bash
npm install waygraph @playwright/test
```

`@playwright/test` is a peer dependency, not bundled - you bring your own version
(`^1.40.0` or later) since it's also what drives the rest of your test suite. Requires
Node 22+ (uses `URL`/`URLPattern` from `@types/node` for `Trait.url`'s type checking).

## Quick start

```typescript
import { Engine, MemPage, keys, defineNavBlock, defineMethodBlock, checkpoint, Trait } from "waygraph";
import type { Checkpoint } from "waygraph";

const LoginForm = checkpoint("LoginForm");
type LoginForm = typeof LoginForm;
const LoggedIn = checkpoint("LoggedIn");
type LoggedIn = typeof LoggedIn;

const LoginKeys = keys("login")<{ username: string }>();

const NavLogin = defineNavBlock({
  name: "nav-login",
  checkpoint: LoginForm,
  url: "https://example.com/login",
  verify: [Trait.visible("button:text-is('Sign in')")],
});

const SignIn = defineMethodBlock({
  name: "sign-in",
  from: LoginForm,
  to: LoggedIn,
  requires: [LoginKeys.username],
  instruction: {
    async act(page, _input, mem) {
      await page.getByLabel("Username").fill(mem.get(LoginKeys.username));
      await page.getByRole("button", { name: "Sign in" }).click();
    },
    verify: [Trait.url({ pathname: "/dashboard" })],
  },
});

const mem = new MemPage();
mem.set(LoginKeys.username, "alice");

const flow = new Engine().map().start().gotoPage(NavLogin).method(SignIn).end();
const result = await flow.run(mem); // Engine launches its own browser
// result === { __state: "LoggedIn" }
```

Inside an existing `@playwright/test` file, reuse its `context` fixture instead of having
the Engine launch its own browser: `await flow.run(context, mem)`.

See `tests/core/` here, and
`examples/saucedemo/tests/checkout-flow.spec.ts` (a real multi-Block flow against live
saucedemo.com), for this running for real. The lower-level `connect()`/`runGraph()` still
exist and are what flows build on - reach for them directly only if you need a
shape `map()` can't express yet.

## Getting started (pick one)

| Goal | Command |
|------|---------|
| Watch Sauce Demo step-through (temp dir only) | `npx waygraph try demo` |
| Interactive explore (Add/Remove/Open details from live page) | clone + build the repo, `cd examples/saucedemo && npm install`, then `npx waygraph auto` |
| Scaffold a new **offline** project (green `npm test`, pages open via `file://`, no server) | `npx waygraph init my-app` |
| Install coding-agent defs for diving an app into Blocks | `npx waygraph agent-dive --loop claude` (also `opencode` / `cursor` / `vscode`) |
| Print a packaged agent skill to stdout | `npx waygraph --skill` (list) / `--skill-pilot` / `--skill-pilot-blind` / `--skill-convention` |
| Add waygraph to an existing repo | `npm install waygraph @playwright/test` |

```bash
npx waygraph init my-app
cd my-app && npm install && npx playwright install chromium && npm test
```

`try demo` is different: live saucedemo.com, step-through **Sign In -> Shop & Checkout ->
blocked Viewer login**, then headless tests. Permanent full example:
[`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo). Offline empty scaffold: `init`.

**`create-waygraph` (npm) is deprecated** - it was the identical `init` template shipped as
a second package for no real benefit. Use `npx waygraph init my-app` instead.

```bash
# From this checkout, after npm run build:
npm install && npm run build && npx playwright install chromium   # at the repo root first
cd examples/saucedemo && npm install
npm test                  # live Playwright suite
npm run auto              # headed interactive explore
npm run demo:step         # stepper (manual Next)
npm run demo:autoplay     # stepper with Auto-advance
```

Both scaffold commands emit the same offline tree (route-shaped `demo-web/` + `methods/`,
stubs, fixtures, one YAP slide). Layout: [`docs/scaffold.html`](../scaffold.md) ·
`templates/scaffold/STRUCTURE.md`.

**Consumer layout (Next.js App Router):** block folders mirror `app/` page routes (`/` at
the namespace root; no invented `landing/`/`root/`; sidebar = chrome + edges). See
[`docs/consumer.html`](../consumer.md). A separate mesh handout
(`WAYGRAPH-CONSUMER-CONVENTION.md`) covers the same convention outside this repo - not
part of this package's own tree.
