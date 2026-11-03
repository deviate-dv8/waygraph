import { engine } from "#config/waygraph.config";
import { MailpitInboxPage } from "#map/(external)/mailpit/_page.block";
import { MailpitSel } from "#map/(external)/mailpit/_sel";
import { NavVerificationLinkBlock } from "#map/(app_base)/home/nav-verification-link.block";

/** Needs a Mailpit at WAYGRAPH_MAIL_URL (default http://127.0.0.1:8025); tests/mail-verify.spec.ts starts one. */
export const emailVerificationFlow = engine
  .map()
  .start()
  .gotoExternal(
    MailpitInboxPage.nav.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Cross-origin mail verification (QA-rich)");
    }),
  )
  .assert(
    MailpitInboxPage.do.assertEmailReceived.stubAfter((ctx) => {
      ctx.ui.ring("note", {
        selector: MailpitSel.messageRow,
        label: "AC · email arrived",
        detail: "Confirmed before opening anything.",
        tag: "AC",
      });
    }),
  )
  .method(MailpitInboxPage.do.openMessage)
  .assert(
    MailpitInboxPage.do.assertEmailContent.stubAfter((ctx) => {
      ctx.ui.ring("note", { selector: MailpitSel.previewIframe, label: "AC · email body matches expected copy", tag: "AC" });
    }),
  )
  .method(
    MailpitInboxPage.do.extractEmailLink.stubAfter((ctx) => {
      ctx.ui.ring("note", {
        selector: MailpitSel.previewIframe,
        label: "AC · link found",
        detail: "Read from the message preview iframe.",
        tag: "AC",
      });
    }),
  )
  .gotoPage(NavVerificationLinkBlock)
  .end();
