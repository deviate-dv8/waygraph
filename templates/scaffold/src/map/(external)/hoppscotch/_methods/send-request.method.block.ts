import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../../../../states/demo.states.js";
import { HoppscotchSel } from "../_sel.js";

export const SendRequestBlock = defineMethodBlock({
  name: "send-request",
  description: "Sends the request and waits for the response status to appear.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  instruction: {
    async act(page) {
      await page.locator(HoppscotchSel.send).click();
      await page.locator(HoppscotchSel.status).waitFor({ timeout: 20_000 });
    },
  },
});
