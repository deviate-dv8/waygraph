# Quick start

Three entry paths, then your first Block + Flow.

## Three ways in

| Path | When | Command |
|---|---|---|
| **Try demo** | Onboarding - watch chainFlow on saucedemo.com; nothing written to your cwd | `npx waygraph try demo` |
| **Try auto** | Temp Sauce Demo headed explorer (creds pre-seeded) | `npx waygraph try auto` |
| **Try auto:cli** | Same explorer, terminal menu | `npx waygraph try auto:cli` |
| **In-repo example** | Permanent Sauce Demo - headed `auto` | [Clone and run it](#saucedemo) (needs one root install + build first) |
| **waygraph init** | New repo - offline scaffold, built into waygraph since 0.7.5 | `npx waygraph init my-app` |

After `init`:

```sh
cd my-app
npm install
npx playwright install chromium
npm test          # offline example flow - green immediately
npm run test:ui   # same suite, Playwright's interactive UI Mode
npx waygraph test report               # open the HTML report (trace on failure)
npx waygraph test show-trace <trace.zip>  # open one trace directly
npm run list      # .flow.ts → export map
npm run check     # nav hygiene + orphan Blocks
npm run demo      # watch example.flow.ts (manual Next)
npm run auto      # headed explore
npm run auto:cli  # same menus in the terminal
```

`try demo` / `try auto` use the live saucedemo quickstart
template, not the offline scaffold.
Flags: [Demo / run](./demo).
Explore: [Auto explore](./auto) (headed by default; `--cli` for terminal).

## Run the Sauce Demo example

`examples/saucedemo` is a complete project (Map layout, live tests, demos)
against [saucedemo.com](https://www.saucedemo.com). It links to the waygraph
checkout it lives in, so install and build the repo _first_:

```sh
git clone https://github.com/deviate-dv8/waygraph.git
cd waygraph
npm install && npm run build     # 1. install + build waygraph itself
npx playwright install chromium    # 2. browser (once)
cd examples/saucedemo
npm install                        # 3. links the example to your build
npm test                           # 15 tests, mostly against the live site
npm run demo                       # watch the checkout with the step overlay
npm run auto                       # explore it by picking Blocks
npm run test:ui                    # Playwright's interactive UI
```

Changed waygraph's source? Run `npm run build` at the repo root again - the
example picks it up immediately. Prefer not to clone? `npx waygraph try demo`
runs the same walkthrough from a temp folder. What each folder in the example is for:
[Sauce Demo walkthrough](./saucedemo/index).

## Watch / run / explore (0.10+)

| Want | Command |
|---|---|
| List flows (file → export) | `npx waygraph list` |
| Run a flow file | `npx waygraph run src/flows/shop.flow.ts --data '{…}'`
`npx waygraph auto src/flows/shop.flow.ts --data '{…}'` |
| Manual Next (default) | `npx waygraph demo src/flows/shop.flow.ts` |
| Auto-advance timer | `npx waygraph demo --blocks shopFlow --auto-next` |
| Faster demo / classic strip | `npx waygraph demo … --fast` · `--full` (default strip is carousel) |
| Execute ad-hoc Blocks | `npx waygraph run --blocks "login then nav-cart" --data '{…}'` |
| CLI explore (same menus as headed) | `npx waygraph auto --cli --data '{…}'` |

Details: [Demo / run](./demo) ·
[Auto explore](./auto).
Alias: `--autoplay` -> `--auto-next`.

## Install into an existing repo

```sh
npm install waygraph @playwright/test
```

## Minimal flow

Prefer `defineNavBlock` for navigation and regular Blocks for page actions.
Full handout examples live on the [engine handout](./handout) page.

```sh
import { Engine, start, end, MemPage, key, checkpoint, defineNavBlock, Trait } from "waygraph";
import type { Block, Checkpoint, Start } from "waygraph";

type LoginForm = Checkpoint<"LoginForm">;
type LoggedIn = Checkpoint<"LoggedIn">;

const Username = key<string>("username");

const NavLogin = defineNavBlock({
name: "nav-login",
checkpoint: "LoginForm",
url: "https://example.com/login",
});

const SubmitLogin: Block<LoginForm, LoggedIn> = {
name: "submit-login",
requires: [Username],
instruction: {
async act(page, _input, mem) {
await page.getByLabel("Username").fill(mem.get(Username));
await page.getByRole("button", { name: "Sign in" }).click();
},
resolve: () => checkpoint("LoggedIn"),
verify: [Trait.url({ pathname: "/dashboard" })],
},
};

const mem = new MemPage();
mem.set(Username, "alice");

const flow = new Engine({ headless: true }).defineFlow([
start,
NavLogin,
SubmitLogin,
end,
]);

await flow.run(mem);
// Or inside @playwright/test: await flow.run(context, mem);
```

## Hard rules

- `resolve` never touches the browser or MemPage - only returns a Checkpoint.
- `verify` runs only after resolve - confirms or fails loud; never redirects.
- `precondition` Traits run right before `act()`.
- `preflight` checks `requires: MemKey[]` before a tab opens.
- Block output Checkpoint is the only contract the next Block can rely on.

## Develop this package

```sh
git clone git@github.com:deviate-dv8/waygraph.git
cd waygraph
npm install
npm run typecheck
npm test
npm run build
```

