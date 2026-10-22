import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestMethod } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetMethodBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-method",
  description: "Picks the HTTP method (GET, POST, PUT, PATCH, DELETE, ...) from the request bar.",
  requires: [RequestMethod],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.methodInput).click();
      await page.locator(HoppscotchSel.menuItem(mem.get(RequestMethod))).click();
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
