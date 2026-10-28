# Flows

A flow is a path through your Blocks, written with `engine.map()`. TypeScript checks that each step starts where the
last one ended, so a flow can't skip from one page to an unrelated one.

```mermaid
graph LR
  S((start)) -->|nav-home| H[Home] -->|add-item| I[ItemInCart] -->|clear-cart| C[CartEmpty]
```

```ts
import { engine } from "../../../config/waygraph.config.js";

export const homeCartFlow = engine
  .map({ memStub: true })
  .gotoPage(NavHomeBlock)
  .method(AddItemBlock)
  .assert(AssertItemAddedBlock)
  .method(ClearCartBlock)
  .end();
```

## The steps

Each step takes the kind of Block its name says. Hand it anything else, or an object that only looks like a Block,
and it throws, naming the factory to use.

| Step | Takes |
|---|---|
| `.gotoPage(b)` | a Nav or Page Block on your app |
| `.gotoExternal(b)` | a Nav Block on another site (a mail catcher, a REST client) |
| `.method(b)` | a Method, Effect or API Block |
| `.assert(b)` | an Assert Block |
| `.flow(sub, { reset })` | another flow's steps, in the same page and mem |
| `.branch({ Tag: (m) => … })` | a different continuation for each place the last step can land |
| `.finally(b)` | a cleanup step: runs after the others, pass or fail |
| `.end()` | the finished `Flow` |

## Step options

The second argument tunes one step:

| Option | Does | Example |
|---|---|---|
| `lands` | the outcome this flow is about, when a Block can land in several | `.method(SubmitLoginBlock, { lands: LoggedIn })` |
| `settle` | waits for a page that keeps changing (a debounced search) | `{ settle: true }` or `{ settle: { quietMs: 600, maxMs: 8000 } }` |
| `when` | plays the step only if it returns true (an optional field) | `{ when: (mem) => mem.get(Case.body) !== undefined }` |
| `pace` | demo speed for this step | `{ pace: "blitz" }` |
| `ff` | groups steps into one fast-forward unit in the demo | `{ ff: true }` |

A run where the Block lands somewhere other than `lands` fails at that step:
`"submit-login" landed on LoginPage, but this flow continues from LoggedIn`.

## Two outcomes: `lands` or `.branch()`

```mermaid
graph LR
  L[LoginPage] -->|submit-login| I[LoggedIn]
  L -->|submit-login| L2[LoginPage<br/>error shown]
  I --> N[nav-cart …]
  L2 --> A[assert-error]
```

```ts
engine.map()
  .gotoPage(NavLoginBlock)
  .method(SubmitLoginBlock)
  .branch({
    LoggedIn: (m) => m.gotoPage(NavCartBlock).end(),
    LoginPage: (m) => m.assert(AssertLoginErrorBlock).end(),
  });
```

`.branch()` must name every outcome (`null` ends that one there). Use `lands` when the flow is only about one.

## Flow settings

`map({ … })` sets the flow up before its first step:

| Setting | Does |
|---|---|
| `memStub: true` | fills keys nothing else supplies from their mem stubs ([Data](./data)) |
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
  .map({ as: StandardUser, memStub: true })
  .gotoPage(NavInventoryBlock)
  .method(AddToCartBlock)
  .end();
```

```mermaid
graph LR
  F[flow as StandardUser] --> Q{signed in before<br/>in this process?}
  Q -->|no| S[run loginFlow,<br/>keep cookies + storage]
  Q -->|yes| R[restore the kept session]
  S --> N[the flow's first step]
  R --> N
```

So a test run signs each account in once. `forgetSessions()` drops the kept sessions.

## Episodes: nesting flows

```ts
export const showcase = engine
  .map()
  .flow(ownerFlow)                       // episode 1
  .flow(viewerFlow, { reset: true })     // episode 2: a second user, fresh cookies
  .end();
```

## Running a flow

| How | Command |
|---|---|
| headless | `npx waygraph run homeCartFlow` (or the file: `src/flows/home/cart.flow.ts`) |
| step by step, narrated | `npx waygraph demo homeCartFlow` ([Demo](./demo)) |
| as a test | `npx waygraph test --flows` ([Testing](./testing)) |
| two in a row | `npx waygraph run "loginFlow then shopFlow"` |
| list them | `npx waygraph list` |
| in code | `await flow.run(mem)` (own browser) · `await flow.run(context, mem)` (a Playwright test's context) |

`flow.run(context, mem, { page, closeOnFinish: false })` drives a page you already have and hands it back:
[recipes](../reference/cli#recipes).
