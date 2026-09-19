## Context

The first version of this change built `src/mail-adapter.ts`: a `MailAdapter` interface,
four HTTP-backend factories (MailHog/MailDev/Mailpit/`maildrop.cc`), shared polling, and
`resolveMailAdapter` reading a new `waygraph.mail` `package.json` config block. It was fully
implemented, typechecked, and proven with real Docker-container integration tests (a real
MailHog/MailDev/Mailpit container, a real SMTP send, a real fetch) plus a real live call
against `maildrop.cc`'s public GraphQL API (which also hit a real greylist rejection on a
live-send attempt - a genuine, documented finding, not a guess).

Before that work was committed, real evidence changed the picture: searching the actual
Block libraries of more than one real consumer project turned up a `*-external/mailpit/`
folder convention, independently built by each, that does not use a REST client at all - it
navigates the Playwright browser to the mail catcher's own web UI and reads the message via
`page.locator`/`page.frameLocator`, exactly like driving any other page. Two independent
projects landing on the identical shape (same folder convention, same
`page.frameLocator("#preview-html")` read, same recipient-matched-in-mem reasoning) is
stronger evidence for what this repo's own convention should be than a design built without
that evidence. This change replaces the HTTP-adapter attempt entirely with the browser-driven
convention, rather than keeping both.

Read before implementing (or re-implementing): `src/engine.ts`'s `defineNavBlock` (the
mem-function `url` form the final navigation step reuses unchanged) and
`templates/scaffold`'s existing `demo-web/` Blocks (the app-side half of the example).

## Roadmap (why this slice, not the whole vision)

1. **This change** - the browser-driven `*-external/<tool>/` convention, documented and
   proven once (Mailpit) inside `templates/scaffold`.
2. **Not in this change** - a second real example against MailHog or MailDev's own web UI.
   The pattern is identical (Nav to the catcher's UI, Locator-based reads) - only the
   selectors differ per catcher's own markup - so a second worked example is real but
   marginal proof once the pattern is proven once; a genuine future addition, not required
   to consider this change complete.
3. **Not in this change** - a browser-driven equivalent for `maildrop.cc`. It does have its
   own web UI (visit the site, type an inbox name, view messages), so the same convention
   plausibly extends there too, but that UI was not inspected or proven against in this
   change - a real, separate follow-up, not assumed working here.
4. **Not in this change** - Waygraph Copilot (Phase 6), sequenced after this phase.
5. **Explicitly never in scope** - editing any external consumer project. This documents and
   proves the convention inside this repo's own example; it does not touch the two real
   projects the evidence came from.

## Goals / Non-Goals

**Goals:**
- The convention needs zero new engine code - a Nav, two Methods, another Nav, all built
  from existing helpers.
- The example is real, live-container proof, not a description of a pattern that was never
  actually run.
- The convention matches real, convergent, independently-arrived-at usage, not a
  from-scratch guess.

**Non-Goals (this change):**
- Reintroducing an HTTP/REST path for mail verification. If a real, concrete need for
  headless (no-browser-tab) mail verification surfaces later, that is a new proposal
  informed by that real need, not a revival of the exact interface built and discarded here.
- MailHog/MailDev/`maildrop.cc` worked examples (see Roadmap above).
- A shared `*Sel`-style abstraction across mail-catcher UIs - each catcher's own web UI has
  its own DOM shape (confirmed different between MailHog's classic UI and Mailpit's Vue SPA
  in the earlier, now-discarded HTTP-based investigation), so there is no shared code to
  extract beyond the one `MailpitSel` object this example already has.

## Decisions

**Replace the HTTP adapter entirely, not keep both.** Shipping two working ways to solve the
same problem (a REST client and a browser-driven convention) would leave every future author
guessing which one is "the" waygraph way - worse than shipping neither. The browser-driven
convention has stronger real-world evidence (two independent real projects, not zero) and
fits this project's own stated philosophy ("just an opinionated Playwright") more closely
than a bespoke HTTP module. Discarding real, working, tested code is a real cost, honestly
noted here - not free, but the right call given the evidence.

**`*-external/<tool>/`, not folded into the app's own Block tree.** Mirrors both real
projects' own convention exactly (`pia-external/mailpit/`, `zsign-external/mailpit/`
generically - not named here per this repo's own established rule against referencing
specific consumer projects in its own artifacts). A cross-origin tool is a genuinely
different site; keeping it in its own folder makes that visible from structure alone, and
keeps `waygraph check`'s nav-escape sweep meaningful (a Nav to a completely different origin
is not a "teleport" bug the way an in-app `page.goto` bypass would be).

