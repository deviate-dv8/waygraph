---
tags:
  - waygraph
  - concept
aliases:
  - auto
  - pilot
  - traverse
---

# Live sessions - no timeline

Not everything plays a saved [[Flows|Flow]]. These open a browser and work from **where it is now**:

| Command | What it does |
|---|---|
| `waygraph auto` | shows a menu of every [[Blocks|Block]] that can start from the current [[Checkpoints|Checkpoint]]; you (or `--cli`) pick, it plays that Block, the menu updates |
| `waygraph pilot` | the same session, driven by a coding agent: it reads the menu and sends Blocks to play |
| `waygraph browser` | a long-running session you attach to and send commands |
| `waygraph traverse` | walks the whole graph by itself, trying every edge, and reports coverage |

They use the same [[The Engine|engine]] for each Block and the same overlay as the [[Demo UI]]. The menu comes from
the project scan ([[What Waygraph Writes#The manifest]]).

Code: `src/live/`.
