## Why

Some scenarios have two sides, and a flow today can only show one:

- **Two people.** A planner requests a repair and an admin approves it; one person sends a chat message and the other
  receives it. Today that is two flows, or one flow that signs out and in again, and nobody sees both screens at once.
- **The app and a helper.** Signing up while the mail catcher receives the link; the UI beside the REST client that
  checks the same record. The flow jumps between them and a demo shows one at a time.
- **The same flow, two ways.** Desktop and phone; two accounts; staging and production. Comparing them means two runs
  and two videos, watched one after the other.

Firefox and Chrome both have a split view (two tabs side by side in one window), but it belongs to the browser's own UI,
which Playwright can't reach. Spikes on Chromium 153 found two ways that work without it:

- **A stage page.** Each pane is its own page (its own context, so its own signed-in person); a stage page shows them
  side by side, live, from their screencasts (Chrome DevTools Protocol `Page.startScreencast`). Playwright drives the
  real pages; the stage is the one thing on screen and the one thing recorded. Two users on saucedemo, side by side, in
  one video: about 5 frames a second per pane while it changes, none while it doesn't.
- **Tiled windows.** Two real browser windows, placed side by side with `Browser.setWindowBounds`, both driven.

Frames in one page were ruled out: two panes on the same site share their cookies (no second person), and many apps
refuse to be framed.

## What Changes

- **Panes in a flow.** `map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })` declares the flow's panes,
  each with its own browser context (its own account, device, cookies) or sharing another pane's (`with: "app"`: one
  person, two pages). `.in("admin")` says which pane the next steps act in. Each pane has its own current page, and
  TypeScript checks every step against the pane it acts in. Blocks don't change: a Block acts on a page, and the flow
  chooses which.
- **One mem, each pane's person.** Panes share the flow's mem (what the planner made, the admin reads); switching to a
  pane puts its account's own data (`account({ mem })`) back.
- **Showing it.** `waygraph demo` and `--video` show a split flow on a stage: the panes side by side, each labelled
  (its account, its device), the one acting highlighted, the demo's overlay in each. `--split windows` uses real tiled
  windows instead, for watching live and clicking into them. `waygraph run` and `waygraph test` play the panes with no
  stage.
- **Compare two runs.** `waygraph demo checkoutFlow --compare as=planner,admin` (or `device=desktop,phone`,
  `config=staging,prod`) plays one flow twice, side by side, step by step together, and says where they differ: a step
  that lands somewhere else, a check that passed on one side only, a field that reads differently.
- **The run log and Waygraph UI.** Each step records its pane; a split flow and its runs show as lanes, one per pane; a
  compared run shows its differences.

## Capabilities

### New Capabilities
- `split-view`: panes in a flow (`panes`, `.in()`, shared or own context, accounts and devices per pane), playing them
  in run, test and demo, the stage and tiled windows, the run log's pane per step, and Waygraph UI's lanes.
- `compare-runs`: playing one flow twice side by side (`--compare` by account, device or config), in step, and the
  differences it reports.

### Modified Capabilities
<!-- None: no main spec covers map() options or the demo's display yet (openspec/specs/ predates them). -->

## Impact

- **Engine:** `map()` options and the map builder (a current page per pane, `.in()`), the flow runner (a page per pane,
  contexts made and closed per flow), accounts (sign-in per pane, its mem back on switching).
- **Runner and demo:** the stage (`demo/split/`: screencasts, the stage page, labels, the acting pane), `--split
  windows`, `--compare`, the video of the stage; the overlay's ties to "the page" become per pane.
- **Run log and manifest:** a step's `pane`; a flow's panes; a compared run's two sides and its differences.
- **Waygraph UI:** lanes on a flow and a run; a compared run's differences.
- **Docs and skills:** a Split view guide page, flows and demo guides, the CLI reference, the convention skill (two
  people in one scenario are panes, not two flows or a sign-out in the middle).
- **Limits:** Chromium only at first (the stage needs CDP screencasts; tiled windows need CDP window bounds); Firefox and
  WebKit play split flows in run and test, without a stage.
