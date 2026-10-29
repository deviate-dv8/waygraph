# Waygraph roadmap

What's next. What shipped is in `git log` (one commit per change) and [docs/deprecated.md](docs/deprecated.md) (every
removed form and its replacement). Not 1.0 yet: a minor version can change syntax.

## 1.0.0

**Waygraph Pilot demoable on one real consumer project**: an agent driving a live session against a real app, using that
app's own Block library. Everything it needs has shipped and is proven on `examples/saucedemo`; what's left is running it
against a real consumer.

## Next

- **Waygraph UI** - a separate app (not in this package) over what the CLI already emits: the graph from
  `waygraph manifest` (Blocks, flows, Checkpoints, Read Block fields), the use cases under `src/flows/<page>/`, run history
  from `.waygraph/runs/*.jsonl`, starting `run` / `demo` / `test`, live sessions through the session protocol, a form over
  `config/waygraph.config.ts`. First slice: read-only (graph, flow catalogue, run results).
- **Event Blocks** - Blocks that move the world instead of the page (a webhook, a clock, a second user), through
  `ctx.world.*`, next to `ctx.ui.*` (stubs) and `ctx.page.*` (Read Blocks).

## Open

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

- **Federated pool** - several site-specific map packages (`waygraph map pack`) loaded together, namespaced per package,
  so route finding works across sites. Scoped to sites you own or cooperate with.
- **VirtualUser** - an agent in a Pilot session told to behave like a real user of the app (sign in, browse, decide
  what to do) rather than follow a script: load and organic-traffic testing on your own app.
- **`npm create waygraph`** - the modern entry point next to `npx waygraph init`. (Packing an existing project's pages
  for reuse is `waygraph map pack`.)
- **A freeform scaffold** - a second `init` template in the freeform layout, for projects that don't use `src/map/`.
- **Narrated videos (1.0.x)** - captions timed from the narration flows already have (`ctx.ui.caption`, slides), a
  `waygraph clip` command (capture, render, mux), and a pluggable voice-over, like `EngineConfig.browsers`.
- **Separate packages** - whether the engine, demo, sessions and traverse become separate npm packages or stay one
  package with clear internal layers (`src/ARCHITECTURE.md`) is undecided.
