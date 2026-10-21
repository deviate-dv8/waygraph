import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { RequestBody } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

const spansLines = (text: string): boolean => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2).includes("\n");
  } catch {
    return false;
  }
};

export const SetJsonBodyBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "set-json-body",
  description: "Sets the content type to application/json and types the mem-supplied body, prettified.",
  requires: [RequestBody],
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.tab("Body")).first().click();
      await page.locator(HoppscotchSel.contentTypeMenu).click();
      await page.getByText("application/json", { exact: true }).click();
      const editor = page.locator(HoppscotchSel.visibleEditor).last();
      await editor.click();
      const body = mem.get(RequestBody);
      await page.keyboard.type(body);
      if (!spansLines(body)) return;
      // Prettify is the third toolbar button (Clear, Wrap lines, Prettify); typed JSON stays on one line otherwise.
      await page.locator(HoppscotchSel.bodyToolbarButton).nth(2).click();
      if ((await editor.locator(HoppscotchSel.bodyLine).count()) < 2) {
        throw new Error("set-json-body: Hoppscotch's Prettify button was not found, so the body stayed on one line");
      }
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
