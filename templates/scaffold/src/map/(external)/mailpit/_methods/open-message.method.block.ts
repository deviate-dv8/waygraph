import type { PageHandle } from "waygraph";
import { MailpitSel } from "../_sel.js";
import { claimOnce } from "waygraph";
import { MailpitKeys } from "../_keys.js";

export const openMessage = (self: PageHandle<"MailpitInbox">) =>
  self.method({
    to: "MailpitMessageOpen",
    name: "open-message",
    description: "Opens the newest unclaimed message addressed to the expected recipient.",
    requires: [MailpitKeys.expectedRecipient],
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
  });
