import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestHeaders } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetHeadersBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-headers",
  description: "Adds each mem-supplied header (name -> value) on the Headers tab.",
  requires: [RequestHeaders],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Headers")).first().click();
      const headers = Object.entries(mem.get(RequestHeaders));
      for (const [i, [name, value]] of headers.entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
