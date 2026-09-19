# Waygraph roadmap

Not yet v1.0.0 - breaking changes between minor versions are expected and acceptable
until then. This file is the durable, git-tracked record of where the project is headed;
`openspec/changes/<name>/` holds the planning artifacts (proposal/spec/design/tasks) for
an in-progress change, and `openspec/changes/archive/` holds the same for a shipped one.
`openspec/specs/` is the current, merged spec for each capability - read that for "what is
true today," not a `changes/` entry, which is a point-in-time proposal.

## Modules

The package is one published unit today, organized internally along these lines:

| Module | Where | What it owns |
|---|---|---|
| `waygraph-core` | `src/types.ts`, `src/mem-page.ts`, `src/trait.ts` | Checkpoint, Block, MemPage, Trait, `connect()`. Stable. |
| `waygraph-engine` | `src/engine.ts` | `Engine`, `defineFlow`, `runGraph`, `chainFlow`, `composeBlock`, browser launching (pluggable via `EngineConfig.browsers`). |
| `waygraph-cli` | `src/cli.ts` (non-overlay commands) | `list` / `nav` / `validate` / `run` / `check` / `graph` / `init` / `agent-dive` / `traverse`. |
| `waygraph-demo` | `src/cli.ts` (`demo` / `chain --step` overlay), `src/step-overlay.ts`, `src/highlights.ts`, `src/overlay-beacon.ts` | The step-through browser overlay: panel, ring, cursor, todo dock, `narrate()`, episode headings, stub/fixture/slide narration. |
| `waygraph-auto` | `src/graph.ts`, `src/auto-explore.ts`, `src/auto-explore-run.ts`, `locate()` in `src/engine.ts` | State-machine discovery (`discoverGraph` / `toMermaid`) + page recognition (`locate`) + the interactive `waygraph auto` explore loop. |
| `waygraph-traverse` | `src/traverse-run.ts`, `src/traverse-coverage.ts`, `src/traverse-lease.ts` | `waygraph traverse` graph crawl: serial/parallel workers, edge leases, coverage report + CI gate. |

Whether these become physically separate npm packages, or stay one package with clearer
internal boundaries, is an open decision - not committed to either way yet.

## Milestones

Themes below are proposal-time labels, not npm version tags - actual npm releases run
their own `0.12.x`/`0.13.x` sequence (see `git log` / `package.json` for the real current
version). Every theme in this table is already shipped in that real lineage unless marked
otherwise.

| Theme | Status |
|---|---|
| `chainFlow`, `withSessionReset`/`withTitle`, episode-aware step overlay | Shipped |
| `precondition` + tip polish | Shipped |
| `waygraph demo` + run flags; NavBlock click demo cursor | Shipped |
| PageBlock + `methods/` + `Sel` convention; Action -> Method rename | Shipped |
| `NavBlock` + `ActionPage` deprecation + `waygraph check` + pluggable browser provider | Shipped - see "NavBlock + ActionPage" below |
| `locate()` page recognition (`waygraph auto` graph discovery) | Shipped - split `requires` still open, see below |
| Traverse (Phase B-E: serial/parallel graph crawl, coverage gate) | Shipped - `docs/proposals/traverse-ffcompose-rfc.md` |
| `Flow.run` / `runGraph` tab options (drive an existing page, `closeOnFinish`) | Shipped - see "Flow.run tab options" below |
| Split `requires` (externally-supplied vs producedBy-another-Block) | Roadmap only |
| Federated pool of waygraphs | Roadmap only (autonomous-mode phase 3) |
| `waygraph auto --cli` session control (detach/attach/send/status) | Shipped - `openspec/changes/waygraph-auto-cli-session-control/` |
| DOM-inspection tool (`auto dom`: aria / full fidelity, `--selector` scoping) | Shipped - `openspec/changes/waygraph-auto-dom-inspect/` |
| Visible-browser sessions + Checkpoint/Block trace (`--non-headless`, `auto trace`) | Shipped - `openspec/changes/waygraph-auto-headful-trace/` |
| Agent-skill hardening (one-action-per-Block, `defineAssertBlock`, Sel enforcement, orphan gates) | Shipped - `openspec/changes/waygraph-agent-skill-hardening/` |
| Mail verification (browser-driven, `*-external/<tool>/` convention) | Shipped (Mailpit) - `openspec/changes/waygraph-mail-adapters/` |
| Waygraph Pilot (plain-language ask -> narrate/agentic, built on AutoSession) | Proposed - `openspec/changes/waygraph-pilot/` |
| Narrated help-center video generation (core `waygraph render`) | Deferred to v1.0.x (`waygraph-demo` module) - not current focus, see below |
| Stability declaration (1.0.0) | Gated on Waygraph Pilot demoable - see "1.0.0" below |

