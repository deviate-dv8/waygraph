import { definePageBlock, Trait } from "waygraph";
import { MailpitInbox } from "./_states.js";
import { ExpectEmailReceivedBlock } from "./_expect/email-received.expect.block.js";
import { OpenMessageBlock } from "./_methods/open-message.method.block.js";
import { ExpectEmailContentBlock } from "./_expect/email-content.expect.block.js";
import { ExtractEmailLinkBlock } from "./_methods/extract-email-link.method.block.js";
import { MailpitSel } from "./_sel.js";
const mailpitUrl = (): string => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025";


export const MailpitInboxPage = definePageBlock({
  name: "page-mailpit-inbox",
  description: "Mailpit dev inbox hub - confirm arrival/content, open the expected message, read its link.",
  checkpoint: MailpitInbox,
  url: mailpitUrl,
  verify: [Trait.url({ pathname: "/" })],
  do: () => ({ openMessage: OpenMessageBlock, extractEmailLink: ExtractEmailLinkBlock }),
  expects: () => ({ emailContent: ExpectEmailContentBlock, emailReceived: ExpectEmailReceivedBlock }),
  read: (ctx) => ({ messages: ctx.page.texts(MailpitSel.messageRow) }),
  readAs: "mailpit"
});
