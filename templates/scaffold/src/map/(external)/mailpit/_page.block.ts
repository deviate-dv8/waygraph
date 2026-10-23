import { definePageBlock, Trait } from "waygraph";
import { MailpitInbox } from "../../../states/demo.states.js";
import { AssertEmailReceivedBlock } from "./_methods/assert-email-received.method.block.js";
import { OpenMessageBlock } from "./_methods/open-message.method.block.js";
import { AssertEmailContentBlock } from "./_methods/assert-email-content.method.block.js";
import { ExtractEmailLinkBlock } from "./_methods/extract-email-link.method.block.js";

export const MailpitInboxPageBlock = definePageBlock({
  name: "page-mailpit-inbox",
  description: "Mailpit dev inbox hub - confirm arrival/content, open the expected message, read its link.",
  checkpoint: MailpitInbox,
  verify: [Trait.url({ pathname: "/" })],
  methods: {
    assertEmailReceived: () => AssertEmailReceivedBlock,
    openMessage: () => OpenMessageBlock,
    assertEmailContent: () => AssertEmailContentBlock,
    extractEmailLink: () => ExtractEmailLinkBlock,
  },
});
