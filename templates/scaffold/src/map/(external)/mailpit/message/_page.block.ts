import { definePageBlock, Trait } from "waygraph";
import { MailpitKeys } from "../_keys.js";
import { MailpitSel } from "../_sel.js";
import { extractEmailLink } from "./_methods/extract-email-link.method.block.js";

// Reads the expected copy from mem, so one page serves any email template.
const bodyContainsExpectedText: Trait = {
  name: "body-contains-expected-text",
  async check(page, mem) {
    const expected = mem.get(MailpitKeys.expectedEmailContent);
    const text = await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent();
    return (text ?? "").includes(expected);
  },
};

/** One message open (`/view/<id>`): its body in the preview iframe, and the link in it. */
export const MailpitMessagePage = definePageBlock({
  name: "page-mailpit-message",
  description: "An open message: its preview, and the link read out of it.",
  checkpoint: "MailpitMessageOpen",
  from: ["MailpitInbox"],
  verify: [Trait.url({ pathname: "/view/*" })],
  read: (ctx) => ({ body: ctx.page.fn(async (page) => (await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent())?.trim() ?? "") }),
  readAs: "mailpitMessage",
  do: (self) => ({ extractEmailLink: extractEmailLink(self) }),
  expects: (self) => ({
    emailContent: self.expect({
      name: "expect-email-content",
      description: "Confirms the open message's body contains the mem-supplied expected copy.",
      requires: [MailpitKeys.expectedEmailContent],
      verify: [bodyContainsExpectedText],
    }),
  }),
});
