import { defineAssertBlock, type Trait } from "waygraph";
import type { MailpitInbox } from "../../../../states/demo.states.js";
import { ExpectedRecipient } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

/**
 * Mem-aware Trait: the selector depends on which recipient this run expects,
 * so it can't be a static `Trait.visible(...)` string - a Trait's own
 * `check(page, mem)` already receives mem, so a bespoke Trait object reads it
 * directly instead of needing a new engine primitive.
 */
const emailReceived: Trait = {
  name: "email-received",
  async check(page, mem) {
    const { email } = mem.get(ExpectedRecipient.key);
    try {
      await page.locator(MailpitSel.messageRow, { hasText: email }).first().waitFor({
        state: "visible",
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Kind: Assert
 * Helper: defineAssertBlock
 * Route: demo-external/mailpit/_methods/
 *
 * "Did the email even arrive" - a lightweight existence check that does not
 * open or consume the message, so it's safe to run before deciding to open
 * anything. Self-loop on MailpitInbox - no state change, verify only.
 *
 * Explicit `<MailpitInbox>` type argument: `defineAssertBlock` defaults to
 * wildcard `Checkpoint<string>` on both sides when uninferred, which only
 * "works" when the assert sits last in a chain (nothing downstream narrows
 * it) - this one sits between two specifically-typed Blocks, so it must be
 * parameterized explicitly or `defineFlow`'s tuple typing breaks.
 */
export const AssertEmailReceivedBlock = defineAssertBlock<MailpitInbox>({
  name: "assert-email-received",
  description: "Confirms a message addressed to the expected recipient has arrived.",
  checkpoint: "MailpitInbox",
  requires: [ExpectedRecipient.key],
  verify: [emailReceived],
});
