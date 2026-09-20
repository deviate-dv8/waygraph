## Why

`ROADMAP.md`'s Phase 6b names Blind Pilot: the same agent-drives-a-real-session mechanism
`waygraph-pilot` (Phase 6, just corrected) already ships, but for a site with **zero
pre-existing Blocks**. Where non-blind Pilot assumes a developer already authored a Block
library and the agent only drives it, Blind Pilot is the cold-start case: an agent opens a
real waygraph browser on a site nobody has described to this package yet, explores it,
recognizes patterns, and builds the Block library as it goes - asking the human clarifying
questions it can't resolve from the DOM alone (the user's own example: "is this a local or
published [mail catcher]? does it support maildrop.cc?" - i.e. which existing convention,
like the `*-external/` mail pattern, actually applies here). Comparison target, the user's
own words: like a browser-use/Vercel-style browser agent, but sending waygraph commands
instead of raw CDP/DOM actions - "lesser but more accurate and deterministic," because
whatever gets authored becomes a real, verified Block afterward, not a one-off scripted
action that leaves nothing reusable behind.

**What's already true today, verified by reading the code, not assumed** (see
`openspec/changes/waygraph-pilot/design.md`'s own Roadmap section, which flagged this
exact gap when Phase 6 was corrected):

- `AutoSession.start()`/`loadBlockLibrary` (`src/auto-explore.ts:117`) already tolerate a
  project directory with **zero** `.block.ts` files - returns empty maps, does not throw.
- `detectHere`/`locate` (`src/auto-explore-run.ts:71`) already return `null` gracefully on
  an empty `navBlocks` list, not a crash.
- Together, these mean "open a waygraph browser on a brand-new site with no Blocks yet"
  already works today via plain `auto --cli --detach` (or the just-shipped
  `waygraph pilot start`) - zero new code needed for that first step.
- `auto dom <sessionId>` (Phase 2) already gives real live-DOM/ARIA inspection independent
  of any Block library - already usable for blind exploration today.

**What's genuinely missing, confirmed by direct reproduction, not assumed:**

1. **No raw interaction primitive.** `auto send <sessionId> "<pick>"` only accepts an index
   into the *current menu*, which is built entirely from existing Block edges. With zero (or
   partial) Blocks, there is nothing to click through - there is currently no way for an
   agent to actually click, type into, or navigate a page before a Block exists for that
   action. This is the literal missing mechanism for "start navigating... try to click
   around."
2. **No live Block-library reload.** `AutoSession`'s Block library is loaded once at
   `start()`. A Block an agent writes to disk mid-session would not appear in `auto send`'s
   own menu without restarting the whole session (a real browser relaunch, losing
   navigation/mem state) - which defeats the point of writing a Block *while* exploring.

**What this proposal deliberately does NOT build**, because building it now would be
speculative rather than driven by a real, checked requirement (the same discipline Phase 6
just re-learned the hard way): a Block-file-content generator living inside this package.
The agent that recognizes "this is a login pattern" and knows this project's own
Nav/Page/Method/`*Sel`/mem-keys conventions (already documented in `README.md`) can write
that file itself, the same way it writes any other source file - this package's job is only
to give it the two missing primitives above, not to out-think it about what a login Block
should look like.

## What Changes

- **New: raw interaction primitives on a running session** - `click`, `type`, `goto` - so an
  agent can act on a live page before any Block covers that action.
  - `AutoSession`: three new methods (`rawClick(selector)`, `rawType(selector, text)`,
    `rawGoto(url)`) using the session's own already-live page internally; each re-runs
    `detectHere` afterward and returns a fresh `SessionSnapshot`, exactly like `applyPick`
    already does after running a Block.
  - `auto-session-ipc.ts`: three new server ops (`click`, `type`, `goto`) on the existing
    detached-session socket protocol - additive to the existing `ServerRequest` union, no
    change to `status`/`send`/`dom`/`trace`'s existing behavior.
  - `src/cli.ts`: three new `auto` sub-verbs - `auto click/type/goto <sessionId> <args...>` -
    following the exact existing pattern `send`/`dom`/`trace` already establish.
- **New: live Block-library reload on a running session** - `AutoSession.reloadLibrary()`
  (re-runs `loadBlockLibrary`/`discoverGraph` against the same `projectDir`, replaces the
  session's in-memory library/graph, and leaves `page`/`mem`/`here`/browser context
  untouched), a new `reload` server op, and `auto reload <sessionId>` CLI sub-verb. This is
  what makes a Block an agent just wrote to disk immediately pickable via `auto send`,
  without restarting the session.
- **New: an in-repo, end-to-end Blind Pilot proof** - a synthetic zero-Block fixture project
  is explored cold (via `pilot start` + `auto dom` + the new `click`/`type`/`goto`), a real
  Nav+Page+Method Block is hand-authored to disk mid-session (proving the convention is
  writable by an agent, not that this package writes it), picked up via `auto reload`, and
  then driven for real via `auto send` - all without restarting the browser.
- **Not built:** any Block-content generation/templating logic in this package; Waygraph Map
  (a portable, consolidated graph artifact); Waygraph Router (an opinionated folder
  convention); any special "ask a clarifying question" API (that's the external agent's own
  conversation with its user, not a technical capability this package needs to support).

## Capabilities

### New Capabilities
- `waygraph-blind-pilot`: gives an agent driving a detached session two primitives it does
  not otherwise have - acting on a live page before any Block covers that action
  (`click`/`type`/`goto`), and picking up a Block newly written to disk mid-session
  (`reload`) - so it can build a project's Block library incrementally, with a human in the
  loop, instead of only ever driving an already-complete one (`waygraph-pilot`'s own scope).

## Impact

- `src/auto-session.ts`: three new methods (`rawClick`, `rawType`, `rawGoto`) plus
  `reloadLibrary()`. No existing method's behavior changes.
- `src/auto-session-ipc.ts`: `ServerRequest`/`ServerResponse` unions gain `click`/`type`/
  `goto`/`reload` variants; `serveSession`'s request dispatch gains four new cases, following
  the exact shape `dom`/`trace` already establish. No change to `status`/`send`'s own
  behavior.
- `src/cli.ts`: `auto click <sessionId> <selector>`, `auto type <sessionId> <selector>
  <text>`, `auto goto <sessionId> <url>`, `auto reload <sessionId>` - four new sub-verbs
  alongside the existing `send`/`status`/`attach`/`dom`/`trace`. `usage()` updated.
- One new in-repo fixture (a minimal synthetic local page, no network, matching
  `templates/scaffold`'s own offline `demo-web/home.html` precedent) with a project
  directory that starts with zero `.block.ts` files, used only for this proof.
- `README.md`/`ROADMAP.md`: document the four new primitives and the worked cold-start
  example; move Blind Pilot from "vision only" to "shipped" in `ROADMAP.md`'s Phase 6b/6c
  section, leaving Waygraph Map/Router explicitly still vision-only.
- Does not touch `waygraph-pilot`'s own `pilotStart`, `resolveAsk`'s removal, or any
  Playwright-side Block-execution helper (`runGraph`, `locate()`, Trait factories). Does not
  add any Block-authoring/templating code - the fixture Block used in this change's own proof
  is hand-written in the test/fixture, proving the primitives work, not that this package
  writes Blocks for anyone.
