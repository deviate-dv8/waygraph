import { definePageBlock, Trait } from "waygraph";
import type { MailpitInbox } from "../../../states/demo.states.js";
import { AssertEmailReceivedBlock } from "./methods/assert-email-received.method.block.js";
import { OpenMessageBlock } from "./methods/open-message.method.block.js";
import { AssertEmailContentBlock } from "./methods/assert-email-content.method.block.js";
import { ExtractEmailLinkBlock } from "./methods/extract-email-link.method.block.js";

/**
 * Kind: Page
 * Helper: definePageBlock
 * Route: demo-external/mailpit/  (= http://127.0.0.1:8025/ by default)
 *
 * Hub for the Mailpit dev-inbox screen. Arrival-only (no url/click) -
 * nav-mailpit-inbox owns the goto. Methods: confirm the email arrived, open
 * it, confirm its content, then read its link - all mem-driven (recipient,
 * link pattern, expected content), so this one page's methods serve any
 * number of different email scenarios, not just one.
 */
export const MailpitInboxPageBlock = definePageBlock<MailpitInbox>({
  name: "page-mailpit-inbox",
  description: "Mailpit dev inbox hub - confirm arrival/content, open the expected message, read its link.",
  checkpoint: "MailpitInbox",
  verify: [Trait.url({ pathname: "/" })],
  methods: {
    assertEmailReceived: () => AssertEmailReceivedBlock,
    openMessage: () => OpenMessageBlock,
    assertEmailContent: () => AssertEmailContentBlock,
    extractEmailLink: () => ExtractEmailLinkBlock,
  },
});
