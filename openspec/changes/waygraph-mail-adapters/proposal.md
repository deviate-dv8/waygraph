## Why

`ROADMAP.md`'s "Agent-authoring tooling and Waygraph Copilot" section lists Phase 5 as
mail-driven-flow support (signup confirmation, password reset, magic links). The first
version of this proposal built a `MailAdapter` HTTP/REST interface with four backends
(MailHog/MailDev/Mailpit/`maildrop.cc`) - real, tested, working, and then superseded before
being committed once real evidence surfaced: more than one real consumer project
independently converged on a *different* shape for this exact problem, not a REST client at
all. Their `*-external/mailpit/` Block folders navigate the actual Playwright browser to the
mail catcher's own web UI (a real, separate, cross-origin page every catcher already ships)
and read the message with ordinary `page.locator`/`page.frameLocator` DOM calls - the same
`getAttribute("href")` + regex a real Block would use on any other page. No REST client, no
JSON parsing, no polling loop, no new engine surface at all - just more Blocks.

Two independent projects landing on the identical shape (same folder convention, same
`page.frameLocator("#preview-html")` read, same "match the recipient in mem, not inbox
position" reasoning) is strong, convergent, real-world evidence for what waygraph's own
convention should be - stronger than a from-scratch design built without that evidence. It
is also a better fit for waygraph's own stated philosophy ("just an opinionated Playwright"):
zero new module, zero new config mechanism, and - concretely useful - it is narratable in
`waygraph demo`/`auto` (a real click and DOM read a human or agent can watch), where an
invisible `fetch()` call never would be.

## What Changes

- **Removed:** `src/mail-adapter.ts` (the `MailAdapter` interface, four HTTP-backend
  factories, `resolveMailAdapter`, `waygraph.mail` package.json config) and its test suite
  (`tests/mail-adapter/`) - the whole HTTP-based first attempt, replaced rather than kept
  alongside the browser-driven convention, to avoid shipping two competing ways to do the
  same thing.
- **Documented convention (no new engine code):** a `*-external/<tool>/` Block folder,
  kept separate from the app's own Blocks, containing:
  - a `NavBlock` navigating to the mail catcher's web UI (`url` resolved from an env var,
    same pattern as any other configurable base URL in this project),
  - a `MethodBlock` opening the message addressed to a mem-supplied recipient (`requires`
    correctly used here - the recipient is genuinely externally supplied),
  - a `MethodBlock` reading the verification link out of the message's preview
    (`page.frameLocator`, `getAttribute("href")`), storing it in mem,
  - a separate `NavBlock` (back in the app's own Blocks) navigating to that link - the
    existing mem-function `url` form, `requires` deliberately omitted since that mem key is
    produced earlier in the same chain, not supplied externally.
- **Real example, real proof:** `templates/scaffold/src/blocks/demo-external/mailpit/` +
  `mail-verify.flow.ts`, proven end to end against a real, throwaway Mailpit container - a
  real SMTP send, a real click on a real inbox row, a real DOM read out of a real preview
  iframe, a real navigation back into the scaffold's own fixture page. Selectors
  (`a.message`, `#preview-html`) were confirmed against a real running Mailpit container's
  actual DOM before being written, not assumed from memory of the UI.
- **README** documents the convention with the full four-Block example; **ROADMAP.md**
  records the pivot honestly (what was built first, why it was replaced, not silently).

## Capabilities

### New Capabilities
- `waygraph-mail-adapters`: a documented, real, proven `*-external/<tool>/` Block
  convention for reading a verification email out of a mail catcher's own web UI and
  carrying its link back into the app under test - zero new engine surface, matching
  real-world convergent usage.

## Impact

- `src/mail-adapter.ts`, `src/index.ts`'s mail-adapter exports, `tests/mail-adapter/` -
  removed entirely (superseded first attempt).
- `templates/scaffold/src/blocks/demo-external/mailpit/` (new folder: a Nav, a Page hub, two
  Methods, a Sel file), `templates/scaffold/src/blocks/demo-web/nav-verification-link.block.ts`
  (new), `templates/scaffold/src/flows/mail-verify.flow.ts` (rewritten),
  `templates/scaffold/tests/mail-verify.spec.ts` (rewritten) - real Docker-container proof,
  not fixtures.
- `templates/scaffold/src/states/demo.states.ts` / `demo.mem-keys.ts` - new checkpoints
  (`MailpitInbox`, `MailpitMessageOpen`) and mem keys (`EmailLink`, `ExpectedRecipient`,
  `ExpectedLinkPattern`, `ExpectedEmailContent` - the last two are what make the mail-reading
  Blocks reusable across scenarios instead of one Block set per email); `demo-sel.ts`/
  `home.html` - a `verified-banner` proof point.
- `src/engine.ts` - `defineAssertBlock` gained a `requires` option (a real, missed gap - see
  design.md).
- `README.md` - the "Mail adapters" section rewritten around the browser-driven convention.
- `ROADMAP.md` - Phase 5's section rewritten to record the pivot honestly.
- Does not touch Phase 6 (Waygraph Copilot) or any external consumer project. Does not
  change the Block lifecycle, `runGraph`, or any existing helper's signature - this change
  ships zero new engine code, which is itself the point.
