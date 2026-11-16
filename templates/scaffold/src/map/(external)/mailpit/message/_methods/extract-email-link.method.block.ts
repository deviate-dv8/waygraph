import type { PageHandle } from "waygraph";
import { MailpitKeys } from "../../_keys.js";
import { MailpitSel } from "../../_sel.js";

/** Reads the link matching the expected pattern out of the preview into mem; going there is the home page's address. */
export const extractEmailLink = (self: PageHandle<"MailpitMessageOpen">) =>
  self.method({
    name: "extract-email-link",
    description: "Reads the link matching the mem-supplied pattern out of the open message's preview.",
    requires: [MailpitKeys.expectedLinkPattern],
    async act(page, _in, mem) {
      const pattern = mem.get(MailpitKeys.expectedLinkPattern);
      const link = page.frameLocator(MailpitSel.previewIframe).locator(`a[href*="${pattern}"]`).first();
      await link.waitFor({ state: "visible", timeout: 15_000 });
      const href = await link.getAttribute("href");
      if (!href) throw new Error(`extract-email-link: no link matching "${pattern}" in message preview`);
      mem.set(MailpitKeys.emailLink, { url: href });
    },
  });
