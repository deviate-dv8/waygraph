import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { RequestMethod } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetMethodBlock = defineMethodBlock({
  name: "set-method",
  description: "Picks the HTTP method (GET, POST, PUT, PATCH, DELETE, ...) from the request bar.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [RequestMethod],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.methodInput).click();
      await page.locator(HoppscotchSel.menuItem(mem.get(RequestMethod))).click();
    },
  },
});
