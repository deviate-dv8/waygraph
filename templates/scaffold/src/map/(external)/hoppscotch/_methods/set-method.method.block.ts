import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { HoppscotchKeys } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetMethodBlock = defineMethodBlock({
  name: "set-method",
  description: "Picks the HTTP method (GET, POST, PUT, PATCH, DELETE, ...) from the request bar.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [HoppscotchKeys.requestMethod],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.methodInput).click();
      await page.locator(HoppscotchSel.menuItem(mem.get(HoppscotchKeys.requestMethod))).click();
    },
  },
});
