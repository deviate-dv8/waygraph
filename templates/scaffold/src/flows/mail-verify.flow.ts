import { engine } from "../../config/waygraph.config.js";
import { NavMailpitInboxBlock } from "../map/(external)/mailpit/_nav.block.js";
import { AssertEmailReceivedBlock } from "../map/(external)/mailpit/_methods/assert-email-received.method.block.js";
import { OpenMessageBlock } from "../map/(external)/mailpit/_methods/open-message.method.block.js";
import { AssertEmailContentBlock } from "../map/(external)/mailpit/_methods/assert-email-content.method.block.js";
import { ExtractEmailLinkBlock } from "../map/(external)/mailpit/_methods/extract-email-link.method.block.js";
import { NavVerificationLinkBlock } from "../map/(app_base)/home/nav-verification-link.block.js";
import "../map/(external)/mailpit/_page.block.js";
import { MailpitSel } from "../map/(external)/mailpit/_sel.js";

/** Needs a Mailpit at WAYGRAPH_MAIL_URL (default http://127.0.0.1:8025); tests/mail-verify.spec.ts starts one. */
export const mailVerifyFlow = engine
  .map()
  .start()
  .gotoExternal(NavMailpitInboxBlock)
  .assert(
    AssertEmailReceivedBlock.stubAfter((ctx) => {
      ctx.ring("note", {
        selector: MailpitSel.messageRow,
        label: "AC · email arrived",
        detail: "Confirmed before opening anything.",
        tag: "AC",
      });
    }),
  )
  .method(OpenMessageBlock)
  .assert(
    AssertEmailContentBlock.stubAfter((ctx) => {
      ctx.ring("note", { selector: MailpitSel.previewIframe, label: "AC · email body matches expected copy", tag: "AC" });
    }),
  )
  .method(
    ExtractEmailLinkBlock.stubAfter((ctx) => {
      ctx.ring("note", {
        selector: MailpitSel.previewIframe,
        label: "AC · link found",
        detail: "Read from the message preview iframe.",
        tag: "AC",
      });
    }),
  )
  .gotoPage(NavVerificationLinkBlock)
  .end({ title: "Scaffold: Cross-origin mail verification (QA-rich)" });
