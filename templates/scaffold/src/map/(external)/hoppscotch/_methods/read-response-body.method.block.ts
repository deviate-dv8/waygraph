import { defineMethodBlock } from "waygraph";
import { HoppscotchRest } from "../../../../states/demo.states.js";
import { ResponseBody } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const ReadResponseBodyBlock = defineMethodBlock({
  name: "read-response-body",
  description: "Reads the raw response body into mem.",
  from: HoppscotchRest,
  to: HoppscotchRest,
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.rawTab).click();
      const body = page.locator(HoppscotchSel.responseEditor);
      await body.waitFor();
      mem.set(ResponseBody, (await body.innerText()).trim());
      // Raw is the reliable place to read from; go back to the formatted JSON view so a recording ends on it.
      const json = page.locator(HoppscotchSel.responseJsonTab);
      if (await json.count()) await json.click();
    },
  },
});
