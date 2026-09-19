import { Engine, start, end, withTitle, withHighlightFixtures } from "waygraph";
import { NavMailpitInboxBlock } from "../blocks/demo-external/mailpit/nav-mailpit-inbox.block.js";
import { AssertEmailReceivedBlock } from "../blocks/demo-external/mailpit/methods/assert-email-received.method.block.js";
import { OpenMessageBlock } from "../blocks/demo-external/mailpit/methods/open-message.method.block.js";
import { AssertEmailContentBlock } from "../blocks/demo-external/mailpit/methods/assert-email-content.method.block.js";
import { ExtractEmailLinkBlock } from "../blocks/demo-external/mailpit/methods/extract-email-link.method.block.js";
import { NavVerificationLinkBlock } from "../blocks/demo-web/nav-verification-link.block.js";
import "../blocks/demo-external/mailpit/mailpit-inbox.page.block.js";
import { MailpitSel } from "../blocks/demo-external/mailpit/mailpit-sel.js";

const engine = new Engine();

/**
 * Cross-origin mail demo, QA-rich: navigate to a real Mailpit inbox (a real,
 * separate web UI - not this app), confirm the email actually arrived,
 * open it, confirm its body says what it's supposed to, read a link
 * straight out of the DOM, then navigate back into the app with it - six
 * atomic Blocks, no mail-catcher REST API anywhere.
 *
 * The four mail-reading Blocks (`assert-email-received`, `open-message`,
 * `assert-email-content`, `extract-email-link`) are reusable across any
 * number of different email scenarios in a project (signup confirmation,
 * password reset, magic link, ...) with zero new Blocks per scenario - only
 * mem varies per run: `ExpectedRecipient` (who), `ExpectedLinkPattern`
 * (which link in the body to follow), `ExpectedEmailContent` (what the body
 * should say). This particular flow wires them to this scaffold's own
 * "verified" landing route (`nav-verification-link`, app-specific by
 * nature - a different scenario would use a different landing Nav) - see
 * tests/mail-verify.spec.ts for two different scenarios driven through the
 * same four mail-reading Blocks.
 *
 * Needs a real Mailpit instance reachable at WAYGRAPH_MAIL_URL (default
 * http://127.0.0.1:8025) with a message already waiting for
 * ExpectedRecipient's email - see tests/mail-verify.spec.ts for how the test
 * drives this end to end (spins up a real Mailpit container, sends a real
 * email, then runs this exact flow) - including the negative cases: no email
 * arriving, or content that doesn't match, each fail loud, naming
 * themselves, not a silent pass.
 */
export const mailVerifyFlow = withHighlightFixtures(
  withTitle(
    engine.defineFlow([
      start,
      NavMailpitInboxBlock,
      AssertEmailReceivedBlock,
      OpenMessageBlock,
      AssertEmailContentBlock,
      ExtractEmailLinkBlock,
      NavVerificationLinkBlock,
      end,
    ]),
    "Scaffold: Cross-origin mail verification (QA-rich)",
  ),
  {
    "assert-email-received": {
      stubAfter: {
        note: {
          selector: MailpitSel.messageRow,
          label: "AC · email arrived",
          detail: "Confirmed before opening anything.",
          tag: "AC",
        },
      },
    },
    "assert-email-content": {
      stubAfter: {
        note: {
          selector: MailpitSel.previewIframe,
          label: "AC · email body matches expected copy",
          tag: "AC",
        },
      },
    },
    "extract-email-link": {
      stubAfter: {
        note: {
          selector: MailpitSel.previewIframe,
          label: "AC · link found",
          detail: "Read from the message preview iframe.",
          tag: "AC",
        },
      },
    },
  },
);
