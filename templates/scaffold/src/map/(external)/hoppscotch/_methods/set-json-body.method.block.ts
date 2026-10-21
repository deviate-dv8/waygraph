import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestBody } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const SetJsonBodyBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-json-body",
  description: "Sets the content type to application/json and types the mem-supplied body.",
  requires: [RequestBody],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Body")).first().click();
      await page.locator(HoppscotchSel.contentTypeMenu).click();
      await page.getByText("application/json", { exact: true }).click();
      await page.locator(HoppscotchSel.visibleEditor).last().click();
      await page.keyboard.type(mem.get(RequestBody));
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
