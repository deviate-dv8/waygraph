import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const setUrl = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "set-url",
    description: "Types the request URL into the request bar.",
    requires: [HoppscotchKeys.requestUrl],
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.urlInput).first().click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(mem.get(HoppscotchKeys.requestUrl));
    },
  });
