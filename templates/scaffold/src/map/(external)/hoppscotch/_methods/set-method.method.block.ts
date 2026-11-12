import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const setMethod = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "set-method",
    description: "Picks the HTTP method (GET, POST, PUT, PATCH, DELETE, ...) from the request bar.",
    requires: [HoppscotchKeys.requestMethod],
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.methodInput).click();
      await page.locator(HoppscotchSel.menuItem(mem.get(HoppscotchKeys.requestMethod))).click();
    },
  });
