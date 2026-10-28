import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../_states.js";
import { HoppscotchKeys } from "../_keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetBearerTokenBlock = defineMethodBlock({
  name: "set-bearer-token",
  description: "Sets the Authorization tab to Bearer and types the mem-supplied token.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  requires: [HoppscotchKeys.requestBearerToken],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Authorization")).click();
      await page.locator(HoppscotchSel.authTypeMenu).click();
      await page.locator(HoppscotchSel.menuItem("Bearer")).click();
      await page.locator(HoppscotchSel.bearerToken).locator(HoppscotchSel.editor).click();
      await page.keyboard.type(mem.get(HoppscotchKeys.requestBearerToken));
    },
  },
});
