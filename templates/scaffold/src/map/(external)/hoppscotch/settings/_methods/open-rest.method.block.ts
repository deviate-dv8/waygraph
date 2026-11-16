import { Trait } from "waygraph";
import type { PageHandle } from "waygraph";
import { HoppscotchSel } from "../../_sel.js";

export const openRest = (self: PageHandle<"HoppscotchSettings">) =>
  self.method({
    name: "open-rest",
    description: "Opens the REST client from the sidebar, inside the app: hoppscotch.io doesn't load again.",
    to: "HoppscotchRest",
    async act(page) {
      await page.locator(HoppscotchSel.restLink).click();
    },
    verify: [Trait.url({ pathname: "/" }), Trait.visible(HoppscotchSel.send)],
  });
