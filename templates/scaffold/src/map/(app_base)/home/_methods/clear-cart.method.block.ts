import { defineMethodBlock } from "waygraph";
import { Home } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";
import { HomeRead } from "../_reads.js";

export const ClearCartBlock = defineMethodBlock({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  from: Home,
  to: Home,
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    verify: [HomeRead.cartCount.is(0)],
  },
});
