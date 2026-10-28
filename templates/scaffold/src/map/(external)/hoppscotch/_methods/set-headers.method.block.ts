import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { HoppscotchKeys } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetHeadersBlock = defineMethodBlock({
  name: "set-headers",
  description: "Adds each mem-supplied header (name -> value) on the Headers tab.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [HoppscotchKeys.requestHeaders],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Headers")).click();
      const headers = Object.entries(mem.get(HoppscotchKeys.requestHeaders));
      for (const [i, [name, value]] of headers.entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
  },
});
