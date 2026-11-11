## Context

- **One page per flow today.** `runGraph` (`engine/run/run.ts`) plays a chain of Blocks on one `page`: each Block's
  `precondition → act → observe → resolve → verify` gets that page and the previous step's Checkpoint as its input.
  `flow.run(context, mem, { page })` makes or takes the page; `map({ as })` adds a `sign-in-as-<account>` first step.
- **Typing.** `MapBuilder<Out>` carries the page the flow is on; `gotoPage`/`method` check a step's `from` against it.
- **Step wrappers.** `map()` already wraps a step's Block (`resetBefore`, `landsOn`, `withExpect`) and keeps its markers
  (`copyWaygraphRuntime`): a step can change how a Block runs without the Block changing.
- **The demo** injects its overlay into the page (`demo/overlay/`), paints the device inside the page
  (`device-stage.ts`), and records the page's video (`--video`).
- **Spikes (Chromium 153, saucedemo):**
  - *Stage.* Two headless contexts, each streaming `Page.startScreencast` (JPEG, quality 70) into an `<img>` on a third
    page: both live side by side, both driven, the stage recorded as one video. About 5 frames a second per pane while it
    changes; nothing while it doesn't.
  - *Tiled windows.* Two headed pages, `Browser.getWindowForTarget` + `Browser.setWindowBounds` to 960×1080 at x 0 and
    960: placed exactly, both driven.
  - *Frames.* Not tried further: two panes on one site share cookies, and `X-Frame-Options` / `frame-ancestors` refuse
    many apps.

## Goals / Non-Goals

**Goals:**
- A scenario with two sides reads as one flow, in order, the way the story goes.
- Every Block works in a pane unchanged.
- One window and one video show both sides.
- The same flow, two ways, compared step by step, with the differences named.

**Non-Goals:**
- Driving the browser's own split view (Chrome's or Firefox's tab UI): not reachable from Playwright.
- More than two panes on the stage at first (the model allows any number; the stage lays out two, then a grid later).
- Steps in two panes at the same time (a race between two people): steps play in the flow's order.
- A stage on Firefox or WebKit (no CDP screencast); they play split flows in run and test.

## Decisions

### D1. A pane is a page in a context; the flow names panes
`map({ panes: { planner: { as: Planner }, admin: { as: Admin, device: "iphone-15" } } })`. A pane with `with: "app"` is
another page in the app pane's context (one person: the app and the mail catcher). Panes are opened when first used and
closed with the flow.
- *Alternative:* two flows played together, synchronized by events. Rejected: the scenario is one story; splitting it
  hides the order and the data passing between the sides.

### D2. `.in(pane)` marks each step; the run asks which page a step gets
A step after `.in("admin")` carries its pane (`__waygraphPane`, set by `inPane` beside `resetBefore` and `landsOn`; a
joined or fast-forwarded step carries its last step's). Wherever a step uses its page (act, precondition, observe,
verify, expect, reads, screenshot, the address in the run log), the run loop and joined steps ask `run/pane-page.ts`
for it: the pane's page, opened on first use, and the pane's last Checkpoint as input (`Start` the first time). The
panes themselves (`flow/panes.ts`) install that answer when a flow declares panes, so a flow without panes never loads
them. Every Block stays as it is; the run log's `step:start` carries `pane`.
- *Alternative:* wrapping each step's instruction to swap the page. Rejected: verify, expect, reads and screenshots run
  outside the instruction, on the page the loop holds.

### D3. Typing: a current page per pane
`MapBuilder<Out, Panes, Active>`: `Panes` maps each pane to the page it's on, `Active` the pane acting. `.in<P>(p)`
returns a builder whose `Out` is `Panes[P]` and whose `Panes` records the active pane's `Out`. A pane first used starts
at `Start` (or its sign-in's landing). A flow without panes keeps today's `MapBuilder<Out>` (defaults).

### D4. One mem; a pane's person comes back with it
Panes share mem: what one side makes, the other reads (a request id, a message). An account's `mem` (its person: email,
credentials) is set again when the flow switches to its pane, so steps read their own side's person.

### D5. The stage shows panes; the run and test don't need it
- `waygraph run` / `test`: panes play headless, no stage; their contexts follow the config (device per pane).
- `waygraph demo` and `--video`: a stage page (`demo/split/stage.ts`) shows each pane's screencast side by side, with a
  label (pane, account, device) and the acting pane marked; the overlay is injected into each pane as today, so rings
  and captions show in the pane they're about, and the stage records one video. The stage's window is the demo's window
  (it keeps its size, like the device stage).
- `--split windows`: real windows placed side by side (`Browser.setWindowBounds`), for watching live and clicking in;
  no single video unless recorded from the screen.
- The stage's frame rate is the screencast's: smooth enough for a demo; a run that needs every frame records each
  pane's own video too (`--video` writes the stage video and, with `--video-panes`, one per pane).

### D6. Compare is a play mode, not a flow option
`--compare as=a,b | device=a,b | config=a,b` plays the flow twice as two panes of one run, `left` and `right`, each step
on both before the next. After each step it compares the landing Checkpoint, each check's outcome and the Read fields;
differences go in the run log (`compare:diff`) and the end of the run prints them. A side that fails stops; the other plays
on. The exit code follows failures, not differences.

### D7. Chromium first
The stage needs `Page.startScreencast`, tiled windows need `Browser.setWindowBounds`: both CDP, Chromium only. Other
browsers play split flows without a stage, and the demo says why.

## Risks / Trade-offs

- **Screencast frame rate** (about 5 per second per pane under load) → demos look a little stepped; `--video-panes`
  gives each pane's full-rate video, and a later change can compose them (ffmpeg `hstack`).
- **The overlay assumes one page** (the step panel, the todo dock, the outcome card) → the stage owns the step panel and
  the todos (one per flow), each pane keeps its rings, captions and outcome card.
- **Type complexity in `MapBuilder`** → defaults keep single-pane flows' types as today; `typecheck/` gets cases for
  `.in()`.
- **Two sign-ins per run** → each pane's account uses its kept session like any flow `as` it.
- **Compare on two configs** loads two configs in one process → the second config's `baseUrl` and device only; other
  settings come from the first, and the report says so.

## Migration Plan

Additive: a flow without `panes` plays as today, and no flag changes. A project with a scenario written as two flows (or
one with a sign-out in the middle) can move it to panes when it wants.

## Open Questions

- Should `waygraph auto` and Pilot offer panes (an agent acting as two people)? Proposed: later, on the same table.
- A stage with three or more panes: a grid, or tabs? Proposed: a grid, after two work.
