import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { HoppscotchKeys } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetUrlBlock = defineMethodBlock({
  name: "set-url",
  description: "Types the request URL into the request bar.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [HoppscotchKeys.requestUrl],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.urlInput).first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(mem.get(HoppscotchKeys.requestUrl));
    },
  },
});
