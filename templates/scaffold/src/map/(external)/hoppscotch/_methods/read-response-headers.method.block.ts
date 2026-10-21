import { defineMethodBlock, checkpoint } from "waygraph";
import type { HoppscotchRest } from "../../../../states/demo.states.js";
import { ResponseHeaders } from "../../../../states/demo.mem-keys.js";
import { HoppscotchSel } from "../_sel.js";

export const ReadResponseHeadersBlock = defineMethodBlock<HoppscotchRest, HoppscotchRest>({
  name: "read-response-headers",
  description: "Reads the response headers (lower-cased names) into mem.",
  instruction: {
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.responseHeadersTab).click();
      const cells = page.locator(HoppscotchSel.responseHeaderCell);
      await cells.first().waitFor();
      const texts = (await cells.allInnerTexts()).map((t) => t.trim());
      const headers: Record<string, string> = {};
      for (let i = 0; i + 1 < texts.length; i += 2) headers[texts[i]!.toLowerCase()] = texts[i + 1]!;
      mem.set(ResponseHeaders, headers);
    },
    resolve: () => checkpoint("HoppscotchRest"),
  },
});
