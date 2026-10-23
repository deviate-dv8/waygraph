---
tags:
  - waygraph
  - glossary
---

# Glossary

| Term | Meaning |
|---|---|
| **Checkpoint** | A state the app can be in. See [[Checkpoints]] |
| **Block** | One step from one Checkpoint to another. See [[Blocks]] |
| **Flow** | Blocks in order, built with `map()` - the timeline. See [[Flows]] |
| **map()** | The flow builder; checks each step's kind and that steps connect |
| **Mem** / **MemKey** | Values carried between steps, and their typed names. See [[Mem]] |
| **Trait** | One check `verify` runs against the page (url, text, visible) |
| **Layout** | Checks that apply to many Checkpoints (a sidebar always present) |
| **Stub** (`stubBefore` / `stubAfter` / `stubOnError`) | A step's narration for the demo. See [[Demo UI]] |
| **Mode** | How the runner plays steps: run, demo, report, branches. See [[Playing a Flow]] |
| **Episode** | One named flow inside a chained run (`loginFlow then cartFlow` has two) |
| **Expected failure** | A flow meant to fail (`map({ expectedFailure })`); it stops cleanly |
| **Fast-forward (ff)** | Steps a demo plays at blitz speed as one unit |
| **Waygraph Map** | The project layout where folders mirror the app's URLs. See [[Your Project]] |
| **Manifest** | JSON of everything a project defines. See [[What Waygraph Writes]] |
| **Run log** | `.waygraph/runs/<runId>.jsonl`, one line per run event |
| **Map package** | A packed map group another project installs |
