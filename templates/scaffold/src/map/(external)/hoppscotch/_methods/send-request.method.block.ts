import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestUrl } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SendRequestBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "send-request",
  description: "Types the mem-supplied URL into the REST request bar and sends it.",
  requires: [RequestUrl],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.urlInput).first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(mem.get(RequestUrl));
      await page.locator(HoppscotchSel.send).click();
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
