## 1. Panes in the engine

- [x] 1.1 `map({ panes })` options: each pane's `as`, `device`, `with`; validated when the flow is built (an unknown
      `with`, a pane `with` itself, `as` on a pane that shares a context)
- [x] 1.2 The run's pane table (each pane's page and last Checkpoint), opened on first use, closed with the flow; panes
      with their own context get the config's options and their device
- [x] 1.3 `inPane(block, pane)`: the step acts on its pane's page with its pane's last Checkpoint as input; marker
      `__waygraphPane`; works with `resetBefore`, `landsOn`, `withExpect`, stubs and `{ ff }` (done as a marker the run loop and joined
      steps read through `run/pane-page.ts`: every part that uses the step's page gets its pane's)
- [x] 1.4 `.in(pane)` on the builder, and the types: a current page per pane (`MapBuilder<Out, Panes, Active>`), defaults
      keeping single-pane flows as today; `typecheck/` cases (a step checked against its pane's page; a wrong one fails)
- [x] 1.5 Accounts per pane: each pane with `as` signs in (kept sessions as today); switching pane sets its account's
      mem again
- [x] 1.6 Errors name the pane (`admin, as Admin`); the run log's step events carry `pane`
- [x] 1.7 Tests: two people on a local fixture app (each sees its own session, data passes between them), one person
      with two pages (`with`), a step typed against its pane's page, a failure naming its pane

## 2. Run, test and the manifest

- [x] 2.1 `waygraph run` and `waygraph test --flows` play split flows (headless, no stage); `--blocks` chains keep one
      pane
- [x] 2.2 Manifest: a flow's `panes` (name, account, device, `with`) and each step's pane
- [x] 2.3 Tests: a split flow as a flow test; the manifest's panes

## 3. The stage and tiled windows

- [x] 3.1 `demo/split/stage.ts`: a stage page streaming each pane's screencast side by side, labels (pane, account,
      device), the acting pane marked; it keeps the window's size
- [x] 3.2 The overlay with panes: the stage holds the step panel and todos; each pane keeps its rings, captions and
      outcome card (done as: each pane has the whole demo UI on its own page, seen through the stage, since a step's
      narration and rings are painted on the page it acts on; on the stage the demo moves on by itself, in windows
      Next works as usual)
- [x] 3.3 `--video` records the stage; `--video-panes` also records each pane
- [x] 3.4 `--split windows`: each pane in a real window, placed side by side (`Browser.setWindowBounds`)
- [x] 3.5 Not Chromium: the demo plays without a stage and says why (nothing to do: `run` and `demo` always play in
      Chromium; Firefox and WebKit play split flows only under `waygraph test`, where there's no stage)
- [x] 3.6 Tests: a demo of a split flow (headless, on the hidden display) shows both panes and records one video; tiled
      windows land where placed

## 4. Compare two runs

- [x] 4.1 `--compare as=a,b | device=a,b | config=a,b` on run and demo: the flow twice as `left` and `right`, in step
      (done as two panes named for the sides, `planner` and `admin`; a config side is a pane with that config's
      `baseUrl`; signing in isn't compared)
- [x] 4.2 Differences per step (landing, each check, Read fields) as `compare:diff` events; the summary at the end; a side
      that fails stops, the other plays on; exit code from failures only
- [x] 4.3 Tests: two devices passing with a field that differs; two accounts where one side fails a step

## 5. Waygraph Studio

- [x] 5.1 A split flow and its runs as lanes, one per pane
- [x] 5.2 A compared run: both sides as lanes, each difference beside its step
- [x] 5.3 UI tests; light and dark; the guide's screenshots (`npm run docs:studio-shots`) (the lanes are described in the
      UI guide; its screenshots stay on the single-page flows)

## 7. One screen, then split, then one again

- [x] 7.1 `.close(pane)`: closes another pane (its context, and the panes sharing it); the flow goes on in the pane it's
      in; `.in()` it again later and it opens afresh. Types: the closed pane's page is forgotten; the pane the flow is
      in can't be closed. The pane on the run's own page (outside a demo) doesn't close, saying so
- [x] 7.2 The stage shows only open panes: one fills it, a second opening splits it, one closing gives the room back;
      the panes the stage sizes are resized (through the demo's own resize, which a Block's can't use)
- [x] 7.3 Tests: closing and reopening, the run's own page refusing to close, the types; saucedemo's twoShoppersFlow
      goes from one to two to one

## 6. Examples, docs and skills

- [x] 6.1 saucedemo: a two-person flow (two users, each their own cart) and a compare on two devices; the quickstart
      synced (the compare needs no flow of its own: `--compare device=desktop,mobile` on any flow)
- [x] 6.2 The scaffold: the mail catcher beside the app as a pane in its email verification flow
- [x] 6.3 Docs: a Split view guide page (panes, `.in()`, `with`, the stage, windows, compare), the flows and demo guides,
      the CLI reference, the run log reference
- [x] 6.4 Convention skill: two people in one scenario are panes, not two flows or a sign-out in the middle; the planner
      agent
- [x] 6.5 ROADMAP; full verify (tsc, build, structure, knip, unit, Playwright offscreen, saucedemo, ui)
