---
tags:
  - waygraph
  - concept
aliases:
  - MemPage
  - Memory
---

# Mem

**Mem** is what a run carries between steps: the credentials to type, the item just added, the link read out of an
email. Each value has a typed key:

```ts
export const Credentials = key<{ username: string; password: string }>("app.credentials");
```

- A [[Blocks|Block]] lists the keys it `requires`; the run checks they are set before it starts.
- `act` reads them (`mem.get(Credentials)`) and writes new ones (`mem.set(EmailLink, url)`).
- Values come from `--data '{...}'` on the CLI, from a test, or from **mem stubs**: fakes registered with
  `registerMemStub` in a `*.mem-stubs.ts` file, used when a flow says `map({ memStub: true })` or the CLI says
  `--mem-stub`. [[Live Sessions]] (auto, pilot, traverse) load every `*.mem-stubs.ts` and use those fakes by default.
  A stub gets `{ unique }` - different every run, the same within one - for data a run creates:
  `registerMemStub(Signup.email, ({ unique }) => \`qa+${unique}@example.com\`)`, so the second run doesn't collide.
- Every run records the mem it was seeded with; `waygraph run <flow> --replay <runId>` runs again with exactly that.
- In the demo, the panel shows a step's keys and lets you edit them before it runs.

Code: `src/engine/mem/`.
