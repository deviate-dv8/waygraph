// waygraph-ignore: empty-verify (confirmed by AssertEmailContentBlock right after it in mail-verify.flow.ts)
import { defineMethodBlock } from "waygraph";
import { MailpitInbox, MailpitMessageOpen } from "../_states.js";
import { ExpectedRecipient } from "../_keys.js";
import { MailpitSel } from "../_sel.js";

/** Opens the newest message for the expected recipient (matched by email, not position). */
export const OpenMessageBlock = defineMethodBlock({
  name: "open-message",
  description: "Opens the newest message addressed to the expected recipient.",
  from: MailpitInbox,
  to: MailpitMessageOpen,
  requires: [ExpectedRecipient.key],
  instruction: {
    async act(page, _in, mem) {
      const { email } = mem.get(ExpectedRecipient.key);
      const row = page.locator(MailpitSel.messageRow, { hasText: email }).first();
      try {
        await row.waitFor({ state: "visible", timeout: 30_000 });
      } catch {
        throw new Error(`open-message: no email arrived for "${email}" within 30s`);
      }
      await row.click();
      await page.waitForURL(/\/view\//, { timeout: 15_000 });
      await page.frameLocator(MailpitSel.previewIframe).locator("body").waitFor({
        state: "attached",
        timeout: 15_000,
      });
    },
  },
});
