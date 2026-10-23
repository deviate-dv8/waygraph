import { defineAssertBlock, type Trait } from "waygraph";
import { MailpitMessageOpen } from "../../../../states/demo.states.js";
import { ExpectedEmailContent } from "../../../../states/demo.mem-keys.js";
import { MailpitSel } from "../_sel.js";

// Reads the expected copy from mem, so one Block serves any email template.
const bodyContainsExpectedText: Trait = {
  name: "body-contains-expected-text",
  async check(page, mem) {
    const expected = mem.get(ExpectedEmailContent);
    const text = await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent();
    return (text ?? "").includes(expected);
  },
};

/** The open message says what the scenario expects (copy comes from mem). */
export const AssertEmailContentBlock = defineAssertBlock({
  name: "assert-email-content",
  description: "Confirms the open message's body contains the mem-supplied expected copy.",
  checkpoint: MailpitMessageOpen,
  requires: [ExpectedEmailContent],
  verify: [bodyContainsExpectedText],
});
