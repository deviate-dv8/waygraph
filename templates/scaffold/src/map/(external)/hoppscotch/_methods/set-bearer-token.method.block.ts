import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestBearerToken } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetBearerTokenBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-bearer-token",
  description: "Sets the Authorization tab to Bearer and types the mem-supplied token.",
  requires: [RequestBearerToken],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Authorization")).first().click();
      await page.locator(HoppscotchSel.authTypeMenu).click();
      await page.getByText("Bearer", { exact: true }).click();
      await page.locator(HoppscotchSel.bearerToken).locator(HoppscotchSel.editor).click();
      await page.keyboard.type(mem.get(RequestBearerToken));
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
