import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const setHeaders = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "set-headers",
    description: "Adds each mem-supplied header (name -> value) on the Headers tab.",
    requires: [HoppscotchKeys.requestHeaders],
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
  });
