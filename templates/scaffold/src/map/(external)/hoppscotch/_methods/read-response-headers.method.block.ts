import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";
import { HoppscotchKeys } from "../_keys.js";

export const readResponseHeaders = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "read-response-headers",
    description: "Reads the response headers (lower-cased names) into mem.",
    async act(page, _in, mem) {
      await page.locator(HoppscotchSel.responseHeadersTab).click();
      const cells = page.locator(HoppscotchSel.responseHeaderCell);
      await cells.first().waitFor();
      const texts = (await cells.allInnerTexts()).map((t) => t.trim());
      const headers: Record<string, string> = {};
      for (let i = 0; i + 1 < texts.length; i += 2) headers[texts[i]!.toLowerCase()] = texts[i + 1]!;
      mem.set(HoppscotchKeys.responseHeaders, headers);
    },
  });