### NavBlock + ActionPage + waygraph check + pluggable browser provider

Separates "navigate to a URL" from "act on the current page" as a structural,
engine-enforced distinction - the foundation the later autonomous-mode phases need to
reason over the Block library reliably (a page can't be reliably fingerprinted by a Block
that might also be doing something else). Enforcement is soft: a passive TypeScript
`@deprecated` warning on regular Blocks' `page.goto`/`reload`/`goBack`/`goForward`
(primary), plus `waygraph check` as a whole-project sweep (secondary, for contexts with no
editor watching).

Also folded in: `EngineConfig.browsers` - "waygraph is just an opinionated Playwright," so
the engine's three hardcoded `chromium`/`firefox`/`webkit` launch sites now accept an
override, letting a consumer plug in `playwright-extra` or a stealth-patched launcher
(same `.launch()` shape, drops in unmodified). Requested alongside NavBlock in the same
go-ahead (a real downstream consumer project needed it), so built together rather than as a
separate change. Puppeteer support is explicitly out of scope - different `Page`/
`BrowserContext` shape entirely.

**Shipped** (9 new tests, full suite 105/105 at the time) - full spec now at
`openspec/specs/nav-block-and-check/spec.md`; planning history in
`openspec/changes/archive/2026-09-19-nav-block-and-check/` (see that change's `tasks.md`
for the full verification record, including a real finding: a real consumer project's own
existing nav blocks, still plain `defineBlock`, get flagged by `check` too, since it looks
for the runtime `defineNavBlock` marker, not file-naming convention).

### Flow.run tab options

Lets a run drive an already-open page instead of always opening its own tab, and choose
whether that page survives the run (`closeOnFinish: false` hands it back as
`{ result, page }`). Additive only - every pre-existing `flow.run(context, mem)` call
keeps behaving exactly as before. Popup capture (`target=_blank` clicks) stays a
documented README recipe rather than an engine API until a second real use case needs it.

**Shipped** - full spec now at `openspec/specs/flow-run-tab-options/spec.md`; planning
history in `openspec/changes/archive/2026-09-19-flow-run-tab-options/`.

### locate() + split requires (autonomous-mode phase 2)

**Shipped:** `discoverGraph` / `toMermaid` / `waygraph auto` CLI and
`locate(page, library)` reverse-match NavBlocks by their own `verify` Traits. See
`src/graph.ts`, `tests/graph/`, `tests/nav/locate.spec.ts`.

**Still open:** split a MemKey's `requires` into externally-supplied
(credentials/config) vs producedBy-another-Block so a failed `preflight()` can
suggest a recovery path. Not yet spec'd beyond the paragraph in
`openspec/changes/archive/2026-09-19-nav-block-and-check/design.md`'s Roadmap section.

### Federated pool of waygraphs (autonomous-mode phase 3)

