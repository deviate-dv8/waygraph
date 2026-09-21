import { defineMethodBlock, checkpoint } from "waygraph";
import type { MailpitMessageOpen } from "../../../../states/demo.states.js";
import { EmailLink, ExpectedLinkPattern } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../mailpit.sel.js";

/**
 * Kind: Method
 * Helper: defineMethodBlock
 * Route: demo-external/mailpit/methods/
 *
 * Reads a link straight out of the open message's HTML preview iframe via a
 * real DOM read (getAttribute) - no mail-catcher REST API - and stores it in
 * mem. A separate NavBlock does the actual navigation: folding "read the
 * link" and "go there" into one Block would repeat the exact compound-action
 * anti-pattern `waygraph check` flags elsewhere.
 *
 * Deliberately named for what it does, not for one scenario: the
 * link-matching substring comes from mem (`ExpectedLinkPattern`), not a
 * hardcoded string, so this one Block serves any number of different email
 * scenarios in a project (a signup confirmation, a password reset, a magic
 * link, ...) by varying mem per run, not by writing a new Block per
 * scenario - a Block named "extract-verification-link" would wrongly imply
 * it only ever handles verification emails.
 */
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
