import { defineMethodBlock } from "waygraph";
import { MailpitMessageOpen } from "../_states.js";
import { MailpitKeys } from "../_keys.js";
import { MailpitSel } from "../_sel.js";

/** Reads the link matching `ExpectedLinkPattern` out of the preview into mem; going there is a separate Nav. */
export const ExtractEmailLinkBlock = defineMethodBlock({
  name: "extract-email-link",
  description: "Reads the link matching the mem-supplied pattern out of the open message's preview.",
  from: MailpitMessageOpen,
  to: MailpitMessageOpen,
  requires: [MailpitKeys.expectedLinkPattern],
  instruction: {
    async act(page, _in, mem) {
      const pattern = mem.get(MailpitKeys.expectedLinkPattern);
      const frame = page.frameLocator(MailpitSel.previewIframe);
      const link = frame.locator(`a[href*="${pattern}"]`).first();
      await link.waitFor({ state: "visible", timeout: 15_000 });
      const href = await link.getAttribute("href");
      if (!href) throw new Error(`extract-email-link: no link matching "${pattern}" in message preview`);
      mem.set(MailpitKeys.emailLink, { url: href });
    },
  },
});
