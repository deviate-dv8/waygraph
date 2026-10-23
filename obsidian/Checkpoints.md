---
tags:
  - waygraph
  - concept
aliases:
  - Checkpoint
  - States
---

# Checkpoints

A **Checkpoint** is a state your app can be in: `LoginPage`, `LoggedIn`, `ItemInCart`. It is only a name - no data -
so two Checkpoints with the same name are the same state everywhere.

```ts
export const Home = checkpoint("Home");
export type Home = typeof Home;
```

- Declared once, as values, in `src/states/` (or in a map group's own `_states.ts`, see [[What Waygraph Writes#Map packages]]).
- Every [[Blocks|Block]] says which Checkpoint it starts **from** and which it lands **to**.
- They are the joints of the timeline: a [[Flows|Flow]] only lets a Block follow another if it starts where the last one ended.
- A list (`[Home, CartEmpty] as const`) means "any of these".

The graph `waygraph graph` draws has Checkpoints as nodes and Blocks as the arrows between them.

Code: `src/engine/checkpoint/`.
