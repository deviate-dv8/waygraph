# Waygraph roadmap

What's next. What shipped is in `git log` (one commit per change) and [docs/deprecated.md](docs/deprecated.md) (every
removed form and its replacement). Not 1.0 yet: a minor version can change syntax.

## 1.0.0

**Waygraph Pilot demoable on one real consumer project**: an agent driving a live session against a real app, using that
app's own Block library. Everything it needs has shipped and is proven on `examples/saucedemo`; what's left is running it
against a real consumer.

## Next

- **Flow meta, calls as data** - a flow has `title`/`description`/`labels` (done). Calls as data (run log `step:call`, demo card and modal, Studio run step, `check --network`) and the hybrid saucedemo flow are in. Studio's page panel has a Network section, `network` config names and judges calls, and Studio's API page is the offline console (send a recorded call again, copy it as cURL or an API Block).
- **Pilot, next** - the coverage view in Waygraph Studio's live session, with a click on an orange outline to register it.
- **Session refactor** - `mem.trail` (what each step saw, typed by the page's read keys) is in. Replacing `(page, mem)` with one Session object in every hook, and Block kinds as classes, waits for 1.0.0: it breaks every Block for a model `mem` already gives.
- **Page object, the rest** - a page is one object (`url`/`from`, `read`, `do`, `expects`), a layout has `interrupts`, a
  Method is written flat; four codemods (`page-object`, `nav`, `instructions`, `mem-stubs`) move a project. A page is its own Checkpoint with inline Methods, `route: "folder"`, `frame`
  and `ctx.page.api` are in too. Still to do: Expect Blocks as plain `expects` entries (one check concept), each check's
  last result in Studio's page panel, and a Studio page view built around the object. Then the planned `qa-network-and-api-view`, `api-requests-and-races` and `block-capabilities` changes.
- **Waygraph Studio** - `waygraph studio` (the app in `ui/`); tests run in its Playwright page. Next: live sessions (`auto`, `browser`, `pilot`) through the
  session protocol, editing `config/waygraph.config.ts` from it (it shows it today), more settings (kept in the browser today). Each expectation's result in the run log (today only the one that
  failed is logged) would let it show every expectation a step met. Live updates: a project host that watches the files and the run logs and pushes changes to the
  open pages (the `ui-project-model-and-run-traces` change), instead of reading them on each request.
- **Event Blocks** - Blocks that move the world instead of the page (a webhook, a clock, a second user), through
  `ctx.world.*`, next to `ctx.ui.*` (stubs) and `ctx.page.*` (Read Blocks).

## Open

- **`Trait.visible` waits as long as Playwright lets it** - it waits for the element with Playwright's own default, which
  is unbounded inside a test, so a page that never shows it fails only at the test's timeout. It should wait at most the
  Trait's time (5 s, or its `timeoutMs`), like the other Traits; the access tests cap their page's waits meanwhile.
- **Soft expectations** - a step already reports every expectation it didn't meet; a flow-level `soft` mode would go on
  to the next steps and fail the run at the end, so one QA case reports every expected result it checks.

- **A session the app ended early** - an account's `ttl` says how long a session lasts; an account could also say how
  to tell it's still signed in (a check after restoring it), and sign in again when it isn't, instead of failing the
  flow's first step.
- **A page's read in its Page Block** - `definePageBlock({ read: (ctx) => ... })` instead of a `_read.block.ts` beside it
  (pia: 32 files fewer, one per page): the Page Block becomes the whole page object (nav, do, expects, read). The read
  keys stay in `_reads.ts` (methods' verify uses them, and the Page Block imports the methods: keys in it would be an
  import cycle). Reads on every page (a header) stay Read Blocks. Needs: loading Page Blocks for their reads, a codemod
  folding each `_read.block.ts` into its Page Block, the convention skill, the reads guide and `waygraph check`.
- **Selectors per device** - a `_sel.ts` entry with one selector per device (`menu: { desktop: "nav .menu", mobile:
  "button[aria-label=Menu]" }`), picked by the device the flow plays on; kept as plain data so other drivers can use
  it. The manifest and Waygraph Studio list the variants; `waygraph check` warns about a device an entry has none for. A
  layout's links would use it too (a sidebar on desktop, a burger menu on a phone).
- **A virtual address bar** - the stage's panes (and a single page, in a recording) show the page's url in a slim header, since a demo's window has no browser chrome: where each pane is, at a glance. Next for the stage.
- **Split view, next** - two people acting at the same moment (a race: both click at once) instead of in the flow's
  order; panes for `waygraph auto` and Pilot (an agent acting as two people); composing each pane's full-rate video into
  one (today the stage's video follows the screencast's frame rate).
- **Layouts, next** - the access tests check a layout's links (each has a selector) and the pages an account can't
  open; a Method's button has no selector to look for, so its `for` is checked by `waygraph check` only. A Method could
  name its button (`shows: Sel.archive`) for the access test to look for. Layouts that change by device (a sidebar that
  becomes a burger menu) wait on selectors per device. Disabled-but-visible links (`disabledFor`) aren't covered.
- **Split `requires`** - say which keys the caller must supply (credentials, config) and which another Block produces,
  so a failed preflight can suggest the Block that would produce the missing key.
- **Demo text matchable by the page's selectors** - the overlay is an open shadow root, and Playwright's text engines
  pierce it: `getByText("POST")` can match the network panel or the step banner. A closed shadow root would fix it; the
  session `dom` command and the overlay-beacon tests would then read through `page.evaluate`. Until then, flows played
  in a demo should prefer roles, labels and ids over bare text.
- **Network tab mocking** - the network tab observes traffic; it can't serve a made-up response. Needs a design over
  `page.route()` / `route.fulfill()` where a mocked response still shows in the panel.
- **Pilot ring tones** - a separate tone for a pure DOM read (`dom`) next to the one for an action.

## Later

- **Waygraph to MCP** - an MCP server over a live session, so a model can use the app as a virtual user through checked
  Blocks only (the step before **VirtualUser** below).
- **Scraping with Waygraph GUI** - reading data out of pages with Read Blocks, from the GUI.
- **More drivers** - not before Playwright is mastered; the engine's Playwright seams (`EngineConfig.browsers`, the
  Locator patch) would become one driver interface.

- **Federated pool** - several site-specific map packages (`waygraph map pack`) loaded together, namespaced per package,
  so route finding works across sites. Scoped to sites you own or cooperate with.
- **VirtualUser** - an agent in a Pilot session told to behave like a real user of the app (sign in, browse, decide
  what to do) rather than follow a script: load and organic-traffic testing on your own app.
- **`npm create waygraph`** - the modern entry point next to `npx waygraph init`. (Packing an existing project's pages
  for reuse is `waygraph map pack`.)
- **A freeform scaffold** - a second `init` template in the freeform layout, for projects that don't use `src/map/`.
- **Narrated videos** - a recorded demo speaks its captions and slides (`demo.voice`, done). Next: hearing the voice
  live in a headed demo, a `ctx.ui.say(...)` for a line that's spoken but not shown, and a `waygraph clip` command
  that renders a flow's video with its voice-over in one go.
- **Separate packages** - whether the engine, demo, sessions and traverse become separate npm packages or stay one
  package with clear internal layers (`src/ARCHITECTURE.md`) is undecided.