Multiple site-specific waygraph packages loaded together, each publishing its own Block
library, with package-scoped namespacing so `locate()`/planning can run across sites
without name collisions. Scoped to owned/cooperating sites, not arbitrary third parties -
two real risks make that scoping deliberate, not just cautious: DOM/selector rot at
community scale (no one owns a third party's markup, unlike your own product) and
ToS/access risk on platforms that restrict automation. Neither is an engine problem to
solve; both are reasons this stays scoped.

**Not yet spec'd** beyond the paragraph in
`openspec/changes/archive/2026-09-19-nav-block-and-check/design.md`'s Roadmap section.

## Agent-authoring tooling and Waygraph Pilot (planned)

**Current focus (as of 2026-09-19): the `waygraph-auto` module** - phases 1-3 below
(`--cli` session control, DOM-inspection tool, simultaneous `--cli` + headful) all live
there, and Phase 6 (Pilot) depends directly on `waygraph-auto`'s `locate()` /
`discoverGraph` / `findBlockPath`. `waygraph-demo`-module work (the narrated help-center
video generation section further down) is explicitly deferred to v1.0.x, not part of the
near-term push.

Grounded in two real, opposite data points from actual consumer usage, not speculation:

- **Positive:** `waygraph demo`'s step-overlay/narration was used for real in a production
  QA workflow at a real consumer and measurably reduced the QA bottleneck there - this is
  the evidence the later Pilot phase below is betting on, not a hypothetical.
- **Negative:** `waygraph check` run against two real pre-skill consumer projects found the
  exact defect classes this roadmap exists to close: one project's `complete-draft`-style
  Method does `page.reload()` outside a NavBlock *and* silently drives an entire multi-step
  wizard (clear storage, reload, then a bounded retry loop clicking through rail steps)
  inside one opaque Method - the "teleporting" / multi-action-per-Block anti-pattern this
  cycle's saucedemo atomicity fixes were meant to catch. The other project has **98 orphan
  Blocks** (built, never wired into a `defineFlow`, invisible to `auto`/`traverse`). Both
  predate the waygraph agent skill (`templates/agents/*.agent.md`) and are the baseline the
  phases below are measured against.
- **Convergent finding (from the Phase 0 saucedemo cleanup, 2026-09-19):** the same
  orphan-heavy consumer project also has **40+ near-identical `assert-*.method.block.ts`
  files** - each one a self-loop
  `defineMethodBlock<Checkpoint<string>, Checkpoint<string>>` whose `act` is just
  `await page.getByRole("heading", {...}).waitFor()`, `resolve` hand-restates the same
  checkpoint tag as a string every time (a real footgun - copy/rename one and forget to
  update the string, it silently self-loops to the wrong tag with nothing catching it),
  and all the real content lives in a long `verify: [Trait...]` array. None of those 40+
  files use a `*Sel` object anywhere - every check is a raw inline selector string, the
  same gap this cycle's saucedemo cleanup fixed, at larger scale and higher risk (these are
  long compound Playwright chain-locators, not simple ids). This is stronger, more
  convergent evidence than what originally justified `Effect`/`Method` becoming real sugar
  (those were also promoted from watching agents write the same shape by hand repeatedly).

Six phases, each independently shippable, in dependency order:

1. **`waygraph auto --cli` session control - Shipped.** `--cli` used to be a single
   in-process `readline` loop over the CLI's own stdin/stdout - an agent driving it had no
   way to inspect state between prompts or send one command without blind-piping a whole
   pre-guessed input sequence. `--detach` (long-lived session behind a local unix socket
   under `.waygraph-auto/`), `waygraph auto send <id> "<pick>"` (one-shot RPC: send one
   command, get the resulting menu/state back as JSON, no TTY), `auto attach <id>` (reopen
   the interactive loop), `auto status <id>` (pure getter) - all implemented and proven with
   a real non-interactive login+add-to-cart run against live saucedemo.com. Full spec/design/
   tasks: `openspec/changes/waygraph-auto-cli-session-control/`.
2. **DOM-inspection tool - Shipped.** A `dom` op/`auto dom` sub-verb on the same session
   protocol with two fidelities - `aria` (default: Playwright's `ariaSnapshotJSON({mode:"ai"})`
   - the originally-planned `page.accessibility.snapshot()` turned out to be removed in this
   package's Playwright version, and the replacement is better-suited to this job anyway) and
   `full` (a hand-written bounded DOM walk, hard-capped on depth/node count/text length,
   explicitly marked `truncated: true` when a cap is hit). `--selector` scopes either fidelity
   to one element's subtree - a modifier on the mode, not a third mode ("container" was
   corrected from an originally-planned third enum value to this simpler shape before
   implementation). Token-budget aware by design since the reader is an LLM agent, not a
   human. Full spec/design/tasks: `openspec/changes/waygraph-auto-dom-inspect/`.
3. **Visible-browser sessions + Checkpoint/Block trace - Shipped.** `--non-headless` (the
   same flag `run`/`demo` already use, reused rather than a new `--headful` name) launches a
   `--detach`'d session with a real visible browser while it stays driven entirely through
   `send`/`status`/`attach`/`dom` - not a new picker, and the existing page-embedded headful
   panel is untouched either way. `auto trace <sessionId>` returns the session's own
   Checkpoint/Block-level history (Block name, Checkpoint before/after, and - extended mid-
   implementation on request - the resolved `stubBefore`/`stubAfter`/`stubOnError`
   demo-narration fixtures already computed by `waygraph demo`'s own lifecycle logging via
   `runStubPhase`, confirmed to have zero browser side effects and safe to reuse). Still
   deliberately not a 1:1 action recorder the way Playwright codegen is - no clicks/fills,
   only the Block-level sequence and its own authored narration metadata. Turning a trace
   into actually-authored Blocks remains separate, later work (Phase 4+). Full spec/design/
   tasks: `openspec/changes/waygraph-auto-headful-trace/`.
