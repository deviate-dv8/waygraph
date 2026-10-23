---
tags:
  - waygraph
  - moc
aliases:
  - Home
  - Waygraph overview
---

# Waygraph, at a glance

Waygraph is an opinionated Playwright. You describe your app as **steps between states**, line the steps up into a
**timeline**, and an **engine** plays the timeline in a real browser - plainly like a test, or slowly with an
on-screen guide.

> [!tip] Read in this order
> 1. [[How Waygraph Works]] - the whole idea in one picture (your video-editor model, corrected)
> 2. [[Checkpoints]] -> [[Blocks]] -> [[Flows]] - the three things you write
> 3. [[The Engine]] - what happens when one step plays
> 4. [[Playing a Flow]] - `run`, `demo` and the other modes
> 5. [[Inside the Code]] - where each of these lives in `src/`

## The pieces

| Note | One line |
|---|---|
| [[Checkpoints]] | The states your app can be in ("on the login page", "item in cart") |
| [[Blocks]] | One step from one state to another (fill a field, click a link, call an API) |
| [[Flows]] | The timeline: Blocks in order, built with `map()` |
| [[Mem]] | The values a run carries between steps (credentials, the item just added) |
| [[The Engine]] | Plays one Block: act -> observe -> resolve -> verify |
| [[Playing a Flow]] | One loop, different modes: run, demo, report, all branches |
| [[Demo UI]] | What `waygraph demo` paints on the page around each step |
| [[Live Sessions]] | Driving a browser without a timeline: auto, pilot, traverse |
| [[Your Project]] | How a waygraph project is laid out (`src/map`, `src/flows`, config) |
| [[What Waygraph Writes]] | The manifest, run logs, videos and map packages |
| [[Inside the Code]] | The source folders and where to start reading |
| [[Glossary]] | Every term in one place |

![[Waygraph.canvas]]
