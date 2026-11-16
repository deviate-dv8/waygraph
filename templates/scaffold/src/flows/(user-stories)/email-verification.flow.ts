import { pane } from "waygraph";
import { engine } from "#config/waygraph.config";
import { MailpitInboxPage } from "#map/(external)/mailpit/_page.block";
import { MailpitSel } from "#map/(external)/mailpit/_sel";
import { MailpitMessagePage } from "#map/(external)/mailpit/message/_page.block";
import { HomePage } from "#map/(main)/(app_base)/home/_page.block";

const Arrived = MailpitInboxPage.expects.emailReceived.stub((ctx) => {
  ctx.ui.ring("note", { selector: MailpitSel.messageRow, label: "AC · email arrived", detail: "Confirmed before opening anything.", tag: "AC" });
});
const ContentMatches = MailpitMessagePage.expects.emailContent.stub((ctx) => {
  ctx.ui.ring("note", { selector: MailpitSel.previewIframe, label: "AC · email body matches expected copy", tag: "AC" });
});
const LinkFound = MailpitMessagePage.do.extractEmailLink.stub((ctx) => {
  ctx.ui.ring("note", { selector: MailpitSel.previewIframe, label: "AC · link found", detail: "Read from the message preview iframe.", tag: "AC" });
});

const Mail = pane("mail");
const App = pane("app", { with: Mail });

/**
 * The mail catcher and the app side by side, one person (the app shares the mail pane's browser): the email arrives,
 * its link opens the app. Needs a Mailpit at WAYGRAPH_MAIL_URL (default http://127.0.0.1:8025); tests/mail-verify.spec.ts
 * starts one.
 */
export const emailVerificationFlow = engine
  .map({ title: "Email verification", description: "The email arrives in the mail catcher, its link opens the app, and the app says verified.", labels: ["mail"], panes: [Mail, App] })
  .in(Mail)
  .gotoExternal(MailpitInboxPage.stubBefore((ctx) => ctx.ui.title("Scaffold: Cross-origin mail verification (QA-rich)")), { expect: [Arrived] })
  .method(MailpitInboxPage.do.openMessage, { expect: [ContentMatches] })
  .method(LinkFound)
  .in(App)
  .gotoPage(HomePage, { expect: [HomePage.expects.verified] });
