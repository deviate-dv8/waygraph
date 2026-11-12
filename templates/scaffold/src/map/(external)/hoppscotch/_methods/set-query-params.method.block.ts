import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const setQueryParams = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "set-query-params",
    description: "Adds each mem-supplied query parameter (name -> value) on the Parameters tab.",
    requires: [HoppscotchKeys.requestParams],
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Parameters")).click();
      for (const [i, [name, value]] of Object.entries(mem.get(HoppscotchKeys.requestParams)).entries()) {
        await page.locator(HoppscotchSel.keyCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(name);
        await page.locator(HoppscotchSel.valueCell).nth(i).locator(HoppscotchSel.editor).click();
        await page.keyboard.type(value);
      }
    },
  });
