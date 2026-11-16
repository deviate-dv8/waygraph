import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../../_sel.js";

export const pickExtensionInterceptor = (self: PageHandle<"HoppscotchSettings">) =>
  self.method({
    name: "pick-extension-interceptor",
    description: "Routes Hoppscotch's requests through the browser extension, which skips CORS.",
    async act(page) {
      const radio = page.locator(HoppscotchSel.extensionInterceptor);
      await radio.waitFor({ timeout: 10_000 }).catch(() => {
        throw new Error('Hoppscotch extension not loaded - add extensions: ["hoppscotch"] to waygraph.config.ts');
      });
      await radio.click();
    },
  });