**The final hop back into the app is a plain `NavBlock` with a mem-function `url`, not an
in-iframe click with a `target="_top"` DOM hack.** The real projects' own implementation
clicks the link *inside* the mail catcher's iframe with a manually-set `target="_top"`,
because their app login flow needed the *same tab* to carry over browser state set during the
mail-catcher visit. This example's scaffold app has no such constraint, and "click inside an
iframe with a manually patched target attribute" is significantly more code and fragility
than "navigate to the URL directly" for no benefit here - a plain `NavBlock` is genuinely the
cleaner choice when nothing forces the iframe-click workaround. Documented explicitly so a
real consumer with the same same-tab-session constraint knows the iframe-click variant is
available and why this example doesn't need it.

**Selectors confirmed against a real running Mailpit container before being written, not
assumed from memory.** A real container (`axllent/mailpit`) was launched, a real message was
sent to it via raw SMTP, and its actual rendered DOM was inspected via Playwright
(`page.locator("body").innerHTML()`, then the detail view after a real click) before
`MailpitSel`'s `messageRow`/`previewIframe` values were written - the exact discipline this
whole "Agent-authoring tooling" roadmap phase has followed throughout (real proof, not
assumption), applied here at the selector level too.

**`ExpectedRecipient` mem key, not a hardcoded email string.** Mirrors the real projects'
own reasoning exactly: Mailpit (and MailHog/MailDev) list newest-first, but a shared inbox
across runs can hold mail for more than one recipient, so `.first()` alone would silently
open the wrong message on a second run. Matching by mem-supplied recipient is the correctness
fix both real projects independently arrived at.

**QA-richness follow-up (same change, driven by direct user request): three new frame-scoped
Trait factories, not a bespoke per-Block DOM read.** Once "does the email say the right
thing" needed a real answer, the choice was between (a) one-off inline `act()`/`observe()`
code per Block reading `page.frameLocator(...)` by hand, or (b) generalizing it as
`Trait.frameVisible`/`Trait.frameText`/`Trait.frameContains`, mirroring the existing
page-level `visible`/`textEquals` factories exactly. (b) was chosen: this is a real, reusable
gap (any iframe content, not just mail), not a mail-specific one-off, and keeping the
declarative `verify: [...]` shape consistent with every other Trait-based check in this
project is worth the small addition to `src/trait.ts`. This is the one genuinely new piece of
engine surface this change ships - deliberately small and mirroring an existing pattern
exactly, not a new abstraction.

**Existence check is a mem-aware Trait object, not a new Trait factory.** "Is there a message
for this recipient" needs a *dynamic* selector (built from mem at check time), which none of
`Trait.visible`'s static-string factories can express. Rather than inventing a
`Trait.visibleDynamic(fn)`-shaped new factory for one use, this uses the plain `{ name,
async check(page, mem) {...} }` shape every Trait already is - `check` already receives mem,
so no new capability is needed, just using the existing one directly. Kept internal to the
Block file (not exported), since it is not a generally reusable factory the way the frame
Traits are.

**Existence and content are two separate assert Blocks, not one.** `assert-email-received`
runs before opening the message (safe to check speculatively, does not consume anything);
`assert-email-content` runs after opening it (needs the preview iframe to exist). Combining
them into one Block would force choosing one point in the chain for both checks, losing the
ability to fail early on "nothing arrived" before spending time opening anything - and would
reintroduce a compound-assertion shape this same roadmap phase has otherwise been steering
away from.

