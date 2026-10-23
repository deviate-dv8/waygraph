import { defineAssertBlock, type Trait } from "waygraph";
import { MailpitInbox } from "../../../../states/demo.states.js";
import { ExpectedRecipient } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

// Mem-aware: which recipient to look for is only known at run time.
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

/** A message for the expected recipient has arrived; nothing is opened or consumed. */
export const AssertEmailReceivedBlock = defineAssertBlock({
  name: "assert-email-received",
  description: "Confirms a message addressed to the expected recipient has arrived.",
  checkpoint: MailpitInbox,
  requires: [ExpectedRecipient.key],
  verify: [emailReceived],
});
