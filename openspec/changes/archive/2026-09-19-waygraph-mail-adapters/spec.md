# waygraph-mail-adapters Specification

## Purpose
Documents and proves a real, `*-external/<tool>/` Block convention for flows driven by an
email (signup confirmation, password reset, magic links): navigate the browser to the mail
catcher's own web UI and read the message via ordinary DOM Locator calls, rather than a
REST/HTTP client - matching real, convergent usage across more than one real consumer
project, and requiring zero new engine surface.

## Requirements

### Requirement: External tooling stays in its own `*-external/<tool>/` folder
A Block that drives a cross-origin tool (a mail catcher's web UI, or any other tool not part
of the app under test) SHALL live in a folder named `*-external/<tool>/`, never mixed into
the app's own Block folders - the same separation real consumer projects independently
apply, keeping "which Blocks drive my app" and "which Blocks drive supporting tooling"
unambiguous from folder structure alone.

#### Scenario: The example's Mailpit Blocks are not mixed into the app's own Blocks
- **WHEN** `templates/scaffold`'s Block tree is inspected
- **THEN** the Mailpit-driving Blocks SHALL live under `demo-external/mailpit/`, and the
  app-driving Blocks SHALL live under `demo-web/`, never combined in one folder

### Requirement: Reading a mail catcher's message uses page Locators, not a REST client
A Block reading a message out of a mail catcher SHALL do so with ordinary Playwright
Locator/FrameLocator calls against the catcher's own web UI (already navigated to via a
`NavBlock`), not an HTTP/JSON client against the catcher's REST API. This keeps the
capability entirely inside the existing Block/Nav/Method/Trait model - no new engine type,
interface, or config mechanism.

#### Scenario: Extracting the verification link uses a DOM read, not a fetch
- **WHEN** a Block needs the verification link out of an open message
- **THEN** it SHALL read it via `page.frameLocator(...).locator(...).getAttribute("href")`
  (or equivalent Locator-based DOM access), not `fetch()`/an HTTP client

### Requirement: The message list is matched by recipient in mem, not by inbox position
A Method opening a specific message SHALL match the inbox row against a recipient value
read from mem (`requires`-declared, externally supplied), not by taking the first/newest row
unconditionally - a shared inbox can hold mail for more than one recipient across runs, and
position-only matching would silently open the wrong message.

#### Scenario: A different recipient's message already in the inbox is not opened by mistake
- **WHEN** the inbox holds messages for two different recipients
- **THEN** opening "the message for recipient A" SHALL open the message addressed to A, not
  whichever message is newest/first in the list

### Requirement: Fetching the link and navigating to it stay two separate Blocks
Reading the verification link out of the message and navigating to it SHALL be two separate
Blocks (a `MethodBlock` that reads and `mem.set`s the link, a `NavBlock` that navigates to
it) - folding both into one Block would repeat the compound-action anti-pattern `waygraph
check`'s inline-selector/nav-escape warnings and `defineAssertBlock` already exist to guard
against elsewhere.

#### Scenario: The example's mail-driven flow has no compound Block
- **WHEN** `waygraph check` runs against the example flow this change adds
- **THEN** it SHALL report zero nav-escape, inline-selector, and orphan-Block warnings for
  the new Blocks

### Requirement: A mem key produced earlier in the same chain is never declared as `requires`
A Block consuming a mem key that an earlier Block in the *same* chain produces (not a value
the caller supplies from outside the flow) SHALL NOT declare that key under `requires` -
`requires` is checked for the whole chain before any Block runs, so declaring a
chain-internal, producedBy-an-earlier-Block key there would make the flow fail before it
ever gets the chance to produce it.

#### Scenario: The final NavBlock has no `requires` for the mem-internal link
- **WHEN** `nav-verification-link` (which reads `EmailLink`, set by an earlier Block in the
  same flow) is inspected
- **THEN** it SHALL NOT declare `requires: [EmailLink.key]`, and the flow SHALL run
  successfully end to end despite that key not existing in mem before the flow starts

### Requirement: Reading content inside an iframe has a dedicated Trait, not a page-level one
`Trait.text`/`Trait.visible` (and their underlying `page.locator(selector)`) SHALL NOT be
relied upon to see content inside any iframe - Playwright requires `frameLocator` for that.
`waygraph` SHALL provide frame-scoped equivalents (`Trait.frameVisible`, `Trait.frameText`,
`Trait.frameContains`) mirroring the page-level ones' semantics (exact match for `frameText`,
substring match for `frameContains`, existence for `frameVisible`), so a message-body
assertion is expressible declaratively in a `verify` array like any other Trait, not as
one-off inline `act()`/`observe()` code.

