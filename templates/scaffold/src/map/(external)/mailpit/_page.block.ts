import { definePageBlock, Trait } from "waygraph";
import { MailpitInbox } from "./_states.js";
import { ExpectEmailContentBlock } from "./_expect/email-content.expect.block.js";
import { ExtractEmailLinkBlock } from "./_methods/extract-email-link.method.block.js";
import { MailpitSel } from "./_sel.js";
import { claimOnce } from "waygraph";
import { MailpitKeys } from "./_keys.js";

const mailpitUrl = (): string => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025";
const emailReceived: Trait = {
  name: "email-received",
  async check(page, mem) {
    const { email } = mem.get(MailpitKeys.expectedRecipient);
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



export const MailpitInboxPage = definePageBlock({
  name: "page-mailpit-inbox",
  description: "Mailpit dev inbox hub - confirm arrival/content, open the expected message, read its link.",
  checkpoint: MailpitInbox,
  url: mailpitUrl,
  verify: [Trait.url({ pathname: "/" })],
  read: (ctx) => ({ messages: ctx.page.texts(MailpitSel.messageRow) }),
  readAs: "mailpit",
  do: (self) => ({
  openMessage: self.method({
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
  }),
  extractEmailLink: ExtractEmailLinkBlock,
  }),
  expects: (self) => ({
  emailContent: ExpectEmailContentBlock,
  emailReceived: self.expect({
  name: "expect-email-received",
  description: "Confirms a message addressed to the expected recipient has arrived.",
  requires: [MailpitKeys.expectedRecipient],
  verify: [emailReceived],
  }),
  })
});