**Mem-driven reuse, not a factory that generates N Blocks per scenario - and a rename to
match.** The first shape considered for "100+ different email scenarios in one project" was
a factory function generating a fresh set of named Blocks per call (`clickEmailLink({...})`
returning `{ blocks: [...] }` to spread into a flow). Rejected before building: the Blocks
in question (`open-message`, the link-extraction Method, both asserts) were *already*
scenario-agnostic in everything that matters except their own hardcoded strings - the link-
matching substring and the expected body copy. Moving those two values into mem
(`ExpectedLinkPattern`, `ExpectedEmailContent`, joining the already-mem-driven
`ExpectedRecipient`) makes the *existing fixed set of Blocks* handle any number of scenarios
directly - zero new Blocks, zero factory, zero risk of the generated-Block-name collisions a
factory approach would have introduced at scale (`loadBlockLibrary`'s `byName.set` has no
collision detection - confirmed by reading `src/auto-explore.ts` directly, a real adjacent
finding, not a change made in this phase). Once the Blocks were genuinely scenario-agnostic,
their names had to follow: `extract-verification-link`/`assert-verification-email-content`
(and the `VerificationLink` mem key) were renamed to `extract-email-link`/
`assert-email-content`/`EmailLink` - a mem-driven Block's name should describe its
mechanism, not the one scenario it happened to be built against first.

**`defineAssertBlock`'s wildcard-default footgun, hit twice while building this, is now
documented rather than left to be rediscovered.** Every assert Block this change adds sits
mid-chain (not last before `end`, unlike the earlier `AssertHelloBlock` precedent), and
omitting the explicit type argument produced a real, confusing, deeply-nested `defineFlow`
tuple-typing error both times before the fix (an explicit `<CheckpointType>`) was applied.
Documented in spec.md, design.md (here), README.md, and tasks.md so a future author does not
have to rediscover it from a cryptic compiler error.

**`defineAssertBlock` gained a `requires` option - a real, missed gap, fixed rather than
worked around.** Once `assert-email-received`/`assert-email-content` needed
externally-supplied mem (`ExpectedRecipient`/`ExpectedEmailContent`) read by their own
mem-aware Traits, declaring that via `requires` (for the same preflight-safety reason every
other externally-supplied key in this change uses it) failed to typecheck -
`AssertBlockOptions` never had a `requires` field, unlike `NavBlockOptions`/
`defineMethodBlock`'s base options. This was a real oversight in Phase 4's original
`defineAssertBlock` (built for pure page-state assertions, which typically need no mem
input), not something to work around by skipping `requires` on these two Blocks and losing
preflight's safety net. Fixed with the exact same optional pass-through pattern every other
Block-options interface already uses (`...(options.requires ? { requires: options.requires }
: {})`) - three lines in `src/engine.ts`, two new tests in
`tests/core/define-assert-block.spec.ts`.

## Risks / Trade-offs

- [Discarding the fully-built, fully-tested HTTP adapter is real completed work thrown away]
  -> Accepted and stated plainly, not glossed over - shipping the wrong convention because it
  was already built would be a worse outcome than the sunk cost of replacing it before it
  ever reached a real consumer.
- [Only one of the three local catchers (Mailpit) has a real worked example; MailHog/MailDev
  users must adapt the pattern to that catcher's own DOM, unverified by this change] ->
  Accepted (see Roadmap) - the pattern itself, not per-catcher selector coverage, is what
  this change proves; a second worked example is a genuine, separate future addition.
- [The plain-`NavBlock`-back-into-the-app simplification may not work for a consumer whose
  app requires same-tab session continuity through the mail-catcher visit] -> Documented
  explicitly in Decisions above, with the real iframe-click alternative named as available,
  not silently omitted.
