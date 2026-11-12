import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../_sel.js";

export const sendRequest = (self: PageHandle<"HoppscotchRest">) =>
  self.method({
    name: "send-request",
    description: "Sends the request and waits for the response status to appear.",
    async act(page) {
      await page.locator(HoppscotchSel.send).click();
      await page.locator(HoppscotchSel.status).waitFor({ timeout: 20_000 });
    },
  });
