---
tags:
  - waygraph
  - concept
aliases:
  - Block
  - Clips
---

# Blocks

A **Block** is one step: from one [[Checkpoints|Checkpoint]] to another. It is the clip on the timeline.

Every Block has an **instruction** with up to five parts (see [[The Engine]] for how they run):

| Part | Job |
|---|---|
| `precondition` | checks the page is ready before acting (optional) |
| `act` | does the thing: fill, click, call an API |
| `observe` | reads what happened, only when the Block can land in more than one place |
| `resolve` | names the Checkpoint it reached |
| `verify` | proves the page really is there (Traits: url, text, visible, ...) |

## Kinds

You never build a Block by hand; a factory makes it and marks its kind, so [[Flows|map()]] can check it.

| Kind | Factory | For |
|---|---|---|
| Nav | `defineNavBlock` | getting to a page (URL or link click) |
| Page | `definePageBlock` | "you have arrived" |
| Method | `defineMethodBlock` | an action that doesn't navigate (fill, submit) |
| Effect | `defineEffectBlock` | an action on one of many live items (add *this* item) |
| Assert | `defineAssertBlock` | checks a state without changing it |
| API | `defineApiBlock` | a real HTTP request inside the same flow |

A Block can carry **narration** for the demo (`.stubBefore((ctx) => ctx.ring(...))`), but the convention is to add it
where a flow uses the Block, not in the Block file. See [[Demo UI]].

Code: `src/engine/block/` (`kinds/` has one file per kind).
