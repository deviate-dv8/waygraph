import { definePageBlock, Trait } from "waygraph";
import { MailpitSel } from "./_sel.js";
import { MailpitKeys } from "./_keys.js";
import { openMessage } from "./_methods/open-message.method.block.js";

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
  description: "Mailpit dev inbox - confirm the email arrived, open the expected message.",
  checkpoint: "MailpitInbox",
  url: mailpitUrl,
  verify: [Trait.url({ pathname: "/" })],
  read: (ctx) => ({ messages: ctx.page.texts(MailpitSel.messageRow) }),
  readAs: "mailpit",
  do: (self) => ({ openMessage: openMessage(self) }),
  expects: (self) => ({
    emailReceived: self.expect({
      name: "expect-email-received",
      description: "Confirms a message addressed to the expected recipient has arrived.",
      requires: [MailpitKeys.expectedRecipient],
      verify: [emailReceived],
    }),
  }),
});