4. **Feed it back into the agent skill - Shipped.** `defineAssertBlock` (self-loop-only
   sugar over `defineMethodBlock<Checkpoint<string>, Checkpoint<string>>`: no hand-written
   `act`/`resolve`, just a name, checkpoint, optional `waitForHeading`, and `verify` -
   closing the copy/rename footgun above) plus a new `waygraph check` warning that fires on
   an inline selector literal in a `verify` array and stays silent on a `*Sel` reference -
   directly answering the 40+-file pattern found above. "One distinct action per Block" is
   now an explicit hard rule in `waygraph-author.agent.md`, alongside a self-gate requiring
   zero orphan/inline-selector/nav-escape warnings before reporting done.
   `waygraph-planner.agent.md` gained a "Blind mode" section using Phase 1-3's `auto` session
   tools when there is no FE source to read. Real find while proving this against
   `examples/saucedemo`: the new check immediately caught 3 genuine inline selectors this
   session's earlier atomicity cleanup had missed (the root login route never got a `*Sel`
   object) - fixed, and the whole example now reports zero warnings of any kind. Honest
   scope note: this proof is inside this repo only - it does not re-verify either external
   consumer project's own Block library, which stays separate, later work. Full spec/design/
   tasks: `openspec/changes/waygraph-agent-skill-hardening/`.
