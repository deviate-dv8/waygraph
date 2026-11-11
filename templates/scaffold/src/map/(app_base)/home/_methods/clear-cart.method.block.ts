import { defineMethodBlock, type Trait } from "waygraph";
import { Home } from "../../../../states/demo.states.js";
import { DemoSel } from "../_sel.js";
import { } from "../_reads.js";
import { HomePage } from "../_page.block.js";

export const ClearCartBlock = defineMethodBlock({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  from: Home,
  to: Home,
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    verify: (): Trait[] => [HomePage.read.cartCount.is(0)],
  },
});
