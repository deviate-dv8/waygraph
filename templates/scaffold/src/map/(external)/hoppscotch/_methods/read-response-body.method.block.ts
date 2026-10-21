import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { ResponseBody } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const ReadResponseBodyBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "read-response-body",
  description: "Reads the raw response body into mem.",
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.rawTab).first().click();
      const body = page.locator(HoppscotchSel.responseEditor);
      await body.waitFor();
      mem.set(ResponseBody, (await body.innerText()).trim());
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
