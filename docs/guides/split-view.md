# Split view

Some scenarios have two sides: a planner requests a repair and an admin approves it, one person sends a message and
another receives it, someone signs up while the mail catcher receives the link. A flow with **panes** plays them as one
story, in order, with both screens side by side.

```ts
export const approvalFlow = engine
  .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
  .in("planner").gotoPage(Registry.nav).method(Registry.do.requestRepair)
  .in("admin").gotoPage(Requests.nav).method(Requests.do.approve)
  .in("planner").gotoPage(Registry.nav, { expect: [Machine.status.is("Approved")] });
```

> The planner requests a repair. The admin approves it. Back with the planner, the machine reads Approved.

## Panes

`map({ panes })` names the flow's panes. Each is a page in its own browser context: its own cookies, its own signed-in
person, its own device.

| A pane's option | Means |
|---|---|
| `as: Planner` | signed in as that account before its first step (the kept session, as `map({ as })` does) |
| `device: "mobile"` | it plays on that device: its size, its phone layout, touch |
| `with: "app"` | another page in the `app` pane's context: the same person, a second tab (the app and the mail catcher) |
| `baseUrl: "https://staging.example.com"` | its relative addresses are on another site |

`.in(pane)` says which pane the next steps act in, until the next `.in()`; a flow with panes names one before its first
step. Each pane keeps its own page: TypeScript checks every step against where **its** pane is, so back in the planner's
pane the next step starts where the planner left off. Blocks don't change: a Block acts on a page, and the flow says
which.

Panes share the flow's mem, so what one side makes the other reads (a request id, a message). Switching to a pane puts
its account's own data back (`account({ mem })`): each side reads its own person.

A failure names its pane: `approve (in admin, as admin): check "…" didn't pass`. The run log says each step's pane.

## One screen, then two, then one

A pane opens when the flow first acts in it, so a flow starts on one screen and splits when a second pane joins.
`.close(pane)` closes another pane (its browser context, and every pane sharing it) and the flow goes on in the one it's
in: back to one screen. `.in()` it again later and it opens afresh, signed in again.

```ts
engine
  .map({ memStub: true, panes: { standard: { as: StandardUser }, problem: { as: ProblemUser } } })
  .in("standard").gotoPage(Inventory.nav).method(Inventory.do.addToCart)      // one screen
  .in("problem").gotoPage(Inventory.nav).gotoPage(Cart.nav)                  // two, side by side
  .in("standard").gotoPage(Cart.nav).close("problem")                        // one again
  .gotoPage(Inventory.nav);
```

Any pane closes, the first one too, in a run, a test or a demo alike.

## Seeing it

| | Panes |
|---|---|
| `waygraph run`, `waygraph test` | play with no stage, headless unless asked |
| `waygraph demo`, `--video` | side by side on a **stage**: one window, one video. Each pane is labelled (its name, who is signed in, its device), the one acting is outlined, and each has the demo's UI (rings, captions, its step panel, the voice-over) on its own page. Only open panes show: one fills the stage, a second splits it, more share it as a grid. What you do on the stage goes to the pane under the pointer (a click on Next, a scroll, a key), so a demo with panes is driven as one on a single page |
| `--split windows` | each pane in a real browser window, side by side across the screen, for watching live and clicking into |
| `--video-panes` | with `--video`, also one video per pane, at its full frame rate |

The stage shows each pane live from its screencast, as Playwright's own UI shows a test: smooth enough to follow, a
little stepped next to a pane's own video (`--video-panes`).

## Compare two runs

`--compare` plays one flow twice, side by side, step by step together, and says where the two sides differ:

```sh
npx waygraph demo checkoutFlow --compare device=desktop,mobile
npx waygraph run adminFlow --compare as=planner,admin
npx waygraph run checkoutFlow --compare config=staging,default
```

| `--compare` | Each side |
|---|---|
| `as=a,b` | signs in as that account (the flow's own sign-in step goes) |
| `device=a,b` | plays on that device |
| `config=a,b` | plays on that config's `baseUrl` (`config/waygraph.<name>.config.ts`; `default` is `waygraph.config.ts`) |

A flow with panes compares the same way: each of its panes plays once per side (`planner (desktop)`, `planner
(mobile)`), each side's with that side's device or config; compared by account, the pane the flow starts in (its main
person) is the one signed in as each side's account. `.close(pane)` closes that pane on each side.

After each step it compares where each side landed, whether it passed, and each field its page reads (signing in isn't
compared). The differences go in the run log (`compare:diff`) and print at the end:

```
waygraph compare (as planner | admin): 1 step differs
  step 2 open-admin: outcome: locator.click: Timeout 2000ms exceeded. | passed
```

A side that fails stops; the other plays on to the end. Only failures fail the run; differences alone don't.

## In Waygraph Studio

A flow with panes, and its runs, show as lanes: one per pane, each step at its place in the flow, so the arrows read in
order across them. A compared run marks each step where the two sides differed. See [Waygraph Studio](./studio).
