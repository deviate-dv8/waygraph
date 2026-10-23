import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestUrl } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetUrlBlock = defineMethodBlock({
  name: "set-url",
  description: "Types the request URL into the request bar.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [RequestUrl],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.urlInput).first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(mem.get(RequestUrl));
    },
  },
});
