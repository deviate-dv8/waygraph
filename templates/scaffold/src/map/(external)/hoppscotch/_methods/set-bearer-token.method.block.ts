import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const setBearerToken = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "set-bearer-token",
    description: "Sets the Authorization tab to Bearer and types the mem-supplied token.",
    requires: [HoppscotchKeys.requestBearerToken],
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Authorization")).click();
      await page.locator(HoppscotchSel.authTypeMenu).click();
      await page.locator(HoppscotchSel.menuItem("Bearer")).click();
      await page.locator(HoppscotchSel.bearerToken).locator(HoppscotchSel.editor).click();
      await page.keyboard.type(mem.get(HoppscotchKeys.requestBearerToken));
    },
  });
