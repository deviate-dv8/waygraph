import { defineMethodBlock, checkpoint } from "waygraph";
import type { MailpitMessageOpen } from "../../../../states/demo.states.js";
import { EmailLink, ExpectedLinkPattern } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

/** Reads the link matching `ExpectedLinkPattern` out of the preview into mem; going there is a separate Nav. */
export const ExtractEmailLinkBlock = defineMethodBlock<MailpitMessageOpen, MailpitMessageOpen>({
  name: "extract-email-link",
  description: "Reads the link matching the mem-supplied pattern out of the open message's preview.",
  requires: [ExpectedLinkPattern],
  instruction: {
    async act(page, _in, mem) {
      const pattern = mem.get(ExpectedLinkPattern);
      const frame = page.frameLocator(MailpitSel.previewIframe);
      const link = frame.locator(`a[href*="${pattern}"]`).first();
      await link.waitFor({ state: "visible", timeout: 15_000 });
      const href = await link.getAttribute("href");
      if (!href) throw new Error(`extract-email-link: no link matching "${pattern}" in message preview`);
      mem.set(EmailLink({ url: href }));
    },
    resolve: () => checkpoint("MailpitMessageOpen"),
  },
});
