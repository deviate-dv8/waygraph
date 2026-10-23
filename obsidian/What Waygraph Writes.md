---
tags:
  - waygraph
  - outputs
aliases:
  - Outputs
  - Manifest
  - Run log
---

# What waygraph writes

## The manifest

`waygraph manifest` prints everything a project defines as JSON: every [[Blocks|Block]] (kind, from -> to, the
[[Mem]] keys it needs, its file), every [[Flows|Flow]] (its use case and steps) and every [[Checkpoints|Checkpoint]].
It is read from the Blocks themselves at runtime - the same scan `graph`, `check`, `auto` and the runner use. This is
what Waygraph UI reads.

## Run logs

Every `run`, `demo` and `test` writes `.waygraph/runs/<runId>.jsonl`: one line per event - the run starting, each step
starting and ending (with the Checkpoint and time) or failing (with the error), videos and screenshots, the run ending.
Read the newest one to see what failed without re-running.

## Videos and reports

`--video` records a `.webm` (path in the run log). `WAYGRAPH_JSON=1 waygraph run ...` prints a JSON report carrying the
same `runId`.

## Map packages

A map group that owns its states and keys (`src/map/(external)/hoppscotch/` with `_states.ts`, `_keys.ts`) can be
published: `waygraph map pack hoppscotch` compiles it into a package with a `waygraph.map.json`. Install that package in
another project and its Blocks show up there - in the graph, `auto`, the manifest and flows.
