import { defineReadBlock } from "waygraph";
import { MailpitInbox } from "./_states.js";
import { MailpitSel } from "./_sel.js";
import { MailpitRead } from "./_reads.js";

/** The inbox as data: every message row's text (sender, subject, time), newest first. */
export const MailpitReadBlock = defineReadBlock({
  name: "read-mailpit",
  description: "Every message in the inbox, newest first.",
  from: [MailpitInbox],
  instruction: { read: (ctx) => MailpitRead({ messages: ctx.page.texts(MailpitSel.messageRow) }) },
});
