import { defineMethodBlock, Trait } from "waygraph";
import { HoppscotchRest, HoppscotchSettings } from "../_states.js";
import { HoppscotchSel } from "../_sel.js";

export const OpenRestBlock = defineMethodBlock({
  name: "open-rest",
  description: "Opens the REST client from the sidebar, inside the app: hoppscotch.io doesn't load again.",
  from: HoppscotchSettings,
  to: HoppscotchRest,
  instruction: {
    async act(page) {
      await page.locator(HoppscotchSel.restLink).click();
    },
    verify: [Trait.url({ pathname: "/" }), Trait.visible(HoppscotchSel.send)],
  },
});
