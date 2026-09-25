import { defineAssertBlock, type Trait } from "waygraph";
import type { MailpitMessageOpen } from "../../../../states/demo.states.js";
import { ExpectedEmailContent } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

/**
 * Mem-aware Trait: the expected copy varies per email scenario, so it can't
 * be a static `Trait.frameContains(...)` call (which bakes its expected
 * string in at Block-definition time) - a Trait's own `check(page, mem)`
 * already receives mem, so a bespoke Trait reads it at check time instead.
 * This is what lets one Block serve any number of different email templates.
 */
const bodyContainsExpectedText: Trait = {
  name: "body-contains-expected-text",
  async check(page, mem) {
    const expected = mem.get(ExpectedEmailContent);
    const text = await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent();
    return (text ?? "").includes(expected);
  },
};

/**
 * Kind: Assert
 * Helper: defineAssertBlock
 * Route: demo-external/mailpit/_methods/
 *
 * "Does the email actually say what it's supposed to" - not just "does a
 * link exist somewhere in it." Reads the message body straight out of the
 * preview iframe (the top-level page's own `Trait.text`/`Trait.visible`
 * can't see inside an iframe at all - see docs/REFERENCE.md "Mail adapters" section).
 * Self-loop on MailpitMessageOpen - no state change, verify only.
 *
 * Deliberately named for what it does, not for one scenario: the expected
 * copy comes from mem (`ExpectedEmailContent`), not a hardcoded string in
 * this file, so this one Block serves any number of different email
 * scenarios - a Block named "assert-verification-email-content" would
 * wrongly imply it only ever checks verification-email copy.
 *
 * Explicit `<MailpitMessageOpen>` type argument - see the same note on
 * `assert-email-received.method.block.ts` for why this can't be inferred.
 */
export const AssertEmailContentBlock = defineAssertBlock<MailpitMessageOpen>({
  name: "assert-email-content",
  description: "Confirms the open message's body contains the mem-supplied expected copy.",
  checkpoint: "MailpitMessageOpen",
  requires: [ExpectedEmailContent],
  verify: [bodyContainsExpectedText],
});