#### Scenario: A plain page-level Trait cannot see iframe-only content
- **WHEN** content exists only inside an iframe on the current page
- **THEN** `page.locator(selector)` on the top-level page SHALL NOT find it, and
  `Trait.frameVisible`/`Trait.frameText`/`Trait.frameContains` (scoped to that iframe) SHALL
  find it correctly

#### Scenario: A content mismatch inside the frame fails loud, naming itself
- **WHEN** `Trait.frameContains(frameSelector, innerSelector, expected)` is used in a
  Block's `verify` and the frame's actual content does not contain `expected`
- **THEN** the run SHALL fail with an error naming the Trait and the point in the chain it
  failed at, the same way any other failing Trait does

### Requirement: An assert Block may confirm the real, DOM-observable result of an earlier action
A `defineAssertBlock` (or any self-loop assertion) placed immediately after a Method/Effect
Block SHALL be able to confirm that action's actual effect - reading both the live page and
mem (a Trait's `check(page, mem)` already receives both) - not just a static, always-true
page state. This includes confirming existence (something arrived/appeared) as a distinct,
separately-nameable check from confirming its content.

#### Scenario: An existence check does not require opening/consuming what it checks
- **WHEN** `assert-email-received` runs
- **THEN** it SHALL confirm a matching message is present without opening it, leaving it
  available for `open-message` to open afterward

#### Scenario: An absence is a real, loud failure, not a silent pass or a hang
- **WHEN** no message ever arrives for the expected recipient within the check's own bound
- **THEN** the run SHALL fail with an error naming the check, not hang indefinitely or
  silently proceed as if a message existed

### Requirement: `defineAssertBlock` needs an explicit type argument once it is not the last Block
`defineAssertBlock` without an explicit type argument defaults `Out` to wildcard
`Checkpoint<string>` on both sides. This is documented as a real trap: it type-checks fine
when the assert is the last real Block before `end` (nothing downstream constrains it) but
breaks a `defineFlow` array's tuple typing once the assert sits between two
specifically-typed Blocks - each assert Block added in this change (which all sit mid-chain)
SHALL be given its real checkpoint type explicitly (e.g. `defineAssertBlock<MailpitInbox>`).

#### Scenario: A mid-chain assert without an explicit type argument fails to typecheck
- **WHEN** `defineAssertBlock({...})` (no type argument) is placed between two
  specifically-typed Blocks in a `defineFlow` array
- **THEN** the project SHALL fail to typecheck, not silently accept a wildcard-typed Block
  in the middle of an otherwise strictly-typed chain

### Requirement: `defineAssertBlock` accepts `requires`, like every other Block helper
`defineAssertBlock`'s options SHALL accept an optional `requires: readonly MemKey<any>[]`,
passed through to the generated Block exactly as `defineNavBlock`/`defineMethodBlock`
already do. An assert Block whose `verify` reads a mem-aware Trait needing an externally
-supplied mem key SHALL be able to declare that key under `requires` so preflight can catch
it missing before the flow ever runs, instead of only failing deep inside the Trait's own
`check()` once the flow is already underway.

#### Scenario: A missing externally-supplied key is caught by preflight, not by the Trait
- **WHEN** an assert Block declares `requires: [SomeKey]` and mem does not have `SomeKey` set
- **THEN** `runGraph`'s preflight SHALL reject the run before any Block's `act` runs, naming
  the missing key

### Requirement: The mail-reading Blocks are reusable across any number of email scenarios via mem, not one Block set per scenario
`open-message`, `extract-*-link`, and both assert Blocks SHALL take every scenario-specific
value (which recipient, which link to follow, what the body should say) from mem, never
hardcoded in the Block's own file, so the same fixed set of Blocks serves any number of
different email scenarios (signup confirmation, password reset, magic link, ...) in one
project. A Block name SHALL describe what the Block mechanically does, not one scenario that
happens to use it (e.g. `extract-email-link`, not `extract-verification-link`), since a
scenario-specific name would misdescribe a Block once it is actually scenario-agnostic.

#### Scenario: The same Blocks handle two unrelated email scenarios with no new Blocks
- **WHEN** the same flow (built from the same fixed set of mail-reading Blocks) is run twice
  with different mem values for recipient, link-matching pattern, and expected content
- **THEN** both runs SHALL succeed correctly against their own respective real email, with
  zero new Blocks written for the second scenario

#### Scenario: A link-matching pattern discriminates between two links in the same email
- **WHEN** an email body contains more than one link (e.g. a decoy "report this" link and
  the real action link)
- **THEN** `extract-*-link`'s mem-supplied pattern SHALL select the intended link
  specifically, not merely whichever link appears first
