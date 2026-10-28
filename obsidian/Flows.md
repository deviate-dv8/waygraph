---
tags:
  - waygraph
  - concept
aliases:
  - Flow
  - Timeline
  - map()
---

# Flows - the timeline

A **Flow** is [[Blocks]] in order. You build it with `map()`, the only way to make one:

```ts
export const homeCartFlow = engine
  .map({ memStub: true })          // settings for the whole flow
  .start()
  .gotoPage(NavHomeBlock)          // must be a Nav or Page Block
  .method(AddItemBlock)            // must be a Method, Effect or API Block
  .assert(AssertItemAddedBlock)    // must be an Assert Block
  .end();
```

> [!note] What map() checks for you
> - **Kind**: `.gotoPage()` only takes navigation, `.method()` only actions, `.assert()` only checks.
> - **No teleporting**: each step must start on the [[Checkpoints|Checkpoint]] the previous one ended on (TypeScript
>   catches it as you type).

## Shaping the timeline

- `.flow(otherFlow, { reset: true })` - drop another flow in (a nested sequence), optionally with a fresh session.
- `.branch({ LoggedIn: (m) => ..., LoginPage: (m) => ... })` - split by where the last step landed.
- `.method(Block, { ff: true })` / `.ffStart()...ffEnd()` - fast-forward steps in a demo.
- `.method(Block, { pace: "slow" })` - slow one step down in a demo.
- `.method(Block, { settle: true })` - wait for the page to stop changing after this step (a debounced search), not a fixed sleep.
- `.method(Block, { when: (mem) => … })` - play a step only for the cases that need it (it stays on its Checkpoint).
- `.flow(sub, { input })` - drop in a flow that takes input, with this case's value.
- `.finally(DeleteUserApiBlock)` - a cleanup step: runs after the flow's steps, pass or fail (delete what it created).
- `.method(SubmitLoginBlock, { lands: LoggedIn })` - continue from one outcome of a Block that can land in several
  places (a run that lands elsewhere fails there).

## Settings in map({ ... })

| Setting | Meaning |
|---|---|
| `memStub` | fill missing [[Mem]] values with registered fakes |
| `sessionReset` | start with a fresh browser session when run after another flow |
| `viewport` | the browser size the flow plays at |
| `exclusive` | under `waygraph test --flows`, run alone after every other flow |
| `input` | the flow takes a value (a MemKey): one flow for many cases; `--input` gives it, a list plays it once per item |
| `as` | start signed in as an account (`account("planner", { signIn: plannerSignInFlow })`): it signs in once per run, later flows reuse its session |
| `expectedFailure` | this flow is *meant* to fail (a blocked user); the demo explains instead of alarming |
| `demoPace`, `highlightStyle` | how the demo plays this flow |

A flow's on-screen title is set by a stub on its first step: `NavLoginBlock.stubBefore((ctx) => ctx.ui.title("Sign in"))`.

Where flows live in a project: [[Your Project]]. Code: `src/engine/flow/` (`map-builder.ts` is `map()`).
