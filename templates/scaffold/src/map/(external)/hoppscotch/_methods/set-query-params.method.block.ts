import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestParams } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetQueryParamsBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-query-params",
  description: "Adds each mem-supplied query parameter (name -> value) on the Parameters tab.",
  requires: [RequestParams],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Parameters")).click();
      for (const [i, [name, value]] of Object.entries(mem.get(RequestParams)).entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
