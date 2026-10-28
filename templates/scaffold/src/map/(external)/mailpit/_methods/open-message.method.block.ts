// waygraph-ignore: empty-verify (confirmed by AssertEmailContentBlock right after it in mail-verify.flow.ts)
import { claimOnce, defineMethodBlock } from "waygraph";
import { MailpitInbox, MailpitMessageOpen } from "../_states.js";
import { MailpitKeys } from "../_keys.js";
import { MailpitSel } from "../_sel.js";

/**
 * Opens the newest message for the expected recipient (matched by email, not position) that no other run has opened:
 * parallel tests sharing an inbox each claim their own (claimOnce).
 */
export const OpenMessageBlock = defineMethodBlock({
  name: "open-message",
  description: "Opens the newest unclaimed message addressed to the expected recipient.",
  from: MailpitInbox,
  to: MailpitMessageOpen,
  requires: [MailpitKeys.expectedRecipient],
  instruction: {
    async act(page, _in, mem) {
      const { email } = mem.get(MailpitKeys.expectedRecipient);
      const rows = page.locator(MailpitSel.messageRow, { hasText: email });
      try {
        await rows.first().waitFor({ state: "visible", timeout: 30_000 });
      } catch {
        throw new Error(`open-message: no email arrived for "${email}" within 30s`);
      }
      // Newest first; each message (its /view/<id> link) is opened by one run only.
      let opened = false;
      for (const row of await rows.all()) {
        if (!(await claimOnce(`mailpit:${await row.getAttribute("href")}`))) continue;
        await row.click();
        opened = true;
        break;
      }
      if (!opened) throw new Error(`open-message: every message for "${email}" was already opened by another run`);
      await page.waitForURL(/\/view\//, { timeout: 15_000 });
      await page.frameLocator(MailpitSel.previewIframe).locator("body").waitFor({
        state: "attached",
        timeout: 15_000,
      });
    },
  },
});
