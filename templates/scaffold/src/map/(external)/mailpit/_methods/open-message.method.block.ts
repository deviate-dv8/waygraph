// waygraph-ignore: empty-verify (confirmed by AssertEmailContentBlock right after it in mail-verify.flow.ts)
import { defineMethodBlock, checkpoint } from "waygraph";
import type { MailpitInbox, MailpitMessageOpen } from "../../../../states/demo.states.js";
import { ExpectedRecipient } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: demo-external/mailpit/_methods/
 *
 * Opens the newest inbox row addressed to the mem-set recipient (not bare
 * inbox position - a prior run's leftover mail for a different recipient
 * would otherwise pick the wrong row). UI click only, no mail-catcher REST
 * API - the row itself is a real link (`page.waitForURL` sees the client-side
 * route change the same as any other in-page navigation).
 */
export const OpenMessageBlock = defineMethodBlock<MailpitInbox, MailpitMessageOpen>({
  name: "open-message",
  description: "Opens the newest message addressed to the expected recipient.",
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
    resolve: () => checkpoint("MailpitMessageOpen"),
  },
});
