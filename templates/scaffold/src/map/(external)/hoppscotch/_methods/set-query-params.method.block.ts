import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { RequestParams } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetQueryParamsBlock = defineMethodBlock({
  name: "set-query-params",
  description: "Adds each mem-supplied query parameter (name -> value) on the Parameters tab.",
  from: HoppscotchRest,
  to: HoppscotchRest,
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
  },
});