5. **Mail adapters - Shipped, browser-driven convention.** First attempt built a
   `MailAdapter` HTTP/REST interface with four backends (MailHog/MailDev/Mailpit/
   `maildrop.cc`) - real, tested, working, but superseded before shipping once real evidence
   turned up: more than one real consumer project independently converged on a *different*
   shape for this - a `NavBlock` to the mail catcher's own web UI (a real, separate,
   cross-origin page - MailHog/MailDev/Mailpit all ship one) plus small `MethodBlock`s
   reading the DOM directly (`page.locator`/`page.frameLocator`, `getAttribute("href")`) -
   no REST client, no new engine surface at all, just more Blocks in their own
   `*-external/<tool>/` folder. Convergent evidence from two independent real projects
   settling on the identical pattern (same folder convention, same
   `page.frameLocator("#preview-html")` DOM read, same `mem`-matched-recipient-not-
   inbox-position reasoning) outweighed the from-scratch REST design - replaced it entirely
   rather than shipping two competing conventions. Also more narratable: a real click/DOM
   read shows up in `waygraph demo`/`auto`, an invisible `fetch()` never would. Real finds:
   the message row is a genuine `<a href="/view/:id">` (client-side route change - Playwright
   `waitForURL` sees it exactly like a full navigation), and the message body lives in a
   `srcdoc` `iframe#preview-html`, confirmed against a real running Mailpit container's
   actual DOM before writing any selector. Same "no `requires` for a chain-internal,
   producedBy-an-earlier-Block key" lesson as before still applies to the final NavBlock.
   Live reference: `templates/scaffold/src/blocks/demo-external/mailpit/` +
   `mail-verify.flow.ts`, proven against a real, throwaway Mailpit container (real SMTP
   send, real click, real DOM read, real navigation back into the app) - not a fixture.
   **QA-richness follow-up, same change:** two more assert Blocks answer "does the email
   even exist" (`assert-email-received`, self-loop, doesn't consume the message) and "does
   it say the right thing" (`assert-email-content`, reads the message body via new
   `Trait.frameVisible`/`Trait.frameText`/`Trait.frameContains` factories - the top-level
   page's own `Trait.text`/`Trait.visible` can't see inside an iframe at all). Both proven
   to fail loud, naming themselves, on a real negative case (no email arrives; email
   arrives with the wrong copy) - not just the happy path. A third example
   (`assert-item-added` in `shop.flow.ts`) shows the same "assert Block checks a method's
   real result" pattern outside the mail context, using mem to know which specific row's
   DOM effect to check. Also documented: why a `NavBlock`'s wildcard `from:"*"` edge doesn't
   clutter `waygraph auto`'s live menu on every screen - `buildExploreMenu` already excludes
   URL-based Navs once on a known screen (a pre-existing engine behavior, not built by this
   phase, but confirmed and written down here since it directly answers "how does this fit
   into auto").
   **Reuse follow-up, same change (the actual answer to "100+ different emails"):**
   the temptation is one Block set per email scenario - wrong axis. `open-message`,
   `extract-email-link` (renamed from `extract-verification-link` - a mem-driven Block
   should be named for its mechanism, not one scenario), and the two assert Blocks are
   already scenario-agnostic; only mem varies per run (`ExpectedRecipient`,
   `ExpectedLinkPattern`, `ExpectedEmailContent`), never the Blocks. Proven, not just
   claimed: the same four Blocks run a signup-verification check and an entirely different
   password-reset check (different recipient, different content, and a decoy link
   `ExpectedLinkPattern` correctly discriminates against) with zero new Blocks. Real
   engine gap caught and fixed while wiring this: `defineAssertBlock` never had a
   `requires` option at all (every other Block helper does) - needed once these asserts'
   own mem-aware Traits started reading externally-supplied mem, so preflight can catch a
   missing input before the flow ever runs, not deep inside a Trait check.
   Full spec/design/tasks: `openspec/changes/waygraph-mail-adapters/`.
6. **Waygraph Pilot - shipped, corrected once already.** The big pitch: an **agent** (not
   this package's own code) discovers a real, persistent, running Playwright session and
   drives it through a multi-step, natural-language goal ("log in and buy the backpack",
   "make a signature draft request") it plans itself - more accurately than a generic
   vision-based "browser use" agent because it is constrained to a verified, opinionated,
   site-specific Block graph instead of guessing from pixels each time.
   **Two real corrections along the way, both from direct user feedback, not internal review:**
   (1) An early design draft wrongly assumed Pilot had to run as a script sandboxed inside an
   untrusted end-user page with no Playwright/CDP access - invented hard problems
   (cross-origin iframe access, synthetic-event trust, a DOM compatibility shim) that didn't
   apply once `AutoSession`'s actual existing surface (Phase 1) was re-checked: Pilot is a
   **launched Playwright session**, like every other command in this roadmap.
   (2) The first shipped implementation (`resolveAsk`/`pilotNarrate`/`pilotAct`, a
   deterministic ask-to-one-edge text matcher plus a `pilot ask "<text>"` CLI command) was
   built, tested, and demoed end to end against real saucedemo.com - then explicitly rejected:
   a real request is multi-step, and matching one ask to one edge is "a glorified demo --logs
   tool," not an agent capable of planning a route through the graph. That code was removed
   (preserved for reference at git tag `waygraph-pilot-v1-logs-prettified`, not on any active
   branch) and replaced with the actual shape: `waygraph pilot start` - one call combining
   `spawnDetachedSession` (same mechanism as `auto --cli --detach`, a real persistent session
   an agent keeps driving across many calls) and `discoverGraph` (same mechanism as
   `waygraph graph`, the *whole* project graph, not just what's reachable right now, so an
   agent can plan several steps ahead) into one bootstrap payload
   `{sessionId, socketPath, headless, graph, snapshot}`. Driving the session afterward -
   `auto send/status/dom/trace <sessionId>` - needed **zero new execution primitives**: all
   four already existed from Phases 1-3, confirmed by hand-driving a real multi-step login +
   add-to-cart + checkout + finish-order sequence against saucedemo.com through them directly
   before writing any new code. Because everything runs inside the same trusted Playwright
   session as every other phase, a Block using a bespoke Trait works identically to one using
   only built-in Trait factories - no manifest, no client-safe-data restriction needed at all.
   Phase 4's atomicity/orphan-Block gates remain a hard prerequisite: a compound Block or a
   stray `page.goto` is invisible in a passing test but a visibly broken promise when an agent
   is driving the session live.
   **Shipped**: `pilotStart`, `waygraph pilot start` CLI entry point, in-repo proof
   (`tests/pilot/pilot.spec.ts`, `tests/cli/pilot.spec.ts`, both against live saucedemo.com).
   **Honest proof-scope note, matching Phases 4-5's own established precedent:** this proof
   runs against an in-repo example (`examples/saucedemo`), not a real consumer app - it
   demonstrates the mechanism works, not the original `1.0.0` criterion ("demoable on one
   real consumer"), which remains a separate, later, unmet step. Full spec/design/tasks:
   `openspec/changes/waygraph-pilot/`.

### Phase 6b/6c - Blind Pilot, Waygraph Map, Waygraph Router (vision only - not proposed, not scoped)

Real forward-looking ideas captured here so they aren't lost, deliberately not pulled into
the current Phase 6 (non-blind Pilot) change above:

- **Non-blind Pilot** (Phase 6, above) assumes a Block library already exists, already
  authored with `description`/`verify`/checkpoints by a developer - Pilot just drives
  Playwright through a graph someone already built.
- **Blind Pilot (Phase 6b)** - the opposite case: no pre-existing Block library at all. An
  agent navigates a live site cold, reusing the same discovery primitives Phase 2-3 already
  built for blind planning (`auto --cli --detach`/`dom`/`send`/`trace`), and *builds* the
  graph as it goes instead of reading one that's already authored.
- **Waygraph Map (Phase 6c)** - the blind pilot's own output: a consolidated, portable,
  standalone package (working name `waygraph/map` or a companion package) capturing a
  project's discovered graph as a distributable artifact, separate from any Block source.
- **Waygraph Router (Phase 6c)** - a second, opinionated authoring mode alongside today's:
  today's convention (`*-web/`/`*-external/` namespacing, Nav/Page/Method/Effect/Assert
  kinds, `*Sel` objects) is **manual mode** - a developer has real freedom over file layout,
  just follows soft conventions. Router mode would be a fully opinionated,
  Next.js-App-Router-style folder structure (`(base_app)/dashboard/page.ts`,
  `(external)/mailpit/...`) making a project's structure mechanically parseable - the natural
  target for blind-discovery-to-map generation to regenerate against, and likely its own
  scaffold variant, not a change to the current freeform one.

No design work has started on any of these three - named here as real, coherent future
direction, not as commitments with a shape yet.

## Narrated help-center video generation (planned - deferred to v1.0.x)

**Not current focus.** This is `waygraph-demo`-module work, explicitly deferred to v1.0.x
point releases after 1.0.0 ships; the active push is the `waygraph-auto` module above.
Kept here so the idea and its evidence aren't lost, not as near-term work.

Also already validated in production, not hypothetical: `services/help-center-clip-engine`
uses **unmodified** waygraph (`file:../../waygraph`) - its `*.block.ts` "beats" drive a real
browser capture (`_live_drive/drive.webm`, `beats.json`) - piped into a separate hand-built
`video-pipeline/` (caption-timing script -> `narr.js`, a Playwright frame-seek renderer,
ffmpeg mux) that has shipped real Help Center videos for tickets #248-#251. Current state:
**caption-only** - TTS voice-over (Kokoro) is wired for but stubbed (`gen_vo.py` is a stub),
not live narration yet.

Today this is bespoke per-clip glue: a hand-written `script.json`, a hand-cloned HTML
template per clip, ad hoc capture/mux folders duplicated per project. The roadmap
opportunity is folding the proven parts into core waygraph instead of copy-pasting the
pipeline per consumer:

- Reuse the narration text authors already write in `stubBefore`/`stubAfter`/slide captions
  (for `waygraph demo`) as the source for caption timing, instead of a hand-written
  `script.json` duplicating the same copy.
- Formalize beat-capture -> frame-render -> mux (`render_seek.js` + `build.sh` + ffmpeg) as
  a core `waygraph render` (or `waygraph clip`) command, replacing the per-project copy of
  `video-pipeline/`.
- Wire a real pluggable TTS narrator (Kokoro or otherwise), mirroring the
  `EngineConfig.browsers` pattern - opinionated default, bring-your-own override -
  unblocking the currently-stubbed voice-over.
- Proof: regenerate one of the four already-shipped clips (#248-#251) through the new core
  command and confirm output parity with the existing hand-built pipeline.

### 1.0.0 - Stability declaration

**Decided 2026-09-19: 1.0.0 = Waygraph Pilot demoable on one real consumer** (Phase 6's
own proof bar - narrate and agentic mode working end-to-end against a real consumer app,
using its existing waygraph Block library). Phase 6's own proposal
(`openspec/changes/waygraph-pilot/`) delivers both modes, built entirely on Phase 1's
already-proven `AutoSession` - what its proof cannot satisfy from inside this repo is "one
real consumer" specifically; its proof is scoped to an in-repo example, matching Phases 4-5's
own established precedent. Reaching this 1.0.0 criterion for real still needs a separate,
later step: actually running the shipped Phase 6 capability against one real consumer
project. This supersedes the earlier criteria below, which move to the regular post-1.0.0
roadmap instead of gating the release:

- `locate()`'s split-`requires` follow-up (externally-supplied vs producedBy-another-Block)
- Federated pool of waygraphs (autonomous-mode phase 3)

Phases 1-5 above (CLI session control, DOM-inspection tool, simultaneous `--cli` +
headful, agent-skill hardening, mail adapters) remain prerequisites to 1.0.0 in
practice, since Phase 6 depends on them - see "Agent-authoring tooling and Waygraph
Pilot" above for the dependency order.
