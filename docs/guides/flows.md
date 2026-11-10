# Flows

A flow is a path through your Blocks, written with `engine.map()`. TypeScript checks that each step starts where the
last one ended, so a flow can't skip from one page to an unrelated one. The chain is the flow: there is no closing call, and
whatever the chain holds when you export it, runs.

```mermaid
graph LR
  S((start)) -->|nav-home| H[Home]
  H -->|add-item| H
  H -->|clear-cart| H
```

```ts
import { engine } from "#config/waygraph.config";
import { HomePage } from "#map/(app_base)/home/_page.block";
import { HomeRead } from "#map/(app_base)/home/_reads";

export const homeCartFlow = engine
  .map()
  .gotoPage(HomePage.nav)
  .method(HomePage.do.addItem, { expect: [HomeRead.cartCount.is(1)] })
  .method(HomePage.do.clearCart);
```

A flow imports one thing per page it visits: the page's Page Block, whose `nav` opens it, whose `do` holds what you
can do there and whose `expects` holds what you can check there ([Blocks](./blocks#page-blocks)). `#config/` and `#map/` are the project's own short paths
([Project](./project#imports)).

## The steps

Each step takes the kind of Block its name says. Hand it anything else, or an object that only looks like a Block,
and it throws, naming the factory to use.

| Step | Takes |
|---|---|
| `.gotoPage(b)` | a Nav or Page Block on your app |
| `.gotoExternal(b)` | a Nav Block on another site (a mail catcher, a REST client) |
| `.method(b)` | a Method or API Block |
| `.set(key, value)` | sets a mem key for the steps after it: a value, or one worked out from mem |
| `.steps(part)` | a part made with `steps()`: the same steps in several flows |
| `.flow(sub, { reset, expect })` | another flow's steps, in the same page and mem; `expect` is checked once it's done |
| `.branch({ Tag: (m) => … })` | a different continuation for each place the last step can land |
| `.finally(b)` | a cleanup step: runs after the others, pass or fail |

## Step options

The second argument tunes one step:

| Option | Does | Example |
|---|---|---|
| `expect` | what the scenario expects after this step ([below](#what-the-scenario-expects-expect)) | `{ expect: [ExpectSavedToastBlock, Machine.status.is("Saved")] }` |
| `lands` | the outcome this flow is about, when a Block can land in several | `.method(SubmitLoginBlock, { lands: LoggedIn })` |
| `settle` | waits for a page that keeps changing (a debounced search) | `{ settle: true }` or `{ settle: { quietMs: 600, maxMs: 8000 } }` |
| `when` | plays the step only if it returns true (an optional field) | `{ when: (mem) => mem.get(Case.body) !== undefined }` |
| `pace` | demo speed for this step | `{ pace: "blitz" }` |
| `ff` | fast-forwards this one step in the demo; for several, `.ffStart()` … `.ffEnd()` | `{ ff: true }` |

A run where the Block lands somewhere other than `lands` fails at that step:
`"submit-login" landed on LoginPage, but this flow continues from LoggedIn`.

## What the scenario expects: `expect`

After a step, the flow says what the scenario expects: Expect Blocks, Traits, and what the page shows
(`Key.is(value)`, `Key.passes(test)`, read through the page's [Read Block](./reads)):

```ts
engine.map({ as: Planner })
  .gotoPage(Machine.nav, { expect: [Machine.expects.header] })
  .method(Machine.do.confirmArchive, {
    expect: [
      ExpectArchivedToastBlock,                                                  // named, reusable
      Machine.status.is("Archived"),                                             // equal (deep, for lists and objects)
      Machine.code.passes((code, mem) => code === mem.get(Keys.machine).code, "the machine we archived"),
    ],
  });
```

They're added to what the Block itself expects, run together right after its `verify`, never change the page, and a
failing step lists every one that didn't hold ([Checks](./checks#expect-what-the-scenario-expects)).
`{ expect: false }` drops the Block's own for one step; `map({ expect: false })` or `--no-expect` runs only `verify`.

## One Block, several inputs: `.set()`

A Block reads its input from mem, so the flow can say what it is right before the step. One Fill Block covers every
search instead of one Block per value:

```ts
engine.map()
  .gotoPage(RegistryPage.nav)
  .set(Keys.search, "MCH-0111")
  .method(RegistryPage.do.fillSearch)
  .set(Keys.search, (mem) => mem.get(Keys.downMachine).code)                 // worked out when the step runs
  .method(RegistryPage.do.fillSearch);
```

A key a `.set()` gives is no longer one the run must supply: `--data` and mem stubs aren't asked for it.

## The same steps in several flows: `steps()`

```ts
export const logDisruption = steps(DisruptionLog, (m) =>
  m.method(LogPage.do.selectMachine).method(LogPage.do.fillShiftStart).method(LogPage.do.submit),
);

engine.map({ as: Planner })
  .gotoPage(LogPage.nav)
  .steps(logDisruption)
  .gotoPage(LogPage.nav)
  .steps(logDisruption);
```

A part is typed from the Checkpoint it starts on, like any step: played from anywhere else, it doesn't compile. It
isn't a flow on its own; the flow that plays it is. For signing in, use an [account](#accounts) instead.

## Before and after: setup and cleanup

Data a flow needs goes in first, as steps (an API Block, or a whole flow), so the flow doesn't depend on what the
database happens to hold; what it made goes away in `.finally()`, pass or fail:

```ts
engine.map({ as: Planner })
  .flow(seedDownMachineFlow)          // API Blocks: create the machine, keep its code in mem
  .gotoPage(RegistryPage.nav, { expect: [Registry.rows.passes((rows, mem) => rows.some((r) => r.code === mem.get(Keys.downMachine).code))] })
  .finally(DeleteMachineApiBlock);
```

## Two outcomes: `lands` or `.branch()`

```mermaid
graph LR
  L[LoginPage] -->|submit-login| I[LoggedIn]
  L -->|submit-login| L2[LoginPage<br/>error shown]
  I --> N[nav-cart …]
  L2 --> A[expects the error]
```

```ts
engine.map()
  .gotoPage(NavLoginBlock)
  .method(SubmitLoginBlock, { expect: { LoginPage: [ExpectLoginErrorBlock] } })    // per outcome
  .branch({
    LoggedIn: (m) => m.gotoPage(NavCartBlock),
    LoginPage: null,
  });
```

`.branch()` must name every outcome (`null` ends that one there). Use `lands` when the flow is only about one.

## Flow settings

`map({ … })` sets the flow up before its first step:

| Setting | Does |
|---|---|
| `memStub: true` | fills keys nothing else supplies from their mem stubs ([Data](./data)); `new Engine({ memStub: true })` does it for every flow |
| `as: Account` | starts signed in as that account ([below](#accounts)) |
| `input: Key` | the flow takes this key as its input, once per case ([Data](./data#one-flow-many-cases)) |
| `viewport: { width, height }` | the browser size it plays at |
| `timezone` / `network` | the world it runs in ([Testing](./testing#the-world-a-flow-runs-in)) |
| `exclusive: true` | `test --flows` runs it alone, after the others |
| `sessionReset: true` | starts with fresh cookies and storage when it follows another flow |
| `expectedFailure: "why"` | the flow is meant to fail (a locked-out user); passes when it does |
| `demoPace`, `highlightStyle` | demo speed and ring style ([Demo](./demo)) |
| `homeOrigin` | checks each Nav's URL is on this origin (`gotoExternal` checks it isn't) |

## Accounts

A flow that starts signed in says as whom. An account is a name and the flow that signs it in:

```ts
// src/accounts/accounts.ts
export const StandardUser = account("standard-user", { signIn: loginFlow });

// src/flows/cart-as-account.flow.ts
export const cartAsAccountFlow = engine
  .map({ as: StandardUser })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock);
```

```mermaid
graph LR
  F[flow as StandardUser] --> Q{a session still good?<br/>kept in this process,<br/>or saved, with a ttl}
  Q -->|no| S[run loginFlow,<br/>keep cookies + storage]
  Q -->|yes| R[restore it]
  S --> N[the flow's first step]
  R --> N
```

So a test run signs each account in once. `forgetSessions()` drops the kept sessions.

### How long a session lasts: `ttl`

An app signs people out after a while. Say how long, and the account signs in again once its session is older:

```ts
export const StandardUser = account("standard-user", { signIn: loginFlow, ttl: "15m" }); // "30s", "2h", "1d", or ms
```

An account with a `ttl` also saves its session (`.waygraph/sessions/`), so the next run and every test worker start
signed in too, until it runs out, instead of each signing in again (a sign-in by emailed link is slow, and often
rate-limited). Without a `ttl` the session lasts as long as the process and is never saved: nothing says how long the
app keeps it.

- A saved session is the account's for one site and one person: a different base url, or a different person in its
  `mem`, signs in again (and saves its own).
- The files hold cookies: `.waygraph/` is in the scaffold's `.gitignore`, and each file is readable only by you.
- `--fresh-sessions` (run, demo, test) signs every account in again and saves the new sessions; `WAYGRAPH_SESSIONS=0`
  turns saving off, or names another folder.
- Count from when the app signs the person in, a little under its real timeout: a session the app ended early fails
  the flow's first step (which says what the page showed).

When one sign-in flow serves several people (a magic link, by email), the account says who it is with `mem`: set right
before it signs in, so a flow `as` it needs nothing more, and whoever an earlier flow signed in as doesn't matter.

```ts
const person = (email: string) => (mem: MemPage) => mem.set(AuthKeys.recipient, { email });

export const PlanningOfficer = account("planning-officer", { signIn: loginPlanningOfficerFlow, mem: person("kat@jbtec.example") });
export const Leadership = account("leadership", { signIn: loginLeadershipFlow, mem: person("cesar@jbtec.example") });
```

Waygraph loads `src/accounts/` itself (as it does mem stubs), so a sign-in flow that is one account's knows whose it is:
`waygraph demo loginLeadershipFlow`, or Run in [Waygraph UI](./ui), signs in as Cesar with no `--data`. A value given
with `--data` still wins.

## Episodes: nesting flows

```ts
export const showcase = engine
  .map()
  .flow(ownerFlow)                       // episode 1
  .flow(viewerFlow, { reset: true })     // episode 2: a second user, fresh cookies;
```

## Running a flow

| How | Command |
|---|---|
| headless | `npx waygraph run homeCartFlow` (or the file: `src/flows/home/cart.flow.ts`) |
| step by step, narrated | `npx waygraph demo homeCartFlow` ([Demo](./demo)) |
| as a test | `npx waygraph test --flows` ([Testing](./testing)) |
| two in a row | `npx waygraph run "loginFlow then shopFlow"` |
| list them | `npx waygraph list` |
| in code | `await flow.run(new MemPage())` (own browser) · `await flow.run(context, new MemPage().set(Keys.user, marco))` (a Playwright test's context) |

`flow.run(context, mem, { page, closeOnFinish: false })` drives a page you already have and hands it back:
[recipes](../reference/cli#recipes).
