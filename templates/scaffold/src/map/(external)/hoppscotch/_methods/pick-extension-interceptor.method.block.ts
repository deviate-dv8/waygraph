import { defineMethodBlock } from "waygraph";
import { HoppscotchSettings } from "../../../../states/demo.states.js";
import { HoppscotchSel } from "../_sel.js";

export const PickExtensionInterceptorBlock = defineMethodBlock({
  name: "pick-extension-interceptor",
  description: "Routes Hoppscotch's requests through the browser extension, which skips CORS.",
  from: HoppscotchSettings,
  to: HoppscotchSettings,
  instruction: {
    async act(page) {
      const radio = page.locator(HoppscotchSel.extensionInterceptor);
      await radio.waitFor({ timeout: 10_000 }).catch(() => {
        throw new Error('Hoppscotch extension not loaded - add extensions: ["hoppscotch"] to waygraph.config.ts');
      });
      await radio.click();
    },
  },
});
